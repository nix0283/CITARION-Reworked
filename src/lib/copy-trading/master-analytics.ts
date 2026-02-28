/**
 * Master Trader Analytics
 * 
 * Performance analytics for master traders:
 * - Win rate calculation
 * - PnL tracking
 * - Risk metrics
 * - Follower statistics
 * - Equity curve
 * 
 * @module lib/copy-trading/master-analytics
 */

import { db } from '@/lib/db';

// ==================== TYPES ====================

export interface MasterStats {
  masterId: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalVolume: number;
  avgWin: number;
  avgLoss: number;
  maxWin: number;
  maxLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgTradeDuration: number;
  totalFollowers: number;
  activeFollowers: number;
  totalAUM: number;
  profitShareEarned: number;
  equityCurve: EquityPoint[];
}

export interface EquityPoint {
  timestamp: Date;
  balance: number;
  pnl: number;
  trades: number;
  followers: number;
}

export interface PerformanceMetrics {
  daily: PerformancePeriod;
  weekly: PerformancePeriod;
  monthly: PerformancePeriod;
  allTime: PerformancePeriod;
}

export interface PerformancePeriod {
  trades: number;
  winRate: number;
  pnl: number;
  volume: number;
  avgTrade: number;
}

export interface RiskMetrics {
  maxDrawdown: number;
  maxDrawdownDuration: number;
  avgDrawdown: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  var95: number;
  maxLeverage: number;
  avgLeverage: number;
}

// ==================== MASTER ANALYTICS SERVICE ====================

export class MasterAnalyticsService {
  /**
   * Get comprehensive master statistics
   */
  async getMasterStats(masterId: string): Promise<MasterStats> {
    // Get master trades
    const trades = await db.masterTrade.findMany({
      where: { masterId },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate basic stats
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => (t.pnl || 0) > 0).length;
    const losingTrades = trades.filter(t => (t.pnl || 0) <= 0).length;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalVolume = trades.reduce((sum, t) => sum + (t.quantity * t.entryPrice), 0);

    const wins = trades.filter(t => (t.pnl || 0) > 0);
    const losses = trades.filter(t => (t.pnl || 0) <= 0);

    const avgWin = wins.length > 0 
      ? wins.reduce((sum, t) => sum + (t.pnl || 0), 0) / wins.length 
      : 0;
    const avgLoss = losses.length > 0 
      ? losses.reduce((sum, t) => sum + (t.pnl || 0), 0) / losses.length 
      : 0;

    const maxWin = wins.length > 0 ? Math.max(...wins.map(t => t.pnl || 0)) : 0;
    const maxLoss = losses.length > 0 ? Math.min(...losses.map(t => t.pnl || 0)) : 0;

    // Profit factor
    const grossProfit = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Sharpe ratio (simplified)
    const sharpeRatio = this.calculateSharpeRatio(trades);

    // Max drawdown
    const maxDrawdown = this.calculateMaxDrawdown(trades);

    // Avg trade duration
    const avgTradeDuration = trades.length > 0
      ? trades.reduce((sum, t) => {
          if (t.closedAt && t.createdAt) {
            return sum + (t.closedAt.getTime() - t.createdAt.getTime());
          }
          return sum;
        }, 0) / trades.length / (1000 * 60 * 60) // Convert to hours
      : 0;

    // Follower stats
    const master = await db.masterTrader.findUnique({
      where: { id: masterId },
      include: {
        followers: {
          where: { active: true },
        },
      },
    });

    const totalFollowers = master?.followers.length || 0;
    const activeFollowers = master?.followers.filter(f => f.active).length || 0;

    // Calculate AUM (total follower balance being copied)
    const totalAUM = await this.calculateAUM(masterId);

    // Profit share earned
    const distributions = await db.profitDistribution.findMany({
      where: { masterId, status: 'COMPLETED' },
    });
    const profitShareEarned = distributions.reduce((sum, d) => sum + d.masterShare, 0);

    // Equity curve
    const equityCurve = await this.buildEquityCurve(masterId);

    return {
      masterId,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalPnl,
      totalVolume,
      avgWin,
      avgLoss,
      maxWin,
      maxLoss,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      avgTradeDuration,
      totalFollowers,
      activeFollowers,
      totalAUM,
      profitShareEarned,
      equityCurve,
    };
  }

  /**
   * Get performance metrics by period
   */
  async getPerformanceMetrics(masterId: string): Promise<PerformanceMetrics> {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      daily: await this.getPeriodMetrics(masterId, dayAgo, now),
      weekly: await this.getPeriodMetrics(masterId, weekAgo, now),
      monthly: await this.getPeriodMetrics(masterId, monthAgo, now),
      allTime: await this.getPeriodMetrics(masterId, new Date(0), now),
    };
  }

  /**
   * Get risk metrics
   */
  async getRiskMetrics(masterId: string): Promise<RiskMetrics> {
    const trades = await db.masterTrade.findMany({
      where: { masterId },
      orderBy: { createdAt: 'asc' },
    });

    const maxDrawdown = this.calculateMaxDrawdown(trades);
    const maxDrawdownDuration = this.calculateMaxDrawdownDuration(trades);
    const volatility = this.calculateVolatility(trades);
    const sharpeRatio = this.calculateSharpeRatio(trades);
    const sortinoRatio = this.calculateSortinoRatio(trades);
    const var95 = this.calculateVaR(trades, 0.95);

    const avgLeverage = trades.length > 0
      ? trades.reduce((sum, t) => sum + (t.leverage || 10), 0) / trades.length
      : 10;
    const maxLeverage = trades.length > 0
      ? Math.max(...trades.map(t => t.leverage || 10))
      : 10;

    return {
      maxDrawdown,
      maxDrawdownDuration,
      avgDrawdown: maxDrawdown / 2,
      volatility,
      sharpeRatio,
      sortinoRatio,
      var95,
      maxLeverage,
      avgLeverage,
    };
  }

  /**
   * Calculate Sharpe Ratio
   */
  private calculateSharpeRatio(trades: any[]): number {
    if (trades.length < 2) return 0;

    const returns = trades
      .filter(t => t.pnl && t.entryPrice)
      .map(t => (t.pnl || 0) / (t.entryPrice * t.quantity));

    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)
    );

    if (stdDev === 0) return 0;

    // Annualized Sharpe (assuming daily returns)
    return (avgReturn / stdDev) * Math.sqrt(252);
  }

  /**
   * Calculate Sortino Ratio
   */
  private calculateSortinoRatio(trades: any[]): number {
    if (trades.length < 2) return 0;

    const returns = trades
      .filter(t => t.pnl && t.entryPrice)
      .map(t => (t.pnl || 0) / (t.entryPrice * t.quantity));

    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downsideReturns = returns.filter(r => r < 0);

    if (downsideReturns.length === 0) return Infinity;

    const downsideDev = Math.sqrt(
      downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
    );

    if (downsideDev === 0) return 0;

    return (avgReturn / downsideDev) * Math.sqrt(252);
  }

  /**
   * Calculate Max Drawdown
   */
  private calculateMaxDrawdown(trades: any[]): number {
    if (trades.length === 0) return 0;

    let peak = 0;
    let maxDrawdown = 0;
    let cumulativePnl = 0;

    for (const trade of trades) {
      cumulativePnl += trade.pnl || 0;

      if (cumulativePnl > peak) {
        peak = cumulativePnl;
      }

      const drawdown = peak - cumulativePnl;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Calculate Max Drawdown Duration
   */
  private calculateMaxDrawdownDuration(trades: any[]): number {
    if (trades.length === 0) return 0;

    let peakTime = trades[0]?.createdAt;
    let peakValue = 0;
    let maxDuration = 0;
    let cumulativePnl = 0;

    for (const trade of trades) {
      cumulativePnl += trade.pnl || 0;

      if (cumulativePnl > peakValue) {
        peakValue = cumulativePnl;
        peakTime = trade.createdAt;
      } else if (cumulativePnl < peakValue) {
        const duration = (trade.closedAt?.getTime() || Date.now()) - (peakTime?.getTime() || 0);
        if (duration > maxDuration) {
          maxDuration = duration;
        }
      }
    }

    return maxDuration / (1000 * 60 * 60); // Convert to hours
  }

  /**
   * Calculate Volatility
   */
  private calculateVolatility(trades: any[]): number {
    if (trades.length < 2) return 0;

    const returns = trades
      .filter(t => t.pnl && t.entryPrice)
      .map(t => (t.pnl || 0) / (t.entryPrice * t.quantity));

    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);

    return Math.sqrt(variance) * Math.sqrt(252); // Annualized
  }

  /**
   * Calculate Value at Risk (VaR)
   */
  private calculateVaR(trades: any[], confidence: number = 0.95): number {
    if (trades.length < 10) return 0;

    const returns = trades
      .filter(t => t.pnl && t.entryPrice)
      .map(t => (t.pnl || 0) / (t.entryPrice * t.quantity))
      .sort((a, b) => a - b);

    const index = Math.floor(returns.length * (1 - confidence));
    return Math.abs(returns[index] || 0);
  }

  /**
   * Calculate AUM (Assets Under Management)
   */
  private async calculateAUM(masterId: string): Promise<number> {
    const followers = await db.copyFollower.findMany({
      where: { masterId, active: true },
    });

    let totalAUM = 0;

    for (const follower of followers) {
      // Get follower's open copied trades
      const openTrades = await db.copiedTrade.findMany({
        where: {
          followerId: follower.id,
          status: 'OPEN',
        },
      });

      const followerAUM = openTrades.reduce(
        (sum, t) => sum + (t.quantity * t.entryPrice),
        0
      );

      totalAUM += followerAUM;
    }

    return totalAUM;
  }

  /**
   * Build equity curve
   */
  private async buildEquityCurve(masterId: string): Promise<EquityPoint[]> {
    const trades = await db.masterTrade.findMany({
      where: { masterId },
      orderBy: { createdAt: 'asc' },
    });

    const equityCurve: EquityPoint[] = [];
    let cumulativePnl = 0;

    // Get follower count over time
    const followers = await db.copyFollower.findMany({
      where: { masterId },
      orderBy: { createdAt: 'asc' },
    });

    let followerCount = 0;
    let followerIndex = 0;

    for (const trade of trades) {
      cumulativePnl += trade.pnl || 0;

      // Update follower count
      while (followerIndex < followers.length && 
             followers[followerIndex].createdAt <= trade.createdAt) {
        followerCount++;
        followerIndex++;
      }

      equityCurve.push({
        timestamp: trade.createdAt,
        balance: 10000 + cumulativePnl, // Assuming 10k starting balance
        pnl: cumulativePnl,
        trades: equityCurve.length + 1,
        followers: followerCount,
      });
    }

    return equityCurve;
  }

  /**
   * Get period metrics
   */
  private async getPeriodMetrics(
    masterId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PerformancePeriod> {
    const trades = await db.masterTrade.findMany({
      where: {
        masterId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => (t.pnl || 0) > 0).length;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    const pnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const volume = trades.reduce((sum, t) => sum + (t.quantity * t.entryPrice), 0);
    const avgTrade = totalTrades > 0 ? pnl / totalTrades : 0;

    return {
      trades: totalTrades,
      winRate,
      pnl,
      volume,
      avgTrade,
    };
  }
}

// ==================== SINGLETON ====================

let serviceInstance: MasterAnalyticsService | null = null;

export function getMasterAnalyticsService(): MasterAnalyticsService {
  if (!serviceInstance) {
    serviceInstance = new MasterAnalyticsService();
  }
  return serviceInstance;
}

// ==================== EXPORTS ====================

export default {
  MasterAnalyticsService,
  getMasterAnalyticsService,
};
