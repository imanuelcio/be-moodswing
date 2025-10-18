import { supabase, executeQuery } from "../config/supabase.js";
import type { EventType, Topic } from "./topics.js";

export interface OutboxEvent {
  topic: Topic;
  kind: EventType;
  payload: any;
}

export async function writeToOutbox(event: OutboxEvent): Promise<void> {
  await executeQuery(
    supabase.from("event_outbox").insert({
      topic: event.topic,
      kind: event.kind,
      payload: event.payload,
      created_at: new Date().toISOString(),
      delivered_at: null,
      retries: 0,
    }),
    "write to outbox"
  );
}

export async function writeToOutboxBatch(events: OutboxEvent[]): Promise<void> {
  const eventsWithTimestamp = events.map((event) => ({
    topic: event.topic,
    kind: event.kind,
    payload: event.payload,
    created_at: new Date().toISOString(),
    delivered_at: null,
    retries: 0,
  }));

  await executeQuery(
    supabase.from("event_outbox").insert(eventsWithTimestamp),
    "write to outbox batch"
  );
}

// Helper to write outbox event atomically with a database operation
export async function withOutboxEvent<T>(
  operation: () => Promise<T>,
  event: OutboxEvent
): Promise<T> {
  // In a real implementation, you'd want to use database transactions
  // For now, we'll execute the operation first, then write to outbox
  const result = await operation();
  await writeToOutbox(event);
  return result;
}
