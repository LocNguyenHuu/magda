package au.csiro.data61.magda.search.elasticsearch

import scala.collection.JavaConverters._

import org.elasticsearch.search.aggregations.Aggregation
import org.elasticsearch.search.aggregations.bucket.MultiBucketsAggregation
import org.elasticsearch.search.aggregations.bucket.histogram.Histogram
import org.elasticsearch.search.aggregations.bucket.nested.InternalReverseNested
import org.elasticsearch.search.aggregations.bucket.terms.Terms.Order

import com.rockymadden.stringmetric.similarity.WeightedLevenshteinMetric
import com.sksamuel.elastic4s.AbstractAggregationDefinition
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.QueryDefinition

import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.misc
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.search.elasticsearch.Queries._
import au.csiro.data61.magda.util.DateParser._
import au.csiro.data61.magda.util.DateParser
import scalaz.Memo

/**
 * Contains ES-specific functionality for a Magda FacetType, which is needed to map all our clever magdaey logic
 * over to elasticsearch which doesn't necessarily simply support it.
 */
trait FacetDefinition {
  /**
   *  The elastic4s aggregation definition for this facet, given a max bucket size
   */
  def aggregationDefinition(limit: Int): AbstractAggregationDefinition

  /**
   * Determines whether the passed query has any relevance to this facet - e.g. a query is only relevant to Year if it
   * has some kind of date parameters specified.
   */
  def relatedToQuery(query: Query): Boolean

  /**
   * Returns a QueryDefinition for only the part of the query that's relevant for this facet... e.g. for Year it creates
   * a query that looks for anything with a date within the Query's date parameters.
   */
  def filterAggregationQuery(query: Query): QueryDefinition

  /**
   *  Optional filter for the buckets that are returned from aggregation. This is useful for facets that are based on
   *  1:M relationships, as even filtering on the value of a facet tends to return a lot of nonsense results.
   *
   *  E.g. if I query for datasets with format "PDF" then I could still get "ZIP"  at the top of the resulting format
   *    aggregation, as long as every dataset with format "PDF" also has format "ZIP". So I can use this to filter out
   *    any aggregation results that aren't close to "PDF".
   */
  def isFilterOptionRelevant(query: Query)(filterOption: FacetOption): Boolean = true

  /**
   * Given an aggregation resolved from ElasticSearch, extract the actual individual FacetOptions. This has to be specified
   * per-facet because some facets use nested aggregations, so we need code to reach into the right sub-aggregation.
   */
  def extractFacetOptions(aggregation: Aggregation): Seq[FacetOption] = aggregation

  /**
   * Returns a query with the details relevant to this facet removed - useful for showing what options there *would* be
   * for this aggregation if it wasn't being filtered.
   */
  def removeFromQuery(query: Query): Query

  /**
   * Builds a Query for datasets with facets that match the supplied string. E.g. for publisher "Ballarat Council", this
   * creates a query that matches datasets with publisher "Ballarat Council"
   */
  def facetSearchQuery(textQuery: String): Query

  /**
   * Creates an ES query that will match datasets where the value for this facet matches the exact string passed.
   */
  def exactMatchQuery(query: String): QueryDefinition

  /**
   * Creates zero or more es queries that will match datasets with the exact match of this facet. E.g. if a Query has
   * publishers "Ballarat Council" and "City of ySdney" (sic), then it will return two Tuples with "Ballarat Council" and
   * "City of ySdney" and their corresponding query definitions. When run against elastic search, the first query will
   * return datasets that have the *exact* publisher value "Ballarat Council" but won't return anything for "City of ySdney"
   * because it's spelled wrong.
   */
  def exactMatchQueries(query: Query): Set[(String, QueryDefinition)]

  /**
   * Reduce a list of facets to fit under the limit
   */
  def truncateFacets(query: Query, matched: Seq[FacetOption], exactMatch: Seq[FacetOption], unmatched: Seq[FacetOption], limit: Int): Seq[FacetOption] = {
    val combined = (exactMatch ++ matched ++ unmatched)
    val lookup = combined.groupBy(_.value)

    // It's possible that some of the options will overlap, so make sure we're only showing the first occurence of each.
    combined.map(_.value)
      .distinct
      .map(lookup.get(_).get.head)
      .take(limit)
  }
}

object FacetDefinition {
  def facetDefForType(facetType: FacetType): FacetDefinition = facetType match {
    case Format    => FormatFacetDefinition
    case Year      => YearFacetDefinition
    case Publisher => PublisherFacetDefinition
  }
}

object PublisherFacetDefinition extends FacetDefinition {
  override def aggregationDefinition(limit: Int): AbstractAggregationDefinition = {
    aggregation.terms(Publisher.id).field("publisher.name.untouched").size(limit).exclude("")
  }

  def relatedToQuery(query: Query): Boolean = !query.publishers.isEmpty

  override def filterAggregationQuery(query: Query): QueryDefinition =
    should(
      query.publishers.map(publisherQuery(_))
    ).minimumShouldMatch(1)

  override def removeFromQuery(query: Query): Query = query.copy(publishers = Set())

  override def facetSearchQuery(textQuery: String): Query = Query(publishers = Set(textQuery))

  override def exactMatchQuery(query: String): QueryDefinition = exactPublisherQuery(query)

  override def exactMatchQueries(query: Query): Set[(String, QueryDefinition)] = query.publishers.map(publisher => (publisher, exactMatchQuery(publisher)))
}

object YearFacetDefinition extends FacetDefinition {
  val yearBinSizes = List(1, 2, 5, 10, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000)

  override def aggregationDefinition(limit: Int): AbstractAggregationDefinition =
    aggregation.terms(Year.id).field("years").size(Int.MaxValue)

  override def truncateFacets(query: Query, matched: Seq[FacetOption], exactMatch: Seq[FacetOption], unmatched: Seq[FacetOption], limit: Int): Seq[FacetOption] = {
    lazy val firstYear = query.dateFrom.map(_.getYear)
    lazy val lastYear = query.dateTo.map(_.getYear)

    (matched, unmatched) match {
      case (Nil, Nil)       => Nil
      case (matched, Nil)   => super.truncateFacets(query, makeBins(matched, limit, None, firstYear, lastYear), Nil, Nil, limit)
      case (Nil, unmatched) => super.truncateFacets(query, Nil, Nil, makeBins(unmatched, limit, None, None, None), limit)
      case (matched, unmatched) =>
        val matchedBins = makeBins(matched, limit, None, firstYear, lastYear).map(_.copy(matched = Some(true)))

        val hole = matchedBins match {
          case Nil => None
          case matchedBins =>
            val lastYear = matchedBins.head.upperBound.get.toInt
            val firstYear = matchedBins.last.lowerBound.get.toInt
            Some(firstYear, lastYear)
        }

        val remainingFacetSlots = limit - matchedBins.size

        super.truncateFacets(query, matchedBins, Nil, makeBins(unmatched, remainingFacetSlots, hole, None, None), limit)
    }
  }

  def getBinSize(firstYear: Int, lastYear: Int, limit: Int): Int = {
    val yearDifference = lastYear - firstYear
    yearBinSizes.view.map(x => (x, yearDifference / x)).filter(_._2 < limit).map(_._1).head
  }

  val parseFacets = Memo.mutableHashMapMemo((facets: Seq[FacetOption]) => facets
    .map(facet => (facet.value.split("-").map(_.toInt), facet.hitCount))
  )

  def makeBins(facets: Seq[FacetOption], limit: Int, hole: Option[(Int, Int)], firstYearOpt: Option[Int], lastYearOpt: Option[Int]): Seq[FacetOption] = {
    lazy val yearsFromFacets = parseFacets(facets)
      .flatMap(_._1)
      .distinct
      .toList
      .sorted

    val firstYear = firstYearOpt.getOrElse(yearsFromFacets.head)
    val lastYear = lastYearOpt.getOrElse(yearsFromFacets.last)

    makeBins(facets, limit, hole, firstYear, lastYear)
  }

  def makeBins(facets: Seq[FacetOption], limit: Int, hole: Option[(Int, Int)], firstYear: Int, lastYear: Int): Seq[FacetOption] = facets match {
    case Nil => Nil
    case facets =>
      val binSize = getBinSize(firstYear, lastYear, limit)

      val binsRaw = (for (i <- roundDown(firstYear, binSize) to roundUp(lastYear, binSize) by binSize) yield (i, i + binSize - 1))
      val bins = hole.map {
        case (holeStart, holeEnd) =>
          binsRaw.flatMap {
            case (binStart, binEnd) =>
              if (binStart > holeStart && binEnd < holeEnd)
                Nil
              else if (binStart < holeStart && binEnd > holeEnd)
                Seq((binStart, holeStart - 1), (holeEnd + 1, binEnd))
              else if (binStart <= holeStart && binEnd >= holeStart)
                Seq((binStart, holeStart - 1))
              else if (binStart <= holeEnd && binEnd >= holeEnd)
                Seq((holeEnd + 1, binEnd))
              else Seq((binStart, binEnd))
          }
      } getOrElse (binsRaw)

      bins.reverse.map {
        case (bucketStart, bucketEnd) =>
          val hitCount = parseFacets(facets).filter {
            case (years, hitCount) =>
              val facetStart = years.head
              val facetEnd = years.last

              (facetStart >= bucketStart && facetStart <= bucketEnd) ||
                (facetEnd >= bucketStart && facetEnd <= bucketEnd) ||
                (facetStart <= bucketStart && facetEnd >= bucketEnd)
          }.foldLeft(0l)(_ + _._2)

          FacetOption(
            value = if (bucketStart != bucketEnd) s"$bucketStart - $bucketEnd" else bucketStart.toString,
            hitCount,
            lowerBound = Some(bucketStart.toString),
            upperBound = Some(bucketEnd.toString)
          )
      }.filter(_.hitCount > 0)
  }

  def roundUp(num: Int, divisor: Int): Int = Math.ceil((num.toDouble / divisor)).toInt * divisor
  def roundDown(num: Int, divisor: Int): Int = Math.floor((num.toDouble / divisor)).toInt * divisor

  override def relatedToQuery(query: Query): Boolean = query.dateFrom.isDefined || query.dateTo.isDefined

  override def filterAggregationQuery(query: Query): QueryDefinition =
    must {
      val fromQuery = query.dateFrom.map(dateFromQuery(_))
      val toQuery = query.dateTo.map(dateToQuery(_))

      Seq(fromQuery, toQuery).flatten
    }

  override def removeFromQuery(query: Query): Query = query.copy(dateFrom = None, dateTo = None)

  override def isFilterOptionRelevant(query: Query)(filterOption: FacetOption): Boolean = {
    val (rawFrom, rawTo) = filterOption.value.split("-") match {
      case Array(date)     => (date, date)
      case Array(from, to) => (from, to)
    }
    //FIXME: This is nah-stee
    (parseDate(rawFrom, false), parseDate(rawTo, true)) match {
      case (DateTimeResult(from), DateTimeResult(to)) =>
        query.dateFrom.map(x => x.isBefore(to) || x.equals(to)).getOrElse(true) &&
          query.dateTo.map(x => x.isAfter(from) || x.equals(from)).getOrElse(true)
      case _ => false
    }
  }

  override def facetSearchQuery(textQuery: String) = (parseDate(textQuery, false), parseDate(textQuery, true)) match {
    case (DateTimeResult(from), DateTimeResult(to)) => Query(dateFrom = Some(from), dateTo = Some(to))
    // The idea is that this will come from our own index so it shouldn't even be some weird wildcard thing
    case _ => throw new RuntimeException("Date " + query + " not recognised")
  }

  override def exactMatchQuery(query: String): QueryDefinition = {
    val from = DateParser.parseDate(query, false)
    val to = DateParser.parseDate(query, true)

    (from, to) match {
      case (DateTimeResult(fromInstant), DateTimeResult(toInstant)) => exactDateQuery(fromInstant, toInstant)
    }
  }

  override def exactMatchQueries(query: Query): Set[(String, QueryDefinition)] = Set()
}

object FormatFacetDefinition extends FacetDefinition {
  override def aggregationDefinition(limit: Int): AbstractAggregationDefinition =
    aggregation nested Format.id path "distributions" aggregations {
      aggregation terms "nested" field "distributions.format.untokenized" size limit exclude "" aggs {
        aggregation reverseNested "reverse"
      }
    }

  override def extractFacetOptions(aggregation: Aggregation): Seq[FacetOption] = {
    val nested = aggregation.getProperty("nested").asInstanceOf[MultiBucketsAggregation]

    nested.getBuckets.asScala.map { bucket =>
      val innerBucket = bucket.getAggregations.asScala.head.asInstanceOf[InternalReverseNested]

      new FacetOption(
        value = bucket.getKeyAsString,
        hitCount = innerBucket.getDocCount
      )
    }
  }

  override def relatedToQuery(query: Query): Boolean = !query.formats.isEmpty

  override def filterAggregationQuery(query: Query): QueryDefinition =
    should(query.formats.map(formatQuery(_)))
      .minimumShouldMatch(1)

  override def isFilterOptionRelevant(query: Query)(filterOption: FacetOption): Boolean = query.formats.exists(
    format => WeightedLevenshteinMetric(10, 0.1, 1).compare(format.toLowerCase, filterOption.value.toLowerCase) match {
      case Some(distance) => distance < 1.5
      case None           => false
    })

  override def removeFromQuery(query: Query): Query = query.copy(formats = Set())
  override def facetSearchQuery(textQuery: String) = Query(formats = Set(textQuery))

  override def exactMatchQuery(query: String): QueryDefinition = exactFormatQuery(query)

  override def exactMatchQueries(query: Query): Set[(String, QueryDefinition)] = query.formats.map(format => (format, exactMatchQuery(format)))
}