import { supabase, executeQuery } from "../config/supabase.js";

export interface OutboxEvent {
  id: string;
  topic: string;
  kind: string;
  payload: any;
  created_at: string;
  delivered_at?: string;
  retries: number;
}

export interface CreateOutboxEventData {
  topic: string;
  kind: string;
  payload: any;
}

export class OutboxRepository {
  async create(eventData: CreateOutboxEventData): Promise<OutboxEvent> {
    return executeQuery<OutboxEvent>(
      supabase
        .from("event_outbox")
        .insert({
          ...eventData,
          created_at: new Date().toISOString(),
          delivered_at: null,
          retries: 0,
        })
        .select("*")
        .single(),
      "create outbox event"
    );
  }

  async createBatch(events: CreateOutboxEventData[]): Promise<OutboxEvent[]> {
    const eventsWithDefaults = events.map((event) => ({
      ...event,
      created_at: new Date().toISOString(),
      delivered_at: null,
      retries: 0,
    }));

    return executeQuery<OutboxEvent[]>(
      supabase.from("event_outbox").insert(eventsWithDefaults).select("*"),
      "create outbox events batch"
    );
  }

  async getUndeliveredEvents(limit: number = 500): Promise<OutboxEvent[]> {
    return executeQuery<OutboxEvent[]>(
      supabase
        .from("event_outbox")
        .select("*")
        .is("delivered_at", null)
        .order("id", { ascending: true })
        .limit(limit),
      "get undelivered events"
    );
  }

  async markDelivered(eventId: string): Promise<void> {
    await executeQuery(
      supabase
        .from("event_outbox")
        .update({ delivered_at: new Date().toISOString() })
        .eq("id", eventId),
      "mark event delivered"
    );
  }

  async incrementRetries(eventId: string): Promise<void> {
    await executeQuery(
      supabase.rpc("increment_outbox_retries", { event_id: eventId }),
      "increment retries"
    );
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

  async getRecentEvents(limit: number = 100): Promise<OutboxEvent[]> {
    return executeQuery<OutboxEvent[]>(
      supabase
        .from("event_outbox")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit),
      "get recent events"
    );
  }

  async retryFailedEvents(): Promise<number> {
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

    await executeQuery(
      supabase.from("event_outbox").update({ retries: 0 }).in("id", eventIds),
      "reset failed event retries"
    );

    return eventIds.length;
  }

  async purgeDeliveredEvents(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000
    ).toISOString();

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
