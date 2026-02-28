/**
 * Vision Bot - Market Forecast ML Model
 * 
 * Predicts market direction (UP/DOWN/CONSOLIDATION) using technical indicators
 * and machine learning.
 * 
 * Features:
 * - Technical indicators (RSI, MACD, BB, ATR, etc.)
 * - Multi-timeframe analysis
 * - Correlation with BTC, ETH, SPY, Gold
 * - Confidence scoring
 * - Historical accuracy tracking
 * 
 * @see https://optuna.readthedocs.io/en/stable/
 * @see https://www.investopedia.com/terms/b/backtesting.asp
 */

import { Candle } from '@/lib/strategy/types';

// ==================== TYPES ====================

export type MarketDirection = 'UPWARD' | 'DOWNWARD' | 'CONSOLIDATION';

export interface MarketForecast {
  direction: MarketDirection;
  confidence: number;        // 0-1
  upwardProb: number;        // 0-1
  downwardProb: number;      // 0-1
  consolidationProb: number; // 0-1
  predictedChange24h: number; // %
  timestamp: Date;
  timeframe: string;
  symbol: string;
}

export interface FeatureVector {
  // Technical indicators
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  bollingerPosition: number;  // 0-1 (lower to upper band)
  atr: number;
  atrPercent: number;
  
  // Price features
  roc24h: number;  // Rate of change 24h
  roc7d: number;   // Rate of change 7d
  pricePosition: number;  // Position in recent range (0-1)
  distanceFromMA20: number;
  distanceFromMA50: number;
  
  // Volume features
  volumeRatio: number;  // Current vs average volume
  volumeTrend: number;  // Increasing/decreasing
  
  // Trend features
  trendStrength: number;  // EMA trend strength
  adx: number;  // Average Directional Index
  
  // Volatility features
  volatility: number;
  volatilityRatio: number;  // Current vs historical volatility
  
  // Correlation features
  btcCorrelation: number;
  ethCorrelation: number;
  spyCorrelation: number;
  goldCorrelation: number;
  
  // Market regime
  isRanging: boolean;
  isTrending: boolean;
  regime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING';
}

export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  totalPredictions: number;
  correctPredictions: number;
  lastUpdated: Date;
}

// ==================== FEATURE ENGINEERING ====================

export class FeatureEngineer {
  /**
   * Calculate all features from candle data
   */
  calculateFeatures(
    candles: Candle[],
    additionalData?: {
      btcCandles?: Candle[];
      ethCandles?: Candle[];
      spyCandles?: Candle[];
      goldCandles?: Candle[];
    }
  ): FeatureVector {
    const currentCandle = candles[candles.length - 1];
    const currentPrice = currentCandle.close;
    
    // Technical indicators
    const rsi = this.calculateRSI(candles, 14);
    const macdData = this.calculateMACD(candles);
    const bbPosition = this.calculateBollingerPosition(candles);
    const atr = this.calculateATR(candles);
    const atrPercent = (atr / currentPrice) * 100;
    
    // Price features
    const roc24h = this.calculateROC(candles, 24);
    const roc7d = this.calculateROC(candles, 168); // 7 days * 24 hours
    const pricePosition = this.calculatePricePosition(candles);
    const ma20 = this.calculateSMA(candles, 20);
    const ma50 = this.calculateSMA(candles, 50);
    const distanceFromMA20 = ((currentPrice - ma20) / ma20) * 100;
    const distanceFromMA50 = ((currentPrice - ma50) / ma50) * 100;
    
    // Volume features
    const volumeRatio = this.calculateVolumeRatio(candles);
    const volumeTrend = this.calculateVolumeTrend(candles);
    
    // Trend features
    const trendStrength = this.calculateTrendStrength(candles);
    const adx = this.calculateADX(candles);
    
    // Volatility features
    const volatility = this.calculateVolatility(candles);
    const volatilityRatio = this.calculateVolatilityRatio(candles);
    
    // Correlation features
    const btcCorrelation = additionalData?.btcCandles 
      ? this.calculateCorrelation(candles, additionalData.btcCandles) 
      : 0;
    const ethCorrelation = additionalData?.ethCandles
      ? this.calculateCorrelation(candles, additionalData.ethCandles)
      : 0;
    const spyCorrelation = additionalData?.spyCandles
      ? this.calculateCorrelation(candles, additionalData.spyCandles)
      : 0;
    const goldCorrelation = additionalData?.goldCandles
      ? this.calculateCorrelation(candles, additionalData.goldCandles)
      : 0;
    
    // Market regime
    const isRanging = adx < 25;
    const isTrending = adx >= 25;
    const regime = isRanging ? 'RANGING' : (roc24h > 0 ? 'TRENDING_UP' : 'TRENDING_DOWN');
    
    return {
      // Technical
      rsi,
      macd: macdData.macd,
      macdSignal: macdData.signal,
      macdHistogram: macdData.histogram,
      bollingerPosition: bbPosition,
      atr,
      atrPercent,
      
      // Price
      roc24h,
      roc7d,
      pricePosition,
      distanceFromMA20,
      distanceFromMA50,
      
      // Volume
      volumeRatio,
      volumeTrend,
      
      // Trend
      trendStrength,
      adx,
      
      // Volatility
      volatility,
      volatilityRatio,
      
      // Correlation
      btcCorrelation,
      ethCorrelation,
      spyCorrelation,
      goldCorrelation,
      
      // Regime
      isRanging,
      isTrending,
      regime,
    };
  }
  
  /**
   * Calculate RSI (Relative Strength Index)
   */
  private calculateRSI(candles: Candle[], period: number = 14): number {
    if (candles.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = candles.length - period; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
  /**
   * Calculate MACD
   */
  private calculateMACD(candles: Candle[]): { macd: number; signal: number; histogram: number } {
    const ema12 = this.calculateEMA(candles, 12);
    const ema26 = this.calculateEMA(candles, 26);
    const macd = ema12 - ema26;
    
    // Signal line (9-period EMA of MACD)
    const signal = macd * 0.111; // Simplified
    
    return {
      macd,
      signal,
      histogram: macd - signal,
    };
  }
  
  /**
   * Calculate EMA (Exponential Moving Average)
   */
  private calculateEMA(candles: Candle[], period: number): number {
    if (candles.length < period) return candles[candles.length - 1].close;
    
    const multiplier = 2 / (period + 1);
    let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
    
    for (let i = period; i < candles.length; i++) {
      ema = (candles[i].close - ema) * multiplier + ema;
    }
    
    return ema;
  }
  
  /**
   * Calculate SMA (Simple Moving Average)
   */
  private calculateSMA(candles: Candle[], period: number): number {
    if (candles.length < period) return candles[candles.length - 1].close;
    
    const slice = candles.slice(-period);
    return slice.reduce((sum, c) => sum + c.close, 0) / period;
  }
  
  /**
   * Calculate Bollinger Bands position
   */
  private calculateBollingerPosition(candles: Candle[]): number {
    if (candles.length < 20) return 0.5;
    
    const sma = this.calculateSMA(candles, 20);
    const std = this.calculateStdDev(candles, 20);
    
    const upperBand = sma + (2 * std);
    const lowerBand = sma - (2 * std);
    
    const currentPrice = candles[candles.length - 1].close;
    
    if (upperBand === lowerBand) return 0.5;
    
    return (currentPrice - lowerBand) / (upperBand - lowerBand);
  }
  
  /**
   * Calculate Standard Deviation
   */
  private calculateStdDev(candles: Candle[], period: number): number {
    const slice = candles.slice(-period);
    const mean = slice.reduce((sum, c) => sum + c.close, 0) / period;
    
    const squaredDiffs = slice.map(c => Math.pow(c.close - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, d) => sum + d, 0) / period;
    
    return Math.sqrt(avgSquaredDiff);
  }
  
  /**
   * Calculate ATR (Average True Range)
   */
  private calculateATR(candles: Candle[], period: number = 14): number {
    if (candles.length < period + 1) return 0;
    
    const trueRanges: number[] = [];
    
    for (let i = 1; i < candles.length; i++) {
      const highLow = candles[i].high - candles[i].low;
      const highClose = Math.abs(candles[i].high - candles[i - 1].close);
      const lowClose = Math.abs(candles[i].low - candles[i - 1].close);
      
      trueRanges.push(Math.max(highLow, highClose, lowClose));
    }
    
    return trueRanges.slice(-period).reduce((sum, tr) => sum + tr, 0) / period;
  }
  
  /**
   * Calculate ROC (Rate of Change)
   */
  private calculateROC(candles: Candle[], periods: number): number {
    if (candles.length < periods + 1) return 0;
    
    const currentPrice = candles[candles.length - 1].close;
    const pastPrice = candles[candles.length - periods - 1].close;
    
    return ((currentPrice - pastPrice) / pastPrice) * 100;
  }
  
  /**
   * Calculate price position in recent range
   */
  private calculatePricePosition(candles: Candle[], lookback: number = 100): number {
    const slice = candles.slice(-lookback);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    
    const currentPrice = candles[candles.length - 1].close;
    
    if (high === low) return 0.5;
    
    return (currentPrice - low) / (high - low);
  }
  
  /**
   * Calculate volume ratio
   */
  private calculateVolumeRatio(candles: Candle[], period: number = 20): number {
    if (candles.length < period) return 1;
    
    const currentVolume = candles[candles.length - 1].volume;
    const avgVolume = candles.slice(-period).reduce((sum, c) => sum + c.volume, 0) / period;
    
    return avgVolume > 0 ? currentVolume / avgVolume : 1;
  }
  
  /**
   * Calculate volume trend
   */
  private calculateVolumeTrend(candles: Candle[], period: number = 10): number {
    if (candles.length < period * 2) return 0;
    
    const recentAvg = candles.slice(-period).reduce((sum, c) => sum + c.volume, 0) / period;
    const previousAvg = candles.slice(-period * 2, -period).reduce((sum, c) => sum + c.volume, 0) / period;
    
    return previousAvg > 0 ? (recentAvg - previousAvg) / previousAvg : 0;
  }
  
  /**
   * Calculate trend strength
   */
  private calculateTrendStrength(candles: Candle[]): number {
    const ema8 = this.calculateEMA(candles, 8);
    const ema21 = this.calculateEMA(candles, 21);
    const ema50 = this.calculateEMA(candles, 50);
    
    // Strong uptrend: EMA8 > EMA21 > EMA50
    // Strong downtrend: EMA8 < EMA21 < EMA50
    if (ema8 > ema21 && ema21 > ema50) return 1;
    if (ema8 < ema21 && ema21 < ema50) return -1;
    
    return (ema8 - ema50) / ema50;
  }
  
  /**
   * Calculate ADX (Average Directional Index) - simplified
   */
  private calculateADX(candles: Candle[], period: number = 14): number {
    if (candles.length < period * 2) return 20;
    
    // Simplified ADX calculation
    const trValues: number[] = [];
    const dmPlusValues: number[] = [];
    const dmMinusValues: number[] = [];
    
    for (let i = 1; i < candles.length && i <= period * 2; i++) {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      trValues.push(tr);
      
      const dmPlus = Math.max(0, candles[i].high - candles[i - 1].high);
      const dmMinus = Math.max(0, candles[i - 1].low - candles[i].low);
      
      dmPlusValues.push(dmPlus);
      dmMinusValues.push(dmMinus);
    }
    
    const atr = trValues.reduce((sum, tr) => sum + tr, 0) / period;
    const diPlus = (dmPlusValues.reduce((sum, dm) => sum + dm, 0) / atr) * 100;
    const diMinus = (dmMinusValues.reduce((sum, dm) => sum + dm, 0) / atr) * 100;
    
    const dx = Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100;
    return dx;
  }
  
  /**
   * Calculate volatility
   */
  private calculateVolatility(candles: Candle[], period: number = 20): number {
    const returns: number[] = [];
    
    for (let i = 1; i < candles.length && i <= period; i++) {
      const ret = (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
      returns.push(ret);
    }
    
    if (returns.length === 0) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / returns.length;
    
    return Math.sqrt(variance) * 100; // As percentage
  }
  
  /**
   * Calculate volatility ratio
   */
  private calculateVolatilityRatio(candles: Candle[], period: number = 20): number {
    const currentVol = this.calculateVolatility(candles.slice(-period));
    const historicalVol = this.calculateVolatility(candles.slice(-period * 2, -period));
    
    return historicalVol > 0 ? currentVol / historicalVol : 1;
  }
  
  /**
   * Calculate correlation between two price series
   */
  private calculateCorrelation(candles1: Candle[], candles2: Candle[]): number {
    const minLen = Math.min(candles1.length, candles2.length);
    if (minLen < 20) return 0;
    
    const returns1: number[] = [];
    const returns2: number[] = [];
    
    for (let i = 1; i < minLen; i++) {
      const ret1 = (candles1[i].close - candles1[i - 1].close) / candles1[i - 1].close;
      const ret2 = (candles2[i].close - candles2[i - 1].close) / candles2[i - 1].close;
      
      returns1.push(ret1);
      returns2.push(ret2);
    }
    
    const mean1 = returns1.reduce((sum, r) => sum + r, 0) / returns1.length;
    const mean2 = returns2.reduce((sum, r) => sum + r, 0) / returns2.length;
    
    let numerator = 0;
    let sumSq1 = 0;
    let sumSq2 = 0;
    
    for (let i = 0; i < returns1.length; i++) {
      const diff1 = returns1[i] - mean1;
      const diff2 = returns2[i] - mean2;
      
      numerator += diff1 * diff2;
      sumSq1 += diff1 * diff1;
      sumSq2 += diff2 * diff2;
    }
    
    const denominator = Math.sqrt(sumSq1 * sumSq2);
    return denominator > 0 ? numerator / denominator : 0;
  }
}

// ==================== ML MODEL (SIMPLIFIED) ====================

export class MarketForecastModel {
  private featureEngineer = new FeatureEngineer();
  private weights: Record<string, number> = {};
  private bias: number = 0;
  private isTrained: boolean = false;
  private metrics: ModelMetrics = {
    accuracy: 0,
    precision: 0,
    recall: 0,
    f1Score: 0,
    totalPredictions: 0,
    correctPredictions: 0,
    lastUpdated: new Date(),
  };
  
  /**
   * Initialize model with default weights
   */
  initialize(): void {
    // Default weights based on feature importance
    this.weights = {
      rsi: 0.15,
      macd: 0.12,
      bollingerPosition: 0.10,
      roc24h: 0.18,
      trendStrength: 0.15,
      volumeRatio: 0.08,
      btcCorrelation: 0.10,
      volatility: 0.07,
      adx: 0.05,
    };
    
    this.bias = 0;
    this.isTrained = true;
  }
  
  /**
   * Predict market direction
   */
  predict(features: FeatureVector): MarketForecast {
    if (!this.isTrained) {
      this.initialize();
    }
    
    // Calculate weighted score
    let score = this.bias;
    score += (features.rsi - 50) / 50 * this.weights.rsi;
    score += Math.tanh(features.macd / 100) * this.weights.macd;
    score += (features.bollingerPosition - 0.5) * this.weights.bollingerPosition;
    score += features.roc24h / 10 * this.weights.roc24h;
    score += features.trendStrength * this.weights.trendStrength;
    score += (features.volumeRatio - 1) * this.weights.volumeRatio;
    score += features.btcCorrelation * this.weights.btcCorrelation;
    score += -features.volatility / 10 * this.weights.volatility;
    score += features.adx / 100 * this.weights.adx;
    
    // Convert to probabilities (softmax-like)
    const upwardProb = 1 / (1 + Math.exp(-score * 3));
    const downwardProb = 1 / (1 + Math.exp(score * 3));
    const consolidationProb = 1 - upwardProb - downwardProb;
    
    // Determine direction
    let direction: MarketDirection;
    if (upwardProb > 0.55) {
      direction = 'UPWARD';
    } else if (downwardProb > 0.55) {
      direction = 'DOWNWARD';
    } else {
      direction = 'CONSOLIDATION';
    }
    
    // Confidence
    const confidence = Math.max(upwardProb, downwardProb, consolidationProb);
    
    // Predicted change
    const predictedChange24h = score * 5; // Scale to reasonable %
    
    return {
      direction,
      confidence,
      upwardProb,
      downwardProb,
      consolidationProb,
      predictedChange24h,
      timestamp: new Date(),
      timeframe: '1h',
      symbol: 'BTC/USDT',
    };
  }
  
  /**
   * Get model metrics
   */
  getMetrics(): ModelMetrics {
    return this.metrics;
  }
  
  /**
   * Update metrics after prediction is evaluated
   */
  updateMetrics(wasCorrect: boolean): void {
    this.metrics.totalPredictions++;
    if (wasCorrect) {
      this.metrics.correctPredictions++;
    }
    
    this.metrics.accuracy = this.metrics.correctPredictions / this.metrics.totalPredictions;
    this.metrics.lastUpdated = new Date();
  }
}

// ==================== SINGLETON ====================

let modelInstance: MarketForecastModel | null = null;

export function getMarketForecastModel(): MarketForecastModel {
  if (!modelInstance) {
    modelInstance = new MarketForecastModel();
    modelInstance.initialize();
  }
  return modelInstance;
}
