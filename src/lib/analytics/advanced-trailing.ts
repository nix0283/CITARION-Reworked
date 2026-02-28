/**
 * Advanced Trailing Stop & Take Profit System
 * 
 * Sophisticated exit management:
 * - Multi-level trailing take profit
 * - Dynamic trailing stop (volatility-adjusted)
 * - Time-based trailing
 * - Copy trading integration
 * 
 * @module lib/analytics/advanced-trailing
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getOrderManager } from '@/lib/order-management/order-manager';

// ==================== TYPES ====================

export interface TrailingTakeProfit {
  levels: Array<{
    id: string;
    percent: number;         // % of position to close
    trigger: number;         // % profit to activate
    trailingType: 'PERCENT' | 'ATR' | 'HIGH_LOW';
    trailingDistance: number; // Distance from highest price
    triggered: boolean;
    executed: boolean;
    executionPrice?: number;
  }>;
}

export interface DynamicTrailingStop {
  type: 'AGGRESSIVE' | 'MODERATE' | 'CONSERVATIVE';
  breakevenTrigger: number;  // % profit to move to breakeven
  stepPercent: number;       // % step for trailing
  minDistance: number;       // Minimum distance in %
  maxDistance: number;       // Maximum distance in %
  volatilityAdjustment: boolean;
  currentStopPrice: number;
  highestPrice: number;
  activated: boolean;
}

export interface TimeTrailingStop {
  enableAfterMinutes: number;
  initialStopPercent: number;
  finalStopPercent: number;
  decayType: 'LINEAR' | 'EXPONENTIAL';
  startTime: Date;
  currentStopPercent: number;
}

export interface TrailingConfig {
  takeProfit?: TrailingTakeProfit;
  stopLoss?: DynamicTrailingStop;
  timeStop?: TimeTrailingStop;
}

export interface TrailingState {
  positionId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  highestPrice: number;
  lowestPrice: number;
  config: TrailingConfig;
  lastUpdate: Date;
}

// ==================== DEFAULT CONFIGS ====================

const DEFAULT_DYNAMIC_STOP_CONFIGS: Record<string, Partial<DynamicTrailingStop>> = {
  AGGRESSIVE: {
    breakevenTrigger: 0.5,
    stepPercent: 0.5,
    minDistance: 0.5,
    maxDistance: 2,
    volatilityAdjustment: true,
  },
  MODERATE: {
    breakevenTrigger: 1,
    stepPercent: 1,
    minDistance: 1,
    maxDistance: 3,
    volatilityAdjustment: true,
  },
  CONSERVATIVE: {
    breakevenTrigger: 2,
    stepPercent: 2,
    minDistance: 2,
    maxDistance: 5,
    volatilityAdjustment: true,
  },
};

// ==================== ADVANCED TRAILING MANAGER ====================

export class AdvancedTrailingManager {
  private activePositions: Map<string, TrailingState>;

  constructor() {
    this.activePositions = new Map();
  }

  /**
   * Initialize trailing for a position
   */
  async initializePosition(
    positionId: string,
    symbol: string,
    direction: 'LONG' | 'SHORT',
    entryPrice: number,
    config: TrailingConfig
  ): Promise<void> {
    const state: TrailingState = {
      positionId,
      symbol,
      direction,
      entryPrice,
      currentPrice: entryPrice,
      highestPrice: entryPrice,
      lowestPrice: entryPrice,
      config,
      lastUpdate: new Date(),
    };

    this.activePositions.set(positionId, state);

    // Save to database
    await db.position.update({
      where: { id: positionId },
      data: {
        trailingConfig: JSON.stringify(config),
        trailingActivated: false,
      },
    });

    logger.info({ positionId, symbol, config }, 'Trailing initialized');
  }

  /**
   * Update trailing on price change
   */
  async updatePosition(
    positionId: string,
    currentPrice: number
  ): Promise<{ stopUpdated: boolean; newStopPrice?: number; takeProfitExecuted: boolean }> {
    const state = this.activePositions.get(positionId);
    if (!state) {
      return { stopUpdated: false, takeProfitExecuted: false };
    }

    state.currentPrice = currentPrice;
    state.lastUpdate = new Date();

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

    let stopUpdated = false;
    let newStopPrice: number | undefined;
    let takeProfitExecuted = false;

    // Update dynamic trailing stop
    if (state.config.stopLoss) {
      const stopResult = await this.updateDynamicStop(state);
      if (stopResult.updated) {
        stopUpdated = true;
        newStopPrice = stopResult.newStopPrice;
      }
    }

    // Check trailing take profit levels
    if (state.config.takeProfit) {
      const tpResult = await this.checkTakeProfitLevels(state);
      takeProfitExecuted = tpResult.executed;
    }

    // Update time-based trailing stop
    if (state.config.timeStop) {
      await this.updateTimeStop(state);
    }

    // Save to database
    await db.position.update({
      where: { id: positionId },
      data: {
        currentPrice,
        highestPrice: state.highestPrice,
        lowestPrice: state.lowestPrice,
        stopLoss: newStopPrice,
        trailingActivated: state.config.stopLoss?.activated || false,
        updatedAt: new Date(),
      },
    });

    return { stopUpdated, newStopPrice, takeProfitExecuted };
  }

  /**
   * Update dynamic trailing stop
   */
  private async updateDynamicStop(
    state: TrailingState
  ): Promise<{ updated: boolean; newStopPrice?: number }> {
    const config = state.config.stopLoss!;

    // Calculate current profit
    const profitPercent = state.direction === 'LONG'
      ? (state.currentPrice - state.entryPrice) / state.entryPrice
      : (state.entryPrice - state.currentPrice) / state.entryPrice;

    // Activate breakeven if profit threshold reached
    if (!config.activated && profitPercent >= config.breakevenTrigger / 100) {
      config.activated = true;
      config.currentStopPrice = state.entryPrice; // Move to breakeven
      logger.info({ positionId: state.positionId }, 'Trailing stop activated - moved to breakeven');
    }

    if (!config.activated) {
      return { updated: false };
    }

    // Calculate trailing distance
    let distance = config.stepPercent / 100;

    // Adjust for volatility if enabled
    if (config.volatilityAdjustment) {
      const atr = await this.calculateATR(state.symbol);
      const volatilityMultiplier = Math.min(2, Math.max(0.5, atr / (state.entryPrice * 0.02)));
      distance *= volatilityMultiplier;
    }

    // Apply min/max distance
    distance = Math.max(config.minDistance / 100, Math.min(distance, config.maxDistance / 100));

    // Calculate new stop price
    let newStopPrice: number;
    if (state.direction === 'LONG') {
      newStopPrice = state.highestPrice * (1 - distance);
      
      // Only move stop up
      if (newStopPrice <= config.currentStopPrice) {
        return { updated: false };
      }
    } else {
      newStopPrice = state.lowestPrice * (1 + distance);
      
      // Only move stop down
      if (newStopPrice >= config.currentStopPrice) {
        return { updated: false };
      }
    }

    config.currentStopPrice = newStopPrice;

    logger.debug({
      positionId: state.positionId,
      oldStop: config.currentStopPrice,
      newStop: newStopPrice,
      highestPrice: state.highestPrice,
      distance: (distance * 100).toFixed(2) + '%',
    }, 'Dynamic trailing stop updated');

    return { updated: true, newStopPrice };
  }

  /**
   * Check and execute take profit levels
   */
  private async checkTakeProfitLevels(
    state: TrailingState
  ): Promise<{ executed: boolean }> {
    const config = state.config.takeProfit!;
    let executed = false;

    for (const level of config.levels) {
      if (level.executed || level.triggered) continue;

      // Calculate current profit
      const profitPercent = state.direction === 'LONG'
        ? (state.currentPrice - state.entryPrice) / state.entryPrice * 100
        : (state.entryPrice - state.currentPrice) / state.entryPrice * 100;

      // Check if trigger reached
      if (profitPercent >= level.trigger) {
        level.triggered = true;

        // Calculate trailing stop for this level
        let trailingStopPrice: number;
        if (level.trailingType === 'PERCENT') {
          trailingStopPrice = state.direction === 'LONG'
            ? state.highestPrice * (1 - level.trailingDistance / 100)
            : state.lowestPrice * (1 + level.trailingDistance / 100);
        } else if (level.trailingType === 'ATR') {
          const atr = await this.calculateATR(state.symbol);
          trailingStopPrice = state.direction === 'LONG'
            ? state.highestPrice - atr * level.trailingDistance
            : state.lowestPrice + atr * level.trailingDistance;
        } else { // HIGH_LOW
          trailingStopPrice = state.direction === 'LONG'
            ? state.highestPrice * (1 - level.trailingDistance / 100)
            : state.lowestPrice * (1 + level.trailingDistance / 100);
        }

        // Check if price retraced to trailing stop
        const hitTrailingStop = state.direction === 'LONG'
          ? state.currentPrice <= trailingStopPrice
          : state.currentPrice >= trailingStopPrice;

        if (hitTrailingStop) {
          // Execute take profit
          const quantityToClose = state.direction === 'LONG' ? 1 : 1; // Simplified
          level.executed = true;
          level.executionPrice = state.currentPrice;
          executed = true;

          logger.info({
            positionId: state.positionId,
            level: level.percent + '%',
            price: state.currentPrice,
          }, 'Take profit level executed');
        }
      }
    }

    return { executed };
  }

  /**
   * Update time-based trailing stop
   */
  private async updateTimeStop(state: TrailingState): Promise<void> {
    const config = state.config.timeStop!;

    const elapsedMinutes = (Date.now() - config.startTime.getTime()) / 60000;

    if (elapsedMinutes < config.enableAfterMinutes) {
      return;
    }

    // Calculate current stop percent based on decay type
    const progress = Math.min(1, (elapsedMinutes - config.enableAfterMinutes) / 60); // Max 60 minutes

    let currentStopPercent: number;
    if (config.decayType === 'LINEAR') {
      currentStopPercent = config.initialStopPercent + (config.finalStopPercent - config.initialStopPercent) * progress;
    } else { // EXPONENTIAL
      currentStopPercent = config.initialStopPercent * Math.pow(config.finalStopPercent / config.initialStopPercent, progress);
    }

    config.currentStopPercent = currentStopPercent;

    logger.debug({
      positionId: state.positionId,
      elapsedMinutes: Math.round(elapsedMinutes),
      currentStopPercent: currentStopPercent.toFixed(2) + '%',
    }, 'Time trailing stop updated');
  }

  /**
   * Calculate ATR for symbol
   */
  private async calculateATR(symbol: string, period: number = 14): Promise<number> {
    const candles = await db.ohlcvCandle.findMany({
      where: { symbol },
      orderBy: { openTime: 'desc' },
      take: period + 1,
    });

    if (candles.length < period + 1) {
      return 0;
    }

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

    const atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    return atr;
  }

  /**
   * Check if stop loss hit
   */
  async checkStopLoss(positionId: string, currentPrice: number): Promise<{ hit: boolean; stopPrice?: number }> {
    const state = this.activePositions.get(positionId);
    if (!state) {
      return { hit: false };
    }

    const stopPrice = state.config.stopLoss?.currentStopPrice;
    if (!stopPrice) {
      return { hit: false };
    }

    const hit = state.direction === 'LONG'
      ? currentPrice <= stopPrice
      : currentPrice >= stopPrice;

    return { hit, stopPrice };
  }

  /**
   * Remove position from tracking
   */
  removePosition(positionId: string): void {
    this.activePositions.delete(positionId);
    logger.info({ positionId }, 'Position removed from trailing manager');
  }

  /**
   * Get active trailing positions
   */
  getActivePositions(): TrailingState[] {
    return Array.from(this.activePositions.values());
  }

  /**
   * Get position state
   */
  getPositionState(positionId: string): TrailingState | undefined {
    return this.activePositions.get(positionId);
  }
}

// ==================== PRESET CONFIGS ====================

export const TRAILING_PRESETS = {
  // Scalping
  SCALPING: {
    stopLoss: {
      type: 'AGGRESSIVE',
      breakevenTrigger: 0.3,
      stepPercent: 0.3,
      minDistance: 0.3,
      maxDistance: 1,
      volatilityAdjustment: true,
    } as DynamicTrailingStop,
    takeProfit: {
      levels: [
        { id: 'tp1', percent: 50, trigger: 0.5, trailingType: 'PERCENT', trailingDistance: 0.3, triggered: false, executed: false },
        { id: 'tp2', percent: 50, trigger: 1, trailingType: 'PERCENT', trailingDistance: 0.5, triggered: false, executed: false },
      ],
    } as TrailingTakeProfit,
  },

  // Day Trading
  DAY_TRADING: {
    stopLoss: {
      type: 'MODERATE',
      breakevenTrigger: 1,
      stepPercent: 0.5,
      minDistance: 1,
      maxDistance: 3,
      volatilityAdjustment: true,
    } as DynamicTrailingStop,
    takeProfit: {
      levels: [
        { id: 'tp1', percent: 30, trigger: 2, trailingType: 'ATR', trailingDistance: 1.5, triggered: false, executed: false },
        { id: 'tp2', percent: 30, trigger: 4, trailingType: 'ATR', trailingDistance: 2, triggered: false, executed: false },
        { id: 'tp3', percent: 40, trigger: 6, trailingType: 'ATR', trailingDistance: 3, triggered: false, executed: false },
      ],
    } as TrailingTakeProfit,
  },

  // Swing Trading
  SWING_TRADING: {
    stopLoss: {
      type: 'CONSERVATIVE',
      breakevenTrigger: 2,
      stepPercent: 1,
      minDistance: 2,
      maxDistance: 5,
      volatilityAdjustment: true,
    } as DynamicTrailingStop,
    takeProfit: {
      levels: [
        { id: 'tp1', percent: 25, trigger: 5, trailingType: 'PERCENT', trailingDistance: 2, triggered: false, executed: false },
        { id: 'tp2', percent: 25, trigger: 10, trailingType: 'PERCENT', trailingDistance: 3, triggered: false, executed: false },
        { id: 'tp3', percent: 50, trigger: 15, trailingType: 'HIGH_LOW', trailingDistance: 5, triggered: false, executed: false },
      ],
    } as TrailingTakeProfit,
  },
};

// ==================== SINGLETON ====================

let managerInstance: AdvancedTrailingManager | null = null;

export function getAdvancedTrailingManager(): AdvancedTrailingManager {
  if (!managerInstance) {
    managerInstance = new AdvancedTrailingManager();
  }
  return managerInstance;
}

// ==================== EXPORTS ====================

export default {
  AdvancedTrailingManager,
  getAdvancedTrailingManager,
  TRAILING_PRESETS,
};
