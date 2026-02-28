/**
 * Market Regime Detector
 * 
 * Определение рыночного режима через:
 * - K-Means кластеризацию
 * - Правила на основе ATR/ADX
 * - GMM (Gaussian Mixture Models) - simplified
 * 
 * @module lib/ml/market-regime-detector
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE' | 'CALM';

export interface RegimeFeatures {
  atr: number;
  adx: number;
  volatility: number;
  volumeRatio: number;
  priceChange: number;
  bbWidth: number;
}

export interface RegimeResult {
  regime: MarketRegime;
  confidence: number;
  characteristics: {
    trendStrength: number;
    volatility: number;
    volume: number;
  };
  recommendedStrategy: string;
}

export interface RegimeCluster {
  id: number;
  center: RegimeFeatures;
  regime: MarketRegime;
  count: number;
}

// ==================== MARKET REGIME DETECTOR ====================

export class MarketRegimeDetector {
  private regimeClusters: RegimeCluster[] = [];
  private isTrained: boolean = false;

  /**
   * Обучить детектор на исторических данных
   */
  async train(symbol: string, days: number = 90): Promise<void> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get OHLCV data
    const candles = await db.ohlcvCandle.findMany({
      where: {
        symbol,
        timeframe: '1h',
        openTime: { gte: since },
      },
      orderBy: { openTime: 'asc' },
    });

    if (candles.length < 100) {
      logger.warn({ symbol, candlesCount: candles.length }, 'Not enough data for regime training');
      this.useRuleBasedRegimes();
      return;
    }

    // Extract features for each candle
    const features: RegimeFeatures[] = [];
    for (let i = 50; i < candles.length; i++) {
      const slice = candles.slice(i - 50, i);
      const feature = this.extractFeatures(slice, candles[i]);
      features.push(feature);
    }

    // K-Means clustering with K=5
    this.regimeClusters = this.kMeans(features, 5);
    this.isTrained = true;

    logger.info({ symbol, clusters: this.regimeClusters.length }, 'Market regime detector trained');
  }

  /**
   * Извлечь фичи для свечи
   */
  private extractFeatures(candles: any[], current: any): RegimeFeatures {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);

    // ATR (14)
    const atr = this.calculateATR(candles, 14);

    // ADX (simplified)
    const ema20 = this.calculateEMA(closes, 20);
    const ema50 = this.calculateEMA(closes, 50);
    const adx = Math.min(100, Math.abs(ema20 - ema50) / ema50 * 1000);

    // Volatility
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i - 1] - closes[i]) / closes[i]);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const volatility = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);

    // Volume ratio
    const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const volumeRatio = recentVolume / avgVolume;

    // Price change
    const priceChange = (current.close - closes[0]) / closes[0];

    // BB Width
    const sma = closes.reduce((a, b) => a + b, 0) / closes.length;
    const std = Math.sqrt(closes.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / closes.length);
    const bbWidth = (2 * 2 * std) / sma;

    return { atr, adx, volatility, volumeRatio, priceChange, bbWidth };
  }

  /**
   * K-Means кластеризация
   */
  private kMeans(features: RegimeFeatures[], k: number): RegimeCluster[] {
    // Initialize centroids randomly
    let centroids = this.initializeCentroids(features, k);
    let clusters: RegimeCluster[] = [];

    // Iterate until convergence
    for (let iteration = 0; iteration < 50; iteration++) {
      // Assign points to nearest centroid
      const assignments = features.map(f => this.assignToCluster(f, centroids));

      // Update centroids
      const newCentroids = this.updateCentroids(features, assignments, k);

      // Check convergence
      if (this.centroidsConverged(centroids, newCentroids)) {
        centroids = newCentroids;
        break;
      }

      centroids = newCentroids;
    }

    // Create clusters with regime labels
    clusters = centroids.map((center, i) => ({
      id: i,
      center,
      regime: this.labelRegime(center),
      count: 0,
    }));

    // Count points per cluster
    const assignments = features.map(f => this.assignToCluster(f, centroids));
    assignments.forEach(a => clusters[a].count++);

    return clusters;
  }

  /**
   * Инициализация центроидов
   */
  private initializeCentroids(features: RegimeFeatures[], k: number): RegimeFeatures[] {
    const centroids: RegimeFeatures[] = [];
    const used = new Set<number>();

    while (centroids.length < k) {
      const idx = Math.floor(Math.random() * features.length);
      if (!used.has(idx)) {
        centroids.push({ ...features[idx] });
        used.add(idx);
      }
    }

    return centroids;
  }

  /**
   * Назначить точку кластеру
   */
  private assignToCluster(feature: RegimeFeatures, centroids: RegimeFeatures[]): number {
    let minDistance = Infinity;
    let cluster = 0;

    for (let i = 0; i < centroids.length; i++) {
      const distance = this.distance(feature, centroids[i]);
      if (distance < minDistance) {
        minDistance = distance;
        cluster = i;
      }
    }

    return cluster;
  }

  /**
   * Обновить центроиды
   */
  private updateCentroids(features: RegimeFeatures[], assignments: number[], k: number): RegimeFeatures[] {
    const newCentroids: RegimeFeatures[] = [];

    for (let i = 0; i < k; i++) {
      const points = features.filter((_, idx) => assignments[idx] === i);

      if (points.length === 0) {
        newCentroids.push(this.randomCentroid());
        continue;
      }

      const center: RegimeFeatures = {
        atr: points.reduce((s, p) => s + p.atr, 0) / points.length,
        adx: points.reduce((s, p) => s + p.adx, 0) / points.length,
        volatility: points.reduce((s, p) => s + p.volatility, 0) / points.length,
        volumeRatio: points.reduce((s, p) => s + p.volumeRatio, 0) / points.length,
        priceChange: points.reduce((s, p) => s + p.priceChange, 0) / points.length,
        bbWidth: points.reduce((s, p) => s + p.bbWidth, 0) / points.length,
      };

      newCentroids.push(center);
    }

    return newCentroids;
  }

  /**
   * Проверка сходимости центроидов
   */
  private centroidsConverged(old: RegimeFeatures[], neu: RegimeFeatures[]): boolean {
    for (let i = 0; i < old.length; i++) {
      if (this.distance(old[i], neu[i]) > 0.001) {
        return false;
      }
    }
    return true;
  }

  /**
   * Евклидово расстояние
   */
  private distance(a: RegimeFeatures, b: RegimeFeatures): number {
    return Math.sqrt(
      Math.pow(a.atr - b.atr, 2) +
      Math.pow(a.adx - b.adx, 2) +
      Math.pow(a.volatility - b.volatility, 2) +
      Math.pow(a.volumeRatio - b.volumeRatio, 2) +
      Math.pow(a.priceChange - b.priceChange, 2) +
      Math.pow(a.bbWidth - b.bbWidth, 2)
    );
  }

  /**
   * Случайный центроид
   */
  private randomCentroid(): RegimeFeatures {
    return {
      atr: 0.01 + Math.random() * 0.05,
      adx: 10 + Math.random() * 40,
      volatility: 0.01 + Math.random() * 0.08,
      volumeRatio: 0.5 + Math.random() * 2,
      priceChange: -0.1 + Math.random() * 0.2,
      bbWidth: 0.02 + Math.random() * 0.1,
    };
  }

  /**
   * Назвать режим по центроиду
   */
  private labelRegime(center: RegimeFeatures): MarketRegime {
    // High volatility
    if (center.volatility > 0.05 || center.atr > 0.03) {
      return 'VOLATILE';
    }

    // Strong trend
    if (center.adx > 25) {
      return center.priceChange > 0 ? 'TRENDING_UP' : 'TRENDING_DOWN';
    }

    // Low volatility
    if (center.volatility < 0.01 && center.volumeRatio < 0.8) {
      return 'CALM';
    }

    // Range
    return 'RANGING';
  }

  /**
   * Fallback: rule-based regimes
   */
  private useRuleBasedRegimes(): void {
    this.regimeClusters = [
      { id: 0, center: { atr: 0.02, adx: 30, volatility: 0.03, volumeRatio: 1, priceChange: 0.05, bbWidth: 0.05 }, regime: 'TRENDING_UP', count: 0 },
      { id: 1, center: { atr: 0.02, adx: 30, volatility: 0.03, volumeRatio: 1, priceChange: -0.05, bbWidth: 0.05 }, regime: 'TRENDING_DOWN', count: 0 },
      { id: 2, center: { atr: 0.015, adx: 15, volatility: 0.02, volumeRatio: 1, priceChange: 0, bbWidth: 0.04 }, regime: 'RANGING', count: 0 },
      { id: 3, center: { atr: 0.04, adx: 20, volatility: 0.07, volumeRatio: 1.5, priceChange: 0.02, bbWidth: 0.08 }, regime: 'VOLATILE', count: 0 },
      { id: 4, center: { atr: 0.01, adx: 10, volatility: 0.008, volumeRatio: 0.5, priceChange: 0, bbWidth: 0.02 }, regime: 'CALM', count: 0 },
    ];
    this.isTrained = true;
  }

  /**
   * Определить текущий режим
   */
  async detect(symbol: string): Promise<RegimeResult> {
    // Get recent candles
    const candles = await db.ohlcvCandle.findMany({
      where: { symbol, timeframe: '1h' },
      orderBy: { openTime: 'desc' },
      take: 50,
    });

    if (candles.length < 50) {
      return this.detectByRules(this.extractFeatures(candles, candles[0]));
    }

    const features = this.extractFeatures(candles, candles[0]);

    // If trained, use K-Means
    if (this.isTrained && this.regimeClusters.length > 0) {
      const clusterIdx = this.assignToCluster(features, this.regimeClusters.map(c => c.center));
      const cluster = this.regimeClusters[clusterIdx];

      const distance = this.distance(features, cluster.center);
      const confidence = Math.max(0, 1 - distance / 10);

      return {
        regime: cluster.regime,
        confidence,
        characteristics: {
          trendStrength: features.adx / 100,
          volatility: features.volatility,
          volume: features.volumeRatio,
        },
        recommendedStrategy: this.getRecommendedStrategy(cluster.regime),
      };
    }

    // Fallback to rules
    return this.detectByRules(features);
  }

  /**
   * Определение по правилам (fallback)
   */
  private detectByRules(features: RegimeFeatures): RegimeResult {
    let regime: MarketRegime = 'RANGING';
    let confidence = 0.5;

    if (features.volatility > 0.05 || features.atr > 0.03) {
      regime = 'VOLATILE';
      confidence = 0.8;
    } else if (features.adx > 25) {
      regime = features.priceChange > 0 ? 'TRENDING_UP' : 'TRENDING_DOWN';
      confidence = features.adx / 100;
    } else if (features.volatility < 0.01 && features.volumeRatio < 0.8) {
      regime = 'CALM';
      confidence = 0.7;
    }

    return {
      regime,
      confidence,
      characteristics: {
        trendStrength: features.adx / 100,
        volatility: features.volatility,
        volume: features.volumeRatio,
      },
      recommendedStrategy: this.getRecommendedStrategy(regime),
    };
  }

  /**
   * Рекомендуемая стратегия для режима
   */
  private getRecommendedStrategy(regime: MarketRegime): string {
    const strategies: Record<MarketRegime, string> = {
      TRENDING_UP: 'DCA_TREND or BB_TREND',
      TRENDING_DOWN: 'SHORT strategies or wait',
      RANGING: 'GRID_NEUTRAL or MEAN_REVERSION',
      VOLATILE: 'GRID_WIDE or BREAKOUT',
      CALM: 'GRID_TIGHT or wait',
    };
    return strategies[regime];
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
   * Получить статус детектора
   */
  getStatus(): { isTrained: boolean; clusters: number } {
    return {
      isTrained: this.isTrained,
      clusters: this.regimeClusters.length,
    };
  }
}

// ==================== SINGLETON ====================

let detectorInstance: MarketRegimeDetector | null = null;

export function getMarketRegimeDetector(): MarketRegimeDetector {
  if (!detectorInstance) {
    detectorInstance = new MarketRegimeDetector();
  }
  return detectorInstance;
}

// ==================== EXPORTS ====================

export default { MarketRegimeDetector, getMarketRegimeDetector };
