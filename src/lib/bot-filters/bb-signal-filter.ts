/**
 * BB Bot Signal Filter with Lawrence Classifier
 * 
 * Фильтрация сигналов BB бота через классификатор Лоренса:
 * - Определяет истинный пробой vs ложный
 * - Оценивает вероятность отскока от полос
 * - Фильтрует сигналы по контексту рынка
 * 
 * @module lib/bot-filters/bb-signal-filter
 */

import { LawrenceClassifier, getLawrenceClassifier } from '@/lib/ml/lawrence-classifier';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';

// ==================== TYPES ====================

export interface BBSignal {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  timeframe: string;
  
  // Bollinger Bands
  currentPrice: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbWidth: number;
  bbPosition: number; // 0-1 (0=lower, 1=upper)
  
  // Indicators
  rsi: number;
  macd: number;
  macdSignal: number;
  adx: number;
  volume: number;
  volumeRatio: number;
  
  // Market context
  trend: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';
  
  // Time
  timestamp: Date;
}

export interface BBFilterResult {
  approved: boolean;
  probability: number;
  confidence: number;
  signalType: 'BREAKOUT' | 'REVERSAL' | 'CONTINUATION';
  reasons: string[];
  recommendedAction: 'ENTER' | 'WAIT' | 'AVOID';
}

// ==================== BB SIGNAL FILTER ====================

export class BBSignalFilter {
  private classifier: LawrenceClassifier;
  private minProbability: number;
  private symbol: string;

  constructor(symbol: string, minProbability: number = 0.65) {
    this.symbol = symbol;
    this.minProbability = minProbability;
    this.classifier = getLawrenceClassifier({
      weights: {
        indicators: 0.45,
        context: 0.30,
        history: 0.20,
        time: 0.05,
      },
      minConfidence: 0.6,
      minHistorySize: 30,
    });
  }

  async initialize(): Promise<void> {
    await this.classifier.train(this.symbol, 60);
    logger.info({ symbol: this.symbol }, 'BB Signal Filter initialized');
  }

  async evaluate(signal: BBSignal): Promise<BBFilterResult> {
    const signalType = this.determineSignalType(signal);
    const features = this.prepareFeatures(signal, signalType);
    const classification = await this.classifier.evaluate(features);
    const bbAdjusted = this.applyBBRules(classification, signal, signalType);
    const recommendation = this.generateRecommendation(bbAdjusted, signal, signalType);

    logger.info({
      symbol: signal.symbol,
      signalType,
      probability: bbAdjusted.probability,
      approved: bbAdjusted.approved,
    }, 'BB signal evaluated');

    await this.recordSignal(signal, bbAdjusted);

    return recommendation;
  }

  private determineSignalType(signal: BBSignal): 'BREAKOUT' | 'REVERSAL' | 'CONTINUATION' {
    const bbPos = signal.bbPosition;

    // Breakout: цена за пределами полос + volume confirmation
    if (bbPos > 1.0 || bbPos < 0.0) {
      // Volume must confirm breakout (1.5x average)
      if (signal.volumeRatio >= 1.5) {
        return 'BREAKOUT';
      }
      // Low volume breakout likely fake
      return 'REVERSAL';
    }

    // Reversal: цена у полос + разворотные индикаторы
    if ((bbPos > 0.9 || bbPos < 0.1) && (signal.rsi > 70 || signal.rsi < 30)) {
      return 'REVERSAL';
    }

    // Continuation: движение к средней полосе
    return 'CONTINUATION';
  }

  private prepareFeatures(signal: BBSignal, signalType: string): any {
    return {
      indicators: {
        rsi: signal.rsi,
        macd: signal.macd,
        macdSignal: signal.macdSignal,
        bbPosition: signal.bbPosition,
        bbWidth: signal.bbWidth,
        adx: signal.adx,
        volumeRatio: signal.volumeRatio,
      },
      context: {
        trend: signal.trend,
        volatility: signal.volatility,
        volume: signal.volumeRatio > 1.5 ? 'HIGH' : signal.volumeRatio < 0.5 ? 'LOW' : 'MEDIUM',
        supportResistance: this.determineSupportResistance(signal),
      },
      signal: {
        direction: signal.direction,
        symbol: signal.symbol,
        timeframe: signal.timeframe,
        entryPrice: signal.currentPrice,
      },
      time: {
        hour: new Date(signal.timestamp).getHours(),
        dayOfWeek: new Date(signal.timestamp).getDay(),
        isSessionOverlap: this.isSessionOverlap(signal.timestamp),
      },
    };
  }

  private determineSupportResistance(signal: BBSignal): 'NEAR_SUPPORT' | 'NEAR_RESISTANCE' | 'MIDDLE' {
    if (signal.bbPosition < 0.2) return 'NEAR_SUPPORT';
    if (signal.bbPosition > 0.8) return 'NEAR_RESISTANCE';
    return 'MIDDLE';
  }

  private isSessionOverlap(timestamp: Date): boolean {
    const hour = timestamp.getUTCHours();
    return hour >= 13 && hour <= 16;
  }

  private applyBBRules(classification: any, signal: BBSignal, signalType: string): any {
    let adjustedProbability = classification.probability;
    const reasons = [...classification.reasons];

    if (signalType === 'BREAKOUT' && signal.direction === 'SHORT') {
      if (signal.bbPosition > 1.0 && signal.rsi > 75) {
        adjustedProbability += 0.15;
        reasons.push('Fake breakout pattern (RSI extreme)');
      }
    }

    if (signalType === 'REVERSAL' && signal.direction === 'LONG') {
      if (signal.bbPosition < 0.1 && signal.rsi < 30) {
        adjustedProbability += 0.2;
        reasons.push('Strong reversal setup (BB + RSI)');
      }
    }

    if (signal.bbWidth < 0.02) {
      adjustedProbability -= 0.1;
      reasons.push('BB squeeze (low volatility)');
    }

    if (signal.bbWidth > 0.1 && signalType === 'BREAKOUT') {
      adjustedProbability += 0.1;
      reasons.push('High volatility breakout');
    }

    if (signal.volumeRatio > 2.0) {
      adjustedProbability += 0.1;
      reasons.push('Volume confirms signal');
    } else if (signal.volumeRatio < 0.5) {
      adjustedProbability -= 0.1;
      reasons.push('Low volume - weak signal');
    }

    return { ...classification, probability: Math.max(0, Math.min(1, adjustedProbability)), reasons };
  }

  private generateRecommendation(result: any, signal: BBSignal, signalType: string): BBFilterResult {
    const probability = result.probability;
    let recommendedAction: 'ENTER' | 'WAIT' | 'AVOID';
    let approved: boolean;

    if (probability >= this.minProbability) {
      approved = true;
      recommendedAction = 'ENTER';
    } else if (probability >= this.minProbability - 0.15) {
      approved = false;
      recommendedAction = 'WAIT';
    } else {
      approved = false;
      recommendedAction = 'AVOID';
    }

    return { approved, probability, confidence: result.confidence, signalType, reasons: result.reasons, recommendedAction };
  }

  private async recordSignal(signal: BBSignal, result: BBFilterResult): Promise<void> {
    await db.classifiedSignal.create({
      data: {
        symbol: signal.symbol,
        direction: signal.direction,
        outcome: 'PENDING',
        pnlPercent: 0,
        probability: result.probability,
        features: JSON.stringify({ bbPosition: signal.bbPosition, bbWidth: signal.bbWidth, rsi: signal.rsi, signalType: result.signalType }),
        botType: 'BB',
        timestamp: signal.timestamp,
      },
    });
  }

  async updateSignalResult(signalId: string, pnlPercent: number): Promise<void> {
    const outcome = pnlPercent > 0.5 ? 'WIN' : pnlPercent < -0.5 ? 'LOSS' : 'BREAKEVEN';
    await db.classifiedSignal.update({ where: { id: signalId }, data: { outcome, pnlPercent } });
  }

  async getStats(): Promise<{ totalSignals: number; approvedSignals: number; winRate: number; avgProbability: number }> {
    const signals = await db.classifiedSignal.findMany({
      where: { symbol: this.symbol, botType: 'BB', outcome: { not: 'PENDING' } },
    });
    const total = signals.length;
    const wins = signals.filter(s => s.outcome === 'WIN').length;
    return {
      totalSignals: total,
      approvedSignals: signals.filter(s => (s.probability || 0) >= this.minProbability).length,
      winRate: total > 0 ? wins / total : 0,
      avgProbability: total > 0 ? signals.reduce((sum, s) => sum + (s.probability || 0), 0) / total : 0,
    };
  }
}

const filterInstances: Map<string, BBSignalFilter> = new Map();

export function getBBSignalFilter(symbol: string, minProbability?: number): BBSignalFilter {
  const key = `${symbol}_${minProbability || 0.65}`;
  if (!filterInstances.has(key)) {
    filterInstances.set(key, new BBSignalFilter(symbol, minProbability));
  }
  return filterInstances.get(key)!;
}

export default { BBSignalFilter, getBBSignalFilter };
