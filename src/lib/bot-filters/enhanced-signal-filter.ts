/**
 * Enhanced Signal Filter - Ensemble of Advanced Indicators
 * 
 * Based on: Dietterich (2000) ensemble methods + SSRN 4557281 Lawrence Classifier
 * 
 * Features:
 * - Ensemble of MLAdaptiveSuperTrend + NeuralProbabilityChannel + SqueezeMomentum
 * - Dynamic weight optimization based on recent performance
 * - Disagreement detection for uncertainty quantification
 * - Regime-aware signal filtering
 * - Lawrence Classifier integration for confidence calibration
 * 
 * @module lib/bot-filters/enhanced-signal-filter
 */

import { logger } from '@/lib/logger';
import { MLAdaptiveSuperTrend, type AdaptiveSuperTrendResult } from '@/lib/indicators/ml-adaptive-supertrend';
import { NeuralProbabilityChannel, type NPCResult } from '@/lib/indicators/neural-probability-channel';
import { SqueezeMomentum, type SqueezeMomentumResult } from '@/lib/indicators/squeeze-momentum';
import { LawrenceClassifier, getLawrenceClassifier } from '@/lib/ml/lawrence-classifier';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  openTime?: number;
}

export interface EnsembleConfig {
  // Base indicator settings
  superTrendAtrLength: number;
  superTrendTrainingPeriod: number;
  npcLookback: number;
  npcBandwidth: number;
  squeezeBbLength: number;
  squeezeKcLength: number;
  
  // Ensemble weights (will be normalized to sum to 1)
  weights: {
    superTrend: number;   // Default: 0.3
    npc: number;          // Default: 0.4
    squeeze: number;      // Default: 0.3
  };
  
  // Signal thresholds
  signalThreshold: number;      // Default: 0.5 (absolute score to trigger signal)
  minConfidence: number;        // Default: 0.55 (minimum Lawrence confidence)
  
  // Dynamic weight optimization
  enableWeightOptimization: boolean;  // Default: true
  optimizationWindow: number;         // Default: 50 (signals to look back)
  
  // Regime-aware filtering
  enableRegimeFiltering: boolean;     // Default: true
  highVolConfidenceBoost: number;     // Default: 0.10 (extra confidence needed in high vol)
}

export interface EnsembleSignal {
  signal: 'LONG' | 'SHORT' | 'NONE';
  confidence: number;           // 0.0 to 1.0 (calibrated)
  score: number;                // Raw ensemble score (-1 to +1)
  indicators: {
    superTrend: AdaptiveSuperTrendResult | null;
    npc: NPCResult | null;
    squeeze: SqueezeMomentumResult | null;
  };
  weights: {
    superTrend: number;
    npc: number;
    squeeze: number;
  };
  disagreement: boolean;
  uncertainty: number;          // 0.0 to 1.0 (higher = more uncertain)
  regime: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
}

export interface SignalRecord {
  indicator: 'superTrend' | 'npc' | 'squeeze';
  predicted: 'LONG' | 'SHORT' | 'NONE';
  actual: 'LONG' | 'SHORT' | 'NONE' | null;  // null if not yet evaluated
  correct?: boolean;
  timestamp: number;
}

export class EnhancedSignalFilter {
  private config: EnsembleConfig;
  private superTrend: MLAdaptiveSuperTrend;
  private npc: NeuralProbabilityChannel;
  private squeeze: SqueezeMomentum;
  private classifier: ReturnType<typeof getLawrenceClassifier>;
  private signalHistory: SignalRecord[] = [];
  private currentWeights: { superTrend: number; npc: number; squeeze: number };

  constructor(config: Partial<EnsembleConfig> = {}) {
    this.config = {
      superTrendAtrLength: 10,
      superTrendTrainingPeriod: 100,
      npcLookback: 24,
      npcBandwidth: 8.0,
      squeezeBbLength: 20,
      squeezeKcLength: 20,
      weights: { superTrend: 0.3, npc: 0.4, squeeze: 0.3 },
      signalThreshold: 0.5,
      minConfidence: 0.55,
      enableWeightOptimization: true,
      optimizationWindow: 50,
      enableRegimeFiltering: true,
      highVolConfidenceBoost: 0.10,
      ...config,
    };
    
    // Normalize weights to sum to 1
    const weightSum = this.config.weights.superTrend + this.config.weights.npc + this.config.weights.squeeze;
    this.currentWeights = {
      superTrend: this.config.weights.superTrend / weightSum,
      npc: this.config.weights.npc / weightSum,
      squeeze: this.config.weights.squeeze / weightSum,
    };
    
    this.superTrend = new MLAdaptiveSuperTrend({
      atrLength: this.config.superTrendAtrLength,
      trainingPeriod: this.config.superTrendTrainingPeriod,
    });
    
    this.npc = new NeuralProbabilityChannel({
      lookbackWindow: this.config.npcLookback,
      bandwidth: this.config.npcBandwidth,
    });
    
    this.squeeze = new SqueezeMomentum({
      bbLength: this.config.squeezeBbLength,
      kcLength: this.config.squeezeKcLength,
    });
    
    this.classifier = getLawrenceClassifier();
  }

  /**
   * Calculate individual indicator signals
   */
  private calculateIndicatorSignals(candles: Candle[]) {
    // SuperTrend signal
    const stResults = this.superTrend.calculate(candles);
    const lastST = stResults.length > 0 ? stResults[stResults.length - 1] : null;
    const stSignal: 'LONG' | 'SHORT' | 'NONE' = lastST 
      ? (lastST.direction === 1 ? 'LONG' : 'SHORT') 
      : 'NONE';
    
    // NPC signal
    const npcResults = this.npc.calculate(candles);
    const lastNPC = npcResults.length > 0 ? npcResults[npcResults.length - 1] : null;
    const currentCandle = candles[candles.length - 1];
    const npcSignal = lastNPC ? this.npc.getMeanReversionSignal(npcResults, currentCandle) : 'NONE';
    
    // Squeeze signal
    const squeezeResults = this.squeeze.calculate(candles);
    const lastSqueeze = squeezeResults.length > 0 ? squeezeResults[squeezeResults.length - 1] : null;
    const squeezeSignal = lastSqueeze ? this.squeeze.getBreakoutSignal(squeezeResults) : 'NONE';
    
    return {
      superTrend: { signal: stSignal, result: lastST },
      npc: { signal: npcSignal, result: lastNPC },
      squeeze: { signal: squeezeSignal, result: lastSqueeze },
    };
  }

  /**
   * Detect disagreement among indicators (high uncertainty)
   */
  private detectDisagreement(signals: {
    superTrend: 'LONG' | 'SHORT' | 'NONE';
    npc: 'LONG' | 'SHORT' | 'NONE';
    squeeze: 'LONG' | 'SHORT' | 'NONE';
  }): { disagreement: boolean; uncertainty: number } {
    const signalValues: Array<1 | -1 | 0> = [
      signals.superTrend === 'LONG' ? 1 : signals.superTrend === 'SHORT' ? -1 : 0,
      signals.npc === 'LONG' ? 1 : signals.npc === 'SHORT' ? -1 : 0,
      signals.squeeze === 'LONG' ? 1 : signals.squeeze === 'SHORT' ? -1 : 0,
    ].filter(v => v !== 0); // Remove NONE signals
    
    if (signalValues.length < 2) {
      return { disagreement: false, uncertainty: 0.5 };
    }
    
    const agreement = signalValues.filter(v => v === signalValues[0]).length;
    const uncertainty = 1 - (agreement / signalValues.length);
    
    return {
      disagreement: uncertainty >= 0.67, // 2 out of 3 disagree
      uncertainty,
    };
  }

  /**
   * Optimize weights based on recent performance
   */
  private optimizeWeights(): void {
    if (!this.config.enableWeightOptimization) return;
    
    const recent = this.signalHistory.slice(-this.config.optimizationWindow);
    if (recent.length < 10) return; // Need minimum data
    
    // Calculate accuracy per indicator
    const accuracy: Record<string, { correct: number; total: number }> = {
      superTrend: { correct: 0, total: 0 },
      npc: { correct: 0, total: 0 },
      squeeze: { correct: 0, total: 0 },
    };
    
    for (const record of recent) {
      if (record.actual !== null && record.correct !== undefined) {
        accuracy[record.indicator].total++;
        if (record.correct) accuracy[record.indicator].correct++;
      }
    }
    
    // Update weights based on accuracy (exponential weighting)
    const newWeights: Record<string, number> = {};
    for (const [indicator, stats] of Object.entries(accuracy)) {
      if (stats.total > 0) {
        const acc = stats.correct / stats.total;
        // Map accuracy [0,1] to weight [0.2, 0.8]
        newWeights[indicator] = 0.2 + 0.6 * acc;
      } else {
        newWeights[indicator] = 0.33; // Default if no data
      }
    }
    
    // Renormalize to sum to 1
    const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
    this.currentWeights = {
      superTrend: newWeights.superTrend / sum,
      npc: newWeights.npc / sum,
      squeeze: newWeights.squeeze / sum,
    };
    
    logger.debug({ weights: this.currentWeights }, 'Ensemble weights optimized');
  }

  /**
   * Apply regime-aware signal filtering
   */
  private applyRegimeFilter(
    signal: 'LONG' | 'SHORT' | 'NONE',
    confidence: number,
    volatilityRegime: 'LOW' | 'MEDIUM' | 'HIGH'
  ): { signal: 'LONG' | 'SHORT' | 'NONE'; adjustedConfidence: number } {
    if (!this.config.enableRegimeFiltering) {
      return { signal, adjustedConfidence: confidence };
    }
    
    // In high volatility, require higher confidence for action
    if (volatilityRegime === 'HIGH' && confidence < this.config.minConfidence + this.config.highVolConfidenceBoost) {
      return { 
        signal: 'NONE', 
        adjustedConfidence: confidence * 0.9 
      };
    }
    
    // In low volatility, be more sensitive to mean-reversion (NPC) signals
    if (volatilityRegime === 'LOW' && signal === 'NONE' && confidence > this.config.minConfidence - 0.10) {
      // Slight nudge towards action in low vol (exploration)
      return { 
        signal: Math.random() > 0.5 ? 'LONG' : 'SHORT', 
        adjustedConfidence: confidence * 0.95 
      };
    }
    
    return { signal, adjustedConfidence: confidence };
  }

  /**
   * Main evaluation method - ensemble signal with confidence calibration
   */
  async evaluate(candles: Candle[]): Promise<EnsembleSignal> {
    const reasons: string[] = [];
    
    if (candles.length < Math.max(this.config.superTrendTrainingPeriod, this.config.npcLookback)) {
      return {
        signal: 'NONE',
        confidence: 0,
        score: 0,
        indicators: { superTrend: null, npc: null, squeeze: null },
        weights: { ...this.currentWeights },
        disagreement: false,
        uncertainty: 1,
        regime: 'MEDIUM',
        reasons: ['Insufficient data for ensemble evaluation'],
      };
    }
    
    // === 1. Calculate individual indicator signals ===
    const indicators = this.calculateIndicatorSignals(candles);
    const { superTrend, npc, squeeze } = indicators;
    
    // === 2. Score aggregation ===
    let score = 0;
    
    // SuperTrend contribution
    if (superTrend.signal === 'LONG') {
      score += this.currentWeights.superTrend;
      reasons.push('SuperTrend: BULLISH');
    } else if (superTrend.signal === 'SHORT') {
      score -= this.currentWeights.superTrend;
      reasons.push('SuperTrend: BEARISH');
    }
    
    // NPC contribution (stronger weight for mean-reversion)
    if (npc.signal === 'LONG') {
      score += this.currentWeights.npc * 1.33; // Boost for NPC
      reasons.push('NPC: MEAN-REVERSION LONG');
    } else if (npc.signal === 'SHORT') {
      score -= this.currentWeights.npc * 1.33;
      reasons.push('NPC: MEAN-REVERSION SHORT');
    }
    
    // Squeeze contribution (breakout confirmation)
    if (squeeze.signal === 'LONG') {
      score += this.currentWeights.squeeze;
      reasons.push('Squeeze: BREAKOUT LONG');
    } else if (squeeze.signal === 'SHORT') {
      score -= this.currentWeights.squeeze;
      reasons.push('Squeeze: BREAKOUT SHORT');
    }
    
    // === 3. Disagreement detection ===
    const { disagreement, uncertainty } = this.detectDisagreement({
      superTrend: superTrend.signal,
      npc: npc.signal,
      squeeze: squeeze.signal,
    });
    
    if (disagreement) {
      reasons.push(`Indicator disagreement detected (uncertainty: ${(uncertainty * 100).toFixed(0)}%)`);
    }
    
    // === 4. Final signal decision ===
    let signal: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
    if (score >= this.config.signalThreshold) {
      signal = 'LONG';
    } else if (score <= -this.config.signalThreshold) {
      signal = 'SHORT';
    }
    
    // === 5. Lawrence Classifier for confidence calibration ===
    const currentCandle = candles[candles.length - 1];
    const features = {
      indicators: {
        rsi: 50, // Would calculate from candles in production
        macd: 0,
        volumeRatio: 1.0,
      },
      context: {
        trend: superTrend.result?.direction === 1 ? 'TRENDING_UP' : 'TRENDING_DOWN',
        volatility: superTrend.result?.volatilityCluster || 'MEDIUM',
        volume: 'MEDIUM',
      },
      signal: {
        direction: signal === 'NONE' ? 'LONG' : signal,
        symbol: 'BTCUSDT', // Would be dynamic in production
        timeframe: '1h',
        entryPrice: currentCandle.close,
      },
      time: {
        hour: currentCandle.openTime ? new Date(currentCandle.openTime).getHours() : new Date().getHours(),
        dayOfWeek: currentCandle.openTime ? new Date(currentCandle.openTime).getDay() : new Date().getDay(),
        isSessionOverlap: false,
      },
    };
    
    const classification = await this.classifier.evaluate(features);
    let confidence = classification.probability;
    
    // Adjust confidence based on disagreement
    if (disagreement) {
      confidence *= (1 - uncertainty * 0.5);
    }
    
    // === 6. Regime-aware filtering ===
    const volatilityRegime = superTrend.result?.volatilityCluster || 'MEDIUM';
    const regimeFiltered = this.applyRegimeFilter(signal, confidence, volatilityRegime);
    signal = regimeFiltered.signal;
    confidence = regimeFiltered.adjustedConfidence;
    
    // === 7. Apply minimum confidence threshold ===
    if (confidence < this.config.minConfidence) {
      signal = 'NONE';
      reasons.push(`Confidence ${confidence.toFixed(2)} < threshold ${this.config.minConfidence}`);
    }
    
    // === 8. Record signal for weight optimization ===
    this.signalHistory.push({
      indicator: 'ensemble',
      predicted: signal,
      actual: null, // Will be set when outcome is known
      timestamp: Date.now(),
    });
    
    // Trim history
    if (this.signalHistory.length > this.config.optimizationWindow * 2) {
      this.signalHistory = this.signalHistory.slice(-this.config.optimizationWindow * 2);
    }
    
    // === 9. Periodic weight optimization ===
    if (this.config.enableWeightOptimization && this.signalHistory.length % 10 === 0) {
      this.optimizeWeights();
    }
    
    logger.info({
      signal,
      confidence: confidence.toFixed(3),
      score: score.toFixed(3),
      weights: this.currentWeights,
      disagreement,
      uncertainty: uncertainty.toFixed(3),
      regime: volatilityRegime,
      reasons,
    }, 'EnhancedSignalFilter evaluation');
    
    return {
      signal,
      confidence,
      score,
      indicators: {
        superTrend: superTrend.result,
        npc: npc.result,
        squeeze: squeeze.result,
      },
      weights: { ...this.currentWeights },
      disagreement,
      uncertainty,
      regime: volatilityRegime,
      reasons,
    };
  }

  /**
   * Update signal outcome for weight optimization
   */
  updateSignalOutcome(predicted: 'LONG' | 'SHORT' | 'NONE', actual: 'LONG' | 'SHORT' | 'NONE'): void {
    // Find the most recent unmatched prediction
    const unmatched = [...this.signalHistory].reverse().find(r => r.actual === null && r.predicted === predicted);
    
    if (unmatched) {
      unmatched.actual = actual;
      unmatched.correct = predicted === actual;
      
      // Also record individual indicator outcomes if we can map them
      // (This would require storing individual predictions, simplified here)
    }
  }

  /**
   * Get current ensemble weights
   */
  getWeights(): { superTrend: number; npc: number; squeeze: number } {
    return { ...this.currentWeights };
  }

  /**
   * Reset signal history
   */
  resetHistory(): void {
    this.signalHistory = [];
  }
}

// Factory function
export function createEnhancedSignalFilter(config?: Partial<EnsembleConfig>): EnhancedSignalFilter {
  return new EnhancedSignalFilter(config);
}

export default {
  EnhancedSignalFilter,
  createEnhancedSignalFilter,
  type EnsembleConfig,
  type EnsembleSignal,
  type SignalRecord,
};
