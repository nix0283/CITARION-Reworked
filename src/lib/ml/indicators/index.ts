/**
 * Technical Indicators for Lawrence Classifier
 * 
 * @module lib/ml/indicators
 */

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: Date;
}

/**
 * Calculate RSI
 */
export function calculateRSI(candles: Candle[], period: number = 14): number {
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
export function calculateMACD(candles: Candle[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(candles.map(c => c.close), 12);
  const ema26 = calculateEMA(candles.map(c => c.close), 26);
  const macd = ema12 - ema26;
  const signal = macd * 0.9;
  const histogram = macd - signal;
  return { macd, signal, histogram };
}

/**
 * Calculate EMA
 */
export function calculateEMA(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] || 0;
  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }
  return ema;
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(candles: Candle[], period: number = 20, stdDev: number = 2) {
  const closes = candles.slice(-period).map(c => c.close);
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = sma + stdDev * std;
  const lower = sma - stdDev * std;
  const current = closes[closes.length - 1];
  const position = (current - lower) / (upper - lower || 1);
  const width = (upper - lower) / sma;
  return { upper, middle: sma, lower, position: Math.max(0, Math.min(1, position)), width };
}

/**
 * Calculate ATR
 */
export function calculateATR(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return 0;
  const trueRanges = [];
  for (let i = 1; i <= period; i++) {
    const candle = candles[candles.length - i];
    const prevCandle = candles[candles.length - i - 1];
    const tr = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevCandle.close),
      Math.abs(candle.low - prevCandle.close)
    );
    trueRanges.push(tr);
  }
  return trueRanges.reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate Volume Ratio
 */
export function calculateVolumeRatio(candles: Candle[], recentPeriod: number = 5, totalPeriod: number = 20): number {
  if (candles.length < totalPeriod) return 1;
  const recentVolume = candles.slice(-recentPeriod).reduce((sum, c) => sum + c.volume, 0) / recentPeriod;
  const avgVolume = candles.slice(-totalPeriod).reduce((sum, c) => sum + c.volume, 0) / totalPeriod;
  return recentVolume / avgVolume;
}

/**
 * Calculate ADX (simplified)
 */
export function calculateADX(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return 20;
  const ema20 = calculateEMA(candles.map(c => c.close), 20);
  const ema50 = calculateEMA(candles.map(c => c.close), 50);
  const separation = Math.abs(ema20 - ema50) / ema50;
  return Math.min(100, separation * 1000);
}

/**
 * Detect Trend
 */
export function detectTrend(candles: Candle[]): 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' {
  const ema20 = calculateEMA(candles.map(c => c.close), 20);
  const ema50 = calculateEMA(candles.map(c => c.close), 50);
  const currentPrice = candles[candles.length - 1].close;
  if (currentPrice > ema20 && ema20 > ema50) return 'TRENDING_UP';
  if (currentPrice < ema20 && ema20 < ema50) return 'TRENDING_DOWN';
  return 'RANGING';
}

/**
 * Calculate Volatility
 */
export function calculateVolatility(candles: Candle[], period: number = 20): number {
  if (candles.length < period) return 0.03;
  const returns = [];
  for (let i = 1; i < period; i++) {
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
export function detectSupportResistance(candles: Candle[], price: number, period: number = 20): 'NEAR_SUPPORT' | 'NEAR_RESISTANCE' | 'MIDDLE' {
  const lows = candles.slice(-period).map(c => c.low);
  const highs = candles.slice(-period).map(c => c.high);
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
 * Check Session Overlap (London-NY)
 */
export function isSessionOverlap(timestamp: Date): boolean {
  const hour = new Date(timestamp).getUTCHours();
  return hour >= 13 && hour <= 16;
}
