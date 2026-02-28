/**
 * Bot Filters Unit Tests
 * 
 * @module __tests__/bot-filters.test.ts
 */

import { BBSignalFilter, getBBSignalFilter } from '@/lib/bot-filters/bb-signal-filter';
import { DCAEntryFilter, getDCAEntryFilter } from '@/lib/bot-filters/dca-entry-filter';
import { VISIONSignalFilter, getVISIONSignalFilter } from '@/lib/bot-filters/vision-signal-filter';

describe('Bot Filters', () => {
  describe('BBSignalFilter', () => {
    let filter: BBSignalFilter;

    beforeEach(() => {
      filter = getBBSignalFilter('BTCUSDT', 0.65);
    });

    it('should create filter with default config', () => {
      expect(filter).toBeDefined();
    });

    it('should determine signal type correctly', async () => {
      // Mock the classifier to avoid database calls
      (filter as any).classifier.evaluate = jest.fn().mockResolvedValue({
        probability: 0.7,
        prediction: 'WIN',
        confidence: 0.8,
        scores: { indicator: 0.7, context: 0.6, history: 0.5, time: 0.6 },
        reasons: [],
      });

      // Breakout with volume confirmation
      const breakoutSignal = {
        symbol: 'BTCUSDT',
        direction: 'SHORT' as const,
        timeframe: '1h',
        currentPrice: 51000,
        bbUpper: 50000,
        bbMiddle: 49000,
        bbLower: 48000,
        bbWidth: 0.04,
        bbPosition: 1.05, // Above upper band
        rsi: 75,
        macd: 150,
        macdSignal: 140,
        adx: 30,
        volume: 2000,
        volumeRatio: 1.8, // High volume confirms
        trend: 'RANGING' as const,
        volatility: 'MEDIUM' as const,
        timestamp: new Date(),
      };

      const result = await filter.evaluate(breakoutSignal);
      expect(result).toBeDefined();
      expect(result.signalType).toBe('BREAKOUT');
    });

    it('should detect fake breakout (low volume)', async () => {
      (filter as any).classifier.evaluate = jest.fn().mockResolvedValue({
        probability: 0.7,
        prediction: 'WIN',
        confidence: 0.8,
        scores: { indicator: 0.7, context: 0.6, history: 0.5, time: 0.6 },
        reasons: [],
      });

      const fakeBreakoutSignal = {
        symbol: 'BTCUSDT',
        direction: 'SHORT' as const,
        timeframe: '1h',
        currentPrice: 51000,
        bbUpper: 50000,
        bbMiddle: 49000,
        bbLower: 48000,
        bbWidth: 0.04,
        bbPosition: 1.05,
        rsi: 75,
        macd: 150,
        macdSignal: 140,
        adx: 30,
        volume: 500,
        volumeRatio: 0.5, // Low volume - likely fake
        trend: 'RANGING' as const,
        volatility: 'MEDIUM' as const,
        timestamp: new Date(),
      };

      const result = await filter.evaluate(fakeBreakoutSignal);
      expect(result.signalType).toBe('REVERSAL'); // Low volume breakout = reversal
    });

    it('should detect strong reversal setup', async () => {
      (filter as any).classifier.evaluate = jest.fn().mockResolvedValue({
        probability: 0.7,
        prediction: 'WIN',
        confidence: 0.8,
        scores: { indicator: 0.7, context: 0.6, history: 0.5, time: 0.6 },
        reasons: [],
      });

      const reversalSignal = {
        symbol: 'BTCUSDT',
        direction: 'LONG' as const,
        timeframe: '1h',
        currentPrice: 48000,
        bbUpper: 50000,
        bbMiddle: 49000,
        bbLower: 48000,
        bbWidth: 0.04,
        bbPosition: 0.05, // Near lower band
        rsi: 25, // Oversold
        macd: -150,
        macdSignal: -140,
        adx: 20,
        volume: 1500,
        volumeRatio: 1.5,
        trend: 'RANGING' as const,
        volatility: 'MEDIUM' as const,
        timestamp: new Date(),
      };

      const result = await filter.evaluate(reversalSignal);
      expect(result.signalType).toBe('REVERSAL');
    });
  });

  describe('DCAEntryFilter', () => {
    let filter: DCAEntryFilter;

    beforeEach(() => {
      filter = getDCAEntryFilter('ETHUSDT');
    });

    it('should create filter with default config', () => {
      expect(filter).toBeDefined();
    });

    it('should give EXCELLENT rating for oversold RSI + big drop', async () => {
      (filter as any).classifier.evaluate = jest.fn().mockResolvedValue({
        probability: 0.65,
        prediction: 'WIN',
        confidence: 0.75,
        scores: { indicator: 0.7, context: 0.6, history: 0.5, time: 0.6 },
        reasons: [],
      });

      const excellentSignal = {
        symbol: 'ETHUSDT',
        direction: 'LONG' as const,
        timeframe: '1h',
        currentPrice: 2800,
        rsi: 25, // Very oversold
        macd: -100,
        macdSignal: -90,
        ema20: 3000,
        ema50: 3100,
        atr: 80,
        volume: 5000,
        volumeRatio: 2.0,
        priceChange1h: -0.03,
        priceChange4h: -0.08,
        priceChange24h: -0.15, // -15% drop
        distanceFromHigh24h: 0.18, // 18% from high
        trend: 'TRENDING_DOWN' as const,
        volatility: 'HIGH' as const,
        timestamp: new Date(),
      };

      const result = await filter.evaluate(excellentSignal);
      expect(result.entryQuality).toBe('EXCELLENT');
      expect(result.recommendedAction).toBe('START_DCA');
    });

    it('should calculate ATR-based position size', async () => {
      (filter as any).classifier.evaluate = jest.fn().mockResolvedValue({
        probability: 0.65,
        prediction: 'WIN',
        confidence: 0.75,
        scores: { indicator: 0.7, context: 0.6, history: 0.5, time: 0.6 },
        reasons: [],
      });

      const signal = {
        symbol: 'ETHUSDT',
        direction: 'LONG' as const,
        timeframe: '1h',
        currentPrice: 3000,
        rsi: 35,
        macd: -50,
        macdSignal: -45,
        ema20: 3050,
        ema50: 3100,
        atr: 150, // High ATR (5% of price)
        volume: 3000,
        volumeRatio: 1.2,
        priceChange1h: -0.02,
        priceChange4h: -0.05,
        priceChange24h: -0.08,
        distanceFromHigh24h: 0.10,
        trend: 'TRENDING_DOWN' as const,
        volatility: 'HIGH' as const,
        timestamp: new Date(),
      };

      const result = await filter.evaluate(signal);
      expect(result.atrPositionSize).toBeDefined();
      expect(result.atrPositionSize).toBeLessThan(1.0); // High ATR = smaller position
    });

    it('should give POOR rating for overbought RSI', async () => {
      (filter as any).classifier.evaluate = jest.fn().mockResolvedValue({
        probability: 0.45,
        prediction: 'LOSS',
        confidence: 0.6,
        scores: { indicator: 0.4, context: 0.5, history: 0.5, time: 0.5 },
        reasons: [],
      });

      const poorSignal = {
        symbol: 'ETHUSDT',
        direction: 'LONG' as const,
        timeframe: '1h',
        currentPrice: 3200,
        rsi: 75, // Overbought
        macd: 100,
        macdSignal: 90,
        ema20: 3100,
        ema50: 3050,
        atr: 50,
        volume: 2000,
        volumeRatio: 0.8,
        priceChange1h: 0.03,
        priceChange4h: 0.08,
        priceChange24h: 0.12,
        distanceFromHigh24h: 0.02,
        trend: 'TRENDING_UP' as const,
        volatility: 'LOW' as const,
        timestamp: new Date(),
      };

      const result = await filter.evaluate(poorSignal);
      expect(result.entryQuality).toBe('POOR');
      expect(result.recommendedAction).toBe('SKIP');
    });
  });

  describe('VISIONSignalFilter', () => {
    let filter: VISIONSignalFilter;

    beforeEach(() => {
      filter = getVISIONSignalFilter('BTCUSDT');
    });

    it('should create filter with default config', () => {
      expect(filter).toBeDefined();
    });

    it('should use configurable ensemble weights', async () => {
      const customFilter = getVISIONSignalFilter('BTCUSDT', {
        ensembleWeights: {
          lawrence: 0.5,
          mlModel: 0.3,
          forecast: 0.2,
        },
        thresholds: {
          enter: 0.75,
          wait: 0.60,
        },
      });

      expect(customFilter).toBeDefined();
    });

    it('should combine scores correctly', async () => {
      (filter as any).classifier.evaluate = jest.fn().mockResolvedValue({
        probability: 0.7,
        prediction: 'WIN',
        confidence: 0.8,
        scores: { indicator: 0.7, context: 0.6, history: 0.5, time: 0.6 },
        reasons: [],
      });

      const signal = {
        symbol: 'BTCUSDT',
        timeframe: '1h',
        currentPrice: 50000,
        mlPrediction: {
          direction: 'UP' as const,
          confidence: 0.8,
          targetPrice: 52000,
          stopLoss: 48500,
        },
        forecast: {
          direction: 'UPWARD' as const,
          confidence: 0.7,
          upwardProb: 0.65,
          downwardProb: 0.35,
        },
        rsi: 45,
        macd: 100,
        ema20: 49500,
        ema50: 49000,
        atr: 1000,
        volumeRatio: 1.5,
        trend: 'TRENDING_UP' as const,
        volatility: 'MEDIUM' as const,
        correlation: { btc: 1, eth: 0.8 },
        timestamp: new Date(),
      };

      const result = await filter.evaluate(signal);
      expect(result).toBeDefined();
      expect(result.ensembleScore).toBeDefined();
      expect(result.ensembleScore.lawrence).toBeDefined();
      expect(result.ensembleScore.mlModel).toBeDefined();
      expect(result.ensembleScore.forecast).toBeDefined();
      expect(result.ensembleScore.combined).toBeDefined();
    });

    it('should approve high confidence LONG signal', async () => {
      (filter as any).classifier.evaluate = jest.fn().mockResolvedValue({
        probability: 0.8,
        prediction: 'WIN',
        confidence: 0.85,
        scores: { indicator: 0.8, context: 0.7, history: 0.6, time: 0.7 },
        reasons: ['Strong signals'],
      });

      const signal = {
        symbol: 'BTCUSDT',
        timeframe: '1h',
        currentPrice: 50000,
        mlPrediction: {
          direction: 'UP' as const,
          confidence: 0.85,
          targetPrice: 52000,
          stopLoss: 48500,
        },
        forecast: {
          direction: 'UPWARD' as const,
          confidence: 0.8,
          upwardProb: 0.75,
          downwardProb: 0.25,
        },
        rsi: 45,
        macd: 100,
        ema20: 49500,
        ema50: 49000,
        atr: 1000,
        volumeRatio: 1.5,
        trend: 'TRENDING_UP' as const,
        volatility: 'MEDIUM' as const,
        correlation: { btc: 1, eth: 0.8 },
        timestamp: new Date(),
      };

      const result = await filter.evaluate(signal);
      expect(result.approved).toBe(true);
      expect(result.recommendedAction).toBe('ENTER_LONG');
    });
  });
});
