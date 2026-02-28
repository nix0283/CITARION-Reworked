/**
 * Commission & Slippage Modeling
 * 
 * Realistic trading cost calculation:
 * - Exchange commission fees
 * - Slippage based on volume/volatility
 * - Spread costs
 * - Impact on profitability
 * 
 * @module lib/analytics/trading-costs
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface CommissionConfig {
  makerFee: number;      // % for maker orders
  takerFee: number;      // % for taker orders
  volumeDiscount: boolean;
  discountTiers: Array<{
    minVolume: number;
    makerFee: number;
    takerFee: number;
  }>;
}

export interface SlippageConfig {
  baseSlippage: number;  // Base slippage %
  volatilityMultiplier: number;
  volumeImpact: boolean;
  maxSlippage: number;   // Maximum slippage %
}

export interface TradingCosts {
  commission: number;
  slippage: number;
  spread: number;
  totalCost: number;
  costPercent: number;
}

export interface BacktestAdjustment {
  originalPnl: number;
  adjustedPnl: number;
  totalCosts: number;
  costDrag: number;      // % reduction in returns
  profitable: boolean;
  breakevenWinRate: number;
}

// ==================== DEFAULT CONFIGS ====================

const DEFAULT_COMMISSION_CONFIG: CommissionConfig = {
  makerFee: 0.02,  // 0.02% for maker
  takerFee: 0.04,  // 0.04% for taker
  volumeDiscount: true,
  discountTiers: [
    { minVolume: 0, makerFee: 0.02, takerFee: 0.04 },
    { minVolume: 100000, makerFee: 0.015, takerFee: 0.03 },
    { minVolume: 500000, makerFee: 0.01, takerFee: 0.02 },
    { minVolume: 1000000, makerFee: 0.008, takerFee: 0.015 },
  ],
};

const DEFAULT_Slippage_CONFIG: SlippageConfig = {
  baseSlippage: 0.05,  // 0.05% base
  volatilityMultiplier: 2,
  volumeImpact: true,
  maxSlippage: 0.5,    // Max 0.5%
};

// ==================== TRADING COSTS CALCULATOR ====================

export class TradingCostsCalculator {
  private commissionConfig: CommissionConfig;
  private slippageConfig: SlippageConfig;
  private monthlyVolume: number;

  constructor(
    commissionConfig?: Partial<CommissionConfig>,
    slippageConfig?: Partial<SlippageConfig>
  ) {
    this.commissionConfig = {
      ...DEFAULT_COMMISSION_CONFIG,
      ...commissionConfig,
    };
    this.slippageConfig = {
      ...DEFAULT_Slippage_CONFIG,
      ...slippageConfig,
    };
    this.monthlyVolume = 0;
  }

  /**
   * Calculate total trading costs for a trade
   */
  calculateCosts(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    orderType: 'MARKET' | 'LIMIT';
    quantity: number;
    price: number;
    isMaker?: boolean;
  }): TradingCosts {
    const notionalValue = params.quantity * params.price;

    // Calculate commission
    const commission = this.calculateCommission(notionalValue, params.isMaker);

    // Calculate slippage
    const slippage = this.calculateSlippage(params.symbol, params.side, params.orderType, notionalValue);

    // Calculate spread cost (estimated)
    const spread = this.calculateSpread(params.symbol, notionalValue);

    // Total costs
    const totalCost = commission + slippage + spread;
    const costPercent = (totalCost / notionalValue) * 100;

    return {
      commission,
      slippage,
      spread,
      totalCost,
      costPercent,
    };
  }

  /**
   * Calculate commission fee
   */
  private calculateCommission(notionalValue: number, isMaker?: boolean): number {
    // Get applicable fee tier
    let feeRate = isMaker 
      ? this.commissionConfig.makerFee 
      : this.commissionConfig.takerFee;

    // Apply volume discount if enabled
    if (this.commissionConfig.volumeDiscount) {
      for (const tier of this.commissionConfig.discountTiers.reverse()) {
        if (this.monthlyVolume >= tier.minVolume) {
          feeRate = isMaker ? tier.makerFee : tier.takerFee;
          break;
        }
      }
    }

    return notionalValue * (feeRate / 100);
  }

  /**
   * Calculate slippage
   */
  private async calculateSlippage(
    symbol: string,
    side: 'BUY' | 'SELL',
    orderType: 'MARKET' | 'LIMIT',
    notionalValue: number
  ): number {
    // Limit orders have minimal slippage
    if (orderType === 'LIMIT') {
      return notionalValue * 0.01 / 100; // 0.01% for limit orders
    }

    // Get current volatility
    const volatility = await this.getVolatility(symbol);

    // Calculate base slippage
    let slippageRate = this.slippageConfig.baseSlippage;

    // Adjust for volatility
    slippageRate *= (1 + volatility * this.slippageConfig.volumeImpact);

    // Adjust for order size (larger orders = more slippage)
    if (this.slippageConfig.volumeImpact) {
      const sizeImpact = Math.min(1, notionalValue / 100000); // Impact starts at $100k
      slippageRate *= (1 + sizeImpact);
    }

    // Apply max slippage cap
    slippageRate = Math.min(slippageRate, this.slippageConfig.maxSlippage);

    return notionalValue * (slippageRate / 100);
  }

  /**
   * Calculate spread cost
   */
  private async calculateSpread(symbol: string, notionalValue: number): number {
    // Get current spread from market data
    const marketData = await db.marketData.findFirst({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
    });

    // Estimate spread (typical crypto spread: 0.01-0.1%)
    const spreadRate = marketData?.spread || 0.05;

    // For market orders, we cross the spread
    // For limit orders, we may provide liquidity
    return notionalValue * (spreadRate / 100) * 0.5; // Half spread on average
  }

  /**
   * Adjust backtest results for trading costs
   */
  adjustBacktestResults(trades: Array<{
    pnl: number;
    quantity: number;
    entryPrice: number;
    exitPrice: number;
    side: 'BUY' | 'SELL';
    orderType: 'MARKET' | 'LIMIT';
  }>): BacktestAdjustment {
    let totalCosts = 0;
    let originalPnl = 0;

    for (const trade of trades) {
      originalPnl += trade.pnl;

      // Calculate entry costs
      const entryCosts = this.calculateCosts({
        symbol: 'BTCUSDT', // Would be dynamic
        side: trade.side,
        orderType: trade.orderType,
        quantity: trade.quantity,
        price: trade.entryPrice,
        isMaker: trade.orderType === 'LIMIT',
      });

      // Calculate exit costs
      const exitCosts = this.calculateCosts({
        symbol: 'BTCUSDT',
        side: trade.side === 'BUY' ? 'SELL' : 'BUY',
        orderType: trade.orderType,
        quantity: trade.quantity,
        price: trade.exitPrice,
        isMaker: trade.orderType === 'LIMIT',
      });

      totalCosts += entryCosts.totalCost + exitCosts.totalCost;
    }

    const adjustedPnl = originalPnl - totalCosts;
    const costDrag = originalPnl > 0 ? (totalCosts / originalPnl) * 100 : 0;

    // Calculate breakeven win rate
    const avgWin = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / Math.max(1, trades.filter(t => t.pnl > 0).length);
    const avgLoss = Math.abs(trades.filter(t => t.pnl <= 0).reduce((sum, t) => sum + t.pnl, 0) / Math.max(1, trades.filter(t => t.pnl <= 0).length));
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
    
    // Breakeven win rate = 1 / (1 + profit factor)
    const breakevenWinRate = profitFactor > 0 ? 1 / (1 + profitFactor) : 1;

    return {
      originalPnl,
      adjustedPnl,
      totalCosts,
      costDrag,
      profitable: adjustedPnl > 0,
      breakevenWinRate,
    };
  }

  /**
   * Update monthly volume for fee tier calculation
   */
  updateMonthlyVolume(volume: number): void {
    this.monthlyVolume = volume;
  }

  /**
   * Get volatility for symbol
   */
  private async getVolatility(symbol: string): Promise<number> {
    const candles = await db.ohlcvCandle.findMany({
      where: { symbol },
      orderBy: { openTime: 'desc' },
      take: 20,
    });

    if (candles.length < 20) {
      return 0.02; // Default 2% volatility
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
   * Get cost breakdown for analysis
   */
  getCostBreakdown(trades: any[]): {
    totalCommission: number;
    totalSlippage: number;
    totalSpread: number;
    avgCostPerTrade: number;
    costAsPercentOfPnl: number;
  } {
    let totalCommission = 0;
    let totalSlippage = 0;
    let totalSpread = 0;
    let totalPnl = 0;

    for (const trade of trades) {
      const costs = this.calculateCosts({
        symbol: trade.symbol || 'BTCUSDT',
        side: trade.side,
        orderType: trade.orderType || 'MARKET',
        quantity: trade.quantity,
        price: trade.entryPrice,
        isMaker: trade.orderType === 'LIMIT',
      });

      totalCommission += costs.commission;
      totalSlippage += costs.slippage;
      totalSpread += costs.spread;
      totalPnl += trade.pnl;
    }

    const totalCosts = totalCommission + totalSlippage + totalSpread;

    return {
      totalCommission,
      totalSlippage,
      totalSpread,
      avgCostPerTrade: totalCosts / Math.max(1, trades.length),
      costAsPercentOfPnl: totalPnl > 0 ? (totalCosts / totalPnl) * 100 : 0,
    };
  }
}

// ==================== SINGLETON ====================

let calculatorInstance: TradingCostsCalculator | null = null;

export function getTradingCostsCalculator(
  commissionConfig?: Partial<CommissionConfig>,
  slippageConfig?: Partial<SlippageConfig>
): TradingCostsCalculator {
  if (!calculatorInstance) {
    calculatorInstance = new TradingCostsCalculator(commissionConfig, slippageConfig);
  }
  return calculatorInstance;
}

// ==================== EXPORTS ====================

export default {
  TradingCostsCalculator,
  getTradingCostsCalculator,
  DEFAULT_COMMISSION_CONFIG,
  DEFAULT_Slippage_CONFIG,
};
