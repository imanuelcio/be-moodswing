import type { Context } from "hono";
import { redisSub } from "../config/redis.js";
import { logger } from "./logger.js";

export interface SSEClient {
  id: string;
  userId?: string;
  topics: Set<string>;
  lastEventId?: string | null;
  connectionTime: number;
  closed: boolean;

  // streaming controller & encoder dari ReadableStream
  _controller: ReadableStreamDefaultController<Uint8Array>;
  _encoder: TextEncoder;

  // kirim event SSE (dengan nama event & payload)
  send: (event: string, data: any, id?: string) => void;

  // tutup koneksi SSE
  close: () => void;
}

export class SSEManager {
  private clients = new Map<string, SSEClient>();
  private topicSubscribers = new Map<string, Set<string>>();
  private heartbeatInterval: NodeJS.Timeout;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Start heartbeat every 20 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 20000);

    // Cleanup dead connections every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupDeadConnections();
    }, 60000);

    // Listen to Redis for events
    this.setupRedisSubscription();
  }

  createSSEConnection(c: Context, clientId: string, userId?: string) {
    let client: SSEClient;

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const enc = new TextEncoder();

        client = {
          id: clientId,
          userId,
          topics: new Set(),
          lastEventId: c.req.header("Last-Event-ID"),
          connectionTime: Date.now(),
          closed: false,
          _controller: controller,
          _encoder: enc,
          send: (event, data, id) => {
            if (client.closed) return;
            const payload =
              (id ? `id: ${id}\n` : "") +
              `event: ${event}\n` +
              `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(enc.encode(payload));
          },
          close: () => {
            client.closed = true;
            this.removeClient(clientId);
            try {
              controller.enqueue(enc.encode(": closed\n\n"));
            } catch {}
            try {
              controller.close();
            } catch {}
          },
        };

        this.clients.set(clientId, client);

        // auto close saat koneksi putus
        c.req.raw.signal?.addEventListener("abort", () => {
          client.close();
        });

        // hello event
        client.send("connected", { clientId, ts: new Date().toISOString() });
      },
    });

    const response = new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "http://localhost:5173", // ← ADD THIS
        "Access-Control-Allow-Credentials": "true", // ← ADD THIS
        "X-Accel-Buffering": "no",
      },
    });

    // @ts-expect-error client akan terisi di start()
    return { client, response };
  }

  subscribeToTopic(clientId: string, topic: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.topics.add(topic);

    if (!this.topicSubscribers.has(topic)) {
      this.topicSubscribers.set(topic, new Set());
      // Subscribe ke Redis channel biar bisa konsumsi publish dari worker lain
      redisSub.subscribe(topic);
    }

    this.topicSubscribers.get(topic)!.add(clientId);

    logger.debug({ clientId, topic }, "SSE client subscribed to topic");
  }

  unsubscribeFromTopic(clientId: string, topic: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.topics.delete(topic);

    const subscribers = this.topicSubscribers.get(topic);
    if (subscribers) {
      subscribers.delete(clientId);

      // If no more subscribers, unsubscribe from Redis
      if (subscribers.size === 0) {
        this.topicSubscribers.delete(topic);
        redisSub.unsubscribe(topic);
      }
    }

    logger.debug({ clientId, topic }, "SSE client unsubscribed from topic");
  }

  //  publish langsung ke subscribers lokal (dipakai oleh Hermes relay / controller lain) ===
  // event = nama event SSE (mis. 'price', 'market_status', 'leaderboard', dst.)
  publish(topic: string, event: string, data: any): void {
    const subscribers = this.topicSubscribers.get(topic);
    if (!subscribers) return;

    const eventId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    subscribers.forEach((clientId) => {
      const client = this.clients.get(clientId);
      if (client && !client.closed) {
        client.send(event, data, eventId);
      }
    });
  }

  // === Redis subscriber: pesan masuk harus berupa JSON { kind: string, ... } ===
  private setupRedisSubscription(): void {
    redisSub.on("message", (channel: string, message: string) => {
      try {
        const eventData = JSON.parse(message);
        // eventData.kind akan menjadi "event name" SSE
        const kind =
          typeof eventData?.kind === "string" ? eventData.kind : "message";
        // broadcast ke semua subscriber topic = channel
        this.publish(channel, kind, eventData); // gunakan publish() supaya format seragam
      } catch (error) {
        logger.error(
          { error, channel, message },
          "Failed to parse Redis message"
        );
      }
    });

    redisSub.on("error", (error) => {
      logger.error({ error }, "Redis subscriber error");
    });
  }

  // (masih dipakai untuk payload internal lama yang panggil broadcastToTopic langsung)
  // Biarkan untuk backward-compat (opsional). Bisa dihapus jika semua pindah ke publish().
  private broadcastToTopic(topic: string, data: any): void {
    const subscribers = this.topicSubscribers.get(topic);
    if (!subscribers) return;

    const kind = typeof data?.kind === "string" ? data.kind : "message";
    const eventId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    subscribers.forEach((clientId) => {
      const client = this.clients.get(clientId);
      if (client && !client.closed) {
        client.send(kind, data, eventId);
      }
    });
  }

  // Helper lama; sekarang publish() sudah handle event-id
  private sendToClient(client: SSEClient, data: any): void {
    const kind = typeof data?.kind === "string" ? data.kind : "message";
    const eventId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    client.send(kind, data, eventId);
  }

  private sendHeartbeat(): void {
    this.clients.forEach((client) => {
      if (!client.closed) {
        client._controller.enqueue(client._encoder.encode(": heartbeat\n\n"));
      }
    });
  }

  private cleanupDeadConnections(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    this.clients.forEach((client, clientId) => {
      if (client.closed || now - client.connectionTime > maxAge) {
        this.removeClient(clientId);
      }
    });
  }

  private removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Unsubscribe from all topics
    client.topics.forEach((topic) => {
      this.unsubscribeFromTopic(clientId, topic);
    });

    this.clients.delete(clientId);
    logger.info({ clientId }, "SSE client disconnected");
  }

  getStats() {
    return {
      totalClients: this.clients.size,
      totalTopics: this.topicSubscribers.size,
      clientsByTopic: Array.from(this.topicSubscribers.entries()).map(
        ([topic, clients]) => ({
          topic,
          subscribers: clients.size,
        })
      ),
    };
  }

  destroy(): void {
    clearInterval(this.heartbeatInterval);
    clearInterval(this.cleanupInterval);

    // Close all clients
    this.clients.forEach((client) => client.close());
    this.clients.clear();
    this.topicSubscribers.clear();
  }
}

export const sseManager = new SSEManager();
