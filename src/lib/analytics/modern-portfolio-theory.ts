/**
 * Modern Portfolio Theory Implementation
 * 
 * Portfolio optimization using MPT:
 * - Risk parity allocation
 * - Correlation analysis
 * - Efficient frontier
 * - Rebalancing automation
 * - Sharpe ratio optimization
 * 
 * @module lib/analytics/modern-portfolio-theory
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface Asset {
  symbol: string;
  expectedReturn: number;
  volatility: number;
  weight: number;
}

export interface Portfolio {
  assets: Asset[];
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  correlationMatrix: number[][];
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
}

export interface RebalanceSignal {
  symbol: string;
  currentWeight: number;
  targetWeight: number;
  deviation: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  priority: number;
}

export interface EfficientFrontierPoint {
  return: number;
  volatility: number;
  sharpeRatio: number;
  weights: number[];
}

export interface PortfolioOptimization {
  optimalWeights: number[];
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  diversificationRatio: number;
  riskContribution: number[];
}

// ==================== MODERN PORTFOLIO THEORY ====================

export class ModernPortfolioTheory {
  private riskFreeRate: number;

  constructor(riskFreeRate: number = 0.02) {
    this.riskFreeRate = riskFreeRate; // Default 2% risk-free rate
  }

  /**
   * Calculate correlation matrix for assets
   */
  async calculateCorrelationMatrix(symbols: string[], days: number = 90): Promise<CorrelationMatrix> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get historical prices for all symbols
    const priceData: Map<string, number[]> = new Map();

    for (const symbol of symbols) {
      const candles = await db.ohlcvCandle.findMany({
        where: {
          symbol,
          openTime: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { openTime: 'asc' },
        select: { close: true },
      });

      const prices = candles.map(c => c.close);
      priceData.set(symbol, prices);
    }

    // Calculate returns
    const returns: Map<string, number[]> = new Map();
    for (const [symbol, prices] of priceData.entries()) {
      const symbolReturns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
        symbolReturns.push(ret);
      }
      returns.set(symbol, symbolReturns);
    }

    // Calculate correlation matrix
    const matrix: number[][] = [];
    for (let i = 0; i < symbols.length; i++) {
      const row: number[] = [];
      for (let j = 0; j < symbols.length; j++) {
        const returnsA = returns.get(symbols[i])!;
        const returnsB = returns.get(symbols[j])!;
        const correlation = this.calculateCorrelation(returnsA, returnsB);
        row.push(correlation);
      }
      matrix.push(row);
    }

    return {
      symbols,
      matrix,
    };
  }

  /**
   * Calculate risk parity weights
   */
  calculateRiskParity(correlationMatrix: CorrelationMatrix, volatilities: number[]): number[] {
    const n = correlationMatrix.symbols.length;
    
    // Initial equal weights
    let weights = new Array(n).fill(1 / n);

    // Iterative optimization
    for (let iteration = 0; iteration < 100; iteration++) {
      const riskContributions = this.calculateRiskContributions(weights, correlationMatrix.matrix, volatilities);
      const avgRiskContribution = riskContributions.reduce((a, b) => a + b, 0) / n;

      // Adjust weights to equalize risk contributions
      const newWeights = weights.map((w, i) => {
        const adjustment = avgRiskContribution / riskContributions[i];
        return w * Math.sqrt(adjustment);
      });

      // Normalize weights
      const sum = newWeights.reduce((a, b) => a + b, 0);
      weights = newWeights.map(w => w / sum);

      // Check convergence
      const maxDiff = Math.max(...weights.map((w, i) => Math.abs(w - newWeights[i])));
      if (maxDiff < 0.0001) {
        break;
      }
    }

    return weights;
  }

  /**
   * Calculate risk contributions
   */
  private calculateRiskContributions(weights: number[], correlationMatrix: number[][], volatilities: number[]): number[] {
    const n = weights.length;
    const portfolioVolatility = this.calculatePortfolioVolatility(weights, correlationMatrix, volatilities);
    const riskContributions: number[] = [];

    for (let i = 0; i < n; i++) {
      let marginalRisk = 0;
      for (let j = 0; j < n; j++) {
        marginalRisk += weights[j] * correlationMatrix[i][j] * volatilities[i] * volatilities[j];
      }
      marginalRisk /= portfolioVolatility;
      riskContributions.push(weights[i] * marginalRisk);
    }

    return riskContributions;
  }

  /**
   * Calculate portfolio volatility
   */
  private calculatePortfolioVolatility(weights: number[], correlationMatrix: number[][], volatilities: number[]): number {
    const n = weights.length;
    let variance = 0;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        variance += weights[i] * weights[j] * correlationMatrix[i][j] * volatilities[i] * volatilities[j];
      }
    }

    return Math.sqrt(variance);
  }

  /**
   * Calculate efficient frontier
   */
  async calculateEfficientFrontier(
    symbols: string[],
    points: number = 50
  ): Promise<EfficientFrontierPoint[]> {
    const correlationMatrix = await this.calculateCorrelationMatrix(symbols);
    
    // Get expected returns and volatilities
    const assets = await this.getAssetMetrics(symbols);
    const volatilities = assets.map(a => a.volatility);
    const expectedReturns = assets.map(a => a.expectedReturn);

    const frontier: EfficientFrontierPoint[] = [];

    // Generate portfolios along the frontier
    const minReturn = Math.min(...expectedReturns);
    const maxReturn = Math.max(...expectedReturns);

    for (let i = 0; i <= points; i++) {
      const targetReturn = minReturn + (maxReturn - minReturn) * (i / points);
      
      // Optimize weights for this return level
      const weights = this.optimizeForReturn(targetReturn, expectedReturns, correlationMatrix.matrix, volatilities);
      
      if (weights) {
        const volatility = this.calculatePortfolioVolatility(weights, correlationMatrix.matrix, volatilities);
        const sharpeRatio = (targetReturn - this.riskFreeRate) / volatility;

        frontier.push({
          return: targetReturn,
          volatility,
          sharpeRatio,
          weights,
        });
      }
    }

    return frontier;
  }

  /**
   * Optimize portfolio for maximum Sharpe ratio
   */
  async optimizeMaxSharpe(symbols: string[]): Promise<PortfolioOptimization> {
    const correlationMatrix = await this.calculateCorrelationMatrix(symbols);
    const assets = await this.getAssetMetrics(symbols);
    const volatilities = assets.map(a => a.volatility);
    const expectedReturns = assets.map(a => a.expectedReturn);

    // Use gradient descent to find optimal weights
    let weights = new Array(symbols.length).fill(1 / symbols.length);
    let bestSharpe = -Infinity;
    let bestWeights = [...weights];

    for (let iteration = 0; iteration < 500; iteration++) {
      const return_ = this.calculatePortfolioReturn(weights, expectedReturns);
      const volatility = this.calculatePortfolioVolatility(weights, correlationMatrix.matrix, volatilities);
      const sharpeRatio = (return_ - this.riskFreeRate) / volatility;

      if (sharpeRatio > bestSharpe) {
        bestSharpe = sharpeRatio;
        bestWeights = [...weights];
      }

      // Gradient ascent
      const gradient = this.calculateSharpeGradient(weights, expectedReturns, correlationMatrix.matrix, volatilities);
      
      // Update weights
      weights = weights.map((w, i) => Math.max(0, w + 0.01 * gradient[i]));
      
      // Normalize
      const sum = weights.reduce((a, b) => a + b, 0);
      weights = weights.map(w => w / sum);
    }

    const optimalReturn = this.calculatePortfolioReturn(bestWeights, expectedReturns);
    const optimalVolatility = this.calculatePortfolioVolatility(bestWeights, correlationMatrix.matrix, volatilities);
    const riskContributions = this.calculateRiskContributions(bestWeights, correlationMatrix.matrix, volatilities);

    // Calculate diversification ratio
    const weightedAvgVolatility = bestWeights.reduce((sum, w, i) => sum + w * volatilities[i], 0);
    const diversificationRatio = weightedAvgVolatility / optimalVolatility;

    return {
      optimalWeights: bestWeights,
      expectedReturn: optimalReturn,
      volatility: optimalVolatility,
      sharpeRatio: bestSharpe,
      diversificationRatio,
      riskContribution: riskContributions,
    };
  }

  /**
   * Generate rebalance signals
   */
  generateRebalanceSignals(
    currentWeights: number[],
    targetWeights: number[],
    symbols: string[],
    threshold: number = 0.05
  ): RebalanceSignal[] {
    const signals: RebalanceSignal[] = [];

    for (let i = 0; i < symbols.length; i++) {
      const deviation = currentWeights[i] - targetWeights[i];
      const absDeviation = Math.abs(deviation);

      let action: 'BUY' | 'SELL' | 'HOLD';
      if (absDeviation < threshold) {
        action = 'HOLD';
      } else if (deviation > 0) {
        action = 'SELL';
      } else {
        action = 'BUY';
      }

      signals.push({
        symbol: symbols[i],
        currentWeight: currentWeights[i],
        targetWeight: targetWeights[i],
        deviation,
        action,
        priority: absDeviation,
      });
    }

    // Sort by priority (largest deviations first)
    signals.sort((a, b) => b.priority - a.priority);

    return signals;
  }

  /**
   * Get asset metrics (expected return and volatility)
   */
  private async getAssetMetrics(symbols: string[]): Promise<Asset[]> {
    const assets: Asset[] = [];

    for (const symbol of symbols) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);

      const candles = await db.ohlcvCandle.findMany({
        where: {
          symbol,
          openTime: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { openTime: 'asc' },
        select: { close: true },
      });

      if (candles.length < 30) {
        continue;
      }

      const prices = candles.map(c => c.close);
      const returns = [];
      for (let i = 1; i < prices.length; i++) {
        const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
        returns.push(ret);
      }

      const expectedReturn = returns.reduce((a, b) => a + b, 0) / returns.length * 252; // Annualized
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - expectedReturn / 252, 2), 0) / returns.length;
      const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized

      assets.push({
        symbol,
        expectedReturn,
        volatility,
        weight: 1 / symbols.length,
      });
    }

    return assets;
  }

  /**
   * Calculate portfolio return
   */
  private calculatePortfolioReturn(weights: number[], expectedReturns: number[]): number {
    return weights.reduce((sum, w, i) => sum + w * expectedReturns[i], 0);
  }

  /**
   * Calculate correlation between two arrays
   */
  private calculateCorrelation(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    const meanA = a.slice(0, n).reduce((sum, x) => sum + x, 0) / n;
    const meanB = b.slice(0, n).reduce((sum, x) => sum + x, 0) / n;

    let numerator = 0;
    let sumSqA = 0;
    let sumSqB = 0;

    for (let i = 0; i < n; i++) {
      const diffA = a[i] - meanA;
      const diffB = b[i] - meanB;
      numerator += diffA * diffB;
      sumSqA += diffA * diffA;
      sumSqB += diffB * diffB;
    }

    const denominator = Math.sqrt(sumSqA * sumSqB);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Optimize weights for target return
   */
  private optimizeForReturn(
    targetReturn: number,
    expectedReturns: number[],
    correlationMatrix: number[][],
    volatilities: number[]
  ): number[] | null {
    // Simplified optimization - in production use proper quadratic programming
    const n = expectedReturns.length;
    let weights = new Array(n).fill(1 / n);

    for (let iteration = 0; iteration < 100; iteration++) {
      const currentReturn = this.calculatePortfolioReturn(weights, expectedReturns);
      
      if (Math.abs(currentReturn - targetReturn) < 0.001) {
        break;
      }

      // Adjust weights toward higher/lower return assets
      for (let i = 0; i < n; i++) {
        if (currentReturn < targetReturn && expectedReturns[i] > currentReturn) {
          weights[i] += 0.01;
        } else if (currentReturn > targetReturn && expectedReturns[i] < currentReturn) {
          weights[i] -= 0.01;
        }
      }

      // Ensure weights are positive and sum to 1
      weights = weights.map(w => Math.max(0, w));
      const sum = weights.reduce((a, b) => a + b, 0);
      weights = weights.map(w => w / sum);
    }

    return weights;
  }

  /**
   * Calculate Sharpe ratio gradient
   */
  private calculateSharpeGradient(
    weights: number[],
    expectedReturns: number[],
    correlationMatrix: number[][],
    volatilities: number[]
  ): number[] {
    const n = weights.length;
    const return_ = this.calculatePortfolioReturn(weights, expectedReturns);
    const volatility = this.calculatePortfolioVolatility(weights, correlationMatrix, volatilities);
    const gradient: number[] = [];

    for (let i = 0; i < n; i++) {
      // Partial derivative of Sharpe ratio with respect to weight i
      const marginalReturn = expectedReturns[i];
      
      let marginalVolatility = 0;
      for (let j = 0; j < n; j++) {
        marginalVolatility += weights[j] * correlationMatrix[i][j] * volatilities[i] * volatilities[j];
      }
      marginalVolatility /= volatility;

      const gradientValue = (marginalReturn * volatility - (return_ - this.riskFreeRate) * marginalVolatility) / (volatility * volatility);
      gradient.push(gradientValue);
    }

    return gradient;
  }
}

// ==================== SINGLETON ====================

let mptInstance: ModernPortfolioTheory | null = null;

export function getModernPortfolioTheory(riskFreeRate?: number): ModernPortfolioTheory {
  if (!mptInstance) {
    mptInstance = new ModernPortfolioTheory(riskFreeRate);
  }
  return mptInstance;
}

// ==================== EXPORTS ====================

export default {
  ModernPortfolioTheory,
  getModernPortfolioTheory,
};
