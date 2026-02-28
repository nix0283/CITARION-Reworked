/**
 * ATR-Based Position Sizing for DCA Entries
 * 
 * Based on: Wilder, J.W. (1978). New Concepts in Technical Trading Systems
 * Principle: Reduce position size in high volatility, increase in low volatility
 * Formula: positionSize = baseSize × (normalATR / currentATR), clamped [0.5, 2.0]
 * 
 * @module lib/dca/atr-position-sizing
 */

import { logger } from '@/lib/logger';

export interface ATRPositionConfig {
  atrPeriod: number;           // Default: 14
  normalATRPercent: number;    // Default: 0.025 (2.5% of price = "normal" volatility)
  minMultiplier: number;       // Default: 0.5 (never go below 50% of base size)
  maxMultiplier: number;       // Default: 2.0 (never exceed 200% of base size)
}

export interface Candle {
  high: number;
  low: number;
  close: number;
}

/**
 * Calculate ATR using Wilder's smoothing method
 */
export function calculateATR(
  candles: Candle[],
  period: number = 14
): number {
  if (candles.length < period + 1) return 0;
  
  const trueRanges: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trueRanges.push(tr);
  }
  
  // Wilder's smoothing: first SMA, then EMA-like
  let atr = trueRanges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
  
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  
  return atr;
}

/**
 * Calculate position size adjusted for current volatility
 * 
 * @param currentPrice - Current asset price
 * @param candles - Historical OHLC data for ATR calculation
 * @param baseSize - Base position size in USD
 * @param config - ATR position sizing configuration
 * @returns Adjusted position size in USD
 */
export function calculateATRPositionSize(
  currentPrice: number,
  candles: Candle[],
  baseSize: number,
  config: ATRPositionConfig = {}
): number {
  const cfg: ATRPositionConfig = {
    atrPeriod: 14,
    normalATRPercent: 0.025,
    minMultiplier: 0.5,
    maxMultiplier: 2.0,
    ...config,
  };
  
  if (currentPrice <= 0 || baseSize <= 0) {
    logger.warn({ currentPrice, baseSize }, 'Invalid price or baseSize for ATR sizing');
    return baseSize;
  }
  
  const atr = calculateATR(candles, cfg.atrPeriod);
  if (atr === 0) {
    logger.debug({ atr }, 'ATR is zero, using base size');
    return baseSize;
  }
  
  const currentATRPercent = atr / currentPrice;
  const normalATR = currentPrice * cfg.normalATRPercent;
  
  // Inverse relationship: higher volatility = smaller position
  const multiplier = normalATR / (currentATRPercent * currentPrice);
  
  // Clamp to safe range
  const clampedMultiplier = Math.max(
    cfg.minMultiplier,
    Math.min(cfg.maxMultiplier, multiplier)
  );
  
  const adjustedSize = baseSize * clampedMultiplier;
  
  logger.debug({
    currentPrice,
    atr,
    currentATRPercent: (currentATRPercent * 100).toFixed(2) + '%',
    normalATRPercent: cfg.normalATRPercent * 100 + '%',
    multiplier: clampedMultiplier.toFixed(3),
    baseSize,
    adjustedSize,
  }, 'ATR position size calculated');
  
  return adjustedSize;
}

/**
 * Get volatility regime based on ATR percentile
 */
export function getVolatilityRegime(
  candles: Candle[],
  atrPeriod: number = 14,
  lookbackPeriod: number = 100
): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (candles.length < lookbackPeriod + atrPeriod) return 'MEDIUM';
  
  // Calculate ATR for each point in lookback window
  const atrs: number[] = [];
  for (let i = atrPeriod; i < Math.min(candles.length, lookbackPeriod + atrPeriod); i++) {
    const slice = candles.slice(i - atrPeriod, i + 1);
    atrs.push(calculateATR(slice, atrPeriod));
  }
  
  if (atrs.length === 0) return 'MEDIUM';
  
  // Calculate percentiles
  const sorted = [...atrs].sort((a, b) => a - b);
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  
  const currentATR = calculateATR(candles.slice(-atrPeriod - 1), atrPeriod);
  
  if (currentATR < p25) return 'LOW';
  if (currentATR > p75) return 'HIGH';
  return 'MEDIUM';
}

/**
 * Adjust position size based on volatility regime
 * Additional layer on top of ATR sizing
 */
export function applyRegimeAdjustment(
  baseSize: number,
  regime: 'LOW' | 'MEDIUM' | 'HIGH',
  adjustments: { LOW: number; MEDIUM: number; HIGH: number } = {
    LOW: 1.3,    // Increase in low vol
    MEDIUM: 1.0, // Normal in medium vol
    HIGH: 0.7,   // Reduce in high vol
  }
): number {
  return baseSize * adjustments[regime];
}

// ==================== EXPORTS ====================

export default {
  calculateATR,
  calculateATRPositionSize,
  getVolatilityRegime,
  applyRegimeAdjustment,
  type ATRPositionConfig,
};
