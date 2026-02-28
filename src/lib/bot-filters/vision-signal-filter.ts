/**
 * VISION Bot Signal Filter with Lawrence Classifier
 * 
 * Ensemble фильтрация для VISION бота:
 * - Комбинирует Lawrence Classifier с ML моделью
 * - Оценивает направление рынка
 * - Фильтрует прогнозы по уверенности
 * 
 * @module lib/bot-filters/vision-signal-filter
 */

import { LawrenceClassifier, getLawrenceClassifier } from '@/lib/ml/lawrence-classifier';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';

export interface VISIONSignal {
  symbol: string;
  timeframe: string;
  currentPrice: number;
  
  // ML Model predictions
  mlPrediction: {
    direction: 'UP' | 'DOWN' | 'NEUTRAL';
    confidence: number;
    targetPrice: number;
    stopLoss: number;
  };
  
  // Indicators
  rsi: number;
  macd: number;
  ema20: number;
  ema50: number;
  atr: number;
  volumeRatio: number;
  
  // Market forecast
  forecast: {
    direction: 'UPWARD' | 'DOWNWARD' | 'CONSOLIDATION';
    confidence: number;
    upwardProb: number;
    downwardProb: number;
  };
  
  // Market context
  trend: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING';
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';
  correlation: { btc: number; eth: number };
  
  timestamp: Date;
}

export interface VISIONFilterConfig {
  ensembleWeights: {
    lawrence: number;   // Default: 0.4
    mlModel: number;    // Default: 0.4
    forecast: number;   // Default: 0.2
  };
  thresholds: {
    enter: number;      // Default: 0.70
    wait: number;       // Default: 0.55
  };
}

const DEFAULT_VISION_CONFIG: VISIONFilterConfig = {
  ensembleWeights: {
    lawrence: 0.4,
    mlModel: 0.4,
    forecast: 0.2,
  },
  thresholds: {
    enter: 0.70,
    wait: 0.55,
  },
};

export interface VISIONFilterResult {
  approved: boolean;
  probability: number;
  confidence: number;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  ensembleScore: {
    lawrence: number;
    mlModel: number;
    forecast: number;
    combined: number;
  };
  reasons: string[];
  recommendedAction: 'ENTER_LONG' | 'ENTER_SHORT' | 'WAIT' | 'AVOID';
  targetPrice?: number;
  stopLoss?: number;
}

export class VISIONSignalFilter {
  private classifier: LawrenceClassifier;
  private symbol: string;
  private config: VISIONFilterConfig;

  constructor(symbol: string, config?: Partial<VISIONFilterConfig>) {
    this.symbol = symbol;
    this.config = { ...DEFAULT_VISION_CONFIG, ...config };
    this.classifier = getLawrenceClassifier({
      weights: {
        indicators: 0.35,
        context: 0.30,
        history: 0.20,
        time: 0.15,  // Higher weight for VISION timing
      },
      minConfidence: 0.7,
      minHistorySize: 50,
    });
  }

  async initialize(): Promise<void> {
    await this.classifier.train(this.symbol, 120);
    logger.info({ symbol: this.symbol }, 'VISION Signal Filter initialized');
  }

  async evaluate(signal: VISIONSignal): Promise<VISIONFilterResult> {
    // 1. Lawrence Classifier evaluation
    const lawrenceFeatures = this.prepareLawrenceFeatures(signal);
    const lawrenceResult = await this.classifier.evaluate(lawrenceFeatures);

    // 2. ML Model score
    const mlScore = signal.mlPrediction.confidence * (signal.mlPrediction.direction === 'UP' ? 1 : -1);

    // 3. Forecast score
    const forecastScore = this.calculateForecastScore(signal.forecast);

    // 4. Ensemble combination
    const ensembleScore = this.combineScores(lawrenceResult.probability, mlScore, forecastScore);

    // 5. Generate recommendation
    const recommendation = this.generateRecommendation(ensembleScore, signal, lawrenceResult);

    logger.info({
      symbol: signal.symbol,
      ensembleScore,
      direction: recommendation.direction,
    }, 'VISION signal evaluated');

    await this.recordSignal(signal, recommendation);

    return recommendation;
  }

  private prepareLawrenceFeatures(signal: VISIONSignal): any {
    const direction: 'LONG' | 'SHORT' = signal.mlPrediction.direction === 'UP' ? 'LONG' : 'SHORT';

    return {
      indicators: {
        rsi: signal.rsi,
        macd: signal.macd,
        ema20: signal.ema20,
        ema50: signal.ema50,
        atr: signal.atr,
        volumeRatio: signal.volumeRatio,
      },
      context: {
        trend: signal.trend,
        volatility: signal.volatility,
        volume: signal.volumeRatio > 1.5 ? 'HIGH' : signal.volumeRatio < 0.5 ? 'LOW' : 'MEDIUM',
        supportResistance: 'MIDDLE',
      },
      signal: {
        direction,
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

  private calculateForecastScore(forecast: VISIONSignal['forecast']): number {
    if (forecast.direction === 'UPWARD') {
      return forecast.upwardProb;
    } else if (forecast.direction === 'DOWNWARD') {
      return forecast.downwardProb;
    }
    return 0.5; // CONSOLIDATION
  }

  private combineScores(lawrence: number, ml: number, forecast: number): {
    lawrence: number;
    mlModel: number;
    forecast: number;
    combined: number;
  } {
    // Normalize ML score to 0-1
    const mlNormalized = (ml + 1) / 2;

    // Weighted ensemble from config
    const combined = 
      lawrence * this.config.ensembleWeights.lawrence +
      mlNormalized * this.config.ensembleWeights.mlModel +
      forecast * this.config.ensembleWeights.forecast;

    return {
      lawrence,
      mlModel: mlNormalized,
      forecast,
      combined,
    };
  }

  private isSessionOverlap(timestamp: Date): boolean {
    const hour = timestamp.getUTCHours();
    return hour >= 13 && hour <= 16;
  }

  private generateRecommendation(
    ensembleScore: any,
    signal: VISIONSignal,
    lawrenceResult: any
  ): VISIONFilterResult {
    const combined = ensembleScore.combined;
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL';
    let recommendedAction: 'ENTER_LONG' | 'ENTER_SHORT' | 'WAIT' | 'AVOID';

    // Use configurable thresholds
    if (combined >= this.config.thresholds.enter && signal.mlPrediction.direction === 'UP') {
      direction = 'LONG';
      recommendedAction = 'ENTER_LONG';
    } else if (combined >= this.config.thresholds.enter && signal.mlPrediction.direction === 'DOWN') {
      direction = 'SHORT';
      recommendedAction = 'ENTER_SHORT';
    } else if (combined >= this.config.thresholds.wait) {
      direction = signal.mlPrediction.direction === 'UP' ? 'LONG' : 'SHORT';
      recommendedAction = 'WAIT';
    } else {
      direction = 'NEUTRAL';
      recommendedAction = 'AVOID';
    }

    const reasons: string[] = [];

    if (ensembleScore.lawrence > 0.65) reasons.push('Lawrence classifier bullish');
    if (ensembleScore.mlModel > 0.65) reasons.push('ML model confident');
    if (ensembleScore.forecast > 0.65) reasons.push('Market forecast positive');
    if (signal.rsi < 35) reasons.push('RSI oversold');
    if (signal.rsi > 65) reasons.push('RSI overbought');
    if (signal.volumeRatio > 1.5) reasons.push('Volume confirms');

    return {
      approved: recommendedAction.startsWith('ENTER'),
      probability: combined,
      confidence: lawrenceResult.confidence,
      direction,
      ensembleScore,
      reasons,
      recommendedAction,
      targetPrice: signal.mlPrediction.targetPrice,
      stopLoss: signal.mlPrediction.stopLoss,
    };
  }

  private async recordSignal(signal: VISIONSignal, result: VISIONFilterResult): Promise<void> {
    await db.classifiedSignal.create({
      data: {
        symbol: signal.symbol,
        direction: result.direction === 'NEUTRAL' ? 'LONG' : result.direction,
        outcome: 'PENDING',
        pnlPercent: 0,
        probability: result.probability,
        features: JSON.stringify({
          mlConfidence: signal.mlPrediction.confidence,
          forecastConfidence: signal.forecast.confidence,
          ensembleScore: result.ensembleScore.combined,
        }),
        botType: 'VISION',
        timestamp: signal.timestamp,
      },
    });
  }

  async updatePredictionResult(signalId: string, pnlPercent: number): Promise<void> {
    const outcome = pnlPercent > 0.5 ? 'WIN' : pnlPercent < -0.5 ? 'LOSS' : 'BREAKEVEN';
    await db.classifiedSignal.update({ where: { id: signalId }, data: { outcome, pnlPercent } });
  }

  async getStats(): Promise<{
    totalPredictions: number;
    approvedPredictions: number;
    winRate: number;
    avgAccuracy: number;
  }> {
    const signals = await db.classifiedSignal.findMany({
      where: { symbol: this.symbol, botType: 'VISION', outcome: { not: 'PENDING' } },
    });
    const total = signals.length;
    const wins = signals.filter(s => s.outcome === 'WIN').length;

    return {
      totalPredictions: total,
      approvedPredictions: signals.filter(s => (s.probability || 0) >= 0.7).length,
      winRate: total > 0 ? wins / total : 0,
      avgAccuracy: total > 0 ? signals.reduce((sum, s) => sum + (s.probability || 0), 0) / total : 0,
    };
  }
}

const filterInstances: Map<string, VISIONSignalFilter> = new Map();

export function getVISIONSignalFilter(symbol: string): VISIONSignalFilter {
  if (!filterInstances.has(symbol)) {
    filterInstances.set(symbol, new VISIONSignalFilter(symbol));
  }
  return filterInstances.get(symbol)!;
}

export default { VISIONSignalFilter, getVISIONSignalFilter };
