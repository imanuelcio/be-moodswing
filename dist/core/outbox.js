import { supabase, executeQuery } from "../config/supabase.js";
export async function writeToOutbox(event) {
    await executeQuery(supabase.from("event_outbox").insert({
        topic: event.topic,
        kind: event.kind,
        payload: event.payload,
        created_at: new Date().toISOString(),
        delivered_at: null,
        retries: 0,
    }), "write to outbox");
}
export async function writeToOutboxBatch(events) {
    const eventsWithTimestamp = events.map((event) => ({
        topic: event.topic,
        kind: event.kind,
        payload: event.payload,
        created_at: new Date().toISOString(),
        delivered_at: null,
        retries: 0,
    }));
    await executeQuery(supabase.from("event_outbox").insert(eventsWithTimestamp), "write to outbox batch");
}
// Helper to write outbox event atomically with a database operation
export async function withOutboxEvent(operation, event) {
    // In a real implementation, you'd want to use database transactions
    // For now, we'll execute the operation first, then write to outbox
    const result = await operation();
    await writeToOutbox(event);
    return result;
}
