// /lib/sse.ts
import type { Context } from "hono";
import type { MarketDelta, MarketSnapshot } from "../types/index.js";
import type { SSEMessage } from "hono/streaming";

interface SSEClient {
  id: string;
  context: Context;
  marketIds: string[];
  lastSeq: number;
  controller: AbortController;
}

/**
 * Server-Sent Events broadcaster for real-time market updates
 * TODO: Replace with NATS/Kafka for production scale-out
 */
export class SSEBroadcaster {
  private clients = new Map<string, SSEClient>();
  private marketSequences = new Map<string, number>();
  private heartbeatInterval: NodeJS.Timeout;

  constructor() {
    // Start heartbeat every 15 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 15000);
  }

  /**
   * Subscribe client to market updates
   */
  async subscribe(
    c: Context,
    marketIds: string[],
    lastEventId?: string
  ): Promise<void> {
    const clientId = this.generateClientId();
    const lastSeq = lastEventId ? parseInt(lastEventId) || 0 : 0;

    // Set SSE headers
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Headers", "Last-Event-ID");

    const controller = new AbortController();

    const client: SSEClient = {
      id: clientId,
      context: c,
      marketIds,
      lastSeq,
      controller,
    };

    this.clients.set(clientId, client);

    try {
      // Send initial snapshots for subscribed markets
      for (const marketId of marketIds) {
        await this.sendMarketSnapshot(client, marketId);
      }

      // Keep connection alive
      return new Promise((resolve, reject) => {
        controller.signal.addEventListener("abort", () => {
          this.clients.delete(clientId);
          resolve();
        });

        // Handle client disconnect
        c.req.raw.signal?.addEventListener("abort", () => {
          controller.abort();
        });
      });
    } catch (error) {
      this.clients.delete(clientId);
      throw error;
    }
  }

  /**
   * Publish update to all subscribers of a market
   */
  async publish(
    marketId: string,
    payload: Omit<MarketDelta, "seq">
  ): Promise<void> {
    const seq = this.getNextSequence(marketId);
    const delta: MarketDelta = {
      ...payload,
      seq,
    };

    const subscribers = Array.from(this.clients.values()).filter((client) =>
      client.marketIds.includes(marketId)
    );

    await Promise.all(
      subscribers.map((client) => this.sendDelta(client, delta))
    );
  }

  /**
   * Send market snapshot to client
   */
  private async sendMarketSnapshot(
    client: SSEClient,
    marketId: string
  ): Promise<void> {
    try {
      // Fetch current market state (this would come from your market service)
      const snapshot = await this.getCurrentMarketSnapshot(marketId);

      if (snapshot) {
        const message: SSEMessage = {
          event: "snapshot",
          id: snapshot.seq.toString(),
          data: JSON.stringify(snapshot),
        };

        await this.sendMessage(client, message);
      }
    } catch (error) {
      console.error(`Failed to send snapshot for market ${marketId}:`, error);
    }
  }

  /**
   * Send delta update to client
   */
  private async sendDelta(
    client: SSEClient,
    delta: MarketDelta
  ): Promise<void> {
    try {
      const message: SSEMessage = {
        event: "delta",
        id: delta.seq.toString(),
        data: JSON.stringify(delta),
      };

      await this.sendMessage(client, message);
    } catch (error) {
      console.error(`Failed to send delta to client ${client.id}:`, error);
      // Remove failed client
      this.clients.delete(client.id);
    }
  }

  /**
   * Send SSE message to client
   */
  private async sendMessage(
    client: SSEClient,
    message: SSEMessage
  ): Promise<void> {
    if (client.controller.signal.aborted) {
      return;
    }

    let sseData = "";

    if (message.event) {
      sseData += `event: ${message.event}\n`;
    }

    if (message.id) {
      sseData += `id: ${message.id}\n`;
    }

    if (message.data) {
      sseData += `data: ${JSON.stringify(message.data)}\n`;
    }

    sseData += "\n";

    try {
      if (client.context.res.body instanceof WritableStream) {
        const writer = client.context.res.body.getWriter();
        await writer.write(new TextEncoder().encode(sseData));
        await writer.close();
      } else {
        console.error("client.context.res.body is not a writable stream");
      }
    } catch (error) {
      console.error(`Failed to write to client ${client.id}:`, error);
      this.clients.delete(client.id);
    }
  }

  /**
   * Send heartbeat to all clients
   */
  private async sendHeartbeat(): Promise<void> {
    const heartbeat = ":\n\n"; // SSE comment format for heartbeat
    const encoder = new TextEncoder();

    const clientsToRemove: string[] = [];

    for (const [clientId, client] of this.clients) {
      try {
        if (client.controller.signal.aborted) {
          clientsToRemove.push(clientId);
          continue;
        }

        if (client.context.res.body instanceof WritableStream) {
          await client.context.res.body
            .getWriter()
            .write(encoder.encode(heartbeat));
        } else {
          console.error("client.context.res.body is not a writable stream");
        }
      } catch (error) {
        console.error(`Heartbeat failed for client ${clientId}:`, error);
        clientsToRemove.push(clientId);
      }
    }

    // Clean up failed clients
    clientsToRemove.forEach((id) => this.clients.delete(id));
  }

  /**
   * Get next sequence number for market
   */
  private getNextSequence(marketId: string): number {
    const current = this.marketSequences.get(marketId) || 0;
    const next = current + 1;
    this.marketSequences.set(marketId, next);
    return next;
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Fetch current market snapshot from database
   * TODO: Implement actual market data fetching
   */
  private async getCurrentMarketSnapshot(
    marketId: string
  ): Promise<MarketSnapshot | null> {
    // This would integrate with your market service
    // For now, return a placeholder
    return {
      marketId,
      yesShares: 1,
      noShares: 1,
      priceYes: 0.5,
      priceNo: 0.5,
      status: "OPEN",
      seq: this.marketSequences.get(marketId) || 0,
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Abort all client connections
    for (const client of this.clients.values()) {
      client.controller.abort();
    }

    this.clients.clear();
    this.marketSequences.clear();
  }
}

// Global broadcaster instance
export const sseBroadcaster = new SSEBroadcaster();
