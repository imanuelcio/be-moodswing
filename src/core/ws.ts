import WebSocket from "ws";
import { redisSub } from "../config/redis.js";
import { verifyJwtToken } from "./auth.js";
import { logger } from "./logger.js";

export interface WSClient {
  id: string;
  userId: string;
  ws: WebSocket;
  topics: Set<string>;
  connectionTime: number;
  lastPingTime: number;
  metadata?: any;
}

export interface WSMessage {
  type:
    | "subscribe"
    | "unsubscribe"
    | "rpc"
    | "ping"
    | "pong"
    | "error"
    | "notification";
  requestId?: string;
  topic?: string;
  method?: string;
  params?: any;
  data?: any;
  error?: string;
}

export class WSManager {
  private clients = new Map<string, WSClient>();
  private userClients = new Map<string, Set<string>>();
  private topicSubscribers = new Map<string, Set<string>>();
  private pingInterval: NodeJS.Timeout;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Ping clients every 30 seconds
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, 30000);

    // Cleanup dead connections every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupDeadConnections();
    }, 60000);

    // Listen to Redis for events
    this.setupRedisSubscription();
  }

  addClient(ws: WebSocket, token: string): WSClient | null {
    try {
      // Verify JWT token
      const payload = verifyJwtToken(token);

      const clientId = `${payload.userId}-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const client: WSClient = {
        id: clientId,
        userId: payload.userId,
        ws,
        topics: new Set(),
        connectionTime: Date.now(),
        lastPingTime: Date.now(),
      };

      this.clients.set(clientId, client);

      // Track user clients
      if (!this.userClients.has(payload.userId)) {
        this.userClients.set(payload.userId, new Set());
      }
      this.userClients.get(payload.userId)!.add(clientId);

      // Automatically subscribe to user-specific channels
      this.subscribeToTopic(clientId, `user:${payload.userId}:notifications`);
      this.subscribeToTopic(clientId, `user:${payload.userId}:relayer`);

      // Setup WebSocket event handlers
      this.setupClientHandlers(client);

      // Send welcome message
      this.sendToClient(client, {
        type: "notification",
        data: {
          type: "connected",
          clientId,
          timestamp: new Date().toISOString(),
        },
      });

      logger.info(
        { clientId, userId: payload.userId },
        "WebSocket client connected"
      );

      return client;
    } catch (error) {
      logger.error({ error }, "Failed to authenticate WebSocket client");
      ws.close(1008, "Authentication failed");
      return null;
    }
  }

  private setupClientHandlers(client: WSClient): void {
    client.ws.on("message", (data: Buffer) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());
        this.handleClientMessage(client, message);
      } catch (error) {
        logger.error(
          { error, clientId: client.id },
          "Failed to parse WebSocket message"
        );
        this.sendError(client, "Invalid message format");
      }
    });

    client.ws.on("close", () => {
      this.removeClient(client.id);
    });

    client.ws.on("error", (error) => {
      logger.error({ error, clientId: client.id }, "WebSocket client error");
      this.removeClient(client.id);
    });

    client.ws.on("pong", () => {
      client.lastPingTime = Date.now();
    });
  }

  private handleClientMessage(client: WSClient, message: WSMessage): void {
    switch (message.type) {
      case "ping":
        this.sendToClient(client, {
          type: "pong",
          requestId: message.requestId,
        });
        break;

      case "subscribe":
        if (message.topic) {
          this.subscribeToTopic(client.id, message.topic);
          this.sendToClient(client, {
            type: "notification",
            requestId: message.requestId,
            data: { subscribed: message.topic },
          });
        }
        break;

      case "unsubscribe":
        if (message.topic) {
          this.unsubscribeFromTopic(client.id, message.topic);
          this.sendToClient(client, {
            type: "notification",
            requestId: message.requestId,
            data: { unsubscribed: message.topic },
          });
        }
        break;

      case "rpc":
        this.handleRPCMessage(client, message);
        break;

      default:
        this.sendError(client, "Unknown message type", message.requestId);
    }
  }

  private async handleRPCMessage(
    client: WSClient,
    message: WSMessage
  ): Promise<void> {
    try {
      switch (message.method) {
        case "bet.place":
          // Handle bet placement via WebSocket
          // This would integrate with your BetService
          await this.handleBetPlace(client, message);
          break;

        case "market.subscribe":
          // Subscribe to market-specific updates
          if (message.params?.marketId) {
            this.subscribeToTopic(
              client.id,
              `market:${message.params.marketId}:ticker`
            );
            this.subscribeToTopic(
              client.id,
              `market:${message.params.marketId}:trades`
            );
          }
          break;

        default:
          this.sendError(
            client,
            `Unknown RPC method: ${message.method}`,
            message.requestId
          );
      }
    } catch (error) {
      logger.error(
        { error, method: message.method, clientId: client.id },
        "RPC method failed"
      );
      this.sendError(client, "RPC method failed", message.requestId);
    }
  }

  private async handleBetPlace(
    client: WSClient,
    message: WSMessage
  ): Promise<void> {
    // This is a placeholder - integrate with your BetService
    try {
      // Validate bet placement parameters
      const { marketId, outcomeKey, side, stakePoints } = message.params || {};

      if (!marketId || !outcomeKey || !side) {
        this.sendError(
          client,
          "Missing required bet parameters",
          message.requestId
        );
        return;
      }

      // Send immediate acknowledgment
      this.sendToClient(client, {
        type: "notification",
        requestId: message.requestId,
        data: {
          type: "bet.accepted",
          message: "Bet accepted for processing",
        },
      });

      // Here you would call your BetService.placeBet method
      // For now, simulate success
      setTimeout(() => {
        this.sendToClient(client, {
          type: "notification",
          data: {
            type: "bet.filled",
            betId: "bet-" + Date.now(),
            marketId,
            outcomeKey,
            side,
            stakePoints,
          },
        });
      }, 1000);
    } catch (error) {
      this.sendError(client, "Failed to place bet", message.requestId);
    }
  }

  private subscribeToTopic(clientId: string, topic: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.topics.add(topic);

    if (!this.topicSubscribers.has(topic)) {
      this.topicSubscribers.set(topic, new Set());
      // Subscribe to Redis channel
      redisSub.subscribe(topic);
    }

    this.topicSubscribers.get(topic)!.add(clientId);

    logger.debug({ clientId, topic }, "WebSocket client subscribed to topic");
  }

  private unsubscribeFromTopic(clientId: string, topic: string): void {
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

    logger.debug(
      { clientId, topic },
      "WebSocket client unsubscribed from topic"
    );
  }

  private setupRedisSubscription(): void {
    redisSub.on("message", (channel: string, message: string) => {
      try {
        const eventData = JSON.parse(message);
        this.broadcastToTopic(channel, eventData);
      } catch (error) {
        logger.error(
          { error, channel, message },
          "Failed to parse Redis message"
        );
      }
    });
  }

  private broadcastToTopic(topic: string, data: any): void {
    const subscribers = this.topicSubscribers.get(topic);
    if (!subscribers) return;

    subscribers.forEach((clientId) => {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        this.sendToClient(client, {
          type: "notification",
          data,
        });
      }
    });
  }

  private sendToClient(client: WSClient, message: WSMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error(
          { error, clientId: client.id },
          "Failed to send WebSocket message"
        );
      }
    }
  }

  private sendError(client: WSClient, error: string, requestId?: string): void {
    this.sendToClient(client, {
      type: "error",
      requestId,
      error,
    });
  }

  private pingClients(): void {
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    });
  }

  private cleanupDeadConnections(): void {
    const now = Date.now();
    const timeout = 60000; // 60 seconds

    this.clients.forEach((client, clientId) => {
      if (
        client.ws.readyState !== WebSocket.OPEN ||
        now - client.lastPingTime > timeout
      ) {
        this.removeClient(clientId);
      }
    });
  }

  private removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from user clients
    const userClientSet = this.userClients.get(client.userId);
    if (userClientSet) {
      userClientSet.delete(clientId);
      if (userClientSet.size === 0) {
        this.userClients.delete(client.userId);
      }
    }

    // Unsubscribe from all topics
    client.topics.forEach((topic) => {
      this.unsubscribeFromTopic(clientId, topic);
    });

    this.clients.delete(clientId);

    logger.info(
      { clientId, userId: client.userId },
      "WebSocket client disconnected"
    );
  }

  // Public methods for sending messages to users
  sendToUser(userId: string, message: any): void {
    const userClients = this.userClients.get(userId);
    if (!userClients) return;

    userClients.forEach((clientId) => {
      const client = this.clients.get(clientId);
      if (client) {
        this.sendToClient(client, {
          type: "notification",
          data: message,
        });
      }
    });
  }

  sendToTopic(topic: string, message: any): void {
    this.broadcastToTopic(topic, message);
  }

  getStats() {
    return {
      totalClients: this.clients.size,
      totalUsers: this.userClients.size,
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
    clearInterval(this.pingInterval);
    clearInterval(this.cleanupInterval);

    // Close all clients
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close();
      }
    });

    this.clients.clear();
    this.userClients.clear();
    this.topicSubscribers.clear();
  }
}

export const wsManager = new WSManager();
