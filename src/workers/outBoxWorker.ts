import { OutboxRepository } from "../repo/outbox.repo.js";
import { redisPub } from "../config/redis.js";
import { logger } from "../core/logger.js";

export class OutboxWorker {
  private isRunning = false;
  private pollInterval = 1000; // 1 second
  private batchSize = 500;
  private maxRetries = 5;
  private retryDelays = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff

  constructor(private outboxRepo = new OutboxRepository()) {}

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Outbox worker already running");
      return;
    }

    this.isRunning = true;
    logger.info("Starting outbox worker");

    while (this.isRunning) {
      try {
        await this.processBatch();
        await this.sleep(this.pollInterval);
      } catch (error) {
        logger.error({ error }, "Outbox worker error");
        await this.sleep(this.pollInterval * 2); // Backoff on error
      }
    }
  }

  async stop(): Promise<void> {
    logger.info("Stopping outbox worker");
    this.isRunning = false;
  }

  private async processBatch(): Promise<void> {
    const events = await this.outboxRepo.getUndeliveredEvents(this.batchSize);

    if (events.length === 0) {
      return; // No events to process
    }

    logger.debug({ count: events.length }, "Processing outbox events");

    for (const event of events) {
      try {
        await this.publishEvent(event);
        await this.outboxRepo.markDelivered(event.id);

        logger.debug(
          {
            eventId: event.id,
            topic: event.topic,
            kind: event.kind,
          },
          "Event published successfully"
        );
      } catch (error) {
        logger.error(
          {
            error,
            eventId: event.id,
            topic: event.topic,
            kind: event.kind,
            retries: event.retries,
          },
          "Failed to publish event"
        );

        if (event.retries < this.maxRetries) {
          await this.outboxRepo.incrementRetries(event.id);

          // Schedule retry with exponential backoff
          const delay =
            this.retryDelays[
              Math.min(event.retries, this.retryDelays.length - 1)
            ];
          setTimeout(async () => {
            try {
              await this.publishEvent(event);
              await this.outboxRepo.markDelivered(event.id);
            } catch (retryError) {
              logger.error({ retryError, eventId: event.id }, "Retry failed");
            }
          }, delay);
        } else {
          logger.error(
            {
              eventId: event.id,
              topic: event.topic,
              retries: event.retries,
            },
            "Event exceeded max retries, giving up"
          );
        }
      }
    }
  }

  private async publishEvent(event: any): Promise<void> {
    const message = JSON.stringify({
      id: event.id,
      kind: event.kind,
      payload: event.payload,
      timestamp: event.created_at,
    });

    await redisPub.publish(event.topic, message);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getStats() {
    return this.outboxRepo.getStats();
  }

  async retryFailedEvents(): Promise<number> {
    return this.outboxRepo.retryFailedEvents();
  }

  async purgeOldEvents(days: number = 7): Promise<number> {
    return this.outboxRepo.purgeDeliveredEvents(days);
  }
}
