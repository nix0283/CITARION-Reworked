/**
 * WebSocket Server
 * 
 * Real-time WebSocket server for live updates:
 * - Position updates
 * - Trade executions
 * - Price updates
 * - Notifications
 * - Dashboard data
 * 
 * @module lib/websocket/server
 */

import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface WSMessage {
  type: 'POSITION_UPDATE' | 'TRADE_EXECUTED' | 'PRICE_UPDATE' | 'NOTIFICATION' | 'DASHBOARD_DATA';
  payload: any;
  timestamp: Date;
}

export interface WSClient {
  id: string;
  ws: WebSocket;
  userId?: string;
  subscriptions: string[];
  lastPing: Date;
}

export interface WSServerConfig {
  port: number;
  pingInterval: number;
  maxClients: number;
  allowedOrigins: string[];
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: WSServerConfig = {
  port: 3001,
  pingInterval: 30000, // 30 seconds
  maxClients: 1000,
  allowedOrigins: ['http://localhost:3000', 'https://citarion.app'],
};

// ==================== WEBSOCKET SERVER CLASS ====================

export class WebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WSClient> = new Map();
  private config: WSServerConfig;
  private pingInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config?: Partial<WSServerConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Start WebSocket server
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('WebSocket server already running');
      return;
    }

    this.wss = new WebSocketServer({
      port: this.config.port,
      clientTracking: true,
    });

    this.wss.on('connection', (ws: WebSocket, request: any) => {
      this.handleConnection(ws, request);
    });

    this.wss.on('error', (error: Error) => {
      logger.error({ error }, 'WebSocket server error');
    });

    // Start ping interval
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, this.config.pingInterval);

    this.isRunning = true;
    logger.info({ port: this.config.port }, 'WebSocket server started');
  }

  /**
   * Stop WebSocket server
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    // Close all client connections
    for (const [clientId, client] of this.clients.entries()) {
      client.ws.close();
      this.clients.delete(clientId);
    }

    // Stop ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.isRunning = false;
    logger.info('WebSocket server stopped');
  }

  /**
   * Handle new connection
   */
  private handleConnection(ws: WebSocket, request: any): void {
    // Check origin
    const origin = request.headers.origin;
    if (origin && !this.config.allowedOrigins.includes(origin)) {
      logger.warn({ origin }, 'WebSocket connection rejected - invalid origin');
      ws.close(4003, 'Invalid origin');
      return;
    }

    // Check max clients
    if (this.clients.size >= this.config.maxClients) {
      logger.warn('WebSocket connection rejected - max clients reached');
      ws.close(4004, 'Server full');
      return;
    }

    // Generate client ID
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create client record
    const client: WSClient = {
      id: clientId,
      ws,
      subscriptions: [],
      lastPing: new Date(),
    };

    this.clients.set(clientId, client);
    logger.info({ clientId, origin }, 'WebSocket client connected');

    // Handle messages
    ws.on('message', (data: Buffer) => {
      this.handleMessage(client, data);
    });

    // Handle close
    ws.on('close', () => {
      this.handleClose(client);
    });

    // Handle error
    ws.on('error', (error: Error) => {
      logger.error({ clientId, error }, 'WebSocket client error');
    });

    // Send welcome message
    this.sendToClient(client, {
      type: 'NOTIFICATION',
      payload: {
        message: 'Connected to CITARION WebSocket',
        clientId,
      },
      timestamp: new Date(),
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(client: WSClient, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      logger.debug({ clientId: client.id, message }, 'WebSocket message received');

      switch (message.type) {
        case 'SUBSCRIBE':
          this.handleSubscribe(client, message.payload);
          break;
        case 'UNSUBSCRIBE':
          this.handleUnsubscribe(client, message.payload);
          break;
        case 'AUTHENTICATE':
          this.handleAuthenticate(client, message.payload);
          break;
        case 'PING':
          this.handlePing(client);
          break;
        default:
          logger.warn({ clientId: client.id, type: message.type }, 'Unknown message type');
      }
    } catch (error) {
      logger.error({ clientId: client.id, error }, 'Failed to parse WebSocket message');
    }
  }

  /**
   * Handle subscribe
   */
  private handleSubscribe(client: WSClient, payload: { channel: string }): void {
    if (!client.subscriptions.includes(payload.channel)) {
      client.subscriptions.push(payload.channel);
      logger.info({ clientId: client.id, channel: payload.channel }, 'Client subscribed');
    }
  }

  /**
   * Handle unsubscribe
   */
  private handleUnsubscribe(client: WSClient, payload: { channel: string }): void {
    const index = client.subscriptions.indexOf(payload.channel);
    if (index > -1) {
      client.subscriptions.splice(index, 1);
      logger.info({ clientId: client.id, channel: payload.channel }, 'Client unsubscribed');
    }
  }

  /**
   * Handle authenticate
   */
  private handleAuthenticate(client: WSClient, payload: { userId: string; token: string }): void {
    // In production, validate token
    client.userId = payload.userId;
    logger.info({ clientId: client.id, userId: payload.userId }, 'Client authenticated');
  }

  /**
   * Handle ping
   */
  private handlePing(client: WSClient): void {
    client.lastPing = new Date();
    this.sendToClient(client, {
      type: 'PONG',
      payload: { timestamp: new Date() },
      timestamp: new Date(),
    });
  }

  /**
   * Handle close
   */
  private handleClose(client: WSClient): void {
    this.clients.delete(client.id);
    logger.info({ clientId: client.id }, 'WebSocket client disconnected');
  }

  /**
   * Ping all clients
   */
  private pingClients(): void {
    const now = new Date();
    const timeout = this.config.pingInterval * 2;

    for (const [clientId, client] of this.clients.entries()) {
      const timeSincePing = now.getTime() - client.lastPing.getTime();

      if (timeSincePing > timeout) {
        // Client not responding, close connection
        logger.warn({ clientId }, 'WebSocket client timeout');
        client.ws.close();
        this.clients.delete(clientId);
      } else {
        // Send ping
        client.ws.ping();
      }
    }
  }

  /**
   * Send message to client
   */
  sendToClient(client: WSClient, message: WSMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message to all clients
   */
  broadcast(message: WSMessage, excludeClientId?: string): void {
    const messageStr = JSON.stringify(message);

    for (const [clientId, client] of this.clients.entries()) {
      if (clientId === excludeClientId) continue;

      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(messageStr);
      }
    }

    logger.debug({ type: message.type, clients: this.clients.size }, 'Message broadcast');
  }

  /**
   * Broadcast to channel subscribers
   */
  broadcastToChannel(channel: string, message: WSMessage): void {
    const messageStr = JSON.stringify(message);

    for (const client of this.clients.values()) {
      if (client.subscriptions.includes(channel) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(messageStr);
      }
    }
  }

  /**
   * Send to user
   */
  sendToUser(userId: string, message: WSMessage): void {
    const messageStr = JSON.stringify(message);

    for (const client of this.clients.values()) {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(messageStr);
      }
    }
  }

  /**
   * Get connected clients count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get server stats
   */
  getStats(): {
    connectedClients: number;
    authenticatedClients: number;
    uptime: number;
  } {
    const authenticatedClients = Array.from(this.clients.values()).filter(
      c => c.userId
    ).length;

    return {
      connectedClients: this.clients.size,
      authenticatedClients,
      uptime: this.isRunning ? Date.now() : 0,
    };
  }

  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }
}

// ==================== SINGLETON ====================

let serverInstance: WebSocketServer | null = null;

export function getWebSocketServer(config?: Partial<WSServerConfig>): WebSocketServer {
  if (!serverInstance) {
    serverInstance = new WebSocketServer(config);
  }
  return serverInstance;
}

// ==================== EXPORTS ====================

export default {
  WebSocketServer,
  getWebSocketServer,
  DEFAULT_CONFIG,
};
