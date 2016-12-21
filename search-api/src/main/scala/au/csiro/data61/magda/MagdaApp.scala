
package au.csiro.data61.magda

import akka.actor.{Actor, ActorLogging, ActorSystem, DeadLetter, Props}
import akka.event.Logging
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.api.Api

object MagdaApp extends App {
  implicit val system = ActorSystem()
  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()
  implicit val config = AppConfig.conf

  val logger = Logging(system, getClass)

  logger.info("Starting API in env {}", AppConfig.env)

  val listener = system.actorOf(Props(classOf[Listener]))
  system.eventStream.subscribe(listener, classOf[DeadLetter])

  logger.debug("Starting API")
  new Api()
}

class Listener extends Actor with ActorLogging {
  def receive = {
    case d: DeadLetter => log.debug(d.message.toString())
  }
}