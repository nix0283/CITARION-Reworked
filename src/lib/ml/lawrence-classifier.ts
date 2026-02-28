/**
 * Lawrence Classifier
 * 
 * Специализированный классификатор торговых сигналов на основе:
 * - Множественных индикаторов (RSI, MACD, ATR, Volume)
 * - Контекста рынка (тренд, волатильность, объём)
 * - Исторической эффективности похожих сигналов
 * - Временных паттернов
 * 
 * Формула вероятности:
 * P(success) = w₁×Indicator_Score + w₂×Context_Score + w₃×History_Score + w₄×Time_Score
 * 
 * @module lib/ml/lawrence-classifier
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export type MarketTrend = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE' | 'CALM';
export type SignalDirection = 'LONG' | 'SHORT';
export type ClassificationResult = 'WIN' | 'LOSS' | 'BREAKEVEN';

export interface ClassifierFeatures {
  // Индикаторы
  indicators: {
    rsi?: number;           // 0-100
    macd?: number;          // MACD value
    macdSignal?: number;    // Signal line
    macdHistogram?: number; // Histogram
    atr?: number;           // Average True Range
    bbPosition?: number;    // Position in Bollinger Bands (0-1)
    bbWidth?: number;       // Band width
    ema20?: number;
    ema50?: number;
    volume?: number;        // Current volume
    volumeRatio?: number;   // Volume vs average
    adx?: number;           // Trend strength
  };
  
  // Контекст рынка
  context: {
    trend: MarketTrend;
    volatility: 'LOW' | 'MEDIUM' | 'HIGH';
    volume: 'LOW' | 'MEDIUM' | 'HIGH';
    supportResistance?: 'NEAR_SUPPORT' | 'NEAR_RESISTANCE' | 'MIDDLE';
  };
  
  // Сигнал
  signal: {
    direction: SignalDirection;
    symbol: string;
    timeframe: string;
    entryPrice: number;
  };
  
  // Время
  time: {
    hour: number;         // 0-23
    dayOfWeek: number;    // 0-6
    isSessionOverlap: boolean;
  };
}

export interface ClassifierConfig {
  // Веса компонентов
  weights: {
    indicators: number;   // 0-1
    context: number;      // 0-1
    history: number;      // 0-1
    time: number;         // 0-1
  };
  
  // Пороги
  minConfidence: number;  // 0-1
  minHistorySize: number; // Minimum historical trades
  
  // Обучение
  lookbackDays: number;   // Days of history to consider
  decayFactor: number;    // Recency decay (0-1)
}

export interface ClassificationResult {
  probability: number;    // 0-1 probability of success
  prediction: 'WIN' | 'LOSS';
  confidence: number;     // 0-1 confidence in prediction
  scores: {
    indicator: number;
    context: number;
    history: number;
    time: number;
  };
  reasons: string[];
}

export interface HistoricalTrade {
  id: string;
  symbol: string;
  direction: SignalDirection;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  outcome: ClassificationResult;
  features: ClassifierFeatures;
  timestamp: Date;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: ClassifierConfig = {
  weights: {
    indicators: 0.4,
    context: 0.3,
    history: 0.2,
    time: 0.1,
  },
  minConfidence: 0.6,
  minHistorySize: 50,
  lookbackDays: 90,
  decayFactor: 0.95,
};

// ==================== LAWRENCE CLASSIFIER ====================

export class LawrenceClassifier {
  private config: ClassifierConfig;
  private historicalTrades: HistoricalTrade[] = [];
  private isTrained: boolean = false;

  constructor(config?: Partial<ClassifierConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Загрузить исторические данные для обучения с pagination
   */
  async train(symbol?: string, days?: number): Promise<void> {
    const lookbackDays = days || this.config.lookbackDays;
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const where: any = {
      status: 'CLOSED',
      exitTime: { gte: since },
    };

    if (symbol) {
      where.symbol = symbol;
    }

    // Pagination: load in chunks of 200
    const pageSize = 200;
    let skip = 0;
    const allTrades: any[] = [];

    while (true) {
      const trades = await db.trade.findMany({
        where,
        orderBy: { exitTime: 'desc' },
        take: pageSize,
        skip,
      });

      if (trades.length === 0) break;

      allTrades.push(...trades);
      skip += pageSize;

      // Stop if we have enough or reached 2000 trades max
      if (allTrades.length >= 2000) break;
    }

    this.historicalTrades = allTrades.map(trade => ({
      id: trade.id,
      symbol: trade.symbol,
      direction: trade.direction as SignalDirection,
      entryPrice: trade.entryPrice || 0,
      exitPrice: trade.exitPrice || 0,
      pnl: trade.pnl,
      pnlPercent: trade.pnlPercent,
      outcome: this.classifyOutcome(trade.pnlPercent),
      features: {} as ClassifierFeatures, // Will be populated asynchronously
      timestamp: trade.exitTime,
    }));

    // Populate features asynchronously in batches
    await this.populateFeaturesInBatches(50); // 50 at a time

    this.isTrained = this.historicalTrades.length >= this.config.minHistorySize;

    logger.info({
      symbol,
      tradesLoaded: this.historicalTrades.length,
      isTrained: this.isTrained,
    }, 'Lawrence classifier trained');
  }

  /**
   * Populate features in batches to avoid memory issues
   */
  private async populateFeaturesInBatches(batchSize: number = 50): Promise<void> {
    for (let i = 0; i < this.historicalTrades.length; i += batchSize) {
      const batch = this.historicalTrades.slice(i, i + batchSize);
      const promises = batch.map(async (trade) => {
        trade.features = await this.extractFeaturesFromTrade({
          ...trade,
          entryTime: trade.timestamp,
        });
      });
      await Promise.all(promises);
      logger.debug({ batch: Math.floor(i / batchSize) + 1 }, 'Features populated');
    }
  }

  /**
   * Оценить сигнал
   */
  async evaluate(features: ClassifierFeatures): Promise<ClassificationResult> {
    // 1. Score индикаторов
    const indicatorScore = this.calculateIndicatorScore(features);

    // 2. Score контекста
    const contextScore = this.calculateContextScore(features);

    // 3. Score истории (если есть данные)
    const historyScore = this.calculateHistoryScore(features);

    // 4. Score времени
    const timeScore = this.calculateTimeScore(features);

    // 5. Комбинированная вероятность
    const probability =
      indicatorScore * this.config.weights.indicators +
      contextScore * this.config.weights.context +
      historyScore * this.config.weights.history +
      timeScore * this.config.weights.time;

    // 6. Уверенность
    const confidence = this.calculateConfidence(indicatorScore, contextScore, historyScore, timeScore);

    // 7. Предсказание
    const prediction: 'WIN' | 'LOSS' = probability >= 0.5 ? 'WIN' : 'LOSS';

    // 8. Причины
    const reasons = this.generateReasons(features, indicatorScore, contextScore, historyScore, timeScore);

    return {
      probability,
      prediction,
      confidence,
      scores: {
        indicator: indicatorScore,
        context: contextScore,
        history: historyScore,
        time: timeScore,
      },
      reasons,
    };
  }

  /**
   * Расчет score индикаторов
   */
  private calculateIndicatorScore(features: ClassifierFeatures): number {
    let score = 0.5;
    const indicators = features.indicators;

    // RSI score
    if (indicators.rsi !== undefined) {
      const rsi = indicators.rsi;
      if (features.signal.direction === 'LONG') {
        if (rsi < 30) score += 0.15;      // Oversold - bullish
        else if (rsi > 70) score -= 0.15; // Overbought - bearish
        else if (rsi < 50) score += 0.05;
      } else {
        if (rsi > 70) score += 0.15;      // Overbought - bearish
        else if (rsi < 30) score -= 0.15; // Oversold - bullish
        else if (rsi > 50) score += 0.05;
      }
    }

    // MACD score
    if (indicators.macd !== undefined && indicators.macdSignal !== undefined) {
      const macdHistogram = indicators.macd - indicators.macdSignal;
      if (features.signal.direction === 'LONG') {
        if (macdHistogram > 0) score += 0.1;
        else score -= 0.1;
      } else {
        if (macdHistogram < 0) score += 0.1;
        else score -= 0.1;
      }
    }

    // Bollinger Bands score
    if (indicators.bbPosition !== undefined) {
      const bbPos = indicators.bbPosition;
      if (features.signal.direction === 'LONG') {
        if (bbPos < 0.2) score += 0.15;   // Near lower band
        else if (bbPos > 0.8) score -= 0.15; // Near upper band
      } else {
        if (bbPos > 0.8) score += 0.15;   // Near upper band
        else if (bbPos < 0.2) score -= 0.15; // Near lower band
      }
    }

    // Volume score
    if (indicators.volumeRatio !== undefined) {
      const volRatio = indicators.volumeRatio;
      if (volRatio > 1.5) score += 0.1;   // High volume confirms
      else if (volRatio < 0.5) score -= 0.1; // Low volume - suspicious
    }

    // ADX score (trend strength)
    if (indicators.adx !== undefined) {
      const adx = indicators.adx;
      if (adx > 25) {
        // Strong trend - follow direction
        if (features.context.trend.includes('TRENDING')) {
          score += 0.1;
        }
      } else {
        // Weak trend - range strategies better
        if (features.context.trend === 'RANGING') {
          score += 0.05;
        }
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Расчет score контекста
   */
  private calculateContextScore(features: ClassifierFeatures): number {
    let score = 0.5;

    // Trend alignment
    const trend = features.context.trend;
    const direction = features.signal.direction;

    if (direction === 'LONG') {
      if (trend === 'TRENDING_UP') score += 0.2;
      else if (trend === 'TRENDING_DOWN') score -= 0.2;
      else if (trend === 'RANGING') score += 0.05;
    } else {
      if (trend === 'TRENDING_DOWN') score += 0.2;
      else if (trend === 'TRENDING_UP') score -= 0.2;
      else if (trend === 'RANGING') score += 0.05;
    }

    // Volatility
    const volatility = features.context.volatility;
    if (volatility === 'HIGH') {
      score -= 0.1; // Higher risk
    } else if (volatility === 'LOW') {
      score += 0.05; // More predictable
    }

    // Volume context
    const volume = features.context.volume;
    if (volume === 'HIGH') {
      score += 0.1; // Confirms move
    } else if (volume === 'LOW') {
      score -= 0.05; // Weak move
    }

    // Support/Resistance
    const sr = features.context.supportResistance;
    if (sr) {
      if (direction === 'LONG' && sr === 'NEAR_SUPPORT') {
        score += 0.15;
      } else if (direction === 'SHORT' && sr === 'NEAR_RESISTANCE') {
        score += 0.15;
      } else if (direction === 'LONG' && sr === 'NEAR_RESISTANCE') {
        score -= 0.15;
      } else if (direction === 'SHORT' && sr === 'NEAR_SUPPORT') {
        score -= 0.15;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Расчет score истории
   */
  private calculateHistoryScore(features: ClassifierFeatures): number {
    if (!this.isTrained || this.historicalTrades.length < this.config.minHistorySize) {
      return 0.5; // Neutral if not enough history
    }

    // Find similar historical trades
    const similarTrades = this.findSimilarTrades(features, 50);

    if (similarTrades.length === 0) {
      return 0.5;
    }

    // Calculate win rate of similar trades
    const wins = similarTrades.filter(t => t.outcome === 'WIN').length;
    const winRate = wins / similarTrades.length;

    // Apply recency decay
    let weightedScore = 0;
    let totalWeight = 0;

    const now = Date.now();
    for (const trade of similarTrades) {
      const age = (now - trade.timestamp.getTime()) / (1000 * 60 * 60 * 24); // days
      const weight = Math.pow(this.config.decayFactor, age);
      
      weightedScore += (trade.outcome === 'WIN' ? 1 : 0) * weight;
      totalWeight += weight;
    }

    const decayedWinRate = totalWeight > 0 ? weightedScore / totalWeight : winRate;

    // Blend current win rate with decayed
    return (winRate * 0.5 + decayedWinRate * 0.5);
  }

  /**
   * Расчет score времени
   */
  private calculateTimeScore(features: ClassifierFeatures): number {
    let score = 0.5;
    const hour = features.time.hour;
    const dayOfWeek = features.time.dayOfWeek;

    // Best trading hours (UTC)
    const bestHours = [9, 10, 11, 14, 15, 16]; // London/NY overlap
    const worstHours = [0, 1, 2, 3, 4, 5];     // Low volume

    if (bestHours.includes(hour)) {
      score += 0.1;
    } else if (worstHours.includes(hour)) {
      score -= 0.1;
    }

    // Session overlap
    if (features.time.isSessionOverlap) {
      score += 0.05;
    }

    // Day of week
    if (dayOfWeek >= 1 && dayOfWeek <= 4) {
      score += 0.02; // Tue-Fri slightly better
    } else if (dayOfWeek === 0 || dayOfWeek === 6) {
      score -= 0.05; // Weekend - lower volume
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Расчет уверенности
   */
  private calculateConfidence(
    indicatorScore: number,
    contextScore: number,
    historyScore: number,
    timeScore: number
  ): number {
    // Confidence based on agreement between components
    const scores = [indicatorScore, contextScore, historyScore, timeScore];
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;

    // Low variance = high confidence
    const variancePenalty = Math.min(0.3, variance * 2);

    // History size factor
    const historyFactor = Math.min(1, this.historicalTrades.length / this.config.minHistorySize);

    return Math.max(0, Math.min(1, (1 - variancePenalty) * (0.7 + 0.3 * historyFactor)));
  }

  /**
   * Генерация причин решения
   */
  private generateReasons(
    features: ClassifierFeatures,
    indicatorScore: number,
    contextScore: number,
    historyScore: number,
    timeScore: number
  ): string[] {
    const reasons: string[] = [];

    // Indicator reasons
    if (indicatorScore > 0.65) {
      reasons.push('Strong indicator alignment');
      if (features.indicators.rsi && features.indicators.rsi < 35) {
        reasons.push('RSI oversold (bullish)');
      }
      if (features.indicators.rsi && features.indicators.rsi > 65) {
        reasons.push('RSI overbought (bearish)');
      }
    } else if (indicatorScore < 0.35) {
      reasons.push('Weak indicator signals');
    }

    // Context reasons
    if (contextScore > 0.65) {
      reasons.push(`Favorable market context (${features.context.trend})`);
    } else if (contextScore < 0.35) {
      reasons.push('Unfavorable market conditions');
    }

    // History reasons
    if (this.isTrained && historyScore > 0.6) {
      reasons.push('Historical patterns support this signal');
    }

    // Time reasons
    if (timeScore > 0.6) {
      reasons.push('Good timing (trading session)');
    }

    return reasons;
  }

  /**
   * Поиск похожих исторических сделок
   */
  private findSimilarTrades(features: ClassifierFeatures, limit: number = 50): HistoricalTrade[] {
    // Filter by symbol and direction
    let similar = this.historicalTrades.filter(
      t => t.symbol === features.signal.symbol && t.direction === features.signal.direction
    );

    // If not enough, expand to all symbols
    if (similar.length < 10) {
      similar = this.historicalTrades.filter(t => t.direction === features.signal.direction);
    }

    // Score similarity
    const scored = similar.map(trade => {
      let similarity = 0;

      // Same market regime
      if (trade.features.context.trend === features.context.trend) {
        similarity += 0.3;
      }

      // Similar volatility
      if (trade.features.context.volatility === features.context.volatility) {
        similarity += 0.2;
      }

      // Similar RSI
      if (trade.features.indicators.rsi && features.indicators.rsi) {
        const rsiDiff = Math.abs(trade.features.indicators.rsi - features.indicators.rsi);
        similarity += Math.max(0, 0.3 - rsiDiff / 100);
      }

      // Similar volume
      if (trade.features.indicators.volumeRatio && features.indicators.volumeRatio) {
        const volDiff = Math.abs(trade.features.indicators.volumeRatio - features.indicators.volumeRatio);
        similarity += Math.max(0, 0.2 - volDiff);
      }

      return { trade, similarity };
    });

    // Sort by similarity and return top N
    scored.sort((a, b) => b.similarity - a.similarity);

    return scored.slice(0, limit).map(s => s.trade);
  }

  /**
   * Классификация исхода сделки
   */
  private classifyOutcome(pnlPercent: number): ClassificationResult {
    if (pnlPercent > 0.5) return 'WIN';
    if (pnlPercent < -0.5) return 'LOSS';
    return 'BREAKEVEN';
  }

  /**
   * Извлечение фич из сделки
   */
  private async extractFeaturesFromTrade(trade: any): Promise<ClassifierFeatures> {
    try {
      // Get OHLCV data for indicators at entry time
      const candles = await db.ohlcvCandle.findMany({
        where: {
          symbol: trade.symbol,
          timeframe: '1h',
          openTime: { lte: trade.entryTime },
        },
        orderBy: { openTime: 'desc' },
        take: 50,
      });

      if (candles.length < 20) {
        return this.getDefaultFeatures(trade);
      }

      // Calculate indicators
      const rsi = this.calculateRSI(candles, 14);
      const { macd, macdSignal } = this.calculateMACD(candles);
      const { bbPosition, bbWidth } = this.calculateBollingerBands(candles);
      const atr = this.calculateATR(candles, 14);
      const volumeRatio = this.calculateVolumeRatio(candles);
      const adx = this.calculateADX(candles, 14);
      const trend = this.detectTrend(candles);
      const volatility = this.calculateVolatility(candles);

      return {
        indicators: {
          rsi,
          macd,
          macdSignal,
          atr,
          bbPosition,
          bbWidth,
          adx,
          volumeRatio,
        },
        context: {
          trend,
          volatility: volatility > 0.05 ? 'HIGH' : volatility < 0.02 ? 'LOW' : 'MEDIUM',
          volume: volumeRatio > 1.5 ? 'HIGH' : volumeRatio < 0.5 ? 'LOW' : 'MEDIUM',
          supportResistance: this.detectSupportResistance(candles, trade.entryPrice),
        },
        signal: {
          direction: trade.direction as SignalDirection,
          symbol: trade.symbol,
          timeframe: '1h',
          entryPrice: trade.entryPrice || 0,
        },
        time: {
          hour: trade.entryTime ? new Date(trade.entryTime).getHours() : 0,
          dayOfWeek: trade.entryTime ? new Date(trade.entryTime).getDay() : 0,
          isSessionOverlap: this.isSessionOverlap(trade.entryTime),
        },
      };
    } catch (error) {
      logger.error({ error, tradeId: trade.id }, 'Failed to extract features from trade');
      return this.getDefaultFeatures(trade);
    }
  }

  /**
   * Get default features when data unavailable
   */
  private getDefaultFeatures(trade: any): ClassifierFeatures {
    return {
      indicators: {},
      context: {
        trend: 'RANGING',
        volatility: 'MEDIUM',
        volume: 'MEDIUM',
      },
      signal: {
        direction: trade.direction as SignalDirection,
        symbol: trade.symbol,
        timeframe: '1h',
        entryPrice: trade.entryPrice || 0,
      },
      time: {
        hour: trade.entryTime ? new Date(trade.entryTime).getHours() : 0,
        dayOfWeek: trade.entryTime ? new Date(trade.entryTime).getDay() : 0,
        isSessionOverlap: false,
      },
    };
  }

  /**
   * Calculate RSI
   */
  private calculateRSI(candles: any[], period: number = 14): number {
    if (candles.length < period + 1) return 50;

    const closes = candles.map(c => c.close).reverse();
    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i <= period; i++) {
      const change = closes[i - 1] - closes[i];
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
  private calculateMACD(candles: any[]): { macd: number; macdSignal: number } {
    const ema12 = this.calculateEMA(candles.map(c => c.close), 12);
    const ema26 = this.calculateEMA(candles.map(c => c.close), 26);
    const macd = ema12 - ema26;
    const macdSignal = macd * 0.9; // Simplified signal line
    return { macd, macdSignal };
  }

  /**
   * Calculate Bollinger Bands position
   */
  private calculateBollingerBands(candles: any[]): { bbPosition: number; bbWidth: number } {
    const closes = candles.map(c => c.close).slice(-20);
    const sma = closes.reduce((a, b) => a + b, 0) / closes.length;
    const std = Math.sqrt(closes.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / closes.length);
    const upper = sma + 2 * std;
    const lower = sma - 2 * std;
    const current = closes[closes.length - 1];

    const bbPosition = (current - lower) / (upper - lower || 1);
    const bbWidth = (upper - lower) / sma;

    return { bbPosition: Math.max(0, Math.min(1, bbPosition)), bbWidth };
  }

  /**
   * Calculate EMA
   */
  private calculateEMA(values: number[], period: number): number {
    if (values.length < period) return values[values.length - 1] || 0;
    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  /**
   * Calculate ATR
   */
  private calculateATR(candles: any[], period: number = 14): number {
    if (candles.length < period + 1) return 0;
    const trueRanges = [];
    for (let i = 1; i <= period; i++) {
      const high = candles[candles.length - i].high;
      const low = candles[candles.length - i].low;
      const prevClose = candles[candles.length - i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trueRanges.push(tr);
    }
    return trueRanges.reduce((a, b) => a + b, 0) / period;
  }

  /**
   * Calculate Volume Ratio
   */
  private calculateVolumeRatio(candles: any[]): number {
    if (candles.length < 20) return 1;
    const recentVolume = candles.slice(0, 5).reduce((sum, c) => sum + c.volume, 0) / 5;
    const avgVolume = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
    return recentVolume / avgVolume;
  }

  /**
   * Calculate ADX (simplified)
   */
  private calculateADX(candles: any[], period: number = 14): number {
    if (candles.length < period + 1) return 20;
    // Simplified ADX calculation
    const ema20 = this.calculateEMA(candles.map(c => c.close), 20);
    const ema50 = this.calculateEMA(candles.map(c => c.close), 50);
    const separation = Math.abs(ema20 - ema50) / ema50;
    return Math.min(100, separation * 1000);
  }

  /**
   * Detect Trend
   */
  private detectTrend(candles: any[]): MarketTrend {
    const ema20 = this.calculateEMA(candles.map(c => c.close), 20);
    const ema50 = this.calculateEMA(candles.map(c => c.close), 50);
    const currentPrice = candles[candles.length - 1].close;

    if (currentPrice > ema20 && ema20 > ema50) return 'TRENDING_UP';
    if (currentPrice < ema20 && ema20 < ema50) return 'TRENDING_DOWN';
    return 'RANGING';
  }

  /**
   * Calculate Volatility
   */
  private calculateVolatility(candles: any[]): number {
    if (candles.length < 20) return 0.03;
    const returns = [];
    for (let i = 1; i < 20; i++) {
      const ret = (candles[i - 1].close - candles[i].close) / candles[i].close;
      returns.push(ret);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  /**
   * Detect Support/Resistance
   */
  private detectSupportResistance(candles: any[], price: number): 'NEAR_SUPPORT' | 'NEAR_RESISTANCE' | 'MIDDLE' {
    const lows = candles.slice(-20).map(c => c.low);
    const highs = candles.slice(-20).map(c => c.high);
    const support = Math.min(...lows);
    const resistance = Math.max(...highs);
    const range = resistance - support;

    if (range === 0) return 'MIDDLE';
    const position = (price - support) / range;

    if (position < 0.2) return 'NEAR_SUPPORT';
    if (position > 0.8) return 'NEAR_RESISTANCE';
    return 'MIDDLE';
  }

  /**
   * Check Session Overlap
   */
  private isSessionOverlap(timestamp: Date): boolean {
    if (!timestamp) return false;
    const hour = new Date(timestamp).getUTCHours();
    return hour >= 13 && hour <= 16; // London-NY overlap
  }

  /**
   * Получить статистику классификатора
   */
  getStats(): {
    totalTrades: number;
    isTrained: boolean;
    avgWinRate: number;
    recentWinRate: number;
  } {
    const winRate = this.historicalTrades.length > 0
      ? this.historicalTrades.filter(t => t.outcome === 'WIN').length / this.historicalTrades.length
      : 0;

    const recentTrades = this.historicalTrades.slice(0, 20);
    const recentWinRate = recentTrades.length > 0
      ? recentTrades.filter(t => t.outcome === 'WIN').length / recentTrades.length
      : 0;

    return {
      totalTrades: this.historicalTrades.length,
      isTrained: this.isTrained,
      avgWinRate: winRate,
      recentWinRate,
    };
  }

  /**
   * Сохранить результат сделки для будущего обучения
   */
  async recordTradeResult(
    features: ClassifierFeatures,
    pnlPercent: number
  ): Promise<void> {
    const trade: HistoricalTrade = {
      id: `recorded_${Date.now()}`,
      symbol: features.signal.symbol,
      direction: features.signal.direction,
      entryPrice: features.signal.entryPrice,
      exitPrice: 0,
      pnl: 0,
      pnlPercent,
      outcome: this.classifyOutcome(pnlPercent),
      features,
      timestamp: new Date(),
    };

    this.historicalTrades.unshift(trade);

    // Keep only recent trades
    if (this.historicalTrades.length > 1000) {
      this.historicalTrades = this.historicalTrades.slice(0, 1000);
    }

    // Update training status
    this.isTrained = this.historicalTrades.length >= this.config.minHistorySize;

    // Save to database
    await this.saveToDatabase(trade);
  }

  /**
   * Сохранить в базу данных
   */
  private async saveToDatabase(trade: HistoricalTrade): Promise<void> {
    try {
      await db.classifiedSignal.create({
        data: {
          symbol: trade.symbol,
          direction: trade.direction,
          outcome: trade.outcome,
          pnlPercent: trade.pnlPercent,
          features: JSON.stringify(trade.features),
          probability: 0, // Would need to store this separately
          timestamp: trade.timestamp,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to save classified signal');
    }
  }
}

// ==================== SINGLETON ====================

let classifierInstance: LawrenceClassifier | null = null;

export function getLawrenceClassifier(config?: Partial<ClassifierConfig>): LawrenceClassifier {
  if (!classifierInstance) {
    classifierInstance = new LawrenceClassifier(config);
  }
  return classifierInstance;
}

// ==================== EXPORTS ====================

export default {
  LawrenceClassifier,
  getLawrenceClassifier,
  DEFAULT_CONFIG,
};
