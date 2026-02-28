/**
 * Bot Filters Integration Tests
 * 
 * @module __tests__/integration/bot-filters.integration.test.ts
 */

import { BBSignalFilter } from '@/lib/bot-filters/bb-signal-filter';
import { DCAEntryFilter } from '@/lib/bot-filters/dca-entry-filter';
import { VISIONSignalFilter } from '@/lib/bot-filters/vision-signal-filter';

describe('Bot Filters Integration', () => {
  describe('BB Signal Filter', () => {
    let filter: BBSignalFilter;

    beforeEach(() => {
      filter = new BBSignalFilter('BTCUSDT', 0.65);
      // Mock classifier to avoid DB calls
      (filter as any).classifier.evaluate = jest.fn().mockResolvedValue({
        probability: 0.7, prediction: 'WIN', confidence: 0.8,
        scores: { indicator: 0.7, context: 0.6, history: 0.5, time: 0.6 },
        reasons: [],
      });
    });

    it('should detect breakout with volume confirmation', async () => {
      const signal = {
        symbol: 'BTCUSDT', direction: 'SHORT' as const, timeframe: '1h', currentPrice: 51000,
        bbUpper: 50000, bbMiddle: 49000, bbLower: 48000, bbWidth: 0.04, bbPosition: 1.05,
        rsi: 75, macd: 150, macdSignal: 140, adx: 30, volume: 2000, volumeRatio: 1.8,
        trend: 'RANGING' as const, volatility: 'MEDIUM' as const, timestamp: new Date(),
      };
      const result = await filter.evaluate(signal);
      expect(result.signalType).toBe('BREAKOUT');
    });

    it('should detect fake breakout (low volume)', async () => {
      const signal = {
        symbol: 'BTCUSDT', direction: 'SHORT' as const, timeframe: '1h', currentPrice: 51000,
        bbUpper: 50000, bbMiddle: 49000, bbLower: 48000, bbWidth: 0.04, bbPosition: 1.05,
        rsi: 75, macd: 150, macdSignal: 140, adx: 30, volume: 500, volumeRatio: 0.5,
        trend: 'RANGING' as const, volatility: 'MEDIUM' as const, timestamp: new Date(),
      };
      const result = await filter.evaluate(signal);
      expect(result.signalType).toBe('REVERSAL');
    });

    it('should detect strong reversal setup', async () => {
      const signal = {
        symbol: 'BTCUSDT', direction: 'LONG' as const, timeframe: '1h', currentPrice: 48000,
        bbUpper: 50000, bbMiddle: 49000, bbLower: 48000, bbWidth: 0.04, bbPosition: 0.05,
        rsi: 25, macd: -150, macdSignal: -140, adx: 20, volume: 1500, volumeRatio: 1.5,
        trend: 'RANGING' as const, volatility: 'MEDIUM' as const, timestamp: new Date(),
      };
      const result = await filter.evaluate(signal);
      expect(result.signalType).toBe('REVERSAL');
    });
  });

  describe('DCA Entry Filter', () => {
    let filter: DCAEntryFilter;

    beforeEach(() => {
      filter = new DCAEntryFilter('ETHUSDT');
      (filter as any).classifier.evaluate = jest.fn().mockResolvedValue({
        probability: 0.65, prediction: 'WIN', confidence: 0.75,
        scores: { indicator: 0.7, context: 0.6, history: 0.5, time: 0.6 },
        reasons: [],
      });
    });

    it('should give EXCELLENT rating for oversold + big drop', async () => {
      const signal = {
        symbol: 'ETHUSDT', direction: 'LONG' as const, timeframe: '1h', currentPrice: 2800,
        rsi: 25, macd: -100, macdSignal: -90, ema20: 3000, ema50: 3100, atr: 80,
        volume: 5000, volumeRatio: 2.0, priceChange1h: -0.03, priceChange4h: -0.08,
        priceChange24h: -0.15, distanceFromHigh24h: 0.18,
        trend: 'TRENDING_DOWN' as const, volatility: 'HIGH' as const, timestamp: new Date(),
      };
      const result = await filter.evaluate(signal);
      expect(result.entryQuality).toBe('EXCELLENT');
      expect(result.recommendedAction).toBe('START_DCA');
    });

    it('should calculate ATR-based position size', async () => {
      const signal = {
        symbol: 'ETHUSDT', direction: 'LONG' as const, timeframe: '1h', currentPrice: 3000,
        rsi: 35, macd: -50, macdSignal: -45, ema20: 3050, ema50: 3100, atr: 150,
        volume: 3000, volumeRatio: 1.2, priceChange1h: -0.02, priceChange4h: -0.05,
        priceChange24h: -0.08, distanceFromHigh24h: 0.10,
        trend: 'TRENDING_DOWN' as const, volatility: 'HIGH' as const, timestamp: new Date(),
      };
      const result = await filter.evaluate(signal);
      expect(result.atrPositionSize).toBeDefined();
      expect(result.atrPositionSize).toBeLessThan(1.0);
    });

    it('should give POOR rating for overbought RSI', async () => {
      const signal = {
        symbol: 'ETHUSDT', direction: 'LONG' as const, timeframe: '1h', currentPrice: 3200,
        rsi: 75, macd: 100, macdSignal: 90, ema20: 3100, ema50: 3050, atr: 50,
        volume: 2000, volumeRatio: 0.8, priceChange1h: 0.03, priceChange4h: 0.08,
        priceChange24h: 0.12, distanceFromHigh24h: 0.02,
        trend: 'TRENDING_UP' as const, volatility: 'LOW' as const, timestamp: new Date(),
      };
      const result = await filter.evaluate(signal);
      expect(result.entryQuality).toBe('POOR');
      expect(result.recommendedAction).toBe('SKIP');
    });
  });

  describe('VISION Signal Filter', () => {
    let filter: VISIONSignalFilter;

    beforeEach(() => {
      filter = new VISIONSignalFilter('BTCUSDT');
      (filter as any).classifier.evaluate = jest.fn().mockResolvedValue({
        probability: 0.8, prediction: 'WIN', confidence: 0.85,
        scores: { indicator: 0.8, context: 0.7, history: 0.6, time: 0.7 },
        reasons: ['Strong signals'],
      });
    });

    it('should use configurable ensemble weights', async () => {
      const customFilter = new VISIONSignalFilter('BTCUSDT', {
        ensembleWeights: { lawrence: 0.5, mlModel: 0.3, forecast: 0.2 },
        thresholds: { enter: 0.75, wait: 0.60 },
      });
      expect(customFilter).toBeDefined();
    });

    it('should approve high confidence LONG signal', async () => {
      const signal = {
        symbol: 'BTCUSDT', timeframe: '1h', currentPrice: 50000,
        mlPrediction: { direction: 'UP' as const, confidence: 0.85, targetPrice: 52000, stopLoss: 48500 },
        forecast: { direction: 'UPWARD' as const, confidence: 0.8, upwardProb: 0.75, downwardProb: 0.25 },
        rsi: 45, macd: 100, ema20: 49500, ema50: 49000, atr: 1000, volumeRatio: 1.5,
        trend: 'TRENDING_UP' as const, volatility: 'MEDIUM' as const,
        correlation: { btc: 1, eth: 0.8 }, timestamp: new Date(),
      };
      const result = await filter.evaluate(signal);
      expect(result.approved).toBe(true);
      expect(result.recommendedAction).toBe('ENTER_LONG');
    });

    it('should combine scores correctly', async () => {
      const signal = {
        symbol: 'BTCUSDT', timeframe: '1h', currentPrice: 50000,
        mlPrediction: { direction: 'UP' as const, confidence: 0.8, targetPrice: 52000, stopLoss: 48500 },
        forecast: { direction: 'UPWARD' as const, confidence: 0.7, upwardProb: 0.65, downwardProb: 0.35 },
        rsi: 45, macd: 100, ema20: 49500, ema50: 49000, atr: 1000, volumeRatio: 1.5,
        trend: 'TRENDING_UP' as const, volatility: 'MEDIUM' as const,
        correlation: { btc: 1, eth: 0.8 }, timestamp: new Date(),
      };
      const result = await filter.evaluate(signal);
      expect(result.ensembleScore).toBeDefined();
      expect(result.ensembleScore.lawrence).toBeDefined();
      expect(result.ensembleScore.mlModel).toBeDefined();
      expect(result.ensembleScore.forecast).toBeDefined();
      expect(result.ensembleScore.combined).toBeDefined();
    });
  });
});
