/**
 * Walk-Forward Optimization
 * 
 * Advanced strategy validation:
 * - In-sample optimization
 * - Out-of-sample validation
 * - Rolling window analysis
 * - Stability testing
 * - Overfitting detection
 * 
 * @module lib/optimization/walk-forward
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { GeneticOptimizer } from './genetic-optimizer';

// ==================== TYPES ====================

export interface WalkForwardConfig {
  totalDays: number;
  inSampleDays: number;
  outOfSampleDays: number;
  stepDays: number;
  optimizationConfig: {
    populationSize: number;
    generations: number;
    fitnessFunction: 'SHARPE' | 'PROFIT' | 'SORTINO';
  };
}

export interface WalkForwardWindow {
  windowId: number;
  inSampleStart: Date;
  inSampleEnd: Date;
  outOfSampleStart: Date;
  outOfSampleEnd: Date;
  inSampleMetrics: OptimizationMetrics;
  outOfSampleMetrics: OptimizationMetrics;
  degradation: number;
  passed: boolean;
}

export interface OptimizationMetrics {
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
}

export interface WalkForwardResult {
  symbol: string;
  windows: WalkForwardWindow[];
  avgInSampleReturn: number;
  avgOutOfSampleReturn: number;
  avgDegradation: number;
  stabilityScore: number;
  overfittingDetected: boolean;
  recommendation: 'APPROVED' | 'CAUTION' | 'REJECTED';
  robustness: {
    consistencyScore: number;
    degradationScore: number;
    tradeCountScore: number;
    overallScore: number;
  };
}

export interface StabilityAnalysis {
  parameterStability: Map<string, {
    mean: number;
    stdDev: number;
    cv: number; // Coefficient of variation
    stable: boolean;
  }>;
  performanceStability: {
    returnConsistency: number;
    sharpeConsistency: number;
    drawdownConsistency: number;
  };
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: WalkForwardConfig = {
  totalDays: 180,
  inSampleDays: 60,
  outOfSampleDays: 30,
  stepDays: 15,
  optimizationConfig: {
    populationSize: 50,
    generations: 100,
    fitnessFunction: 'SHARPE',
  },
};

// ==================== WALK-FORWARD OPTIMIZER ====================

export class WalkForwardOptimizer {
  private config: WalkForwardConfig;
  private geneticOptimizer: GeneticOptimizer;

  constructor(config?: Partial<WalkForwardConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.geneticOptimizer = new GeneticOptimizer(this.config.optimizationConfig);
  }

  /**
   * Run walk-forward optimization
   */
  async runWalkForward(symbol: string): Promise<WalkForwardResult> {
    logger.info({ symbol, config: this.config }, 'Starting walk-forward optimization...');

    const windows: WalkForwardWindow[] = [];
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - this.config.totalDays);

    // Calculate number of windows
    const numWindows = Math.floor(
      (this.config.totalDays - this.config.inSampleDays) / this.config.stepDays
    );

    if (numWindows < 3) {
      throw new Error('Insufficient data for walk-forward analysis (need at least 3 windows)');
    }

    // Run optimization for each window
    for (let i = 0; i < numWindows; i++) {
      const windowStart = new Date(startDate);
      windowStart.setDate(windowStart.getDate() + i * this.config.stepDays);

      const inSampleEnd = new Date(windowStart);
      inSampleEnd.setDate(inSampleEnd.getDate() + this.config.inSampleDays);

      const outOfSampleEnd = new Date(inSampleEnd);
      outOfSampleEnd.setDate(outOfSampleEnd.getDate() + this.config.outOfSampleDays);

      logger.info({ window: i + 1, total: numWindows }, 'Processing window...');

      // In-sample optimization
      const inSampleMetrics = await this.optimizeInSample(
        symbol,
        windowStart,
        inSampleEnd
      );

      // Out-of-sample validation
      const outOfSampleMetrics = await this.validateOutOfSample(
        symbol,
        inSampleEnd,
        outOfSampleEnd
      );

      // Calculate degradation
      const degradation = this.calculateDegradation(inSampleMetrics, outOfSampleMetrics);

      // Determine if window passed
      const passed = this.evaluateWindow(inSampleMetrics, outOfSampleMetrics, degradation);

      windows.push({
        windowId: i + 1,
        inSampleStart: windowStart,
        inSampleEnd,
        outOfSampleStart: inSampleEnd,
        outOfSampleEnd,
        inSampleMetrics,
        outOfSampleMetrics,
        degradation,
        passed,
      });
    }

    // Calculate aggregate metrics
    const avgInSampleReturn = windows.reduce((sum, w) => sum + w.inSampleMetrics.totalReturn, 0) / windows.length;
    const avgOutOfSampleReturn = windows.reduce((sum, w) => sum + w.outOfSampleMetrics.totalReturn, 0) / windows.length;
    const avgDegradation = windows.reduce((sum, w) => sum + w.degradation, 0) / windows.length;

    // Calculate stability score
    const stabilityScore = this.calculateStabilityScore(windows);

    // Detect overfitting
    const overfittingDetected = avgDegradation > 0.5 || stabilityScore < 0.6;

    // Generate recommendation
    const recommendation = this.generateRecommendation(avgDegradation, stabilityScore, windows);

    // Calculate robustness metrics
    const robustness = this.calculateRobustness(windows);

    const result: WalkForwardResult = {
      symbol,
      windows,
      avgInSampleReturn,
      avgOutOfSampleReturn,
      avgDegradation,
      stabilityScore,
      overfittingDetected,
      recommendation,
      robustness,
    };

    // Save to database
    await this.saveWalkForwardResult(result);

    logger.info({
      symbol,
      recommendation: result.recommendation,
      stabilityScore: result.stabilityScore.toFixed(2),
      avgDegradation: (result.avgDegradation * 100).toFixed(1) + '%',
    }, 'Walk-forward optimization completed');

    return result;
  }

  /**
   * Optimize in-sample period
   */
  private async optimizeInSample(
    symbol: string,
    startDate: Date,
    endDate: Date
  ): Promise<OptimizationMetrics> {
    // Get candles for in-sample period
    const candles = await db.ohlcvCandle.findMany({
      where: {
        symbol,
        openTime: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { openTime: 'asc' },
    });

    if (candles.length < 50) {
      return this.emptyMetrics();
    }

    // Run genetic optimization
    const result = await this.geneticOptimizer.optimize(symbol);

    return {
      totalReturn: result.bestMetrics.totalReturn,
      sharpeRatio: result.bestMetrics.sharpeRatio,
      maxDrawdown: result.bestMetrics.maxDrawdown,
      winRate: result.bestMetrics.winRate,
      profitFactor: result.bestMetrics.profitFactor,
      totalTrades: result.bestMetrics.totalTrades,
    };
  }

  /**
   * Validate out-of-sample period
   */
  private async validateOutOfSample(
    symbol: string,
    startDate: Date,
    endDate: Date
  ): Promise<OptimizationMetrics> {
    // Get candles for out-of-sample period
    const candles = await db.ohlcvCandle.findMany({
      where: {
        symbol,
        openTime: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { openTime: 'asc' },
    });

    if (candles.length < 20) {
      return this.emptyMetrics();
    }

    // Simulate trades using optimized parameters
    // In production, use the optimized genome from in-sample
    const metrics = await this.simulateTrading(symbol, candles);

    return metrics;
  }

  /**
   * Simulate trading for validation
   */
  private async simulateTrading(
    symbol: string,
    candles: any[]
  ): Promise<OptimizationMetrics> {
    // Simplified simulation - in production use actual strategy
    let equity = 10000;
    const trades: number[] = [];
    let peak = equity;
    let maxDrawdown = 0;

    for (let i = 50; i < candles.length; i++) {
      // Simple moving average crossover strategy
      const sma20 = candles.slice(i - 20, i).reduce((sum, c) => sum + c.close, 0) / 20;
      const sma50 = candles.slice(i - 50, i).reduce((sum, c) => sum + c.close, 0) / 50;
      
      const prevSma20 = candles.slice(i - 21, i - 1).reduce((sum, c) => sum + c.close, 0) / 20;
      const prevSma50 = candles.slice(i - 51, i - 1).reduce((sum, c) => sum + c.close, 0) / 50;

      // Generate signal
      let signal = 0;
      if (prevSma20 <= prevSma50 && sma20 > sma50) {
        signal = 1; // Buy
      } else if (prevSma20 >= prevSma50 && sma20 < sma50) {
        signal = -1; // Sell
      }

      if (signal !== 0) {
        const nextCandle = candles[i];
        const pnlPercent = signal * (nextCandle.close - nextCandle.open) / nextCandle.open;
        const pnl = equity * pnlPercent;
        
        equity += pnl;
        trades.push(pnl);

        // Track drawdown
        if (equity > peak) {
          peak = equity;
        }
        const drawdown = (peak - equity) / peak;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    }

    const totalReturn = (equity - 10000) / 10000;
    const winningTrades = trades.filter(t => t > 0).length;
    const winRate = trades.length > 0 ? winningTrades / trades.length : 0;

    const avgWin = trades.filter(t => t > 0).reduce((a, b) => a + b, 0) / Math.max(1, winningTrades);
    const avgLoss = Math.abs(trades.filter(t => t <= 0).reduce((a, b) => a + b, 0) / Math.max(1, trades.length - winningTrades));
    const profitFactor = avgLoss > 0 ? (avgWin * winningTrades) / (avgLoss * (trades.length - winningTrades)) : 0;

    // Sharpe ratio
    const returns = trades.map(t => t / 10000);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / Math.max(1, returns.length);
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / Math.max(1, returns.length - 1));
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    return {
      totalReturn,
      sharpeRatio,
      maxDrawdown,
      winRate,
      profitFactor,
      totalTrades: trades.length,
    };
  }

  /**
   * Calculate performance degradation
   */
  private calculateDegradation(inSample: OptimizationMetrics, outOfSample: OptimizationMetrics): number {
    if (inSample.totalReturn === 0) {
      return 0;
    }

    const returnDegradation = (inSample.totalReturn - outOfSample.totalReturn) / Math.abs(inSample.totalReturn);
    const sharpeDegradation = (inSample.sharpeRatio - outOfSample.sharpeRatio) / Math.max(0.01, inSample.sharpeRatio);
    const drawdownDegradation = (outOfSample.maxDrawdown - inSample.maxDrawdown) / Math.max(0.01, inSample.maxDrawdown);

    return (returnDegradation + sharpeDegradation + drawdownDegradation) / 3;
  }

  /**
   * Evaluate if window passed
   */
  private evaluateWindow(
    inSample: OptimizationMetrics,
    outOfSample: OptimizationMetrics,
    degradation: number
  ): boolean {
    // Window passes if:
    // 1. Out-of-sample return is positive
    // 2. Degradation is less than 50%
    // 3. Minimum trade count
    return (
      outOfSample.totalReturn > 0 &&
      degradation < 0.5 &&
      outOfSample.totalTrades >= 5
    );
  }

  /**
   * Calculate stability score
   */
  private calculateStabilityScore(windows: WalkForwardWindow[]): number {
    const passedWindows = windows.filter(w => w.passed).length;
    const passRate = passedWindows / windows.length;

    // Calculate consistency of returns
    const returns = windows.map(w => w.outOfSampleMetrics.totalReturn);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const consistency = 1 - Math.min(1, stdDev / Math.abs(avgReturn || 1));

    // Stability score is weighted average
    return (passRate * 0.6 + consistency * 0.4);
  }

  /**
   * Generate recommendation
   */
  private generateRecommendation(
    avgDegradation: number,
    stabilityScore: number,
    windows: WalkForwardWindow[]
  ): 'APPROVED' | 'CAUTION' | 'REJECTED' {
    const passedWindows = windows.filter(w => w.passed).length;
    const passRate = passedWindows / windows.length;

    if (passRate >= 0.7 && avgDegradation < 0.3 && stabilityScore >= 0.7) {
      return 'APPROVED';
    } else if (passRate >= 0.5 && avgDegradation < 0.5 && stabilityScore >= 0.5) {
      return 'CAUTION';
    } else {
      return 'REJECTED';
    }
  }

  /**
   * Calculate robustness metrics
   */
  private calculateRobustness(windows: WalkForwardWindow[]): WalkForwardResult['robustness'] {
    // Consistency score (based on return variance)
    const returns = windows.map(w => w.outOfSampleMetrics.totalReturn);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const consistencyScore = 1 - Math.min(1, stdDev / Math.abs(avgReturn || 1));

    // Degradation score
    const avgDegradation = windows.reduce((sum, w) => sum + w.degradation, 0) / windows.length;
    const degradationScore = 1 - Math.min(1, avgDegradation);

    // Trade count score
    const avgTrades = windows.reduce((sum, w) => sum + w.outOfSampleMetrics.totalTrades, 0) / windows.length;
    const tradeCountScore = Math.min(1, avgTrades / 20);

    // Overall score
    const overallScore = (consistencyScore * 0.4 + degradationScore * 0.4 + tradeCountScore * 0.2);

    return {
      consistencyScore,
      degradationScore,
      tradeCountScore,
      overallScore,
    };
  }

  /**
   * Empty metrics
   */
  private emptyMetrics(): OptimizationMetrics {
    return {
      totalReturn: 0,
      sharpeRatio: 0,
      maxDrawdown: 1,
      winRate: 0,
      profitFactor: 0,
      totalTrades: 0,
    };
  }

  /**
   * Save walk-forward result
   */
  private async saveWalkForwardResult(result: WalkForwardResult): Promise<void> {
    await db.walkForwardAnalysis.create({
      data: {
        symbol: result.symbol,
        avgInSampleReturn: result.avgInSampleReturn,
        avgOutOfSampleReturn: result.avgOutOfSampleReturn,
        avgDegradation: result.avgDegradation,
        stabilityScore: result.stabilityScore,
        overfittingDetected: result.overfittingDetected,
        recommendation: result.recommendation,
        robustness: result.robustness as any,
        windowsCount: result.windows.length,
        completedAt: new Date(),
      },
    });
  }
}

// ==================== SINGLETON ====================

let optimizerInstance: WalkForwardOptimizer | null = null;

export function getWalkForwardOptimizer(config?: Partial<WalkForwardConfig>): WalkForwardOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new WalkForwardOptimizer(config);
  }
  return optimizerInstance;
}

// ==================== EXPORTS ====================

export default {
  WalkForwardOptimizer,
  getWalkForwardOptimizer,
  DEFAULT_CONFIG,
};
