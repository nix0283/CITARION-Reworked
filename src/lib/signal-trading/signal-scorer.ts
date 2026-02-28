/**
 * Signal Scoring System
 * 
 * Comprehensive signal scoring with weighted factors:
 * - Source reliability
 * - Technical analysis
 * - Risk/reward ratio
 * - Market conditions
 * - Timing
 * 
 * @module lib/signal-trading/signal-scorer
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ParsedSignal } from './telegram-parser';
import { SignalFeatures, MLPrediction } from './ml-signal-filter';

// ==================== TYPES ====================

export interface SignalScore {
  total: number;
  grade: 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C' | 'D' | 'F';
  recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  factors: {
    source: number;
    technical: number;
    fundamental: number;
    sentiment: number;
    riskReward: number;
    timing: number;
  };
  weights: {
    source: number;
    technical: number;
    fundamental: number;
    sentiment: number;
    riskReward: number;
    timing: number;
  };
}

export interface ScoringConfig {
  weights: {
    source: number;
    technical: number;
    fundamental: number;
    sentiment: number;
    riskReward: number;
    timing: number;
  };
  thresholds: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
  };
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: ScoringConfig = {
  weights: {
    source: 0.20,
    technical: 0.25,
    fundamental: 0.15,
    sentiment: 0.10,
    riskReward: 0.20,
    timing: 0.10,
  },
  thresholds: {
    strongBuy: 0.85,
    buy: 0.65,
    hold: 0.45,
    sell: 0.35,
  },
};

// ==================== SIGNAL SCORER CLASS ====================

export class SignalScorer {
  private config: ScoringConfig;

  constructor(config?: Partial<ScoringConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Calculate comprehensive signal score
   */
  async score(
    signal: ParsedSignal,
    mlPrediction?: MLPrediction
  ): Promise<SignalScore> {
    // Calculate individual factor scores
    const factors = {
      source: await this.calculateSourceScore(signal.sourceChannel),
      technical: await this.calculateTechnicalScore(signal.symbol, signal.direction),
      fundamental: await this.calculateFundamentalScore(signal.symbol),
      sentiment: await this.calculateSentimentScore(signal.symbol),
      riskReward: this.calculateRiskRewardScore(signal),
      timing: await this.calculateTimingScore(signal),
    };

    // Apply ML prediction boost if available
    if (mlPrediction) {
      factors.source = (factors.source + mlPrediction.factors.source) / 2;
      factors.technical = (factors.technical + mlPrediction.factors.technical) / 2;
    }

    // Calculate weighted total
    const total = Object.entries(factors).reduce((sum, [key, value]) => {
      const weight = this.config.weights[key as keyof typeof this.config.weights];
      return sum + value * weight;
    }, 0);

    // Determine grade
    const grade = this.calculateGrade(total);

    // Determine recommendation
    const recommendation = this.calculateRecommendation(total, signal.direction);

    return {
      total,
      grade,
      recommendation,
      factors,
      weights: this.config.weights,
    };
  }

  /**
   * Calculate source reliability score
   */
  private async calculateSourceScore(sourceChannel: string): Promise<number> {
    const stats = await db.signalSource.findUnique({
      where: { source: sourceChannel },
    });

    if (!stats) {
      return 0.5; // Unknown source = neutral
    }

    // Base score from win rate
    let score = stats.winRate;

    // Bonus for volume (more signals = more reliable stats)
    if (stats.totalSignals > 100) score += 0.1;
    else if (stats.totalSignals > 50) score += 0.05;
    else if (stats.totalSignals < 10) score -= 0.1;

    // Bonus for profit factor
    if (stats.profitFactor > 2) score += 0.1;
    else if (stats.profitFactor > 1.5) score += 0.05;
    else if (stats.profitFactor < 1) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate technical analysis score
   */
  private async calculateTechnicalScore(
    symbol: string,
    direction: 'LONG' | 'SHORT'
  ): Promise<number> {
    // Get recent candles
    const candles = await db.ohlcvCandle.findMany({
      where: { symbol },
      orderBy: { openTime: 'desc' },
      take: 100,
    });

    if (candles.length < 50) {
      return 0.5;
    }

    let score = 0.5;

    // RSI
    const rsi = this.calculateRSI(candles, 14);
    if (direction === 'LONG') {
      if (rsi < 30) score += 0.2; // Oversold
      else if (rsi > 70) score -= 0.2; // Overbought
    } else {
      if (rsi > 70) score += 0.2; // Overbought
      else if (rsi < 30) score -= 0.2; // Oversold
    }

    // MACD
    const macd = this.calculateMACD(candles);
    if (direction === 'LONG' && macd.histogram > 0) score += 0.15;
    else if (direction === 'SHORT' && macd.histogram < 0) score += 0.15;
    else score -= 0.1;

    // Trend (EMA)
    const ema20 = this.calculateEMA(candles, 20);
    const ema50 = this.calculateEMA(candles, 50);
    const currentPrice = candles[0].close;

    const isUptrend = currentPrice > ema20 && ema20 > ema50;
    const isDowntrend = currentPrice < ema20 && ema20 < ema50;

    if (direction === 'LONG' && isUptrend) score += 0.15;
    else if (direction === 'SHORT' && isDowntrend) score += 0.15;
    else score -= 0.1;

    // Volume
    const avgVolume = candles.slice(0, 20).reduce((sum, c) => sum + c.volume, 0) / 20;
    const currentVolume = candles[0].volume;
    const volumeRatio = currentVolume / avgVolume;

    if (volumeRatio > 1.5) score += 0.1; // High volume confirms move
    else if (volumeRatio < 0.5) score -= 0.1; // Low volume = weak move

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate fundamental score (market cap, etc.)
   */
  private async calculateFundamentalScore(symbol: string): Promise<number> {
    const marketData = await db.marketData.findFirst({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
    });

    if (!marketData) {
      return 0.5;
    }

    let score = 0.5;

    // Market cap rank (lower = better)
    if (marketData.marketCapRank && marketData.marketCapRank <= 10) {
      score += 0.2;
    } else if (marketData.marketCapRank && marketData.marketCapRank <= 50) {
      score += 0.1;
    } else if (marketData.marketCapRank && marketData.marketCapRank > 200) {
      score -= 0.1;
    }

    // Volume (higher = better liquidity)
    if (marketData.volume24h && marketData.volume24h > 100_000_000) {
      score += 0.15;
    } else if (marketData.volume24h && marketData.volume24h > 10_000_000) {
      score += 0.1;
    } else if (marketData.volume24h && marketData.volume24h < 1_000_000) {
      score -= 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate sentiment score
   */
  private async calculateSentimentScore(symbol: string): Promise<number> {
    // Get social sentiment from database (if available)
    const sentiment = await db.marketSentiment.findFirst({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
    });

    if (!sentiment) {
      return 0.5;
    }

    // Normalize sentiment score (-1 to 1) to (0 to 1)
    return (sentiment.score + 1) / 2;
  }

  /**
   * Calculate risk/reward score
   */
  private calculateRiskRewardScore(signal: ParsedSignal): number {
    if (!signal.stopLoss || signal.takeProfits.length === 0) {
      return 0.5;
    }

    const entry = signal.entryPrices[0];
    const risk = Math.abs(entry - signal.stopLoss);
    
    const avgReward = signal.takeProfits.reduce(
      (sum, tp) => sum + Math.abs(tp.price - entry),
      0
    ) / signal.takeProfits.length;

    const rr = avgReward / risk;

    // Score based on R:R ratio
    if (rr >= 3) return 1.0;
    if (rr >= 2) return 0.9;
    if (rr >= 1.5) return 0.7;
    if (rr >= 1) return 0.5;
    if (rr >= 0.5) return 0.3;
    return 0.1;
  }

  /**
   * Calculate timing score
   */
  private async calculateTimingScore(signal: ParsedSignal): Promise<number> {
    let score = 0.5;

    // Time of day
    const hour = signal.timestamp.getUTCHours();
    if ((hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16)) {
      score += 0.2; // High volume hours
    } else if (hour >= 0 && hour <= 2) {
      score -= 0.2; // Low volume hours
    }

    // Day of week
    const day = signal.timestamp.getUTCDay();
    if (day >= 1 && day <= 5) {
      score += 0.1; // Weekdays
    } else {
      score -= 0.1; // Weekend
    }

    // Market volatility
    const marketData = await db.marketData.findFirst({
      where: { symbol: signal.symbol },
      orderBy: { timestamp: 'desc' },
    });

    if (marketData) {
      // Moderate volatility is best
      if (marketData.volatility24h >= 0.02 && marketData.volatility24h <= 0.05) {
        score += 0.15;
      } else if (marketData.volatility24h > 0.1) {
        score -= 0.15; // Too volatile
      } else if (marketData.volatility24h < 0.01) {
        score -= 0.1; // Too quiet
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate grade from score
   */
  private calculateGrade(score: number): SignalScore['grade'] {
    if (score >= 0.95) return 'A+';
    if (score >= 0.90) return 'A';
    if (score >= 0.85) return 'A-';
    if (score >= 0.75) return 'B+';
    if (score >= 0.65) return 'B';
    if (score >= 0.55) return 'B-';
    if (score >= 0.45) return 'C';
    if (score >= 0.35) return 'D';
    return 'F';
  }

  /**
   * Calculate recommendation from score and direction
   */
  private calculateRecommendation(
    score: number,
    direction: 'LONG' | 'SHORT'
  ): SignalScore['recommendation'] {
    if (score >= this.config.thresholds.strongBuy) {
      return direction === 'LONG' ? 'STRONG_BUY' : 'STRONG_SELL';
    }
    if (score >= this.config.thresholds.buy) {
      return direction === 'LONG' ? 'BUY' : 'SELL';
    }
    if (score >= this.config.thresholds.hold) {
      return 'HOLD';
    }
    if (score >= this.config.thresholds.sell) {
      return direction === 'LONG' ? 'SELL' : 'BUY';
    }
    return direction === 'LONG' ? 'STRONG_SELL' : 'STRONG_BUY';
  }

  /**
   * Helper: Calculate RSI
   */
  private calculateRSI(candles: any[], period: number = 14): number {
    if (candles.length < period + 1) return 50;

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i <= period; i++) {
      const change = candles[i - 1].close - candles[i].close;
      if (change > 0) gains.push(change);
      else losses.push(Math.abs(change));
    }

    const avgGain = gains.reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Helper: Calculate MACD
   */
  private calculateMACD(candles: any[]): {
    macd: number;
    signal: number;
    histogram: number;
  } {
    const ema12 = this.calculateEMA(candles, 12);
    const ema26 = this.calculateEMA(candles, 26);

    const macd = ema12 - ema26;
    const signal = macd * 0.9;
    const histogram = macd - signal;

    return { macd, signal, histogram };
  }

  /**
   * Helper: Calculate EMA
   */
  private calculateEMA(candles: any[], period: number): number {
    if (candles.length < period) return candles[0].close;

    const multiplier = 2 / (period + 1);
    let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;

    for (let i = period; i < candles.length; i++) {
      ema = (candles[i].close - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Update scoring configuration
   */
  updateConfig(config: Partial<ScoringConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): ScoringConfig {
    return { ...this.config };
  }
}

// ==================== SINGLETON ====================

let scorerInstance: SignalScorer | null = null;

export function getSignalScorer(config?: Partial<ScoringConfig>): SignalScorer {
  if (!scorerInstance) {
    scorerInstance = new SignalScorer(config);
  } else if (config) {
    scorerInstance.updateConfig(config);
  }
  return scorerInstance;
}

// ==================== EXPORTS ====================

export default {
  SignalScorer,
  getSignalScorer,
  DEFAULT_CONFIG,
};
