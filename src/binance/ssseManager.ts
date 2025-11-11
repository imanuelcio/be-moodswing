import type { Context } from "hono";

interface SSEClient {
  id: string;
  send: (data: any) => void;
  close: () => void;
}

class SSEManager {
  private clients: Map<string, SSEClient> = new Map();
  private topics: Map<string, Set<string>> = new Map();

  createSSEConnection(c: Context, clientId: string) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start: (controller) => {
        const client: SSEClient = {
          id: clientId,
          send: (data: any) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            );
          },
          close: () => controller.close(),
        };
        this.clients.set(clientId, client);
      },
    });

    const headers = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "http://localhost:5173",
      "Access-Control-Allow-Credentials": "true",
      "X-Accel-Buffering": "no",
    };

    return {
      client: this.clients.get(clientId)!,
      response: new Response(stream, { headers }),
    };
  }

  subscribeToTopic(clientId: string, topic: string) {
    if (!this.topics.has(topic)) this.topics.set(topic, new Set());
    this.topics.get(topic)!.add(clientId);
  }

  publish(topic: string, payload: any) {
    const clientIds = this.topics.get(topic);
    if (!clientIds) return;
    for (const id of clientIds) {
      const client = this.clients.get(id);
      if (client) client.send(payload);
    }
  }

  closeClient(clientId: string) {
    const client = this.clients.get(clientId);
    if (client) {
      client.close();
      this.clients.delete(clientId);
    }
  }
}

export const sseManager = new SSEManager();
export type { SSEClient };
