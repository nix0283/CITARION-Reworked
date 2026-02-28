/**
 * Strategy Performance Tracker
 * 
 * Monitors and analyzes strategy performance:
 * - Real-time performance tracking
 * - Win/loss analysis
 * - Parameter effectiveness
 * - Market regime correlation
 * - Auto-adjustment recommendations
 * 
 * @module lib/performance-tracker/performance-tracker
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface StrategyPerformance {
  strategyId: string;
  strategyName: string;
  strategyType: 'GRID' | 'DCA' | 'BB' | 'MIXED';
  
  // Trade statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number;
  
  // PnL metrics
  totalPnl: number;
  totalPnlPercent: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  
  // Risk metrics
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  
  // Time metrics
  avgTradeDuration: number; // minutes
  bestTrade: number;
  worstTrade: number;
  
  // Consecutive stats
  consecutiveWins: number;
  consecutiveLosses: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  
  // Period
  startDate: Date;
  endDate: Date;
  lastUpdated: Date;
}

export interface TradeMetrics {
  tradeId: string;
  strategyId?: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  duration: number; // minutes
  entryTime: Date;
  exitTime: Date;
  
  // Market conditions at entry
  marketRegime: 'TRENDING' | 'RANGING' | 'VOLATILE' | 'CALM';
  volatility: number;
  volume: number;
  
  // Strategy parameters used
  parameters: Record<string, any>;
  
  // Outcome analysis
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  exitReason: 'TP' | 'SL' | 'MANUAL' | 'TRAILING';
  
  // Lessons learned
  lessons: string[];
  parameterAdjustments: Record<string, number>;
}

export interface PerformanceReport {
  strategyId: string;
  period: {
    start: Date;
    end: Date;
    days: number;
  };
  
  performance: StrategyPerformance;
  
  // Analysis
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  
  // Parameter analysis
  parameterEffectiveness: Record<string, {
    correlation: number;
    optimalRange: { min: number; max: number };
    currentSetting: number;
    recommendation: string;
  }>;
  
  // Market regime analysis
  regimePerformance: {
    TRENDING: { trades: number; winRate: number; pnl: number };
    RANGING: { trades: number; winRate: number; pnl: number };
    VOLATILE: { trades: number; winRate: number; pnl: number };
    CALM: { trades: number; winRate: number; pnl: number };
  };
  
  // Trend analysis
  performanceTrend: 'IMPROVING' | 'DECLINING' | 'STABLE';
  confidenceScore: number;
}

export interface AdjustmentRecommendation {
  strategyId: string;
  parameter: string;
  currentValue: number;
  recommendedValue: number;
  changePercent: number;
  reason: string;
  confidence: number;
  expectedImprovement: number;
}

// ==================== PERFORMANCE TRACKER ====================

export class PerformanceTracker {
  private performanceCache: Map<string, StrategyPerformance> = new Map();
  private tradeMetricsCache: Map<string, TradeMetrics[]> = new Map();

  /**
   * Track a new trade
   */
  async trackTrade(trade: any): Promise<void> {
    if (!trade.exitTime || !trade.entryTime) return;

    const duration = (trade.exitTime.getTime() - trade.entryTime.getTime()) / (1000 * 60);
    const outcome = trade.pnl > 0 ? 'WIN' : trade.pnl < 0 ? 'LOSS' : 'BREAKEVEN';

    // Get market conditions at entry time
    const marketConditions = await this.getMarketConditions(trade.entryTime, trade.symbol);

    // Create trade metrics
    const metrics: TradeMetrics = {
      tradeId: trade.id,
      strategyId: trade.signalId || undefined,
      symbol: trade.symbol,
      direction: trade.direction as 'LONG' | 'SHORT',
      entryPrice: trade.entryPrice || 0,
      exitPrice: trade.exitPrice || 0,
      pnl: trade.pnl,
      pnlPercent: trade.pnlPercent,
      duration,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      marketRegime: marketConditions.regime,
      volatility: marketConditions.volatility,
      volume: marketConditions.volume,
      parameters: this.extractParameters(trade),
      outcome,
      exitReason: trade.closeReason || 'MANUAL',
      lessons: [],
      parameterAdjustments: {},
    };

    // Analyze trade for lessons
    metrics.lessons = this.analyzeTrade(metrics);
    metrics.parameterAdjustments = this.calculateAdjustments(metrics);

    // Save to database
    await this.saveTradeMetrics(metrics);

    // Update performance cache
    await this.updatePerformance(trade);

    logger.info({ tradeId: trade.id, outcome, pnl: trade.pnl }, 'Trade tracked');
  }

  /**
   * Get market conditions at a specific time
   */
  private async getMarketConditions(time: Date, symbol: string): Promise<{
    regime: 'TRENDING' | 'RANGING' | 'VOLATILE' | 'CALM';
    volatility: number;
    volume: number;
  }> {
    // Get candles around that time
    const candles = await db.ohlcvCandle.findMany({
      where: {
        symbol,
        openTime: { lte: time },
      },
      orderBy: { openTime: 'desc' },
      take: 50,
    });

    if (candles.length < 20) {
      return { regime: 'CALM', volatility: 0.03, volume: 1 };
    }

    // Calculate volatility
    const returns = [];
    for (let i = 1; i < 20; i++) {
      const ret = (candles[i - 1].close - candles[i].close) / candles[i].close;
      returns.push(ret);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    // Calculate volume ratio
    const recentVolume = candles.slice(0, 5).reduce((sum, c) => sum + c.volume, 0) / 5;
    const avgVolume = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
    const volume = recentVolume / avgVolume;

    // Determine regime
    let regime: typeof marketConditions.regime = 'CALM';
    if (volatility > 0.08) {
      regime = 'VOLATILE';
    } else if (volatility < 0.02) {
      regime = 'RANGING';
    }

    return { regime, volatility, volume };
  }

  /**
   * Extract parameters from trade
   */
  private extractParameters(trade: any): Record<string, any> {
    const params: Record<string, any> = {};

    if (trade.leverage) params.leverage = trade.leverage;
    if (trade.stopLoss) params.stopLoss = trade.stopLoss;
    if (trade.takeProfits) params.takeProfits = trade.takeProfits;

    return params;
  }

  /**
   * Analyze trade for lessons
   */
  private analyzeTrade(metrics: TradeMetrics): string[] {
    const lessons: string[] = [];

    if (metrics.outcome === 'LOSS') {
      // Analyze why the trade failed
      if (metrics.marketRegime === 'RANGING' && metrics.direction === 'LONG') {
        lessons.push('Long positions underperform in ranging markets');
      }

      if (metrics.volatility > 0.08 && metrics.duration < 60) {
        lessons.push('High volatility led to premature exit');
      }

      if (!metrics.parameters.stopLoss) {
        lessons.push('No stop loss increased loss magnitude');
      }

      if (metrics.duration > 1440 && metrics.pnlPercent < -5) {
        lessons.push('Holding losing position too long');
      }
    } else if (metrics.outcome === 'WIN') {
      // Analyze why the trade succeeded
      if (metrics.marketRegime === 'TRENDING') {
        lessons.push('Trend-following approach worked well');
      }

      if (metrics.exitReason === 'TP' && metrics.pnlPercent > 10) {
        lessons.push('Take profit level was appropriate');
      }

      if (metrics.duration < 120 && metrics.pnlPercent > 5) {
        lessons.push('Quick profit taking was effective');
      }
    }

    return lessons;
  }

  /**
   * Calculate parameter adjustments
   */
  private calculateAdjustments(metrics: TradeMetrics): Record<string, number> {
    const adjustments: Record<string, number> = {};

    if (metrics.outcome === 'LOSS') {
      // Suggest more conservative parameters
      if (metrics.parameters.leverage && metrics.parameters.leverage > 5) {
        adjustments.leverage = -0.2; // Reduce by 20%
      }

      if (!metrics.parameters.stopLoss) {
        adjustments.stopLoss = 0.05; // Add 5% stop loss
      }

      if (metrics.marketRegime === 'VOLATILE') {
        adjustments.takeProfit = -0.1; // Reduce take profit expectation
      }
    } else if (metrics.outcome === 'WIN') {
      // Parameters worked well, minor optimization
      if (metrics.pnlPercent > 10 && metrics.duration < 60) {
        adjustments.takeProfit = 0.05; // Can aim higher
      }
    }

    return adjustments;
  }

  /**
   * Save trade metrics to database
   */
  private async saveTradeMetrics(metrics: TradeMetrics): Promise<void> {
    // Save to a dedicated table or as part of trade record
    // For now, log to system
    logger.debug({ tradeId: metrics.tradeId, metrics }, 'Trade metrics saved');
  }

  /**
   * Update performance cache
   */
  private async updatePerformance(trade: any): Promise<void> {
    const strategyId = trade.signalId || 'default';

    // Get or create performance record
    let performance = this.performanceCache.get(strategyId);

    if (!performance) {
      performance = await this.calculatePerformance(strategyId);
    }

    // Update with new trade
    performance = this.updatePerformanceWithTrade(performance, trade);

    // Update cache
    this.performanceCache.set(strategyId, performance);
  }

  /**
   * Calculate performance for a strategy
   */
  async calculatePerformance(strategyId: string): Promise<StrategyPerformance> {
    // Get all trades for this strategy
    const trades = await db.trade.findMany({
      where: {
        signalId: strategyId,
        status: 'CLOSED',
      },
      orderBy: { exitTime: 'desc' },
    });

    return this.calculatePerformanceFromTrades(trades, strategyId);
  }

  /**
   * Calculate performance from trades
   */
  private calculatePerformanceFromTrades(
    trades: any[],
    strategyId: string
  ): StrategyPerformance {
    const closedTrades = trades.filter(t => t.exitTime && t.entryTime);

    if (closedTrades.length === 0) {
      return this.getEmptyPerformance(strategyId);
    }

    // Calculate basic stats
    const totalTrades = closedTrades.length;
    const winningTrades = closedTrades.filter(t => t.pnl > 0).length;
    const losingTrades = closedTrades.filter(t => t.pnl < 0).length;
    const breakevenTrades = totalTrades - winningTrades - losingTrades;

    const winRate = winningTrades / totalTrades;

    // PnL metrics
    const totalPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnlPercent = closedTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / totalTrades;

    const wins = closedTrades.filter(t => t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl < 0);

    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length) : 1;

    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : Infinity;

    // Risk metrics
    const maxDrawdown = this.calculateMaxDrawdown(closedTrades);
    const sharpeRatio = this.calculateSharpeRatio(closedTrades);

    // Time metrics
    const durations = closedTrades.map(t =>
      (t.exitTime.getTime() - t.entryTime.getTime()) / (1000 * 60)
    );
    const avgTradeDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    const pnls = closedTrades.map(t => t.pnl);
    const bestTrade = Math.max(...pnls);
    const worstTrade = Math.min(...pnls);

    // Consecutive stats
    const consecutiveStats = this.calculateConsecutiveStats(closedTrades);

    return {
      strategyId,
      strategyName: `Strategy_${strategyId}`,
      strategyType: 'MIXED',
      totalTrades,
      winningTrades,
      losingTrades,
      breakevenTrades,
      winRate,
      totalPnl,
      totalPnlPercent: avgPnlPercent * totalTrades,
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown,
      maxDrawdownPercent: maxDrawdown,
      sharpeRatio,
      sortinoRatio: sharpeRatio * 1.2, // Simplified
      avgTradeDuration,
      bestTrade,
      worstTrade,
      consecutiveWins: consecutiveStats.currentWins,
      consecutiveLosses: consecutiveStats.currentLosses,
      maxConsecutiveWins: consecutiveStats.maxWins,
      maxConsecutiveLosses: consecutiveStats.maxLosses,
      startDate: closedTrades[closedTrades.length - 1].entryTime,
      endDate: closedTrades[closedTrades.length - 1].exitTime,
      lastUpdated: new Date(),
    };
  }

  /**
   * Update performance with new trade
   */
  private updatePerformanceWithTrade(
    performance: StrategyPerformance,
    trade: any
  ): StrategyPerformance {
    // Incremental update
    performance.totalTrades++;

    if (trade.pnl > 0) {
      performance.winningTrades++;
      performance.consecutiveWins++;
      performance.consecutiveLosses = 0;
      performance.maxConsecutiveWins = Math.max(
        performance.maxConsecutiveWins,
        performance.consecutiveWins
      );
    } else if (trade.pnl < 0) {
      performance.losingTrades++;
      performance.consecutiveLosses++;
      performance.consecutiveWins = 0;
      performance.maxConsecutiveLosses = Math.max(
        performance.maxConsecutiveLosses,
        performance.consecutiveLosses
      );
    } else {
      performance.breakevenTrades++;
    }

    performance.winRate = performance.winningTrades / performance.totalTrades;
    performance.totalPnl += trade.pnl;
    performance.lastUpdated = new Date();

    return performance;
  }

  /**
   * Generate performance report
   */
  async generateReport(strategyId: string, days: number = 30): Promise<PerformanceReport> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get trades
    const trades = await db.trade.findMany({
      where: {
        signalId: strategyId,
        status: 'CLOSED',
        exitTime: { gte: startDate },
      },
    });

    const performance = this.calculatePerformanceFromTrades(trades, strategyId);

    // Analyze strengths and weaknesses
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    if (performance.winRate > 0.6) {
      strengths.push(`High win rate: ${(performance.winRate * 100).toFixed(1)}%`);
    }
    if (performance.profitFactor > 2) {
      strengths.push(`Excellent profit factor: ${performance.profitFactor.toFixed(2)}`);
    }
    if (performance.sharpeRatio > 1.5) {
      strengths.push(`Strong risk-adjusted returns (Sharpe: ${performance.sharpeRatio.toFixed(2)})`);
    }

    if (performance.winRate < 0.4) {
      weaknesses.push(`Low win rate: ${(performance.winRate * 100).toFixed(1)}%`);
      recommendations.push('Review entry conditions');
    }
    if (performance.maxDrawdownPercent > 0.2) {
      weaknesses.push(`High drawdown: ${(performance.maxDrawdownPercent * 100).toFixed(1)}%`);
      recommendations.push('Implement tighter risk management');
    }
    if (performance.avgTradeDuration > 1440) {
      weaknesses.push('Long trade duration');
      recommendations.push('Consider taking profits earlier');
    }

    // Parameter effectiveness analysis
    const parameterEffectiveness = await this.analyzeParameterEffectiveness(strategyId, trades);

    // Market regime analysis
    const regimePerformance = await this.analyzeRegimePerformance(trades);

    // Performance trend
    const performanceTrend = this.analyzePerformanceTrend(trades);

    return {
      strategyId,
      period: {
        start: startDate,
        end: new Date(),
        days,
      },
      performance,
      strengths,
      weaknesses,
      recommendations,
      parameterEffectiveness,
      regimePerformance,
      performanceTrend,
      confidenceScore: this.calculateConfidenceScore(performance, trades.length),
    };
  }

  /**
   * Get adjustment recommendations
   */
  async getAdjustmentRecommendations(strategyId: string): Promise<AdjustmentRecommendation[]> {
    const report = await this.generateReport(strategyId, 30);
    const recommendations: AdjustmentRecommendation[] = [];

    // Generate recommendations based on performance
    if (report.performance.winRate < 0.5) {
      recommendations.push({
        strategyId,
        parameter: 'entryThreshold',
        currentValue: 0.5,
        recommendedValue: 0.6,
        changePercent: 20,
        reason: 'Low win rate suggests need for stricter entry criteria',
        confidence: 0.7,
        expectedImprovement: 0.1,
      });
    }

    if (report.performance.maxDrawdownPercent > 0.15) {
      recommendations.push({
        strategyId,
        parameter: 'stopLoss',
        currentValue: 0.05,
        recommendedValue: 0.03,
        changePercent: -40,
        reason: 'High drawdown suggests need for tighter stop loss',
        confidence: 0.8,
        expectedImprovement: 0.05,
      });
    }

    return recommendations;
  }

  // ==================== HELPER METHODS ====================

  private getEmptyPerformance(strategyId: string): StrategyPerformance {
    return {
      strategyId,
      strategyName: `Strategy_${strategyId}`,
      strategyType: 'MIXED',
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      breakevenTrades: 0,
      winRate: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      avgTradeDuration: 0,
      bestTrade: 0,
      worstTrade: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      startDate: new Date(),
      endDate: new Date(),
      lastUpdated: new Date(),
    };
  }

  private calculateMaxDrawdown(trades: any[]): number {
    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;

    for (const trade of trades) {
      cumulative += trade.pnl;
      if (cumulative > peak) {
        peak = cumulative;
      }
      const drawdown = (peak - cumulative) / (peak || 1);
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  private calculateSharpeRatio(trades: any[]): number {
    if (trades.length < 2) return 0;

    const returns = trades.map(t => t.pnlPercent / 100);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );

    if (stdDev === 0) return 0;

    // Annualize (assuming daily returns)
    return (avgReturn / stdDev) * Math.sqrt(252);
  }

  private calculateConsecutiveStats(trades: any[]): {
    currentWins: number;
    currentLosses: number;
    maxWins: number;
    maxLosses: number;
  } {
    let currentWins = 0;
    let currentLosses = 0;
    let maxWins = 0;
    let maxLosses = 0;

    for (let i = trades.length - 1; i >= 0; i--) {
      if (trades[i].pnl > 0) {
        currentWins++;
        currentLosses = 0;
        maxWins = Math.max(maxWins, currentWins);
      } else if (trades[i].pnl < 0) {
        currentLosses++;
        currentWins = 0;
        maxLosses = Math.max(maxLosses, currentLosses);
      }
    }

    return { currentWins, currentLosses, maxWins, maxLosses };
  }

  private async analyzeParameterEffectiveness(
    strategyId: string,
    trades: any[]
  ): Promise<Record<string, any>> {
    // Analyze how different parameter values affected outcomes
    return {};
  }

  private async analyzeRegimePerformance(trades: any[]): Promise<any> {
    return {
      TRENDING: { trades: 0, winRate: 0, pnl: 0 },
      RANGING: { trades: 0, winRate: 0, pnl: 0 },
      VOLATILE: { trades: 0, winRate: 0, pnl: 0 },
      CALM: { trades: 0, winRate: 0, pnl: 0 },
    };
  }

  private analyzePerformanceTrend(trades: any[]): 'IMPROVING' | 'DECLINING' | 'STABLE' {
    if (trades.length < 10) return 'STABLE';

    const firstHalf = trades.slice(0, Math.floor(trades.length / 2));
    const secondHalf = trades.slice(Math.floor(trades.length / 2));

    const firstWinRate = firstHalf.filter(t => t.pnl > 0).length / firstHalf.length;
    const secondWinRate = secondHalf.filter(t => t.pnl > 0).length / secondHalf.length;

    const diff = secondWinRate - firstWinRate;

    if (diff > 0.1) return 'IMPROVING';
    if (diff < -0.1) return 'DECLINING';
    return 'STABLE';
  }

  private calculateConfidenceScore(performance: StrategyPerformance, tradeCount: number): number {
    let score = 0.5;

    // More trades = more confidence
    score += Math.min(0.2, tradeCount / 100);

    // Higher win rate = more confidence
    score += performance.winRate * 0.2;

    // Better profit factor = more confidence
    score += Math.min(0.1, performance.profitFactor / 10);

    return Math.min(1, score);
  }
}

// ==================== SINGLETON ====================

let trackerInstance: PerformanceTracker | null = null;

export function getPerformanceTracker(): PerformanceTracker {
  if (!trackerInstance) {
    trackerInstance = new PerformanceTracker();
  }
  return trackerInstance;
}

// ==================== EXPORTS ====================

export default {
  PerformanceTracker,
  getPerformanceTracker,
};
