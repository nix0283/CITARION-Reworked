/**
 * WebSocket Price Server
 * 
 * Real-time price streaming via WebSocket:
 * - Connects to exchange WebSocket APIs
 * - Broadcasts price updates to clients
 * - Supports multiple symbols and exchanges
 * - Automatic reconnection on disconnect
 * 
 * @module lib/websocket/price-server
 */

import WebSocket from 'ws';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface PriceUpdate {
  symbol: string;
  exchange: string;
  price: number;
  bidPrice?: number;
  askPrice?: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  priceChangePercent?: number;
  timestamp: Date;
}

export interface WebSocketClient {
  ws: WebSocket;
  subscriptions: Set<string>; // symbol:exchange
  lastPing: number;
}

export interface WebSocketServerConfig {
  port: number;
  pingInterval: number;
  reconnectDelay: number;
  maxReconnectAttempts: number;
}

// ==================== PRICE WEBSOCKET SERVER ====================

export class PriceWebSocketServer {
  private wss: WebSocket.Server | null = null;
  private clients: Map<string, WebSocketClient> = new Map();
  private exchangeConnections: Map<string, WebSocket> = new Map();
  private config: WebSocketServerConfig;
  private reconnectAttempts: Map<string, number> = new Map();
  private priceCache: Map<string, PriceUpdate> = new Map();
  private isRunning: boolean = false;

  constructor(config?: Partial<WebSocketServerConfig>) {
    this.config = {
      port: 8765,
      pingInterval: 30000,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
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

    this.wss = new WebSocket.Server({ port: this.config.port });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId();
      this.handleConnection(ws, clientId, req);
    });

    this.wss.on('error', (error) => {
      logger.error({ error }, 'WebSocket server error');
    });

    // Start ping interval
    setInterval(() => this.pingClients(), this.config.pingInterval);

    this.isRunning = true;
    logger.info({ port: this.config.port }, 'WebSocket price server started');

    // Connect to exchanges
    this.connectToExchanges();
  }

  /**
   * Stop WebSocket server
   */
  stop(): void {
    if (!this.wss) return;

    this.isRunning = false;

    // Close all client connections
    this.clients.forEach((client) => {
      client.ws.close();
    });
    this.clients.clear();

    // Close all exchange connections
    this.exchangeConnections.forEach((ws) => {
      ws.close();
    });
    this.exchangeConnections.clear();

    this.wss.close();
    this.wss = null;

    logger.info('WebSocket price server stopped');
  }

  /**
   * Handle new client connection
   */
  private handleConnection(ws: WebSocket, clientId: string, req: any): void {
    const client: WebSocketClient = {
      ws,
      subscriptions: new Set(),
      lastPing: Date.now(),
    };

    this.clients.set(clientId, client);

    logger.info({ clientId, ip: req.socket.remoteAddress }, 'Client connected');

    ws.on('message', (data) => {
      this.handleMessage(client, data.toString());
    });

    ws.on('close', () => {
      this.clients.delete(clientId);
      logger.info({ clientId }, 'Client disconnected');
    });

    ws.on('error', (error) => {
      logger.error({ clientId, error }, 'Client error');
      this.clients.delete(clientId);
    });

    // Send welcome message
    this.sendToClient(client, {
      type: 'connected',
      clientId,
      serverTime: new Date().toISOString(),
    });
  }

  /**
   * Handle client message
   */
  private handleMessage(client: WebSocketClient, message: string): void {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'subscribe':
          this.handleSubscribe(client, data.symbols);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(client, data.symbols);
          break;
        case 'ping':
          client.lastPing = Date.now();
          this.sendToClient(client, { type: 'pong', timestamp: Date.now() });
          break;
        default:
          logger.warn({ type: data.type }, 'Unknown message type');
      }
    } catch (error) {
      logger.error({ error, message }, 'Failed to parse client message');
    }
  }

  /**
   * Handle subscription request
   */
  private handleSubscribe(client: WebSocketClient, symbols: string[]): void {
    symbols.forEach((symbol: string) => {
      const [base, exchange] = symbol.split(':');
      const key = `${base}:${exchange || 'binance'}`;
      client.subscriptions.add(key);

      // Send cached price if available
      const cachedPrice = this.priceCache.get(key);
      if (cachedPrice) {
        this.sendToClient(client, {
          type: 'price',
          ...cachedPrice,
        });
      }
    });

    logger.info(
      { clientId: this.getClientId(client), subscriptions: client.subscriptions.size },
      'Client subscribed'
    );
  }

  /**
   * Handle unsubscription request
   */
  private handleUnsubscribe(client: WebSocketClient, symbols: string[]): void {
    symbols.forEach((symbol: string) => {
      client.subscriptions.delete(symbol);
    });

    logger.info(
      { clientId: this.getClientId(client), subscriptions: client.subscriptions.size },
      'Client unsubscribed'
    );
  }

  /**
   * Connect to exchange WebSocket APIs
   */
  private connectToExchanges(): void {
    // Binance WebSocket
    this.connectToBinance();

    // Bybit WebSocket
    this.connectToBybit();

    // Add more exchanges as needed
  }

  /**
   * Connect to Binance WebSocket
   */
  private connectToBinance(): void {
    const wsUrl = 'wss://stream.binance.com:9443/ws';
    this.connectExchange('binance', wsUrl);
  }

  /**
   * Connect to Bybit WebSocket
   */
  private connectToBybit(): void {
    const wsUrl = 'wss://stream.bybit.com/v5/public/linear';
    this.connectExchange('bybit', wsUrl);
  }

  /**
   * Connect to exchange WebSocket
   */
  private connectExchange(exchange: string, wsUrl: string): void {
    if (this.exchangeConnections.has(exchange)) {
      return;
    }

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      logger.info({ exchange }, 'Exchange WebSocket connected');
      this.reconnectAttempts.delete(exchange);

      // Subscribe to ticker streams
      this.subscribeToExchange(exchange, ws);
    });

    ws.on('message', (data) => {
      this.handleExchangeMessage(exchange, data.toString());
    });

    ws.on('close', () => {
      logger.warn({ exchange }, 'Exchange WebSocket closed');
      this.exchangeConnections.delete(exchange);
      this.reconnectExchange(exchange, wsUrl);
    });

    ws.on('error', (error) => {
      logger.error({ exchange, error }, 'Exchange WebSocket error');
      this.exchangeConnections.delete(exchange);
      this.reconnectExchange(exchange, wsUrl);
    });

    this.exchangeConnections.set(exchange, ws);
  }

  /**
   * Reconnect to exchange with exponential backoff
   */
  private reconnectExchange(exchange: string, wsUrl: string): void {
    if (!this.isRunning) return;

    const attempts = this.reconnectAttempts.get(exchange) || 0;
    if (attempts >= this.config.maxReconnectAttempts) {
      logger.error({ exchange, attempts }, 'Max reconnection attempts reached');
      return;
    }

    const delay = this.config.reconnectDelay * Math.pow(2, attempts);
    logger.info({ exchange, delay, attempts }, 'Reconnecting to exchange');

    this.reconnectAttempts.set(exchange, attempts + 1);

    setTimeout(() => {
      if (this.isRunning && !this.exchangeConnections.has(exchange)) {
        this.connectExchange(exchange, wsUrl);
      }
    }, delay);
  }

  /**
   * Subscribe to exchange streams
   */
  private subscribeToExchange(exchange: string, ws: WebSocket): void {
    if (exchange === 'binance') {
      // Subscribe to all mini-tickers
      const subscribeMsg = {
        method: 'SUBSCRIBE',
        params: ['!miniTicker@arr'],
        id: 1,
      };
      ws.send(JSON.stringify(subscribeMsg));
    } else if (exchange === 'bybit') {
      // Subscribe to tickers
      const subscribeMsg = {
        op: 'subscribe',
        args: ['tickers.BTCUSDT', 'tickers.ETHUSDT', 'tickers.SOLUSDT'],
      };
      ws.send(JSON.stringify(subscribeMsg));
    }
  }

  /**
   * Handle exchange message
   */
  private handleExchangeMessage(exchange: string, message: string): void {
    try {
      const data = JSON.parse(message);

      if (exchange === 'binance') {
        this.handleBinanceMessage(data);
      } else if (exchange === 'bybit') {
        this.handleBybitMessage(data);
      }
    } catch (error) {
      logger.error({ exchange, error, message }, 'Failed to parse exchange message');
    }
  }

  /**
   * Handle Binance message
   */
  private handleBinanceMessage(data: any): void {
    // Handle array of tickers
    if (Array.isArray(data)) {
      data.forEach((ticker: any) => {
        this.processPriceUpdate({
          symbol: ticker.s,
          exchange: 'binance',
          price: parseFloat(ticker.c),
          bidPrice: parseFloat(ticker.b),
          askPrice: parseFloat(ticker.a),
          high24h: parseFloat(ticker.h),
          low24h: parseFloat(ticker.l),
          volume24h: parseFloat(ticker.v),
          priceChangePercent: parseFloat(ticker.P),
          timestamp: new Date(ticker.E),
        });
      });
    }
  }

  /**
   * Handle Bybit message
   */
  private handleBybitMessage(data: any): void {
    if (data.topic && data.topic.startsWith('tickers.')) {
      const symbol = data.topic.replace('tickers.', '');
      const ticker = data.data;

      this.processPriceUpdate({
        symbol,
        exchange: 'bybit',
        price: parseFloat(ticker.lastPrice),
        bidPrice: parseFloat(ticker.bid1Price),
        askPrice: parseFloat(ticker.ask1Price),
        high24h: parseFloat(ticker.highPrice24h),
        low24h: parseFloat(ticker.lowPrice24h),
        volume24h: parseFloat(ticker.volume24h),
        priceChangePercent: parseFloat(ticker.price24hPcnt),
        timestamp: new Date(ticker.timestamp),
      });
    }
  }

  /**
   * Process price update
   */
  private async processPriceUpdate(update: PriceUpdate): Promise<void> {
    const key = `${update.symbol}:${update.exchange}`;

    // Update cache
    this.priceCache.set(key, update);

    // Update database (throttled)
    await this.updateMarketPrice(update);

    // Broadcast to subscribed clients
    this.broadcast(key, {
      type: 'price',
      ...update,
    });
  }

  /**
   * Update market price in database
   */
  private async updateMarketPrice(update: PriceUpdate): Promise<void> {
    try {
      await db.marketPrice.upsert({
        where: { symbol: update.symbol },
        update: {
          price: update.price,
          bidPrice: update.bidPrice,
          askPrice: update.askPrice,
          high24h: update.high24h,
          low24h: update.low24h,
          volume24h: update.volume24h,
          priceChangePercent: update.priceChangePercent,
          lastUpdate: update.timestamp,
        },
        create: {
          symbol: update.symbol,
          exchange: update.exchange.toUpperCase(),
          price: update.price,
          bidPrice: update.bidPrice,
          askPrice: update.askPrice,
          high24h: update.high24h,
          low24h: update.low24h,
          volume24h: update.volume24h,
          priceChangePercent: update.priceChangePercent,
          lastUpdate: update.timestamp,
        },
      });

      // Also update MarketData for ML
      await db.marketData.create({
        data: {
          symbol: update.symbol,
          exchange: update.exchange,
          priceChange24h: update.priceChangePercent || 0,
          high24h: update.high24h,
          low24h: update.low24h,
          volume24h: update.volume24h,
          volatility24h: Math.abs(update.priceChangePercent || 0) / 100,
        },
      });
    } catch (error) {
      logger.error({ error, symbol: update.symbol }, 'Failed to update market price');
    }
  }

  /**
   * Broadcast message to subscribed clients
   */
  private broadcast(key: string, message: any): void {
    const messageStr = JSON.stringify(message);

    this.clients.forEach((client, clientId) => {
      if (client.subscriptions.has(key) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(messageStr);
      }
    });
  }

  /**
   * Send message to specific client
   */
  private sendToClient(client: WebSocketClient, message: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Ping all clients
   */
  private pingClients(): void {
    const now = Date.now();
    const timeout = this.config.pingInterval * 2;

    this.clients.forEach((client, clientId) => {
      if (now - client.lastPing > timeout) {
        logger.warn({ clientId }, 'Client timeout, disconnecting');
        client.ws.terminate();
        this.clients.delete(clientId);
      } else {
        client.ws.ping();
      }
    });
  }

  /**
   * Generate client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get client ID from client object
   */
  private getClientId(client: WebSocketClient): string {
    for (const [id, c] of this.clients.entries()) {
      if (c === client) return id;
    }
    return 'unknown';
  }

  /**
   * Get server stats
   */
  getStats(): {
    clientCount: number;
    exchangeConnections: number;
    priceCacheSize: number;
    isRunning: boolean;
  } {
    return {
      clientCount: this.clients.size,
      exchangeConnections: this.exchangeConnections.size,
      priceCacheSize: this.priceCache.size,
      isRunning: this.isRunning,
    };
  }
}

// ==================== SINGLETON ====================

let serverInstance: PriceWebSocketServer | null = null;

export function getPriceWebSocketServer(config?: Partial<WebSocketServerConfig>): PriceWebSocketServer {
  if (!serverInstance) {
    serverInstance = new PriceWebSocketServer(config);
  }
  return serverInstance;
}

// ==================== EXPORTS ====================

export default {
  PriceWebSocketServer,
  getPriceWebSocketServer,
};
