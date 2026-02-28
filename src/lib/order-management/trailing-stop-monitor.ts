/**
 * Trailing Stop Monitor Service
 * 
 * Monitors positions and updates trailing stops in real-time:
 * - WebSocket price feeds
 * - ATR calculation
 * - Automatic stop updates
 * - Position protection
 * 
 * @module lib/order-management/trailing-stop-monitor
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { OrderManager, TrailingStopConfig } from './order-manager';
import { getCurrentPrice } from '@/lib/position-monitor';

// ==================== TYPES ====================

export interface TrailingStopState {
  positionId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  stopPrice: number;
  highestPrice: number;
  lowestPrice: number;
  activated: boolean;
  config: TrailingStopConfig;
  lastUpdate: Date;
}

export interface MonitorStats {
  positionsMonitored: number;
  stopsUpdated: number;
  stopsTriggered: number;
  avgUpdateTime: number;
}

// ==================== TRAILING STOP MONITOR CLASS ====================

export class TrailingStopMonitor {
  private positions: Map<string, TrailingStopState>;
  private orderManagers: Map<string, OrderManager>;
  private stats: MonitorStats;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor() {
    this.positions = new Map();
    this.orderManagers = new Map();
    this.stats = {
      positionsMonitored: 0,
      stopsUpdated: 0,
      stopsTriggered: 0,
      avgUpdateTime: 0,
    };
  }

  /**
   * Start monitoring
   */
  start(checkIntervalMs: number = 5000): void {
    if (this.isRunning) {
      logger.warn('TrailingStopMonitor already running');
      return;
    }

    this.isRunning = true;
    logger.info({ checkIntervalMs }, 'TrailingStopMonitor started');

    // Initial load
    this.loadActivePositions();

    // Start monitoring loop
    this.intervalId = setInterval(() => {
      this.monitorPositions();
    }, checkIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('TrailingStopMonitor stopped');
  }

  /**
   * Load active positions with trailing stops
   */
  private async loadActivePositions(): Promise<void> {
    try {
      const positions = await db.position.findMany({
        where: {
          status: 'OPEN',
          trailingStop: { not: null },
        },
      });

      for (const position of positions) {
        if (!position.trailingStop) continue;

        const config: TrailingStopConfig = JSON.parse(position.trailingStop);
        
        this.positions.set(position.id, {
          positionId: position.id,
          symbol: position.symbol,
          direction: position.direction as 'LONG' | 'SHORT',
          entryPrice: position.avgEntryPrice,
          currentPrice: position.currentPrice || position.avgEntryPrice,
          stopPrice: position.stopLoss || position.avgEntryPrice,
          highestPrice: position.highestPrice || position.avgEntryPrice,
          lowestPrice: position.lowestPrice || position.avgEntryPrice,
          activated: position.trailingActivated || false,
          config,
          lastUpdate: new Date(),
        });
      }

      this.stats.positionsMonitored = this.positions.size;
      logger.info({ count: this.positions.size }, 'Loaded active trailing stop positions');
    } catch (error) {
      logger.error({ error }, 'Failed to load active positions');
    }
  }

  /**
   * Monitor all positions
   */
  private async monitorPositions(): Promise<void> {
    const updatePromises: Promise<void>[] = [];

    for (const [positionId, state] of this.positions.entries()) {
      updatePromises.push(this.updatePosition(positionId, state));
    }

    await Promise.all(updatePromises);
  }

  /**
   * Update single position
   */
  private async updatePosition(
    positionId: string,
    state: TrailingStopState
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Get current price
      const currentPrice = await getCurrentPrice(state.symbol);
      if (!currentPrice) {
        logger.warn({ positionId, symbol: state.symbol }, 'No price data');
        return;
      }

      state.currentPrice = currentPrice;

      // Update highest/lowest price
      if (state.direction === 'LONG') {
        if (currentPrice > state.highestPrice) {
          state.highestPrice = currentPrice;
        }
      } else {
        if (currentPrice < state.lowestPrice) {
          state.lowestPrice = currentPrice;
        }
      }

      // Check if trailing stop should activate
      if (!state.activated) {
        const priceChange = state.direction === 'LONG'
          ? (currentPrice - state.entryPrice) / state.entryPrice
          : (state.entryPrice - currentPrice) / state.entryPrice;

        if (priceChange >= state.config.activationPercent / 100) {
          state.activated = true;
          logger.info({ positionId, priceChange }, 'Trailing stop activated');
        }
      }

      // Update trailing stop if activated
      if (state.activated) {
        const orderManager = this.getOrderManagerForPosition(positionId);
        
        const result = await orderManager.updateTrailingStop(
          positionId,
          currentPrice,
          state.direction
        );

        if (result.updated) {
          state.stopPrice = result.newStopPrice!;
          state.lastUpdate = new Date();
          this.stats.stopsUpdated++;
          
          logger.info({
            positionId,
            oldStop: state.stopPrice,
            newStop: result.newStopPrice,
            price: currentPrice,
          }, 'Trailing stop updated');
        }

        // Check if stop loss hit
        const stopHit = state.direction === 'LONG'
          ? currentPrice <= state.stopPrice
          : currentPrice >= state.stopPrice;

        if (stopHit) {
          await this.triggerStopLoss(positionId, state);
        }
      }

      // Update stats
      const updateTime = Date.now() - startTime;
      this.stats.avgUpdateTime = (this.stats.avgUpdateTime * this.stats.stopsUpdated + updateTime) / (this.stats.stopsUpdated + 1);

      // Update in memory
      this.positions.set(positionId, state);

    } catch (error) {
      logger.error({ error, positionId }, 'Failed to update position');
    }
  }

  /**
   * Trigger stop loss
   */
  private async triggerStopLoss(
    positionId: string,
    state: TrailingStopState
  ): Promise<void> {
    logger.warn({ positionId, symbol: state.symbol, stopPrice: state.stopPrice }, 'Stop loss triggered');

    try {
      const orderManager = this.getOrderManagerForPosition(positionId);

      // Get account for position
      const position = await db.position.findUnique({
        where: { id: positionId },
        include: { account: true },
      });

      if (!position || !position.account) {
        logger.error({ positionId }, 'Position or account not found');
        return;
      }

      // Close position
      const result = await orderManager.placeOrder({
        accountId: position.accountId,
        symbol: state.symbol,
        side: state.direction === 'LONG' ? 'SELL' : 'BUY',
        type: 'MARKET',
        quantity: position.totalAmount,
        reduceOnly: true,
      });

      if (result.success) {
        this.stats.stopsTriggered++;

        // Update position in database
        await db.position.update({
          where: { id: positionId },
          data: {
            status: 'CLOSED',
            closeReason: 'TRAILING',
            closedAt: new Date(),
          },
        });

        // Remove from monitoring
        this.positions.delete(positionId);
        this.stats.positionsMonitored = this.positions.size;

        logger.info({
          positionId,
          orderId: result.orderId,
          stopPrice: state.stopPrice,
        }, 'Position closed by trailing stop');
      }
    } catch (error) {
      logger.error({ error, positionId }, 'Failed to trigger stop loss');
    }
  }

  /**
   * Get or create order manager for position
   */
  private getOrderManagerForPosition(positionId: string): OrderManager {
    const state = this.positions.get(positionId);
    if (!state) {
      throw new Error(`Position ${positionId} not found`);
    }

    // Use accountId from position
    // For now, use a default approach
    return new OrderManager('default');
  }

  /**
   * Add position to monitoring
   */
  async addPosition(positionId: string): Promise<void> {
    const position = await db.position.findUnique({
      where: { id: positionId },
    });

    if (!position || !position.trailingStop) {
      logger.warn({ positionId }, 'Position not suitable for trailing stop');
      return;
    }

    const config: TrailingStopConfig = JSON.parse(position.trailingStop);

    this.positions.set(positionId, {
      positionId,
      symbol: position.symbol,
      direction: position.direction as 'LONG' | 'SHORT',
      entryPrice: position.avgEntryPrice,
      currentPrice: position.currentPrice || position.avgEntryPrice,
      stopPrice: position.stopLoss || position.avgEntryPrice,
      highestPrice: position.highestPrice || position.avgEntryPrice,
      lowestPrice: position.lowestPrice || position.avgEntryPrice,
      activated: position.trailingActivated || false,
      config,
      lastUpdate: new Date(),
    });

    this.stats.positionsMonitored = this.positions.size;
    logger.info({ positionId }, 'Position added to trailing stop monitor');
  }

  /**
   * Remove position from monitoring
   */
  removePosition(positionId: string): void {
    this.positions.delete(positionId);
    this.stats.positionsMonitored = this.positions.size;
    logger.info({ positionId }, 'Position removed from trailing stop monitor');
  }

  /**
   * Get monitor statistics
   */
  getStats(): MonitorStats {
    return { ...this.stats };
  }

  /**
   * Get monitored positions
   */
  getMonitoredPositions(): TrailingStopState[] {
    return Array.from(this.positions.values());
  }
}

// ==================== SINGLETON ====================

let monitorInstance: TrailingStopMonitor | null = null;

export function getTrailingStopMonitor(): TrailingStopMonitor {
  if (!monitorInstance) {
    monitorInstance = new TrailingStopMonitor();
  }
  return monitorInstance;
}

// ==================== EXPORTS ====================

export default {
  TrailingStopMonitor,
  getTrailingStopMonitor,
};
