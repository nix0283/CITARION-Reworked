/**
 * DCA Bot Entry Filter with Lawrence Classifier
 * 
 * Фильтрация точек входа для DCA бота:
 * - Определяет оптимальный момент для начала DCA цикла
 * - Оценивает вероятность успеха первой покупки
 * - Фильтрует рискованные ситуации
 * 
 * @module lib/bot-filters/dca-entry-filter
 */

import { LawrenceClassifier, getLawrenceClassifier } from '@/lib/ml/lawrence-classifier';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';

export interface DCASignal {
  symbol: string;
  direction: 'LONG';
  timeframe: string;
  currentPrice: number;
  
  // Indicators
  rsi: number;
  macd: number;
  macdSignal: number;
  ema20: number;
  ema50: number;
  atr: number;
  volume: number;
  volumeRatio: number;
  
  // Price action
  priceChange1h: number;
  priceChange4h: number;
  priceChange24h: number;
  distanceFromHigh24h: number;
  
  // Market context
  trend: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING';
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';
  
  timestamp: Date;
}

export interface DCAFilterResult {
  approved: boolean;
  probability: number;
  confidence: number;
  entryQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  reasons: string[];
  recommendedAction: 'START_DCA' | 'WAIT' | 'SKIP';
  suggestedDCALevels?: number;
  atrPositionSize?: number; // Position size based on ATR (0-1)
}

export class DCAEntryFilter {
  private classifier: LawrenceClassifier;
  private symbol: string;

  constructor(symbol: string) {
    this.symbol = symbol;
    this.classifier = getLawrenceClassifier({
      weights: {
        indicators: 0.40,
        context: 0.35,  // Higher weight for DCA context
        history: 0.20,
        time: 0.05,
      },
      minConfidence: 0.65,
      minHistorySize: 40,
    });
  }

  async initialize(): Promise<void> {
    await this.classifier.train(this.symbol, 90);
    logger.info({ symbol: this.symbol }, 'DCA Entry Filter initialized');
  }

  async evaluate(signal: DCASignal): Promise<DCAFilterResult> {
    const features = this.prepareFeatures(signal);
    const classification = await this.classifier.evaluate(features);
    const dcaAdjusted = this.applyDCARules(classification, signal);
    const recommendation = this.generateRecommendation(dcaAdjusted, signal);

    logger.info({
      symbol: signal.symbol,
      probability: dcaAdjusted.probability,
      entryQuality: recommendation.entryQuality,
    }, 'DCA entry evaluated');

    await this.recordSignal(signal, recommendation);

    return recommendation;
  }

  private prepareFeatures(signal: DCASignal): any {
    return {
      indicators: {
        rsi: signal.rsi,
        macd: signal.macd,
        macdSignal: signal.macdSignal,
        atr: signal.atr,
        volumeRatio: signal.volumeRatio,
        ema20: signal.ema20,
        ema50: signal.ema50,
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

  private determineSupportResistance(signal: DCASignal): 'NEAR_SUPPORT' | 'NEAR_RESISTANCE' | 'MIDDLE' {
    const ema20 = signal.ema20;
    const ema50 = signal.ema50;
    const price = signal.currentPrice;

    if (price < ema50 * 0.98) return 'NEAR_SUPPORT';
    if (price > ema20 * 1.02) return 'NEAR_RESISTANCE';
    return 'MIDDLE';
  }

  private isSessionOverlap(timestamp: Date): boolean {
    const hour = timestamp.getUTCHours();
    return hour >= 13 && hour <= 16;
  }

  private applyDCARules(classification: any, signal: DCASignal): any {
    let adjustedProbability = classification.probability;
    const reasons = [...classification.reasons];

    // Правило 1: RSI перепроданность (отлично для DCA входа)
    if (signal.rsi < 30) {
      adjustedProbability += 0.2;
      reasons.push('RSI oversold - excellent DCA entry');
    } else if (signal.rsi < 40) {
      adjustedProbability += 0.1;
      reasons.push('RSI approaching oversold');
    } else if (signal.rsi > 60) {
      adjustedProbability -= 0.15;
      reasons.push('RSI too high for DCA entry');
    }

    // Правило 2: MACD гистограмма
    const macdHist = signal.macd - signal.macdSignal;
    if (macdHist < 0 && signal.macd < 0) {
      adjustedProbability += 0.1;
      reasons.push('MACD bearish - potential reversal');
    }

    // Правило 3: Падение цены за 24ч
    if (signal.priceChange24h < -0.1) {
      adjustedProbability += 0.15;
      reasons.push('Significant 24h drop - good DCA opportunity');
    } else if (signal.priceChange24h > 0.05) {
      adjustedProbability -= 0.1;
      reasons.push('Price already up - wait for pullback');
    }

    // Правило 4: Расстояние от хая
    if (signal.distanceFromHigh24h > 0.08) {
      adjustedProbability += 0.1;
      reasons.push('Far from 24h high - room for recovery');
    }

    // Правило 5: Объём
    if (signal.volumeRatio > 2.0) {
      adjustedProbability += 0.1;
      reasons.push('High volume confirms move');
    }

    // Правило 6: Тренд
    if (signal.trend === 'TRENDING_DOWN') {
      adjustedProbability += 0.05; // DCA works well in downtrends
      reasons.push('Downtrend - DCA strategy suitable');
    } else if (signal.trend === 'TRENDING_UP') {
      adjustedProbability -= 0.1;
      reasons.push('Uptrend - consider waiting for pullback');
    }

    // Правило 7: Волатильность
    if (signal.volatility === 'HIGH') {
      adjustedProbability -= 0.05;
      reasons.push('High volatility - use smaller initial position');
    }

    // Правило 8: ATR-based position sizing
    const atrPositionSize = this.calculateATRPositionSize(signal.atr, signal.currentPrice);
    if (atrPositionSize < 0.5) {
      reasons.push('High ATR - reduce position size');
    } else if (atrPositionSize > 1.5) {
      reasons.push('Low ATR - can increase position size');
    }

    return { 
      ...classification, 
      probability: Math.max(0, Math.min(1, adjustedProbability)), 
      reasons,
      atrPositionSize,
    };
  }

  /**
   * Calculate ATR-based position size multiplier
   * Normal ATR = 2-3% of price, adjust position size accordingly
   */
  private calculateATRPositionSize(atr: number, price: number): number {
    const atrPercent = atr / price;
    const normalATR = 0.025; // 2.5% is normal
    
    // If ATR is higher than normal, reduce position size
    // If ATR is lower than normal, can increase position size
    const positionSizeMultiplier = normalATR / atrPercent;
    
    // Clamp between 0.3 and 2.0
    return Math.max(0.3, Math.min(2.0, positionSizeMultiplier));
  }

  private generateRecommendation(result: any, signal: DCASignal): DCAFilterResult {
    const probability = result.probability;
    let entryQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    let recommendedAction: 'START_DCA' | 'WAIT' | 'SKIP';
    let suggestedDCALevels: number | undefined;

    if (probability >= 0.75) {
      entryQuality = 'EXCELLENT';
      recommendedAction = 'START_DCA';
      suggestedDCALevels = 5;
    } else if (probability >= 0.65) {
      entryQuality = 'GOOD';
      recommendedAction = 'START_DCA';
      suggestedDCALevels = 4;
    } else if (probability >= 0.50) {
      entryQuality = 'FAIR';
      recommendedAction = 'WAIT';
      suggestedDCALevels = 3;
    } else {
      entryQuality = 'POOR';
      recommendedAction = 'SKIP';
      suggestedDCALevels = undefined;
    }

    return {
      approved: recommendedAction === 'START_DCA',
      probability,
      confidence: result.confidence,
      entryQuality,
      reasons: result.reasons,
      recommendedAction,
      suggestedDCALevels,
    };
  }

  private async recordSignal(signal: DCASignal, result: DCAFilterResult): Promise<void> {
    await db.classifiedSignal.create({
      data: {
        symbol: signal.symbol,
        direction: signal.direction,
        outcome: 'PENDING',
        pnlPercent: 0,
        probability: result.probability,
        features: JSON.stringify({
          rsi: signal.rsi,
          priceChange24h: signal.priceChange24h,
          entryQuality: result.entryQuality,
        }),
        botType: 'DCA',
        timestamp: signal.timestamp,
      },
    });
  }

  async updateCycleResult(signalId: string, totalPnlPercent: number): Promise<void> {
    const outcome = totalPnlPercent > 1 ? 'WIN' : totalPnlPercent < -1 ? 'LOSS' : 'BREAKEVEN';
    await db.classifiedSignal.update({ where: { id: signalId }, data: { outcome, pnlPercent: totalPnlPercent } });
  }

  async getStats(): Promise<{
    totalCycles: number;
    approvedCycles: number;
    winRate: number;
    avgProfit: number;
  }> {
    const signals = await db.classifiedSignal.findMany({
      where: { symbol: this.symbol, botType: 'DCA', outcome: { not: 'PENDING' } },
    });
    const total = signals.length;
    const wins = signals.filter(s => s.outcome === 'WIN').length;
    const avgProfit = total > 0 ? signals.reduce((sum, s) => sum + s.pnlPercent, 0) / total : 0;

    return {
      totalCycles: total,
      approvedCycles: signals.filter(s => (s.probability || 0) >= 0.65).length,
      winRate: total > 0 ? wins / total : 0,
      avgProfit,
    };
  }
}

const filterInstances: Map<string, DCAEntryFilter> = new Map();

export function getDCAEntryFilter(symbol: string): DCAEntryFilter {
  if (!filterInstances.has(symbol)) {
    filterInstances.set(symbol, new DCAEntryFilter(symbol));
  }
  return filterInstances.get(symbol)!;
}

export default { DCAEntryFilter, getDCAEntryFilter };
