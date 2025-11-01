import { supabase } from "../config/supabase.js";
import { logger } from "../core/logger.js";
export class OutboxService {
    async getStats() {
        const [totalResult, undeliveredResult, failedResult] = await Promise.all([
            supabase.from("event_outbox").select("*", { count: "exact", head: true }),
            supabase
                .from("event_outbox")
                .select("*", { count: "exact", head: true })
                .is("delivered_at", null),
            supabase
                .from("event_outbox")
                .select("*", { count: "exact", head: true })
                .gt("retries", 3)
                .is("delivered_at", null),
        ]);
        return {
            total: totalResult.count || 0,
            undelivered: undeliveredResult.count || 0,
            failed: failedResult.count || 0,
        };
    }
    async getRecentEvents(limit = 100) {
        const { data, error } = await supabase
            .from("event_outbox")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limit);
        if (error) {
            throw new Error(`Failed to get recent events: ${error.message}`);
        }
        return data || [];
    }
    async retryFailedEvents() {
        const { data: failedEvents, error } = await supabase
            .from("event_outbox")
            .select("id")
            .gt("retries", 3)
            .is("delivered_at", null);
        if (error) {
            throw new Error(`Failed to get failed events: ${error.message}`);
        }
        if (!failedEvents || failedEvents.length === 0) {
            return 0;
        }
        const eventIds = failedEvents.map((e) => e.id);
        const { error: updateError } = await supabase
            .from("event_outbox")
            .update({ retries: 0 })
            .in("id", eventIds);
        if (updateError) {
            throw new Error(`Failed to reset retries: ${updateError.message}`);
        }
        logger.info({ count: eventIds.length }, "Reset retries for failed events");
        return eventIds.length;
    }
    async purgeDeliveredEvents(olderThanDays = 7) {
        const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
            .from("event_outbox")
            .delete()
            .not("delivered_at", "is", null)
            .lt("delivered_at", cutoffDate)
            .select("id");
        if (error) {
            throw new Error(`Failed to purge events: ${error.message}`);
        }
        const deletedCount = data?.length || 0;
        logger.info({ count: deletedCount, cutoffDate }, "Purged delivered events");
        return deletedCount;
    }
}
