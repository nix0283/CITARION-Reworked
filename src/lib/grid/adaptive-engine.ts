/**
 * Grid Adaptive Engine with Advanced Indicators
 * 
 * Based on: Chan "Algorithmic Trading" Ch.4 + Wilder (1978) + Nadaraya/Watson (1964)
 * 
 * Features:
 * - ATR-based adaptive grid spacing (volatility adaptation)
 * - RSI mean-reversion entry filter
 * - NeuralProbabilityChannel for confidence bands
 * - SqueezeMomentum for breakout exit signals
 * - Bollinger Position for range detection
 * - Smart rebalancing with filled level preservation
 * 
 * @module lib/grid/adaptive-engine
 */

import { logger } from '@/lib/logger';
import { NeuralProbabilityChannel, type NPCResult } from '@/lib/indicators/neural-probability-channel';
import { SqueezeMomentum, type SqueezeMomentumResult } from '@/lib/indicators/squeeze-momentum';

export interface Candle {
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface AdaptiveGridConfig {
  // ATR settings
  atrPeriod: number;              // Default: 14
  spacingAtrMultiplier: number;   // Default: 1.5 (grid spacing = 1.5x ATR)
  
  // Rebalancing
  rebalanceThreshold: number;     // Default: 0.3 (30% price move from center)
  maxLevels: number;              // Default: 21
  minLevelDistancePct: number;    // Default: 0.005 (0.5% minimum spacing)
  
  // RSI filter
  rsiPeriod: number;              // Default: 14
  rsiBuyThreshold: number;        // Default: 35 (only BUY if RSI < 35)
  rsiSellThreshold: number;       // Default: 65 (only SELL if RSI > 65)
  
  // NPC settings
  npcLookback: number;            // Default: 24
  npcBandwidth: number;           // Default: 8.0
  npcInnerMultiplier: number;     // Default: 1.5
  npcOuterMultiplier: number;     // Default: 2.5
  
  // Squeeze settings
  squeezeBbLength: number;        // Default: 20
  squeezeKcLength: number;        // Default: 20
  
  // Bollinger settings for range detection
  bbPeriod: number;               // Default: 20
  bbStdDev: number;               // Default: 2.0
}

export interface GridLevel {
  price: number;
  side: 'BUY' | 'SELL';
  distancePct: number;
  rsi?: number;
  npcBand?: 'INNER' | 'OUTER' | 'BASELINE';
  bbPosition?: number;
}

export interface GridRebalanceAction {
  action: 'KEEP' | 'CANCEL' | 'CREATE';
  level: GridLevel;
  reason?: string;
}

export class AdaptiveGridEngine {
  private config: AdaptiveGridConfig;
  private npc: NeuralProbabilityChannel;
  private squeeze: SqueezeMomentum;

  constructor(config: Partial<AdaptiveGridConfig> = {}) {
    this.config = {
      atrPeriod: 14,
      spacingAtrMultiplier: 1.5,
      rebalanceThreshold: 0.3,
      maxLevels: 21,
      minLevelDistancePct: 0.005,
      rsiPeriod: 14,
      rsiBuyThreshold: 35,
      rsiSellThreshold: 65,
      npcLookback: 24,
      npcBandwidth: 8.0,
      npcInnerMultiplier: 1.5,
      npcOuterMultiplier: 2.5,
      squeezeBbLength: 20,
      squeezeKcLength: 20,
      bbPeriod: 20,
      bbStdDev: 2.0,
      ...config,
    };
    
    this.npc = new NeuralProbabilityChannel({
      lookbackWindow: this.config.npcLookback,
      bandwidth: this.config.npcBandwidth,
      innerMultiplier: this.config.npcInnerMultiplier,
      outerMultiplier: this.config.npcOuterMultiplier,
    });
    
    this.squeeze = new SqueezeMomentum({
      bbLength: this.config.squeezeBbLength,
      kcLength: this.config.squeezeKcLength,
    });
  }

  /**
   * Calculate ATR using Wilder's smoothing method
   */
  private calculateATR(candles: Candle[], period: number): number {
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
    
    let atr = trueRanges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
    
    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
    }
    
    return atr;
  }

  /**
   * Calculate RSI (Relative Strength Index)
   * Based on: Wilder, J.W. (1978). New Concepts in Technical Trading Systems
   */
  private calculateRSI(candles: Candle[], period: number): number {
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
   * Calculate Bollinger Bands position (%B indicator)
   */
  private calculateBollingerPosition(candles: Candle[], period: number, stdDev: number): number {
    if (candles.length < period) return 0.5;
    
    const closes = candles.slice(-period).map(c => c.close);
    const sma = closes.reduce((a, b) => a + b, 0) / period;
    const variance = closes.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    const upper = sma + stdDev * std;
    const lower = sma - stdDev * std;
    const current = candles[candles.length - 1].close;
    
    if (upper === lower) return 0.5;
    return (current - lower) / (upper - lower);
  }

  /**
   * Generate adaptive grid levels with RSI, NPC, and Bollinger filters
   */
  generateLevels(
    currentPrice: number,
    candles: Candle[],
    direction: 'LONG' | 'SHORT'
  ): GridLevel[] {
    const atr = this.calculateATR(candles, this.config.atrPeriod);
    if (atr === 0) return [];
    
    // Base spacing adapts to volatility
    const baseSpacing = atr * this.config.spacingAtrMultiplier;
    const minSpacing = currentPrice * this.config.minLevelDistancePct;
    const spacing = Math.max(baseSpacing, minSpacing);
    
    // Calculate indicators for filtering
    const rsi = this.calculateRSI(candles, this.config.rsiPeriod);
    const bbPosition = this.calculateBollingerPosition(candles, this.config.bbPeriod, this.config.bbStdDev);
    
    // NPC results for confidence bands
    const npcResults = this.npc.calculate(candles);
    const lastNPC = npcResults.length > 0 ? npcResults[npcResults.length - 1] : null;
    
    const levels: GridLevel[] = [];
    const halfLevels = Math.floor(this.config.maxLevels / 2);
    
    for (let i = -halfLevels; i <= halfLevels; i++) {
      if (i === 0) continue; // Skip current price
      
      const price = currentPrice + (spacing * i);
      if (price <= 0) continue;
      
      const isBuyLevel = direction === 'LONG' ? i < 0 : i > 0;
      const distancePct = Math.abs(spacing * i) / currentPrice;
      
      // === RSI MEAN-REVERSION FILTER ===
      if (isBuyLevel && rsi >= this.config.rsiBuyThreshold) {
        continue; // Skip BUY level if not oversold
      }
      if (!isBuyLevel && rsi <= this.config.rsiSellThreshold) {
        continue; // Skip SELL level if not overbought
      }
      
      // === BOLLINGER POSITION FILTER ===
      // Only place BUY levels when price is in lower half of BB
      if (isBuyLevel && bbPosition > 0.5) {
        continue;
      }
      // Only place SELL levels when price is in upper half of BB
      if (!isBuyLevel && bbPosition < 0.5) {
        continue;
      }
      
      // === NPC CONFIDENCE BAND FILTER ===
      let npcBand: 'INNER' | 'OUTER' | 'BASELINE' | undefined;
      if (lastNPC) {
        if (price <= lastNPC.lowerOuter || price >= lastNPC.upperOuter) {
          npcBand = 'OUTER'; // High confidence mean-reversion zone
        } else if (price <= lastNPC.lowerInner || price >= lastNPC.upperInner) {
          npcBand = 'INNER'; // Medium confidence zone
        } else {
          npcBand = 'BASELINE'; // Low confidence, near mean
        }
        
        // Skip levels in baseline zone (too close to mean, low edge)
        if (npcBand === 'BASELINE') {
          continue;
        }
      }
      
      levels.push({
        price: parseFloat(price.toFixed(8)),
        side: isBuyLevel ? 'BUY' : 'SELL',
        distancePct: parseFloat((distancePct * 100).toFixed(2)),
        rsi,
        npcBand,
        bbPosition,
      });
    }
    
    logger.debug({
      currentPrice,
      atr,
      rsi,
      bbPosition,
      levelsCount: levels.length,
      buyLevels: levels.filter(l => l.side === 'BUY').length,
      sellLevels: levels.filter(l => l.side === 'SELL').length,
    }, 'Adaptive grid levels generated');
    
    return levels;
  }

  /**
   * Check if grid needs rebalancing
   */
  shouldRebalance(
    currentPrice: number,
    gridCenter: number,
    gridSpacing: number
  ): boolean {
    const deviation = Math.abs(currentPrice - gridCenter) / gridSpacing;
    return deviation > this.config.rebalanceThreshold;
  }

  /**
   * Smart rebalance: preserve filled levels, adjust unfilled
   */
  rebalance(
    existing: Array<{ price: number; side: 'BUY' | 'SELL'; status: string }>,
    newLevels: GridLevel[]
  ): GridRebalanceAction[] {
    const actions: GridRebalanceAction[] = [];
    
    // Keep filled levels unchanged
    for (const ex of existing) {
      if (ex.status === 'FILLED') {
        actions.push({ action: 'KEEP', level: { ...ex }, reason: 'Already filled' });
        continue;
      }
      
      // Find matching new level (within 0.1% tolerance)
      const match = newLevels.find(n => 
        n.side === ex.side && 
        Math.abs(n.price - ex.price) / ex.price < 0.001
      );
      
      if (match) {
        actions.push({ action: 'KEEP', level: { ...ex, ...match } });
      } else {
        actions.push({ action: 'CANCEL', level: { ...ex }, reason: 'Outside new grid range or filter' });
      }
    }
    
    // Create new levels that don't exist
    for (const nl of newLevels) {
      const exists = existing.some(ex => 
        ex.side === nl.side && 
        Math.abs(ex.price - nl.price) / nl.price < 0.001
      );
      
      if (!exists) {
        actions.push({ action: 'CREATE', level: { ...nl, status: 'PENDING' } });
      }
    }
    
    return actions;
  }

  /**
   * Get squeeze breakout signal for exit timing
   */
  getExitSignal(candles: Candle[]): 'EXIT_LONG' | 'EXIT_SHORT' | 'HOLD' {
    const squeezeResults = this.squeeze.calculate(candles);
    if (squeezeResults.length < 2) return 'HOLD';
    
    const current = squeezeResults[squeezeResults.length - 1];
    const prev = squeezeResults[squeezeResults.length - 2];
    
    // Squeeze release with positive momentum = exit short positions
    if (prev.squeezeOn && current.squeezeOff && current.momentum > 0) {
      return 'EXIT_SHORT';
    }
    
    // Squeeze release with negative momentum = exit long positions
    if (prev.squeezeOn && current.squeezeOff && current.momentum < 0) {
      return 'EXIT_LONG';
    }
    
    return 'HOLD';
  }

  /**
   * Get NPC mean-reversion signal for entry confirmation
   */
  getEntryConfirmation(candles: Candle[], currentCandle: Candle): 'CONFIRM_LONG' | 'CONFIRM_SHORT' | 'WAIT' {
    const npcResults = this.npc.calculate(candles);
    if (npcResults.length === 0) return 'WAIT';
    
    const lastNPC = npcResults[npcResults.length - 1];
    const signal = this.npc.getMeanReversionSignal(npcResults, currentCandle);
    
    if (signal === 'LONG') return 'CONFIRM_LONG';
    if (signal === 'SHORT') return 'CONFIRM_SHORT';
    return 'WAIT';
  }
}

export function createAdaptiveGridEngine(config?: Partial<AdaptiveGridConfig>): AdaptiveGridEngine {
  return new AdaptiveGridEngine(config);
}

export default {
  AdaptiveGridEngine,
  createAdaptiveGridEngine,
  type AdaptiveGridConfig,
  type GridLevel,
  type GridRebalanceAction,
};
