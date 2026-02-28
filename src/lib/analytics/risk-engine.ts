/**
 * Advanced Risk Management Engine
 * 
 * Comprehensive risk management:
 * - Portfolio risk limits
 * - Position sizing
 * - Daily loss limits
 * - Market condition adjustments
 * - Correlation analysis
 * 
 * @module lib/analytics/risk-engine
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface RiskEngineConfig {
  // Portfolio risk
  maxPortfolioRisk: number;      // Max % of portfolio at risk
  maxCorrelation: number;        // Max correlation between positions
  maxSectorExposure: number;     // Max exposure per sector
  
  // Position risk
  maxPositionSize: number;       // Max % per position
  maxLeverage: number;           // Max leverage allowed
  stopLossRequired: boolean;     // Force stop loss
  minRiskReward: number;         // Min R:R ratio
  
  // Daily limits
  maxDailyLoss: number;          // Stop trading after X% loss
  maxDailyTrades: number;        // Max trades per day
  cooldownAfterLoss: number;     // Minutes cooldown after loss
  
  // Market conditions
  reducePositionInHighVolatility: boolean;
  stopTradingInCrash: boolean;   // Stop if market drops X%
  crashThreshold: number;        // % drop to consider crash
}

export interface RiskCheck {
  approved: boolean;
  reason?: string;
  suggestedSize?: number;
  warnings: string[];
}

export interface PortfolioRisk {
  totalExposure: number;
  totalRisk: number;
  correlation: number;
  sectorExposure: Map<string, number>;
  dailyPnl: number;
  dailyPnlPercent: number;
  tradesToday: number;
}

export interface PositionSizing {
  recommendedSize: number;
  maxAllowedSize: number;
  riskAmount: number;
  riskPercent: number;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: RiskEngineConfig = {
  maxPortfolioRisk: 5,
  maxCorrelation: 0.7,
  maxSectorExposure: 30,
  maxPositionSize: 10,
  maxLeverage: 10,
  stopLossRequired: true,
  minRiskReward: 1.5,
  maxDailyLoss: 5,
  maxDailyTrades: 20,
  cooldownAfterLoss: 30,
  reducePositionInHighVolatility: true,
  stopTradingInCrash: true,
  crashThreshold: 5,
};

// ==================== RISK ENGINE CLASS ====================

export class RiskEngine {
  private config: RiskEngineConfig;
  private dailyStats: {
    pnl: number;
    trades: number;
    lastLossTime: Date | null;
    resetDate: Date;
  };

  constructor(config?: Partial<RiskEngineConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.dailyStats = {
      pnl: 0,
      trades: 0,
      lastLossTime: null,
      resetDate: new Date(),
    };
  }

  /**
   * Check if trade should be approved
   */
  async checkTrade(trade: {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    quantity: number;
    stopLoss?: number;
    takeProfit?: number;
    leverage?: number;
  }): Promise<RiskCheck> {
    const warnings: string[] = [];
    
    // Reset daily stats if new day
    this.resetDailyStatsIfNeeded();

    // Check daily loss limit
    if (this.dailyStats.pnl < -this.config.maxDailyLoss) {
      return {
        approved: false,
        reason: `Daily loss limit reached: ${this.dailyStats.pnl.toFixed(2)}%`,
        warnings,
      };
    }

    // Check daily trades limit
    if (this.dailyStats.trades >= this.config.maxDailyTrades) {
      return {
        approved: false,
        reason: `Daily trades limit reached: ${this.dailyStats.trades}`,
        warnings,
      };
    }

    // Check cooldown after loss
    if (this.dailyStats.lastLossTime) {
      const elapsedMinutes = (Date.now() - this.dailyStats.lastLossTime.getTime()) / 60000;
      if (elapsedMinutes < this.config.cooldownAfterLoss) {
        return {
          approved: false,
          reason: `Cooldown period: ${Math.round(this.config.cooldownAfterLoss - elapsedMinutes)} minutes remaining`,
          warnings,
        };
      }
    }

    // Check leverage
    if (trade.leverage && trade.leverage > this.config.maxLeverage) {
      return {
        approved: false,
        reason: `Lverage too high: ${trade.leverage}x (max: ${this.config.maxLeverage}x)`,
        warnings,
      };
    }

    // Check stop loss required
    if (this.config.stopLossRequired && !trade.stopLoss) {
      return {
        approved: false,
        reason: 'Stop loss required',
        warnings,
      };
    }

    // Check risk/reward ratio
    if (trade.stopLoss && trade.takeProfit) {
      const risk = Math.abs(trade.entryPrice - trade.stopLoss);
      const reward = Math.abs(trade.takeProfit - trade.entryPrice);
      const rrRatio = reward / risk;

      if (rrRatio < this.config.minRiskReward) {
        warnings.push(`Low R:R ratio: ${rrRatio.toFixed(2)} (min: ${this.config.minRiskReward})`);
      }
    }

    // Check position size
    const portfolioValue = await this.getPortfolioValue();
    const positionValue = trade.quantity * trade.entryPrice;
    const positionPercent = (positionValue / portfolioValue) * 100;

    if (positionPercent > this.config.maxPositionSize) {
      return {
        approved: false,
        reason: `Position size too large: ${positionPercent.toFixed(2)}% (max: ${this.config.maxPositionSize}%)`,
        suggestedSize: (portfolioValue * this.config.maxPositionSize / 100) / trade.entryPrice,
        warnings,
      };
    }

    // Check portfolio risk
    const portfolioRisk = await this.getPortfolioRisk();
    const tradeRisk = this.calculateTradeRisk(trade, portfolioValue);

    if (portfolioRisk.totalRisk + tradeRisk > this.config.maxPortfolioRisk) {
      return {
        approved: false,
        reason: `Portfolio risk too high: ${(portfolioRisk.totalRisk + tradeRisk).toFixed(2)}% (max: ${this.config.maxPortfolioRisk}%)`,
        warnings,
      };
    }

    // Check market conditions
    const marketCondition = await this.checkMarketConditions(trade.symbol);
    if (!marketCondition.approved) {
      return {
        approved: false,
        reason: marketCondition.reason,
        warnings: [...warnings, ...marketCondition.warnings],
      };
    }

    // Check correlation
    const correlation = await this.checkCorrelation(trade.symbol);
    if (correlation > this.config.maxCorrelation) {
      warnings.push(`High correlation with existing positions: ${(correlation * 100).toFixed(1)}%`);
    }

    return {
      approved: true,
      suggestedSize: trade.quantity,
      warnings,
    };
  }

  /**
   * Calculate position sizing
   */
  async calculatePositionSize(params: {
    portfolioValue: number;
    entryPrice: number;
    stopLoss: number;
    riskPercent: number;
  }): Promise<PositionSizing> {
    const riskAmount = params.portfolioValue * (params.riskPercent / 100);
    const riskPerUnit = Math.abs(params.entryPrice - params.stopLoss);
    
    const recommendedSize = riskAmount / riskPerUnit;
    const maxAllowedSize = (params.portfolioValue * this.config.maxPositionSize / 100) / params.entryPrice;

    return {
      recommendedSize: Math.min(recommendedSize, maxAllowedSize),
      maxAllowedSize,
      riskAmount,
      riskPercent: params.riskPercent,
    };
  }

  /**
   * Get portfolio risk
   */
  async getPortfolioRisk(): Promise<PortfolioRisk> {
    const positions = await db.position.findMany({
      where: { status: 'OPEN' },
    });

    const portfolioValue = await this.getPortfolioValue();
    
    const totalExposure = positions.reduce(
      (sum, pos) => sum + (pos.totalAmount * (pos.currentPrice || pos.avgEntryPrice)),
      0
    );

    const totalRisk = positions.reduce((sum, pos) => {
      const risk = pos.stopLoss ? Math.abs((pos.currentPrice || pos.avgEntryPrice) - pos.stopLoss) * pos.totalAmount : 0;
      return sum + risk;
    }, 0) / portfolioValue * 100;

    // Calculate sector exposure (simplified - by symbol type)
    const sectorExposure = new Map<string, number>();
    for (const pos of positions) {
      const sector = pos.symbol.endsWith('USDT') ? 'CRYPTO' : 'OTHER';
      const current = sectorExposure.get(sector) || 0;
      sectorExposure.set(sector, current + (pos.quantity * pos.currentPrice));
    }

    return {
      totalExposure,
      totalRisk,
      correlation: 0, // Would need correlation calculation
      sectorExposure,
      dailyPnl: this.dailyStats.pnl,
      dailyPnlPercent: this.dailyStats.pnl,
      tradesToday: this.dailyStats.trades,
    };
  }

  /**
   * Check market conditions
   */
  private async checkMarketConditions(symbol: string): Promise<{ approved: boolean; reason?: string; warnings: string[] }> {
    const warnings: string[] = [];

    // Check volatility
    const volatility = await this.getVolatility(symbol);
    if (volatility > 0.1 && this.config.reducePositionInHighVolatility) {
      warnings.push('High volatility detected - consider reducing position size');
    }

    // Check for market crash
    const marketDrop = await this.getMarketDrop();
    if (marketDrop > this.config.crashThreshold && this.config.stopTradingInCrash) {
      return {
        approved: false,
        reason: `Market crash detected: ${marketDrop.toFixed(2)}% drop`,
        warnings,
      };
    }

    return { approved: true, warnings };
  }

  /**
   * Check correlation with existing positions
   */
  private async checkCorrelation(symbol: string): Promise<number> {
    // Simplified - in production, calculate actual correlation
    const positions = await db.position.findMany({
      where: { status: 'OPEN' },
    });

    if (positions.length === 0) {
      return 0;
    }

    // Check if same symbol
    const sameSymbol = positions.some(pos => pos.symbol === symbol);
    if (sameSymbol) {
      return 1; // Perfect correlation
    }

    // Check if same sector (simplified)
    const sector = symbol.endsWith('USDT') ? 'CRYPTO' : 'OTHER';
    const sameSectorCount = positions.filter(pos => pos.symbol.endsWith('USDT') === symbol.endsWith('USDT')).length;

    return sameSectorCount / positions.length;
  }

  /**
   * Calculate trade risk
   */
  private calculateTradeRisk(trade: any, portfolioValue: number): number {
    if (!trade.stopLoss) {
      return 100; // Maximum risk if no stop loss
    }

    const riskPerUnit = Math.abs(trade.entryPrice - trade.stopLoss);
    const totalRisk = riskPerUnit * trade.quantity;
    return (totalRisk / portfolioValue) * 100;
  }

  /**
   * Get portfolio value
   */
  private async getPortfolioValue(): Promise<number> {
    // In production, get from user account
    const account = await db.account.findFirst({
      where: { isActive: true },
    });

    return account?.balance || 10000; // Default 10k
  }

  /**
   * Get volatility
   */
  private async getVolatility(symbol: string): Promise<number> {
    const candles = await db.ohlcvCandle.findMany({
      where: { symbol },
      orderBy: { openTime: 'desc' },
      take: 20,
    });

    if (candles.length < 20) {
      return 0.03;
    }

    const returns = [];
    for (let i = 1; i < candles.length; i++) {
      const ret = (candles[i - 1].close - candles[i].close) / candles[i].close;
      returns.push(ret);
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }

  /**
   * Get market drop
   */
  private async getMarketDrop(): Promise<number> {
    // Get BTC as market proxy
    const candles = await db.ohlcvCandle.findMany({
      where: { symbol: 'BTCUSDT' },
      orderBy: { openTime: 'desc' },
      take: 24, // Last 24 hours
    });

    if (candles.length < 2) {
      return 0;
    }

    const currentPrice = candles[0].close;
    const highPrice = Math.max(...candles.map(c => c.high));

    return ((highPrice - currentPrice) / highPrice) * 100;
  }

  /**
   * Update daily stats after trade
   */
  async updateAfterTrade(pnl: number): Promise<void> {
    this.resetDailyStatsIfNeeded();

    this.dailyStats.pnl += pnl;
    this.dailyStats.trades++;

    if (pnl < 0) {
      this.dailyStats.lastLossTime = new Date();
    }

    logger.info({
      pnl,
      dailyPnl: this.dailyStats.pnl,
      tradesToday: this.dailyStats.trades,
    }, 'Daily stats updated');
  }

  /**
   * Reset daily stats if new day
   */
  private resetDailyStatsIfNeeded(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (this.dailyStats.resetDate < today) {
      this.dailyStats = {
        pnl: 0,
        trades: 0,
        lastLossTime: null,
        resetDate: today,
      };
      logger.info('Daily stats reset');
    }
  }

  /**
   * Get current config
   */
  getConfig(): RiskEngineConfig {
    return { ...this.config };
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<RiskEngineConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
    logger.info({ config }, 'Risk engine config updated');
  }

  /**
   * Get daily stats
   */
  getDailyStats(): { pnl: number; trades: number; lastLossTime: Date | null } {
    return {
      pnl: this.dailyStats.pnl,
      trades: this.dailyStats.trades,
      lastLossTime: this.dailyStats.lastLossTime,
    };
  }
}

// ==================== SINGLETON ====================

let engineInstance: RiskEngine | null = null;

export function getRiskEngine(config?: Partial<RiskEngineConfig>): RiskEngine {
  if (!engineInstance) {
    engineInstance = new RiskEngine(config);
  } else if (config) {
    engineInstance.updateConfig(config);
  }
  return engineInstance;
}

// ==================== EXPORTS ====================

export default {
  RiskEngine,
  getRiskEngine,
  DEFAULT_CONFIG,
};
