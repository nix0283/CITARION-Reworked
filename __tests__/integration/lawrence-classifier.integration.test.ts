/**
 * Lawrence Classifier Integration Tests
 * 
 * @module __tests__/integration/lawrence-classifier.integration.test.ts
 */

import { LawrenceClassifier } from '@/lib/ml/lawrence-classifier';

describe('Lawrence Classifier Integration', () => {
  let classifier: LawrenceClassifier;

  beforeEach(() => {
    classifier = new LawrenceClassifier({
      minHistorySize: 10,
      lookbackDays: 30,
      weights: { indicators: 0.4, context: 0.3, history: 0.2, time: 0.1 },
    });
  });

  describe('Full Signal Evaluation Flow', () => {
    it('should evaluate a complete LONG signal', async () => {
      const features = {
        indicators: { rsi: 35, macd: 100, macdSignal: 90, atr: 0.02, bbPosition: 0.2, bbWidth: 0.05, adx: 30, volumeRatio: 1.5 },
        context: { trend: 'TRENDING_UP' as const, volatility: 'MEDIUM' as const, volume: 'HIGH' as const, supportResistance: 'NEAR_SUPPORT' as const },
        signal: { direction: 'LONG' as const, symbol: 'BTCUSDT', timeframe: '1h', entryPrice: 50000 },
        time: { hour: 14, dayOfWeek: 2, isSessionOverlap: true },
      };
      const result = await classifier.evaluate(features);
      expect(result).toBeDefined();
      expect(result.probability).toBeGreaterThan(0.5);
      expect(result.prediction).toBe('WIN');
      expect(result.scores.indicator).toBeDefined();
      expect(result.scores.context).toBeDefined();
      expect(result.scores.history).toBeDefined();
      expect(result.scores.time).toBeDefined();
      expect(Array.isArray(result.reasons)).toBe(true);
    });

    it('should evaluate a SHORT signal with overbought conditions', async () => {
      const features = {
        indicators: { rsi: 75, macd: -50, macdSignal: -40, atr: 0.025, bbPosition: 0.9, bbWidth: 0.06, adx: 25, volumeRatio: 1.8 },
        context: { trend: 'TRENDING_DOWN' as const, volatility: 'HIGH' as const, volume: 'HIGH' as const, supportResistance: 'NEAR_RESISTANCE' as const },
        signal: { direction: 'SHORT' as const, symbol: 'ETHUSDT', timeframe: '1h', entryPrice: 3000 },
        time: { hour: 15, dayOfWeek: 3, isSessionOverlap: true },
      };
      const result = await classifier.evaluate(features);
      expect(result).toBeDefined();
      expect(result.probability).toBeGreaterThan(0.5);
      expect(result.scores.context).toBeGreaterThan(0.5);
    });

    it('should give low probability for conflicting signals', async () => {
      const features = {
        indicators: { rsi: 50, macd: 0, macdSignal: 0, atr: 0.02, bbPosition: 0.5, bbWidth: 0.04, adx: 15, volumeRatio: 1.0 },
        context: { trend: 'RANGING' as const, volatility: 'LOW' as const, volume: 'LOW' as const, supportResistance: 'MIDDLE' as const },
        signal: { direction: 'LONG' as const, symbol: 'BTCUSDT', timeframe: '1h', entryPrice: 50000 },
        time: { hour: 3, dayOfWeek: 0, isSessionOverlap: false },
      };
      const result = await classifier.evaluate(features);
      expect(result.probability).toBeLessThan(0.5);
      expect(result.prediction).toBe('LOSS');
    });
  });

  describe('Component Scoring', () => {
    it('should score oversold RSI higher for LONG', async () => {
      const oversold = {
        indicators: { rsi: 25, macd: -50, macdSignal: -40, volumeRatio: 1.5 },
        context: { trend: 'RANGING' as const, volatility: 'MEDIUM' as const, volume: 'MEDIUM' as const },
        signal: { direction: 'LONG' as const, symbol: 'BTCUSDT', timeframe: '1h', entryPrice: 50000 },
        time: { hour: 14, dayOfWeek: 2, isSessionOverlap: true },
      };
      const overbought = {
        indicators: { rsi: 75, macd: 50, macdSignal: 40, volumeRatio: 1.5 },
        context: { trend: 'RANGING' as const, volatility: 'MEDIUM' as const, volume: 'MEDIUM' as const },
        signal: { direction: 'LONG' as const, symbol: 'BTCUSDT', timeframe: '1h', entryPrice: 50000 },
        time: { hour: 14, dayOfWeek: 2, isSessionOverlap: true },
      };
      const r1 = await classifier.evaluate(oversold);
      const r2 = await classifier.evaluate(overbought);
      expect(r1.scores.indicator).toBeGreaterThan(r2.scores.indicator);
    });

    it('should score trending context higher than ranging', async () => {
      const trending = {
        indicators: { rsi: 45, macd: 100, macdSignal: 90, volumeRatio: 1.5 },
        context: { trend: 'TRENDING_UP' as const, volatility: 'MEDIUM' as const, volume: 'MEDIUM' as const },
        signal: { direction: 'LONG' as const, symbol: 'BTCUSDT', timeframe: '1h', entryPrice: 50000 },
        time: { hour: 14, dayOfWeek: 2, isSessionOverlap: true },
      };
      const ranging = {
        indicators: { rsi: 45, macd: 100, macdSignal: 90, volumeRatio: 1.5 },
        context: { trend: 'RANGING' as const, volatility: 'MEDIUM' as const, volume: 'MEDIUM' as const },
        signal: { direction: 'LONG' as const, symbol: 'BTCUSDT', timeframe: '1h', entryPrice: 50000 },
        time: { hour: 14, dayOfWeek: 2, isSessionOverlap: true },
      };
      const r1 = await classifier.evaluate(trending);
      const r2 = await classifier.evaluate(ranging);
      expect(r1.scores.context).toBeGreaterThan(r2.scores.context);
    });
  });

  describe('Confidence Calculation', () => {
    it('should have high confidence when scores agree', async () => {
      const features = {
        indicators: { rsi: 30, macd: 100, macdSignal: 90, volumeRatio: 2.0 },
        context: { trend: 'TRENDING_UP' as const, volatility: 'MEDIUM' as const, volume: 'HIGH' as const },
        signal: { direction: 'LONG' as const, symbol: 'BTCUSDT', timeframe: '1h', entryPrice: 50000 },
        time: { hour: 14, dayOfWeek: 2, isSessionOverlap: true },
      };
      const result = await classifier.evaluate(features);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should have low confidence when scores disagree', async () => {
      const features = {
        indicators: { rsi: 50, macd: 0, macdSignal: 0, volumeRatio: 1.0 },
        context: { trend: 'RANGING' as const, volatility: 'LOW' as const, volume: 'LOW' as const },
        signal: { direction: 'LONG' as const, symbol: 'BTCUSDT', timeframe: '1h', entryPrice: 50000 },
        time: { hour: 3, dayOfWeek: 0, isSessionOverlap: false },
      };
      const result = await classifier.evaluate(features);
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('Stats and Training', () => {
    it('should return correct stats before training', () => {
      const stats = classifier.getStats();
      expect(stats.totalTrades).toBe(0);
      expect(stats.isTrained).toBe(false);
      expect(stats.avgWinRate).toBe(0);
    });

    it('should update stats after training', async () => {
      await classifier.train('BTCUSDT', 7);
      const stats = classifier.getStats();
      expect(stats.isTrained).toBeDefined();
    });
  });
});
