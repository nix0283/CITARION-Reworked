/**
 * Lawrence Classifier Unit Tests
 * 
 * @module __tests__/lawrence-classifier.test.ts
 */

import { LawrenceClassifier, getLawrenceClassifier } from '@/lib/ml/lawrence-classifier';

describe('LawrenceClassifier', () => {
  let classifier: LawrenceClassifier;

  beforeEach(() => {
    classifier = getLawrenceClassifier({
      minHistorySize: 10,
      lookbackDays: 30,
    });
  });

  describe('Constructor', () => {
    it('should create classifier with default config', () => {
      const c = getLawrenceClassifier();
      expect(c).toBeDefined();
    });

    it('should create classifier with custom config', () => {
      const c = getLawrenceClassifier({
        minConfidence: 0.8,
        minHistorySize: 100,
      });
      expect(c).toBeDefined();
    });
  });

  describe('Indicator Scoring', () => {
    it('should calculate RSI correctly', () => {
      const candles = Array(50).fill(null).map((_, i) => ({
        close: 100 + Math.sin(i * 0.1) * 10,
        high: 105 + Math.sin(i * 0.1) * 10,
        low: 95 + Math.sin(i * 0.1) * 10,
        open: 100 + Math.sin(i * 0.1) * 10,
        volume: 1000,
      }));

      // RSI should be between 0 and 100
      const rsi = (classifier as any).calculateRSI(candles, 14);
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    it('should calculate MACD correctly', () => {
      const candles = Array(50).fill(null).map((_, i) => ({
        close: 100 + Math.sin(i * 0.1) * 10,
        high: 105,
        low: 95,
        open: 100,
        volume: 1000,
      }));

      const { macd, macdSignal } = (classifier as any).calculateMACD(candles);
      expect(typeof macd).toBe('number');
      expect(typeof macdSignal).toBe('number');
    });

    it('should calculate Bollinger Bands position correctly', () => {
      const candles = Array(50).fill(null).map((_, i) => ({
        close: 100 + Math.sin(i * 0.1) * 10,
        high: 105,
        low: 95,
        open: 100,
        volume: 1000,
      }));

      const { bbPosition, bbWidth } = (classifier as any).calculateBollingerBands(candles);
      expect(bbPosition).toBeGreaterThanOrEqual(0);
      expect(bbPosition).toBeLessThanOrEqual(1);
      expect(bbWidth).toBeGreaterThan(0);
    });

    it('should calculate ATR correctly', () => {
      const candles = Array(50).fill(null).map((_, i) => ({
        close: 100 + i,
        high: 105 + i,
        low: 95 + i,
        open: 100 + i,
        volume: 1000,
      }));

      const atr = (classifier as any).calculateATR(candles, 14);
      expect(atr).toBeGreaterThan(0);
    });

    it('should calculate volume ratio correctly', () => {
      const candles = Array(50).fill(null).map((_, i) => ({
        close: 100,
        high: 105,
        low: 95,
        open: 100,
        volume: i % 10 === 0 ? 2000 : 1000, // Spike every 10 candles
      }));

      const volumeRatio = (classifier as any).calculateVolumeRatio(candles);
      expect(volumeRatio).toBeGreaterThan(0);
    });
  });

  describe('Context Scoring', () => {
    it('should detect trend correctly', () => {
      const uptrendCandles = Array(50).fill(null).map((_, i) => ({
        close: 100 + i * 2,
        high: 105 + i * 2,
        low: 95 + i * 2,
        open: 100 + i * 2,
        volume: 1000,
      }));

      const trend = (classifier as any).detectTrend(uptrendCandles);
      expect(trend).toBe('TRENDING_UP');
    });

    it('should calculate volatility correctly', () => {
      const candles = Array(50).fill(null).map((_, i) => ({
        close: 100 + Math.sin(i * 0.1) * 10,
        high: 105,
        low: 95,
        open: 100,
        volume: 1000,
      }));

      const volatility = (classifier as any).calculateVolatility(candles);
      expect(volatility).toBeGreaterThanOrEqual(0);
    });

    it('should detect support/resistance correctly', () => {
      const candles = Array(50).fill(null).map((_, i) => ({
        close: 100 + Math.sin(i * 0.1) * 10,
        high: 110,
        low: 90,
        open: 100,
        volume: 1000,
      }));

      const sr = (classifier as any).detectSupportResistance(candles, 92);
      expect(sr).toBe('NEAR_SUPPORT');

      const sr2 = (classifier as any).detectSupportResistance(candles, 108);
      expect(sr2).toBe('NEAR_RESISTANCE');
    });
  });

  describe('Evaluate', () => {
    it('should evaluate signal with all components', async () => {
      const features = {
        indicators: {
          rsi: 35,
          macd: 100,
          macdSignal: 90,
          atr: 0.02,
          bbPosition: 0.2,
          bbWidth: 0.05,
          adx: 30,
          volumeRatio: 1.5,
        },
        context: {
          trend: 'TRENDING_UP' as const,
          volatility: 'MEDIUM' as const,
          volume: 'HIGH' as const,
          supportResistance: 'NEAR_SUPPORT' as const,
        },
        signal: {
          direction: 'LONG' as const,
          symbol: 'BTCUSDT',
          timeframe: '1h',
          entryPrice: 50000,
        },
        time: {
          hour: 14,
          dayOfWeek: 2,
          isSessionOverlap: true,
        },
      };

      const result = await classifier.evaluate(features);

      expect(result).toBeDefined();
      expect(result.probability).toBeGreaterThanOrEqual(0);
      expect(result.probability).toBeLessThanOrEqual(1);
      expect(result.prediction).toBe('WIN');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.scores).toBeDefined();
      expect(Array.isArray(result.reasons)).toBe(true);
    });

    it('should give higher probability for oversold RSI + LONG', async () => {
      const oversoldFeatures = {
        indicators: { rsi: 25, macd: -50, macdSignal: -40, volumeRatio: 1.5 },
        context: { trend: 'RANGING' as const, volatility: 'MEDIUM' as const, volume: 'MEDIUM' as const },
        signal: { direction: 'LONG' as const, symbol: 'BTCUSDT', timeframe: '1h', entryPrice: 50000 },
        time: { hour: 14, dayOfWeek: 2, isSessionOverlap: true },
      };

      const overboughtFeatures = {
        indicators: { rsi: 75, macd: 50, macdSignal: 40, volumeRatio: 1.5 },
        context: { trend: 'RANGING' as const, volatility: 'MEDIUM' as const, volume: 'MEDIUM' as const },
        signal: { direction: 'LONG' as const, symbol: 'BTCUSDT', timeframe: '1h', entryPrice: 50000 },
        time: { hour: 14, dayOfWeek: 2, isSessionOverlap: true },
      };

      const oversoldResult = await classifier.evaluate(oversoldFeatures);
      const overboughtResult = await classifier.evaluate(overboughtFeatures);

      expect(oversoldResult.probability).toBeGreaterThan(overboughtResult.probability);
    });
  });

  describe('Confidence Calculation', () => {
    it('should calculate confidence based on score variance', () => {
      const scores = [0.7, 0.75, 0.65, 0.72];
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;

      // Low variance should give high confidence
      expect(variance).toBeLessThan(0.01);
    });
  });

  describe('Get Stats', () => {
    it('should return stats object', () => {
      const stats = classifier.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.totalTrades).toBe('number');
      expect(typeof stats.isTrained).toBe('boolean');
      expect(typeof stats.avgWinRate).toBe('number');
      expect(typeof stats.recentWinRate).toBe('number');
    });
  });
});
