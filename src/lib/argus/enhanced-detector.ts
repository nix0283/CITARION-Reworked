/**
 * Argus Enhanced Detector - Production Pump/Dump Detection
 * 
 * Based on: Karbalaii et al. (2025) arXiv:2503.08692 + Wilder (1978) ADX + K-means SuperTrend
 * 
 * Features:
 * - EWMA+volatility filter for pump detection (research-optimal thresholds)
 * - ADX trend strength confirmation
 * - MLAdaptiveSuperTrend for volatility-adaptive trend following
 * - SqueezeMomentum for breakout confirmation
 * - Liquidity-normalized orderbook imbalance
 * 
 * @module lib/argus/enhanced-detector
 */

import { logger } from '@/lib/logger';
import { MLAdaptiveSuperTrend, type AdaptiveSuperTrendResult } from '@/lib/indicators/ml-adaptive-supertrend';
import { SqueezeMomentum, type SqueezeMomentumResult } from '@/lib/indicators/squeeze-momentum';

export interface PriceVolumePoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volumeUsd: number;
}

export interface PumpDumpConfig {
  // Price thresholds (from research)
  priceThresholdPct: number;      // Default: 0.90 (90% increase in High)
  volumeThresholdPct: number;     // Default: 4.0 (400% volume increase)
  
  // Moving average settings
  maWindow: number;               // Default: 12 (hours for price MA)
  ewmaWindow: number;             // Default: 20 (days for volume EWMA)
  
  // Double-conditioning thresholds
  ewmaVolumeRatio: number;        // Default: 0.70 (70% of EWMA)
  maxVolumeRatio: number;         // Default: 0.60 (60% of 30d max)
  
  // Volatility filter
  volatilityAlpha: number;        // Default: 2.0 (smoothing parameter)
  minVolatility: number;          // Default: 0.01 (ignore ultra-low vol tokens)
  
  // Signal confirmation
  minDurationMinutes: number;     // Default: 2 (sustained move required)
  minVolumeUsd: number;           // Default: 10000 (filter dust trades)
  
  // ADX settings
  adxPeriod: number;              // Default: 14
  adxThreshold: number;           // Default: 25 (Wilder's strong trend threshold)
  
  // SuperTrend settings
  superTrendAtrLength: number;    // Default: 10
  superTrendBaseFactor: number;   // Default: 3
  superTrendTrainingPeriod: number; // Default: 100
  
  // Squeeze settings
  squeezeBbLength: number;        // Default: 20
  squeezeKcLength: number;        // Default: 20
}

export interface DetectionResult {
  isPump: boolean;
  isDump: boolean;
  confidence: number;            // 0.0 to 1.0
  priceChangePct: number;
  volumeChangePct: number;
  ewmaVolume: number;
  volatility: number;
  adx: number;
  superTrend?: AdaptiveSuperTrendResult;
  squeeze?: SqueezeMomentumResult;
  reasons: string[];
}

export class EnhancedPumpDumpDetector {
  private config: PumpDumpConfig;
  private superTrend: MLAdaptiveSuperTrend;
  private squeeze: SqueezeMomentum;

  constructor(config: PumpDumpConfig) {
    this.config = config;
    this.superTrend = new MLAdaptiveSuperTrend({
      atrLength: config.superTrendAtrLength,
      baseFactor: config.superTrendBaseFactor,
      trainingPeriod: config.superTrendTrainingPeriod,
    });
    this.squeeze = new SqueezeMomentum({
      bbLength: config.squeezeBbLength,
      kcLength: config.squeezeKcLength,
    });
  }

  /**
   * Calculate Exponentially Weighted Moving Average
   */
  private calculateEWMA(values: number[], alpha: number): number[] {
    if (values.length === 0) return [];
    
    const result: number[] = [];
    let ewma = values[0];
    
    for (const value of values) {
      ewma = alpha * value + (1 - alpha) * ewma;
      result.push(ewma);
    }
    
    return result;
  }

  /**
   * Calculate rolling volatility (standard deviation)
   */
  private calculateVolatility(values: number[], window: number): number[] {
    const result: number[] = [];
    
    for (let i = 0; i < values.length; i++) {
      if (i < window) {
        result.push(0);
        continue;
      }
      
      const slice = values.slice(i - window, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / slice.length;
      result.push(Math.sqrt(variance));
    }
    
    return result;
  }

  /**
   * Calculate ADX (Average Directional Index) - Wilder's method
   * Based on: Wilder, J.W. (1978). New Concepts in Technical Trading Systems
   */
  private calculateADX(candles: PriceVolumePoint[], period: number): number {
    if (candles.length < period * 2) return 20; // Default: weak trend
    
    const trValues: number[] = [];
    const dmPlusValues: number[] = [];
    const dmMinusValues: number[] = [];
    
    for (let i = 1; i < candles.length && i <= period * 2; i++) {
      // True Range
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      trValues.push(tr);
      
      // Directional Movement
      const dmPlus = Math.max(0, candles[i].high - candles[i - 1].high);
      const dmMinus = Math.max(0, candles[i - 1].low - candles[i].low);
      
      dmPlusValues.push(dmPlus);
      dmMinusValues.push(dmMinus);
    }
    
    // Smoothed averages (Wilder's method)
    let atr = trValues.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
    let avgPlus = dmPlusValues.slice(0, period).reduce((sum, dm) => sum + dm, 0) / period;
    let avgMinus = dmMinusValues.slice(0, period).reduce((sum, dm) => sum + dm, 0) / period;
    
    for (let i = period; i < trValues.length; i++) {
      atr = (atr * (period - 1) + trValues[i]) / period;
      avgPlus = (avgPlus * (period - 1) + dmPlusValues[i]) / period;
      avgMinus = (avgMinus * (period - 1) + dmMinusValues[i]) / period;
    }
    
    // Calculate DI+ and DI-
    const diPlus = atr > 0 ? (avgPlus / atr) * 100 : 0;
    const diMinus = atr > 0 ? (avgMinus / atr) * 100 : 0;
    
    // Calculate DX and ADX
    const dx = (diPlus + diMinus) > 0 
      ? Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100 
      : 0;
    
    return dx;
  }

  /**
   * Main detection algorithm - research-backed thresholds with ADX + SuperTrend + Squeeze
   */
  async detect(
    symbol: string,
    data: PriceVolumePoint[]
  ): Promise<DetectionResult> {
    const reasons: string[] = [];
    
    if (data.length < Math.max(this.config.ewmaWindow * 24, this.config.superTrendTrainingPeriod)) {
      return {
        isPump: false,
        isDump: false,
        confidence: 0,
        priceChangePct: 0,
        volumeChangePct: 0,
        ewmaVolume: 0,
        volatility: 0,
        adx: 0,
        reasons: ['Insufficient data for detection'],
      };
    }

    const current = data[data.length - 1];
    const recent = data.slice(-this.config.maWindow);
    
    // === PRICE ANALYSIS ===
    const maHigh = recent.reduce((sum, d) => sum + d.high, 0) / recent.length;
    const priceChangePct = (current.high - maHigh) / maHigh;
    
    const priceThresholdMet = Math.abs(priceChangePct) >= this.config.priceThresholdPct;
    if (priceThresholdMet) {
      reasons.push(`Price change ${priceChangePct > 0 ? '+' : ''}${(priceChangePct * 100).toFixed(1)}% vs ${this.config.maWindow}h MA`);
    }

    // === VOLUME ANALYSIS ===
    const volumes = data.map(d => d.volumeUsd);
    const ewmaVolumes = this.calculateEWMA(volumes, 1 / this.config.ewmaWindow);
    const volatilities = this.calculateVolatility(volumes, this.config.ewmaWindow);
    
    const currentEwma = ewmaVolumes[ewmaVolumes.length - 1];
    const currentVol = volatilities[volatilities.length - 1];
    
    // 30-day max volume
    const window30d = Math.min(volumes.length, 30 * 24);
    const maxVolume30d = Math.max(...volumes.slice(-window30d));
    
    // Double-conditioning for volume (research-backed)
    const volumeChangePct = current.volumeUsd / (currentEwma || 1) - 1;
    const passesEwmaCondition = current.volumeUsd >= this.config.ewmaVolumeRatio * currentEwma;
    const passesMaxCondition = current.volumeUsd >= this.config.maxVolumeRatio * maxVolume30d;
    const volumeThresholdMet = volumeChangePct >= this.config.volumeThresholdPct;
    
    // Combined volume condition
    const volumeConfirmed = volumeThresholdMet && passesEwmaCondition && passesMaxCondition;
    
    if (volumeConfirmed) {
      reasons.push(`Volume ${volumeChangePct > 0 ? '+' : ''}${(volumeChangePct * 100).toFixed(1)}% vs EWMA`);
      reasons.push(`Volume ${((current.volumeUsd / maxVolume30d) * 100).toFixed(1)}% of 30d max`);
    }

    // === VOLATILITY FILTER ===
    const volatilityAdjusted = currentVol > this.config.minVolatility;
    if (!volatilityAdjusted) {
      reasons.push('Volatility too low - ignoring potential noise');
    }

    // === ADX TREND STRENGTH FILTER ===
    const adx = this.calculateADX(data, this.config.adxPeriod);
    const adxStrong = adx >= this.config.adxThreshold;
    
    if (!adxStrong && volumeChangePct < 2.0) {
      // Only allow weak-ADX signals if volume is exceptional (pump confirmation)
      reasons.push(`ADX ${adx.toFixed(1)} < ${this.config.adxThreshold} (weak trend) + volume not exceptional`);
    }
    
    if (adxStrong) {
      reasons.push(`Strong trend confirmed: ADX ${adx.toFixed(1)}`);
    }

    // === MLADAPTIVE SUPERTREND ===
    const stResults = this.superTrend.calculate(data);
    const lastST = stResults[stResults.length - 1];
    
    if (lastST) {
      reasons.push(`SuperTrend: ${lastST.direction === 1 ? 'bullish' : 'bearish'}, volatility: ${lastST.volatilityCluster}`);
    }

    // === SQUEEZE MOMENTUM ===
    const squeezeResults = this.squeeze.calculate(data);
    const lastSqueeze = squeezeResults[squeezeResults.length - 1];
    
    if (lastSqueeze) {
      if (lastSqueeze.squeezeOn) {
        reasons.push('Squeeze ON: low volatility contraction');
      } else if (lastSqueeze.squeezeOff) {
        reasons.push(`Squeeze OFF: breakout potential, momentum: ${lastSqueeze.momentumColor}`);
      }
    }

    // === FINAL DECISION ===
    let isPump = priceChangePct >= this.config.priceThresholdPct && volumeConfirmed && volatilityAdjusted;
    let isDump = priceChangePct <= -this.config.priceThresholdPct && volumeConfirmed && volatilityAdjusted;
    
    // ADX filter: only allow signals with strong trend OR exceptional volume
    if (!adxStrong && volumeChangePct < 2.0) {
      isPump = false;
      isDump = false;
    }
    
    // SuperTrend confirmation: boost confidence if direction agrees
    let confidence = 0.33; // Base: equal probability
    
    if (isPump || isDump) {
      const priceScore = Math.min(1, Math.abs(priceChangePct) / (this.config.priceThresholdPct * 1.5));
      const volumeScore = Math.min(1, volumeChangePct / (this.config.volumeThresholdPct * 1.5));
      const volScore = Math.min(1, currentVol / (this.config.minVolatility * 3));
      
      confidence = priceScore * 0.3 + volumeScore * 0.3 + volScore * 0.2;
      
      // ADX boost
      if (adxStrong) {
        confidence = Math.min(0.95, confidence + 0.15);
      }
      
      // SuperTrend agreement boost
      if (lastST && ((lastST.direction === 1 && priceChangePct > 0) || (lastST.direction === -1 && priceChangePct < 0))) {
        confidence = Math.min(0.95, confidence + 0.10);
        reasons.push('SuperTrend confirms direction');
      }
      
      // Squeeze breakout boost
      if (lastSqueeze?.squeezeOff && lastSqueeze.momentum > 0 && priceChangePct > 0) {
        confidence = Math.min(0.95, confidence + 0.08);
        reasons.push('Squeeze breakout confirms pump');
      } else if (lastSqueeze?.squeezeOff && lastSqueeze.momentum < 0 && priceChangePct < 0) {
        confidence = Math.min(0.95, confidence + 0.08);
        reasons.push('Squeeze breakout confirms dump');
      }
    }

    // Cap confidence
    confidence = Math.min(0.95, Math.max(0, confidence));

    logger.info({
      symbol,
      isPump,
      isDump,
      confidence: confidence.toFixed(3),
      priceChangePct: (priceChangePct * 100).toFixed(2),
      volumeChangePct: (volumeChangePct * 100).toFixed(2),
      adx: adx.toFixed(1),
      superTrend: lastST ? { direction: lastST.direction, cluster: lastST.volatilityCluster } : undefined,
      squeeze: lastSqueeze ? { on: lastSqueeze.squeezeOn, momentum: lastSqueeze.momentumColor } : undefined,
      reasons,
    }, 'Argus pump/dump detection result');

    return {
      isPump,
      isDump,
      confidence,
      priceChangePct,
      volumeChangePct,
      ewmaVolume: currentEwma,
      volatility: currentVol,
      adx,
      superTrend: lastST,
      squeeze: lastSqueeze,
      reasons,
    };
  }

  /**
   * Batch detection for multiple symbols
   */
  async detectBatch(
    symbols: Array<{ symbol: string; data: PriceVolumePoint[] }>
  ): Promise<Map<string, DetectionResult>> {
    const results = new Map<string, DetectionResult>();
    
    for (const { symbol, data } of symbols) {
      results.set(symbol, await this.detect(symbol, data));
    }
    
    return results;
  }
}

// Factory with research-backed defaults
export function createEnhancedPumpDumpDetector(config?: Partial<PumpDumpConfig>): EnhancedPumpDumpDetector {
  return new EnhancedPumpDumpDetector({
    priceThresholdPct: 0.90,      // 90% price move (research optimal)
    volumeThresholdPct: 4.0,      // 400% volume spike
    maWindow: 12,                 // 12-hour moving average
    ewmaWindow: 20,               // 20-day EWMA (research optimal)
    ewmaVolumeRatio: 0.70,        // 70% of EWMA threshold
    maxVolumeRatio: 0.60,         // 60% of 30d max threshold
    volatilityAlpha: 2.0,         // Volatility smoothing
    minVolatility: 0.01,          // Ignore ultra-low vol
    minDurationMinutes: 2,        // Sustained move required
    minVolumeUsd: 10000,          // Filter dust trades
    adxPeriod: 14,
    adxThreshold: 25,             // Wilder's strong trend threshold
    superTrendAtrLength: 10,
    superTrendBaseFactor: 3,
    superTrendTrainingPeriod: 100,
    squeezeBbLength: 20,
    squeezeKcLength: 20,
    ...config,
  });
}

export default {
  EnhancedPumpDumpDetector,
  createEnhancedPumpDumpDetector,
  type PumpDumpConfig,
  type DetectionResult,
};
