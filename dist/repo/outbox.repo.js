import { supabase, executeQuery } from "../config/supabase.js";
export class OutboxRepository {
    async create(eventData) {
        return executeQuery(supabase
            .from("event_outbox")
            .insert({
            ...eventData,
            created_at: new Date().toISOString(),
            delivered_at: null,
            retries: 0,
        })
            .select("*")
            .single(), "create outbox event");
    }
    async createBatch(events) {
        const eventsWithDefaults = events.map((event) => ({
            ...event,
            created_at: new Date().toISOString(),
            delivered_at: null,
            retries: 0,
        }));
        return executeQuery(supabase.from("event_outbox").insert(eventsWithDefaults).select("*"), "create outbox events batch");
    }
    async getUndeliveredEvents(limit = 500) {
        return executeQuery(supabase
            .from("event_outbox")
            .select("*")
            .is("delivered_at", null)
            .order("id", { ascending: true })
            .limit(limit), "get undelivered events");
    }
    async markDelivered(eventId) {
        await executeQuery(supabase
            .from("event_outbox")
            .update({ delivered_at: new Date().toISOString() })
            .eq("id", eventId), "mark event delivered");
    }
    async incrementRetries(eventId) {
        await executeQuery(supabase.rpc("increment_outbox_retries", { event_id: eventId }), "increment retries");
    }
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
        return executeQuery(supabase
            .from("event_outbox")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limit), "get recent events");
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
        await executeQuery(supabase.from("event_outbox").update({ retries: 0 }).in("id", eventIds), "reset failed event retries");
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
        return data?.length || 0;
    }
}
