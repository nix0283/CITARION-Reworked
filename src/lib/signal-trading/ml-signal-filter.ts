/**
 * ML Signal Filter
 * 
 * Machine Learning-based signal filtering and scoring:
 * - Feature engineering from signal data
 * - Logistic regression for success prediction
 * - Source reliability tracking
 * - Confidence scoring
 * 
 * @module lib/signal-trading/ml-signal-filter
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface SignalFeatures {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  sourceChannel: string;
  sourceReliability: number;
  timeOfDay: number;
  dayOfWeek: number;
  volatility24h: number;
  volumeRatio: number;
  priceChange24h: number;
  marketCapRank: number;
  technicalScore: number;
  riskRewardRatio: number;
  entryConfidence: number;
  tpLevels: number;
  hasStopLoss: boolean;
  leverage: number;
}

export interface MLPrediction {
  probability: number;
  shouldExecute: boolean;
  confidence: number;
  factors: {
    source: number;
    technical: number;
    timing: number;
    riskReward: number;
    volatility: number;
  };
}

export interface SourceStats {
  source: string;
  totalSignals: number;
  successfulSignals: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  profitFactor: number;
  lastUpdated: Date;
}

// ==================== ML MODEL WEIGHTS ====================

const DEFAULT_WEIGHTS: Record<string, number> = {
  sourceReliability: 0.25,
  technicalScore: 0.20,
  riskRewardRatio: 0.15,
  volatility24h: 0.10,
  volumeRatio: 0.10,
  priceChange24h: 0.08,
  timeOfDay: 0.03,
  dayOfWeek: 0.02,
  marketCapRank: 0.04,
  entryConfidence: 0.03,
};

const EXECUTION_THRESHOLD = 0.65; // 65% probability to execute

// ==================== FEATURE ENGINEERING ====================

export class FeatureEngineer {
  /**
   * Extract features from signal data
   */
  async extractFeatures(signalData: {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    sourceChannel: string;
    entryPrice: number;
    stopLoss?: number;
    takeProfits: Array<{ price: number; percentage: number }>;
    leverage: number;
    timestamp: Date;
  }): Promise<SignalFeatures> {
    // Get source reliability
    const sourceStats = await this.getSourceStats(signalData.sourceChannel);
    const sourceReliability = sourceStats.winRate || 0.5;

    // Get market data
    const marketData = await this.getMarketData(signalData.symbol);

    // Calculate technical score
    const technicalScore = await this.calculateTechnicalScore(signalData.symbol);

    // Calculate risk/reward ratio
    const riskRewardRatio = this.calculateRiskRewardRatio(signalData);

    // Time features
    const timeOfDay = signalData.timestamp.getHours();
    const dayOfWeek = signalData.timestamp.getDay();

    return {
      symbol: signalData.symbol,
      direction: signalData.direction,
      sourceChannel: signalData.sourceChannel,
      sourceReliability,
      timeOfDay,
      dayOfWeek,
      volatility24h: marketData.volatility24h,
      volumeRatio: marketData.volumeRatio,
      priceChange24h: marketData.priceChange24h,
      marketCapRank: marketData.marketCapRank,
      technicalScore,
      riskRewardRatio,
      entryConfidence: signalData.takeProfits.length > 0 ? 0.8 : 0.5,
      tpLevels: signalData.takeProfits.length,
      hasStopLoss: !!signalData.stopLoss,
      leverage: signalData.leverage,
    };
  }

  /**
   * Get source statistics
   */
  private async getSourceStats(source: string): Promise<SourceStats> {
    const stats = await db.signalSource.findUnique({
      where: { source },
    });

    if (!stats) {
      return {
        source,
        totalSignals: 0,
        successfulSignals: 0,
        winRate: 0.5,
        avgProfit: 0,
        avgLoss: 0,
        profitFactor: 1,
        lastUpdated: new Date(),
      };
    }

    return {
      source: stats.source,
      totalSignals: stats.totalSignals,
      successfulSignals: stats.successfulSignals,
      winRate: stats.winRate,
      avgProfit: stats.avgProfit || 0,
      avgLoss: stats.avgLoss || 0,
      profitFactor: stats.profitFactor || 1,
      lastUpdated: stats.updatedAt,
    };
  }

  /**
   * Get market data for symbol
   */
  private async getMarketData(symbol: string): Promise<{
    volatility24h: number;
    volumeRatio: number;
    priceChange24h: number;
    marketCapRank: number;
  }> {
    // Get from MarketData model
    const marketData = await db.marketData.findFirst({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
    });

    if (!marketData) {
      // Fallback to MarketPrice if available
      const marketPrice = await db.marketPrice.findUnique({
        where: { symbol },
      });
      
      return {
        volatility24h: marketPrice?.priceChangePercent ? Math.abs(marketPrice.priceChangePercent) / 100 : 0.03,
        volumeRatio: 1,
        priceChange24h: marketPrice?.priceChangePercent || 0,
        marketCapRank: 50,
      };
    }

    return {
      volatility24h: marketData.volatility24h || 0.03,
      volumeRatio: marketData.volumeRatio || 1,
      priceChange24h: marketData.priceChange24h || 0,
      marketCapRank: marketData.marketCapRank || 50,
    };
  }

  /**
   * Calculate technical score from indicators
   */
  private async calculateTechnicalScore(symbol: string): Promise<number> {
    // Get recent candles
    const candles = await db.ohlcvCandle.findMany({
      where: { symbol },
      orderBy: { openTime: 'desc' },
      take: 50,
    });

    if (candles.length < 50) {
      return 0.5;
    }

    let score = 0.5;

    // RSI component
    const rsi = this.calculateRSI(candles, 14);
    if (rsi < 30) score += 0.15; // Oversold - bullish
    else if (rsi > 70) score -= 0.15; // Overbought - bearish

    // MACD component
    const macd = this.calculateMACD(candles);
    if (macd.histogram > 0) score += 0.1;
    else score -= 0.1;

    // Trend component
    const ema20 = this.calculateEMA(candles, 20);
    const ema50 = this.calculateEMA(candles, 50);
    const currentPrice = candles[0].close;

    if (currentPrice > ema20 && ema20 > ema50) score += 0.15; // Uptrend
    else if (currentPrice < ema20 && ema20 < ema50) score -= 0.15; // Downtrend

    // Normalize to 0-1
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate risk/reward ratio
   */
  private calculateRiskRewardRatio(signalData: {
    entryPrice: number;
    stopLoss?: number;
    takeProfits: Array<{ price: number; percentage: number }>;
  }): number {
    if (!signalData.stopLoss || signalData.takeProfits.length === 0) {
      return 1;
    }

    const entry = signalData.entryPrice;
    const risk = Math.abs(entry - signalData.stopLoss);

    const avgReward = signalData.takeProfits.reduce(
      (sum, tp) => sum + Math.abs(tp.price - entry),
      0
    ) / signalData.takeProfits.length;

    const rr = avgReward / risk;

    // Normalize to 0-1 (2:1 or better = 1)
    return Math.min(1, rr / 2);
  }

  /**
   * Calculate RSI
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
   * Calculate MACD
   */
  private calculateMACD(candles: any[]): {
    macd: number;
    signal: number;
    histogram: number;
  } {
    const ema12 = this.calculateEMA(candles, 12);
    const ema26 = this.calculateEMA(candles, 26);

    const macd = ema12 - ema26;
    const signal = macd * 0.9; // Simplified
    const histogram = macd - signal;

    return { macd, signal, histogram };
  }

  /**
   * Calculate EMA
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
}

// ==================== ML PREDICTOR ====================

export class MLPredictor {
  private weights: Record<string, number>;
  private threshold: number;

  constructor(weights?: Record<string, number>, threshold?: number) {
    this.weights = weights || DEFAULT_WEIGHTS;
    this.threshold = threshold || EXECUTION_THRESHOLD;
  }

  /**
   * Predict signal success probability
   */
  predict(features: SignalFeatures): MLPrediction {
    // Normalize features
    const normalized = this.normalizeFeatures(features);

    // Calculate weighted score
    let score = 0;
    for (const [feature, weight] of Object.entries(this.weights)) {
      const value = normalized[feature as keyof SignalFeatures] as number;
      score += value * weight;
    }

    // Apply sigmoid function
    const probability = this.sigmoid(score * 5); // Scale for better distribution

    // Calculate factor scores
    const factors = {
      source: normalized.sourceReliability,
      technical: normalized.technicalScore,
      timing: this.calculateTimingScore(normalized),
      riskReward: normalized.riskRewardRatio,
      volatility: this.calculateVolatilityScore(normalized),
    };

    return {
      probability,
      shouldExecute: probability >= this.threshold,
      confidence: Math.abs(probability - 0.5) * 2,
      factors,
    };
  }

  /**
   * Normalize features to 0-1 range
   */
  private normalizeFeatures(features: SignalFeatures): Record<string, number> {
    return {
      sourceReliability: features.sourceReliability,
      technicalScore: features.technicalScore,
      riskRewardRatio: Math.min(1, features.riskRewardRatio / 2),
      volatility24h: 1 - Math.min(1, features.volatility24h / 0.1), // Lower volatility = better
      volumeRatio: Math.min(1, features.volumeRatio / 2),
      priceChange24h: 1 - Math.min(1, Math.abs(features.priceChange24h) / 0.1),
      timeOfDay: this.normalizeTimeOfDay(features.timeOfDay),
      dayOfWeek: this.normalizeDayOfWeek(features.dayOfWeek),
      marketCapRank: 1 - Math.min(1, features.marketCapRank / 100),
      entryConfidence: features.entryConfidence,
    };
  }

  /**
   * Normalize time of day (best trading hours = 1)
   */
  private normalizeTimeOfDay(hour: number): number {
    // Best hours: 9-11 AM, 2-4 PM UTC (high volume)
    if ((hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16)) {
      return 1;
    }
    // Worst hours: 12-2 AM UTC (low volume)
    if (hour >= 0 && hour <= 2) {
      return 0.3;
    }
    return 0.7;
  }

  /**
   * Normalize day of week (weekdays = better)
   */
  private normalizeDayOfWeek(day: number): number {
    if (day >= 1 && day <= 5) {
      return 1; // Weekdays
    }
    return 0.6; // Weekend
  }

  /**
   * Calculate timing score
   */
  private calculateTimingScore(normalized: Record<string, number>): number {
    return (normalized.timeOfDay + normalized.dayOfWeek) / 2;
  }

  /**
   * Calculate volatility score
   */
  private calculateVolatilityScore(normalized: Record<string, number>): number {
    return normalized.volatility24h;
  }

  /**
   * Sigmoid function
   */
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Update weights based on performance
   */
  updateWeights(newWeights: Record<string, number>): void {
    this.weights = newWeights;
  }

  /**
   * Get current weights
   */
  getWeights(): Record<string, number> {
    return { ...this.weights };
  }
}

// ==================== SIGNAL FILTER ====================

export class MLSignalFilter {
  private featureEngineer: FeatureEngineer;
  private predictor: MLPredictor;

  constructor() {
    this.featureEngineer = new FeatureEngineer();
    this.predictor = new MLPredictor();
  }

  /**
   * Filter signal and return prediction
   */
  async filter(signalData: {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    sourceChannel: string;
    entryPrice: number;
    stopLoss?: number;
    takeProfits: Array<{ price: number; percentage: number }>;
    leverage: number;
    timestamp: Date;
  }): Promise<MLPrediction> {
    // Extract features
    const features = await this.featureEngineer.extractFeatures(signalData);

    // Get prediction
    const prediction = this.predictor.predict(features);

    // Log prediction
    logger.info({
      symbol: signalData.symbol,
      probability: prediction.probability,
      shouldExecute: prediction.shouldExecute,
      confidence: prediction.confidence,
    }, 'ML signal prediction');

    return prediction;
  }

  /**
   * Update source statistics after signal result
   */
  async updateSourceStats(
    source: string,
    success: boolean,
    profit: number
  ): Promise<void> {
    await db.signalSource.upsert({
      where: { source },
      update: {
        totalSignals: { increment: 1 },
        successfulSignals: success ? { increment: 1 } : undefined,
        winRate: { increment: 0 }, // Will be recalculated
        avgProfit: success ? { increment: profit } : undefined,
        updatedAt: new Date(),
      },
      create: {
        source,
        totalSignals: 1,
        successfulSignals: success ? 1 : 0,
        winRate: success ? 1 : 0,
        avgProfit: success ? profit : 0,
        avgLoss: success ? 0 : Math.abs(profit),
        profitFactor: success ? Infinity : 0,
      },
    });
  }
}

// ==================== SINGLETON ====================

let filterInstance: MLSignalFilter | null = null;

export function getMLSignalFilter(): MLSignalFilter {
  if (!filterInstance) {
    filterInstance = new MLSignalFilter();
  }
  return filterInstance;
}

// ==================== EXPORTS ====================

export default {
  FeatureEngineer,
  MLPredictor,
  MLSignalFilter,
  getMLSignalFilter,
  DEFAULT_WEIGHTS,
  EXECUTION_THRESHOLD,
};
