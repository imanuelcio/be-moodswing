import { OutboxRepository } from "../repo/outbox.repo.js";
import { redisPub } from "../config/redis.js";
import { logger } from "../core/logger.js";
export class OutboxWorker {
    outboxRepo;
    isRunning = false;
    pollInterval = 1000; // 1 second
    batchSize = 500;
    maxRetries = 5;
    retryDelays = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff
    constructor(outboxRepo = new OutboxRepository()) {
        this.outboxRepo = outboxRepo;
    }
    async start() {
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
            }
            catch (error) {
                logger.error({ error }, "Outbox worker error");
                await this.sleep(this.pollInterval * 2); // Backoff on error
            }
        }
    }
    async stop() {
        logger.info("Stopping outbox worker");
        this.isRunning = false;
    }
    async processBatch() {
        const events = await this.outboxRepo.getUndeliveredEvents(this.batchSize);
        if (events.length === 0) {
            return; // No events to process
        }
        logger.debug({ count: events.length }, "Processing outbox events");
        for (const event of events) {
            try {
                await this.publishEvent(event);
                await this.outboxRepo.markDelivered(event.id);
                logger.debug({
                    eventId: event.id,
                    topic: event.topic,
                    kind: event.kind,
                }, "Event published successfully");
            }
            catch (error) {
                logger.error({
                    error,
                    eventId: event.id,
                    topic: event.topic,
                    kind: event.kind,
                    retries: event.retries,
                }, "Failed to publish event");
                if (event.retries < this.maxRetries) {
                    await this.outboxRepo.incrementRetries(event.id);
                    // Schedule retry with exponential backoff
                    const delay = this.retryDelays[Math.min(event.retries, this.retryDelays.length - 1)];
                    setTimeout(async () => {
                        try {
                            await this.publishEvent(event);
                            await this.outboxRepo.markDelivered(event.id);
                        }
                        catch (retryError) {
                            logger.error({ retryError, eventId: event.id }, "Retry failed");
                        }
                    }, delay);
                }
                else {
                    logger.error({
                        eventId: event.id,
                        topic: event.topic,
                        retries: event.retries,
                    }, "Event exceeded max retries, giving up");
                }
            }
        }
    }
    async publishEvent(event) {
        const message = JSON.stringify({
            id: event.id,
            kind: event.kind,
            payload: event.payload,
            timestamp: event.created_at,
        });
        await redisPub.publish(event.topic, message);
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async getStats() {
        return this.outboxRepo.getStats();
    }
    async retryFailedEvents() {
        return this.outboxRepo.retryFailedEvents();
    }
    async purgeOldEvents(days = 7) {
        return this.outboxRepo.purgeDeliveredEvents(days);
    }
}
