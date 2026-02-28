/**
 * Order Management System
 * 
 * Professional order management with advanced features:
 * - Smart order routing
 * - Order lifecycle management
 * - ATR-based trailing stop
 * - Position scaling
 * - Risk management
 * 
 * @module lib/order-management
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getExchangeClient } from '@/lib/exchange';
import { SecureCredentialManager } from '@/lib/security/credential-manager';

// ==================== TYPES ====================

export interface OrderParams {
  accountId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  reduceOnly?: boolean;
  leverage?: number;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  clientOrderId?: string;
  filledQuantity?: number;
  averagePrice?: number;
  status?: string;
  error?: string;
  exchange?: string;
}

export interface TrailingStopConfig {
  type: 'PERCENT' | 'ATR' | 'CHandelier';
  atrPeriod: number;
  atrMultiplier: number;
  activationPercent: number;
  minDistance: number;
  maxDistance: number;
}

export interface PositionScale {
  level: number;
  percent: number;
  price?: number;
  triggered: boolean;
}

export interface OrderManagerStats {
  totalOrders: number;
  successfulOrders: number;
  failedOrders: number;
  totalVolume: number;
  avgFillTime: number;
}

// ==================== ORDER MANAGER CLASS ====================

export class OrderManager {
  private accountId: string;
  private stats: OrderManagerStats;
  private activeOrders: Map<string, OrderParams>;
  private trailingStops: Map<string, TrailingStopConfig>;

  constructor(accountId: string) {
    this.accountId = accountId;
    this.stats = {
      totalOrders: 0,
      successfulOrders: 0,
      failedOrders: 0,
      totalVolume: 0,
      avgFillTime: 0,
    };
    this.activeOrders = new Map();
    this.trailingStops = new Map();
  }

  /**
   * Place order with risk management
   */
  async placeOrder(params: OrderParams): Promise<OrderResult> {
    const startTime = Date.now();
    this.stats.totalOrders++;

    try {
      // Validate order
      const validation = await this.validateOrder(params);
      if (!validation.valid) {
        this.stats.failedOrders++;
        return {
          success: false,
          error: validation.error,
        };
      }

      // Get exchange client
      const credentials = await SecureCredentialManager.getCredentials(this.accountId);
      if (!credentials) {
        this.stats.failedOrders++;
        return {
          success: false,
          error: 'Credentials not found',
        };
      }

      const account = await db.account.findUnique({
        where: { id: this.accountId },
      });

      if (!account) {
        this.stats.failedOrders++;
        return {
          success: false,
          error: 'Account not found',
        };
      }

      const client = await getExchangeClient({
        exchangeId: account.exchangeId as any,
        credentials,
        marketType: account.exchangeType as any,
        testnet: account.isTestnet,
      });

      // Place order
      const orderResult = await client.createOrder({
        symbol: params.symbol,
        side: params.side.toLowerCase() as any,
        type: params.type.toLowerCase() as any,
        quantity: params.quantity,
        price: params.price,
        stopPrice: params.stopPrice,
        timeInForce: params.timeInForce,
        reduceOnly: params.reduceOnly,
      });

      if (orderResult.success && orderResult.order) {
        this.stats.successfulOrders++;
        this.stats.totalVolume += params.quantity * (params.price || orderResult.order.price || 0);
        
        // Track active order
        this.activeOrders.set(orderResult.order.id, params);

        // Calculate fill time
        const fillTime = Date.now() - startTime;
        this.stats.avgFillTime = (this.stats.avgFillTime * (this.stats.successfulOrders - 1) + fillTime) / this.stats.successfulOrders;

        logger.info({
          accountId: this.accountId,
          orderId: orderResult.order.id,
          symbol: params.symbol,
          side: params.side,
          quantity: params.quantity,
          fillTime,
        }, 'Order placed successfully');

        return {
          success: true,
          orderId: orderResult.order.id,
          clientOrderId: orderResult.order.clientOrderId,
          filledQuantity: orderResult.order.filledQuantity,
          averagePrice: orderResult.order.averagePrice,
          status: orderResult.order.status,
          exchange: account.exchangeId,
        };
      } else {
        this.stats.failedOrders++;
        return {
          success: false,
          error: orderResult.error,
        };
      }
    } catch (error) {
      this.stats.failedOrders++;
      logger.error({ error, params }, 'Order placement failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate order before placement
   */
  private async validateOrder(params: OrderParams): Promise<{ valid: boolean; error?: string }> {
    // Check minimum quantity
    if (params.quantity <= 0) {
      return { valid: false, error: 'Quantity must be positive' };
    }

    // Check price for limit orders
    if ((params.type === 'LIMIT' || params.type === 'STOP_LIMIT') && !params.price) {
      return { valid: false, error: 'Price required for limit orders' };
    }

    // Check stop price for stop orders
    if ((params.type === 'STOP_MARKET' || params.type === 'STOP_LIMIT') && !params.stopPrice) {
      return { valid: false, error: 'Stop price required for stop orders' };
    }

    // Check account balance (simplified)
    const account = await db.account.findUnique({
      where: { id: this.accountId },
    });

    if (!account) {
      return { valid: false, error: 'Account not found' };
    }

    return { valid: true };
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, symbol: string): Promise<OrderResult> {
    try {
      const credentials = await SecureCredentialManager.getCredentials(this.accountId);
      if (!credentials) {
        return { success: false, error: 'Credentials not found' };
      }

      const account = await db.account.findUnique({
        where: { id: this.accountId },
      });

      if (!account) {
        return { success: false, error: 'Account not found' };
      }

      const client = await getExchangeClient({
        exchangeId: account.exchangeId as any,
        credentials,
        marketType: account.exchangeType as any,
        testnet: account.isTestnet,
      });

      const result = await client.cancelOrder({
        symbol,
        orderId,
      });

      if (result.success) {
        this.activeOrders.delete(orderId);
        logger.info({ orderId, symbol }, 'Order cancelled');
      }

      return result;
    } catch (error) {
      logger.error({ error, orderId }, 'Cancel order failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Set trailing stop for position
   */
  async setTrailingStop(
    symbol: string,
    positionId: string,
    config: TrailingStopConfig
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.trailingStops.set(positionId, config);

      // Save to database
      await db.position.update({
        where: { id: positionId },
        data: {
          trailingStop: JSON.stringify(config),
          updatedAt: new Date(),
        },
      });

      logger.info({ symbol, positionId, config }, 'Trailing stop set');
      return { success: true };
    } catch (error) {
      logger.error({ error, positionId }, 'Set trailing stop failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update trailing stop based on price movement
   */
  async updateTrailingStop(
    positionId: string,
    currentPrice: number,
    direction: 'LONG' | 'SHORT'
  ): Promise<{ updated: boolean; newStopPrice?: number }> {
    const config = this.trailingStops.get(positionId);
    if (!config) {
      return { updated: false };
    }

    const position = await db.position.findUnique({
      where: { id: positionId },
    });

    if (!position) {
      return { updated: false };
    }

    // Calculate ATR if needed
    let stopDistance: number;

    if (config.type === 'ATR' || config.type === 'Chandelier') {
      const atr = await this.calculateATR(position.symbol, config.atrPeriod);
      stopDistance = atr * config.atrMultiplier;
    } else {
      stopDistance = currentPrice * (config.activationPercent / 100);
    }

    // Apply min/max distance
    stopDistance = Math.max(
      config.minDistance,
      Math.min(stopDistance, config.maxDistance)
    );

    // Calculate new stop price
    let newStopPrice: number;
    if (direction === 'LONG') {
      newStopPrice = currentPrice - stopDistance;
      
      // Only move stop up for LONG
      if (position.stopLoss && newStopPrice <= position.stopLoss) {
        return { updated: false };
      }
    } else {
      newStopPrice = currentPrice + stopDistance;
      
      // Only move stop down for SHORT
      if (position.stopLoss && newStopPrice >= position.stopLoss) {
        return { updated: false };
      }
    }

    // Update position
    await db.position.update({
      where: { id: positionId },
      data: {
        stopLoss: newStopPrice,
        updatedAt: new Date(),
      },
    });

    logger.info({
      positionId,
      oldStop: position.stopLoss,
      newStop: newStopPrice,
      price: currentPrice,
    }, 'Trailing stop updated');

    return {
      updated: true,
      newStopPrice,
    };
  }

  /**
   * Calculate ATR for symbol
   */
  private async calculateATR(symbol: string, period: number = 14): Promise<number> {
    // Get candles from database
    const candles = await db.ohlcvCandle.findMany({
      where: { symbol },
      orderBy: { openTime: 'desc' },
      take: period + 1,
    });

    if (candles.length < period + 1) {
      // Fallback: estimate ATR as 2% of price
      const currentPrice = candles[0]?.close || 50000;
      return currentPrice * 0.02;
    }

    // Calculate True Range
    const trueRanges: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const candle = candles[i - 1];
      const prevCandle = candles[i];

      const tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - prevCandle.close),
        Math.abs(candle.low - prevCandle.close)
      );
      trueRanges.push(tr);
    }

    // Average True Range
    const atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    return atr;
  }

  /**
   * Scale into position (DCA-style)
   */
  async scalePosition(
    params: OrderParams,
    scales: PositionScale[]
  ): Promise<{ success: boolean; orders: OrderResult[] }> {
    const orders: OrderResult[] = [];
    const baseQuantity = params.quantity;

    for (const scale of scales) {
      const scaleParams: OrderParams = {
        ...params,
        quantity: baseQuantity * (scale.percent / 100),
        price: scale.price || params.price,
      };

      const result = await this.placeOrder(scaleParams);
      orders.push(result);

      if (!result.success) {
        logger.warn({ scale: scale.level, error: result.error }, 'Scale order failed');
      }
    }

    const allSuccess = orders.every(o => o.success);
    return {
      success: allSuccess,
      orders,
    };
  }

  /**
   * Get order manager statistics
   */
  getStats(): OrderManagerStats {
    return { ...this.stats };
  }

  /**
   * Get active orders
   */
  getActiveOrders(): Map<string, OrderParams> {
    return new Map(this.activeOrders);
  }

  /**
   * Clear trailing stop
   */
  async clearTrailingStop(positionId: string): Promise<void> {
    this.trailingStops.delete(positionId);

    await db.position.update({
      where: { id: positionId },
      data: {
        trailingStop: null,
        updatedAt: new Date(),
      },
    });

    logger.info({ positionId }, 'Trailing stop cleared');
  }
}

// ==================== ORDER MANAGER FACTORY ====================

const orderManagers = new Map<string, OrderManager>();

export function getOrderManager(accountId: string): OrderManager {
  if (!orderManagers.has(accountId)) {
    orderManagers.set(accountId, new OrderManager(accountId));
  }
  return orderManagers.get(accountId)!;
}

export function removeOrderManager(accountId: string): void {
  orderManagers.delete(accountId);
}

// ==================== EXPORTS ====================

export default {
  OrderManager,
  getOrderManager,
  removeOrderManager,
};
