package au.csiro.data61.magda.util

import scala.util.control.Exception._
import scala.concurrent.duration._
import java.text.ParseException
import java.time._
import java.util.Locale
import java.text.SimpleDateFormat
import java.util.TimeZone
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.temporal.TemporalAdjuster
import java.time.temporal.ChronoUnit
import java.time.temporal.ChronoField
import java.time.format.DateTimeFormatterBuilder
import java.time.temporal.Temporal
import au.csiro.data61.magda.AppConfig

object DateParser {

  sealed trait DateConstant {
    override def toString() = this.getClass.getSimpleName.split("\\$").last
    def strings: List[String]
  }
  case object Now extends DateConstant {
    override def strings = List("Current", "Now", "Ongoing")
  }

  private val constants: List[DateConstant] = List(Now)
  private val constantMap = constants
    .flatMap(constant => constant.strings.flatMap(string => List(string, string.toUpperCase(), string.toLowerCase()).map((constant, _))))
    .map { case (constant, string) => (string, constant) }
    .toMap

  sealed trait Format {
    val format: String = ""
    val precision: ChronoUnit = ChronoUnit.YEARS
  }
  case class OffsetDateTimeFormat(override val format: String, override val precision: ChronoUnit) extends Format
  case class DateTimeFormat(override val format: String, override val precision: ChronoUnit) extends Format
  case class DateFormat(override val format: String, override val precision: ChronoUnit) extends Format

  // TODO: push the strings into config.
  private val timeFormats = List(
    DateTimeFormat("HH:mm:ss", ChronoUnit.SECONDS),
    OffsetDateTimeFormat("HH:mm:ss.SSSXXX", ChronoUnit.SECONDS),
    DateTimeFormat("HH:mm", ChronoUnit.MINUTES))
  private val dateFormats = List(
    DateFormat("yyyy{sep}MM{sep}dd", ChronoUnit.DAYS),
    DateFormat("dd{sep}MM{sep}yyyy", ChronoUnit.DAYS),
    DateFormat("MM{sep}dd{sep}yyyy", ChronoUnit.DAYS),
    DateFormat("MMMMM{sep}yyyy", ChronoUnit.MONTHS),
    DateFormat("MMMMM{sep}yy", ChronoUnit.MONTHS),
    DateFormat("yyyy", ChronoUnit.YEARS),
    DateFormat("yy", ChronoUnit.YEARS))
  private val dateTimeSeparators = List("'T'", " ", "")
  private val dateSeparators = List("-", "/", " ")

  private val formatsWithoutTimes = for {
    dateSeparator <- dateSeparators
    dateFormat <- dateFormats
  } yield {
    formatToFormat(dateFormat.format, dateSeparator, dateFormat)
  }

  val formatsWithTimes = for {
    timeFormat <- timeFormats
    dateTimeSeparator <- dateTimeSeparators
    dateSeparator <- dateSeparators
    dateFormat <- dateFormats
  } yield {
    val fullDateTimeFormat: String = s"${dateFormat.format}${dateTimeSeparator}${timeFormat.format}"
    formatToFormat(fullDateTimeFormat, dateSeparator, timeFormat)
  }

  val formats = formatsWithoutTimes ++ formatsWithTimes

  private def formatToFormat(format: String, dateSeparator: String, originalFormat: Format) = {
    val replacedDateFormat = format.replace("{sep}", dateSeparator)
    val regex = replacedDateFormat
      .replaceAll("'", "")
      .replaceAll("[E|M]{5}", "[A-Za-z]+")
      .replaceAll("[E|M]{3}", "[A-Za-z]{3}")
      .replaceAll("[H|m|s|S|X|d|M|y]", "\\\\d")
      .replaceAll("/", "\\/")
      .r
    val javaFormat = new DateTimeFormatterBuilder()
      .parseLenient()
      .appendPattern(replacedDateFormat)
      .parseDefaulting(ChronoField.MILLI_OF_SECOND, 0)
      .parseDefaulting(ChronoField.SECOND_OF_MINUTE, 0)
      .parseDefaulting(ChronoField.MINUTE_OF_HOUR, 0)
      .parseDefaulting(ChronoField.HOUR_OF_DAY, 0)
      .parseDefaulting(ChronoField.DAY_OF_MONTH, 1)
      .parseDefaulting(ChronoField.MONTH_OF_YEAR, 1)
      .toFormatter()

    (regex, javaFormat, originalFormat)
  }

  sealed trait ParseResult
  case class DateTimeResult(instant: OffsetDateTime) extends ParseResult
  case class ConstantResult(dateConstant: DateConstant) extends ParseResult
  case object ParseFailure extends ParseResult

  private def roundUp[T <: Temporal](roundUp: Boolean, date: T, originalFormat: Format): T =
    if (roundUp) date.plus(1, originalFormat.precision).minus(1, ChronoUnit.MILLIS).asInstanceOf[T] else date

  def parseDate(raw: String, shouldRoundUp: Boolean): ParseResult =
    if (raw.isEmpty())
      ParseFailure
    else
      constantMap.get(raw) match {
        case Some(constant) => ConstantResult(constant) // If the date is a constant representation of "Now", assume the temporal coverage is the last modified date.
        case None =>
          formats
            .view
            .filter { case (regex, _, _) => regex.findFirstIn(raw).isDefined }
            .map {
              case (_, format, originalFormat) => {
                catching(classOf[DateTimeParseException]) opt {
                  originalFormat match {
                    case OffsetDateTimeFormat(_, _) => roundUp(shouldRoundUp, OffsetDateTime.parse(raw, format), originalFormat)
                    case DateTimeFormat(_, _) => roundUp(shouldRoundUp, LocalDateTime.parse(raw, format), originalFormat)
                      .atOffset(ZoneOffset.of(AppConfig.conf.getString("time.defaultOffset")))
                    case DateFormat(_, _) => roundUp(shouldRoundUp, LocalDate.parse(raw, format).atStartOfDay(), originalFormat)
                      .atOffset(ZoneOffset.of(AppConfig.conf.getString("time.defaultOffset")))
                  }
                }
              }
            }
            .filter(_.isDefined)
            .map(_.get)
            .headOption
            .map(date => DateTimeResult(date))
            .getOrElse(ParseFailure)
      }

  def parseDateDefault(raw: String, shouldRoundUp: Boolean): Option[OffsetDateTime] =
    parseDate(raw, shouldRoundUp) match {
      case DateTimeResult(zonedDateTime) => Some(zonedDateTime)
      case ConstantResult(constant) => constant match {
        case Now => Some(OffsetDateTime.now())
      }
      case ParseFailure => None
    }

  class InstantToDateConverter(instant: Instant) {
    def toDefaultZonedTime() = instant.atOffset(ZoneOffset.of(AppConfig.conf.getString("time.defaultOffset")))
  }

  implicit def implicitInstantConv(instant: Instant): InstantToDateConverter = new InstantToDateConverter(instant)
}