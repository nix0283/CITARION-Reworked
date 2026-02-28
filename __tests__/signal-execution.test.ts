/**
 * Signal Execution Enhancements Tests
 * 
 * Tests for the 10 advanced signal execution features:
 * 1. Risk-based position sizing
 * 2. Smart execution filters
 * 3. Confirmation webhook workflow
 * 4. Signal scoring and prioritization
 * 5. Multi-exchange execution with fallback
 * 6. Signal deduplication and anti-spam
 * 7. Paper trade first mode
 * 8. Source reputation tracking
 * 9. Adaptive SL/TP management
 * 10. Signal chaining and conditional execution
 * 
 * @jest-environment node
 */

import {
  calculatePositionSize,
  shouldExecuteSignal,
  calculateSignalScore,
  executeWithFallback,
  isDuplicateSignal,
  generateSignalHash,
  adjustRiskLevels,
  checkChainCondition,
  type ExecutionConfig,
  type ParsedSignal,
} from '@/lib/signal-execution';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  db: {
    position: {
      findMany: jest.fn(),
    },
    signal: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    sourcePerformance: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ==================== 1. RISK-BASED POSITION SIZING TESTS ====================

describe('calculatePositionSize', () => {
  const baseConfig: ExecutionConfig = {
    positionSizingMode: 'FIXED',
    minPositionSize: 10,
    requiresConfirmation: false,
    minSignalScore: 0.5,
    paperTradeFirst: false,
    paperTradeDuration: 60,
    reputationThreshold: 0.6,
    trackSourcePerformance: true,
  };

  test('FIXED mode returns configured amount', () => {
    const config = { ...baseConfig, positionSizingMode: 'FIXED' as const };
    const signal: Partial<ParsedSignal> = { amountPerTrade: 250 };
    
    const size = calculatePositionSize(config, signal as ParsedSignal, 10000, 67000);
    expect(size).toBe(250);
  });

  test('PERCENTAGE mode calculates based on balance', () => {
    const config = { ...baseConfig, positionSizingMode: 'PERCENTAGE' as const };
    const signal: Partial<ParsedSignal> = { amountPerTrade: 5 }; // 5%
    
    const size = calculatePositionSize(config, signal as ParsedSignal, 10000, 67000);
    expect(size).toBe(500); // 5% of 10000
  });

  test('RISK_BASED mode calculates based on risk and SL distance', () => {
    const config = {
      ...baseConfig,
      positionSizingMode: 'RISK_BASED' as const,
      riskPerTrade: 2, // 2% risk
    };
    const signal: Partial<ParsedSignal> = {
      entryPrices: [67000],
      stopLoss: 65000, // ~3% below entry
    };
    
    const size = calculatePositionSize(config, signal as ParsedSignal, 10000, 67000);
    // Risk: 2% of 10000 = 200 USDT
    // Distance: (67000-65000)/67000 = 2.99%
    // Position: 200 / 0.0299 ≈ 6689 USDT notional, but scaled by price ratio
    expect(size).toBeGreaterThan(100);
    expect(size).toBeLessThan(10000);
  });

  test('applies minPositionSize constraint', () => {
    const config = {
      ...baseConfig,
      positionSizingMode: 'FIXED' as const,
      minPositionSize: 50,
    };
    const signal: Partial<ParsedSignal> = { amountPerTrade: 20 };
    
    const size = calculatePositionSize(config, signal as ParsedSignal, 10000, 67000);
    expect(size).toBe(50); // Clamped to min
  });

  test('applies maxPositionSize constraint', () => {
    const config = {
      ...baseConfig,
      positionSizingMode: 'FIXED' as const,
      maxPositionSize: 500,
    };
    const signal: Partial<ParsedSignal> = { amountPerTrade: 1000 };
    
    const size = calculatePositionSize(config, signal as ParsedSignal, 10000, 67000);
    expect(size).toBe(500); // Clamped to max
  });
});

// ==================== 2. SMART EXECUTION FILTERS TESTS ====================

describe('shouldExecuteSignal', () => {
  const baseConfig: ExecutionConfig = {
    positionSizingMode: 'FIXED',
    minPositionSize: 10,
    requiresConfirmation: false,
    minSignalScore: 0.5,
    paperTradeFirst: false,
    paperTradeDuration: 60,
    reputationThreshold: 0.6,
    trackSourcePerformance: true,
  };

  test('passes when no filters configured', async () => {
    const config = { ...baseConfig };
    const signal: Partial<ParsedSignal> = { symbol: 'BTCUSDT', direction: 'LONG' };
    
    const result = await shouldExecuteSignal(signal as ParsedSignal, config);
    expect(result.shouldExecute).toBe(true);
  });

  test('rejects if volume below threshold', async () => {
    const config = {
      ...baseConfig,
      executionFilters: { minVolume24h: 10_000_000, allowInHighVolatility: true, allowInLowVolatility: true },
    };
    const signal: Partial<ParsedSignal> = { symbol: 'BTCUSDT' };
    const marketData = { volume24h: 5_000_000, priceChange24h: 5, atrPercent: 2 };
    
    const result = await shouldExecuteSignal(signal as ParsedSignal, config, marketData);
    expect(result.shouldExecute).toBe(false);
    expect(result.reason).toBe('VOLUME_TOO_LOW');
  });

  test('rejects if price change too high', async () => {
    const config = {
      ...baseConfig,
      executionFilters: { maxPriceChange24h: 10, allowInHighVolatility: true, allowInLowVolatility: true },
    };
    const signal: Partial<ParsedSignal> = { symbol: 'BTCUSDT' };
    const marketData = { volume24h: 50_000_000, priceChange24h: 25, atrPercent: 2 };
    
    const result = await shouldExecuteSignal(signal as ParsedSignal, config, marketData);
    expect(result.shouldExecute).toBe(false);
    expect(result.reason).toBe('PRICE_CHANGE_TOO_HIGH');
  });

  test('rejects if outside trading hours', async () => {
    const config = {
      ...baseConfig,
      executionFilters: {
        tradingHours: { start: '09:00', end: '17:00', timezone: 'UTC' },
        allowInHighVolatility: true,
        allowInLowVolatility: true,
      },
    };
    const signal: Partial<ParsedSignal> = { symbol: 'BTCUSDT' };
    
    // Mock Date to be outside trading hours
    const originalDate = global.Date;
    global.Date = class extends Date {
      constructor() {
        super();
        return new originalDate('2026-02-24T03:00:00Z'); // 3 AM UTC
      }
    } as any;
    
    const result = await shouldExecuteSignal(signal as ParsedSignal, config);
    
    global.Date = originalDate;
    expect(result.shouldExecute).toBe(false);
    expect(result.reason).toBe('OUTSIDE_TRADING_HOURS');
  });
});

// ==================== 4. SIGNAL SCORING TESTS ====================

describe('calculateSignalScore', () => {
  const baseConfig: ExecutionConfig = {
    positionSizingMode: 'FIXED',
    minPositionSize: 10,
    requiresConfirmation: false,
    minSignalScore: 0.5,
    paperTradeFirst: false,
    paperTradeDuration: 60,
    reputationThreshold: 0.6,
    trackSourcePerformance: true,
  };

  test('calculates score with default weights', () => {
    const config = { ...baseConfig };
    const signal: Partial<ParsedSignal> = {
      confidence: 0.8,
      entryPrices: [67000],
      stopLoss: 65000,
      takeProfits: [{ price: 70000, percentage: 50 }],
    };
    const marketData = { volume24h: 50_000_000, atrPercent: 3, trend: 0.7 };
    
    const score = calculateSignalScore(signal as ParsedSignal, config, marketData);
    
    expect(score.total).toBeGreaterThan(0);
    expect(score.total).toBeLessThanOrEqual(1);
    expect(score.factors.confidence).toBe(0.8);
    expect(score.factors.rr_ratio).toBeGreaterThan(1); // TP further than SL
  });

  test('custom weights affect final score', () => {
    const config = {
      ...baseConfig,
      scoreWeights: { confidence: 2, rr_ratio: 1, volume: 0, volatility: 0, trend: 0, source_reliability: 0 },
    };
    const signal: Partial<ParsedSignal> = { confidence: 0.9 };
    
    const score = calculateSignalScore(signal as ParsedSignal, config);
    
    // With confidence weighted 2x and others 0, score should be close to confidence
    expect(score.total).toBeCloseTo(0.9, 1);
  });
});

// ==================== 5. MULTI-EXCHANGE FALLBACK TESTS ====================

describe('executeWithFallback', () => {
  const baseConfig: ExecutionConfig = {
    positionSizingMode: 'FIXED',
    minPositionSize: 10,
    requiresConfirmation: false,
    minSignalScore: 0.5,
    paperTradeFirst: false,
    paperTradeDuration: 60,
    reputationThreshold: 0.6,
    trackSourcePerformance: true,
  };

  test('succeeds on first exchange', async () => {
    const config = {
      ...baseConfig,
      executionStrategy: {
        primaryExchange: 'binance',
        fallbackExchanges: ['bybit', 'okx'],
        fallbackOn: 'ANY' as const,
        maxAttempts: 3,
        retryDelayMs: 100,
      },
    };
    
    const mockExecutor = jest.fn().mockResolvedValue({ success: true, tradeId: 'test-123' });
    
    const result = await executeWithFallback({} as ParsedSignal, config, mockExecutor);
    
    expect(result.success).toBe(true);
    expect(result.executedOn).toBe('binance');
    expect(mockExecutor).toHaveBeenCalledTimes(1);
    expect(mockExecutor).toHaveBeenCalledWith('binance');
  });

  test('falls back on error when configured', async () => {
    const config = {
      ...baseConfig,
      executionStrategy: {
        primaryExchange: 'binance',
        fallbackExchanges: ['bybit'],
        fallbackOn: 'ERROR' as const,
        maxAttempts: 2,
        retryDelayMs: 10, // Fast for tests
      },
    };
    
    const mockExecutor = jest.fn()
      .mockResolvedValueOnce({ success: false, error: 'Rate limit' })
      .mockResolvedValueOnce({ success: true, tradeId: 'fallback-123' });
    
    const result = await executeWithFallback({} as ParsedSignal, config, mockExecutor);
    
    expect(result.success).toBe(true);
    expect(result.executedOn).toBe('bybit');
    expect(mockExecutor).toHaveBeenCalledTimes(2);
  });

  test('does not fallback on invalid signal errors', async () => {
    const config = {
      ...baseConfig,
      executionStrategy: {
        primaryExchange: 'binance',
        fallbackExchanges: ['bybit'],
        fallbackOn: 'ERROR' as const,
        maxAttempts: 2,
        retryDelayMs: 10,
      },
    };
    
    const mockExecutor = jest.fn()
      .mockResolvedValue({ success: false, error: 'Invalid symbol format' });
    
    const result = await executeWithFallback({} as ParsedSignal, config, mockExecutor);
    
    expect(result.success).toBe(false);
    expect(mockExecutor).toHaveBeenCalledTimes(1); // Should not retry
  });
});

// ==================== 6. DEDUPLICATION TESTS ====================

describe('isDuplicateSignal', () => {
  const baseConfig: ExecutionConfig = {
    positionSizingMode: 'FIXED',
    minPositionSize: 10,
    requiresConfirmation: false,
    minSignalScore: 0.5,
    paperTradeFirst: false,
    paperTradeDuration: 60,
    reputationThreshold: 0.6,
    trackSourcePerformance: true,
  };

  test('returns false when dedup disabled', async () => {
    const config = {
      ...baseConfig,
      deduplication: { enabled: false, timeWindow: 300, matchFields: ['symbol', 'direction'] },
    };
    
    const result = await isDuplicateSignal({} as ParsedSignal, config, 'account-1');
    expect(result.isDuplicate).toBe(false);
  });

  test('detects exact duplicate within time window', async () => {
    const { db } = await import('@/lib/db');
    (db.signal.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'existing-1',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        entryPrices: JSON.stringify([67000]),
        stopLoss: 65000,
        takeProfits: JSON.stringify([{ price: 70000, percentage: 50 }]),
        createdAt: new Date(),
        status: 'ACTIVE',
      },
    ]);
    
    const config = {
      ...baseConfig,
      deduplication: {
        enabled: true,
        timeWindow: 300,
        matchFields: ['symbol', 'direction', 'entry', 'sl', 'tp'],
      },
    };
    
    const signal: Partial<ParsedSignal> = {
      id: 'new-1',
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryPrices: [67000],
      stopLoss: 65000,
      takeProfits: [{ price: 70000, percentage: 50 }],
    };
    
    const result = await isDuplicateSignal(signal as ParsedSignal, config, 'account-1');
    expect(result.isDuplicate).toBe(true);
    expect(result.originalSignalId).toBe('existing-1');
  });

  test('allows fuzzy match within tolerance', async () => {
    const { db } = await import('@/lib/db');
    (db.signal.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'existing-2',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        entryPrices: JSON.stringify([67000]),
        stopLoss: 65000,
        takeProfits: JSON.stringify([{ price: 70000, percentage: 50 }]),
        createdAt: new Date(),
        status: 'ACTIVE',
      },
    ]);
    
    const config = {
      ...baseConfig,
      deduplication: {
        enabled: true,
        timeWindow: 300,
        matchFields: ['symbol', 'direction', 'entry'],
        fuzzyMatch: { entryTolerance: 0.01, slTolerance: 0.02, tpTolerance: 0.02 },
      },
    };
    
    // Entry price differs by 0.5% (within 1% tolerance)
    const signal: Partial<ParsedSignal> = {
      id: 'new-2',
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryPrices: [67335], // 0.5% higher than 67000
    };
    
    const result = await isDuplicateSignal(signal as ParsedSignal, config, 'account-1');
    expect(result.isDuplicate).toBe(true);
  });
});

describe('generateSignalHash', () => {
  test('produces consistent hash for same signal', () => {
    const signal: Partial<ParsedSignal> = {
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryPrices: [67000, 66500],
      stopLoss: 65000,
      takeProfits: [{ price: 70000, percentage: 50 }, { price: 72000, percentage: 50 }],
    };
    
    const hash1 = generateSignalHash(signal as ParsedSignal);
    const hash2 = generateSignalHash(signal as ParsedSignal);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sig_[a-z0-9]+$/);
  });

  test('different signals produce different hashes', () => {
    const signal1: Partial<ParsedSignal> = {
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryPrices: [67000],
    };
    const signal2: Partial<ParsedSignal> = {
      symbol: 'BTCUSDT',
      direction: 'SHORT', // Different direction
      entryPrices: [67000],
    };
    
    const hash1 = generateSignalHash(signal1 as ParsedSignal);
    const hash2 = generateSignalHash(signal2 as ParsedSignal);
    
    expect(hash1).not.toBe(hash2);
  });
});

// ==================== 9. ADAPTIVE RISK MANAGEMENT TESTS ====================

describe('adjustRiskLevels', () => {
  const baseConfig: ExecutionConfig = {
    positionSizingMode: 'FIXED',
    minPositionSize: 10,
    requiresConfirmation: false,
    minSignalScore: 0.5,
    paperTradeFirst: false,
    paperTradeDuration: 60,
    reputationThreshold: 0.6,
    trackSourcePerformance: true,
  };

  test('returns original levels when adaptive disabled', () => {
    const config = { ...baseConfig, adaptiveRiskMgmt: { enabled: false, volatilityMultiplier: 1 } };
    const signal: Partial<ParsedSignal> = {
      entryPrices: [67000],
      stopLoss: 65000,
      takeProfits: [{ price: 70000, percentage: 50 }],
      direction: 'LONG',
    };
    
    const result = adjustRiskLevels(signal as ParsedSignal, config, { atrPercent: 5, currentAtr: 1000 });
    
    expect(result.stopLoss).toBe(65000);
    expect(result.takeProfits).toEqual(signal.takeProfits);
  });

  test('widens SL in high volatility', () => {
    const config = {
      ...baseConfig,
      adaptiveRiskMgmt: { enabled: true, volatilityMultiplier: 1.5 },
    };
    const signal: Partial<ParsedSignal> = {
      entryPrices: [67000],
      stopLoss: 65000, // 2000 below entry
      takeProfits: [{ price: 70000, percentage: 50 }],
      direction: 'LONG',
    };
    
    const result = adjustRiskLevels(signal as ParsedSignal, config, { atrPercent: 5, currentAtr: 1000 });
    
    // SL should be widened: 2000 * 1.5 = 3000 below entry
    expect(result.stopLoss).toBe(64000);
  });

  test('narrows SL in low volatility', () => {
    const config = {
      ...baseConfig,
      adaptiveRiskMgmt: { enabled: true, volatilityMultiplier: 0.7 },
    };
    const signal: Partial<ParsedSignal> = {
      entryPrices: [67000],
      stopLoss: 65000,
      takeProfits: [{ price: 70000, percentage: 50 }],
      direction: 'LONG',
    };
    
    const result = adjustRiskLevels(signal as ParsedSignal, config, { atrPercent: 1, currentAtr: 500 });
    
    // SL should be narrowed: 2000 * 0.7 = 1400 below entry
    expect(result.stopLoss).toBe(65600);
  });
});

// ==================== 10. SIGNAL CHAINING TESTS ====================

describe('checkChainCondition', () => {
  const baseConfig: ExecutionConfig = {
    positionSizingMode: 'FIXED',
    minPositionSize: 10,
    requiresConfirmation: false,
    minSignalScore: 0.5,
    paperTradeFirst: false,
    paperTradeDuration: 60,
    reputationThreshold: 0.6,
    trackSourcePerformance: true,
  };

  test('allows execution when no chaining configured', async () => {
    const config = { ...baseConfig };
    
    const result = await checkChainCondition({} as ParsedSignal, config);
    expect(result.shouldExecute).toBe(true);
  });

  test('blocks execution if parent signal not found', async () => {
    const { db } = await import('@/lib/db');
    (db.signal.findUnique as jest.Mock).mockResolvedValue(null);
    
    const config = {
      ...baseConfig,
      signalChaining: { parentId: 'parent-123', condition: 'TP_HIT' },
    };
    
    const result = await checkChainCondition({} as ParsedSignal, config);
    expect(result.shouldExecute).toBe(false);
    expect(result.reason).toBe('PARENT_SIGNAL_NOT_FOUND');
  });

  test('blocks execution if TP not hit', async () => {
    const { db } = await import('@/lib/db');
    (db.signal.findUnique as jest.Mock).mockResolvedValue({
      id: 'parent-123',
      position: { closeReason: 'MANUAL' }, // Not TP
    });
    
    const config = {
      ...baseConfig,
      signalChaining: { parentId: 'parent-123', condition: 'TP_HIT' },
    };
    
    const result = await checkChainCondition({} as ParsedSignal, config);
    expect(result.shouldExecute).toBe(false);
    expect(result.reason).toBe('TP_NOT_HIT');
  });

  test('allows execution when condition met', async () => {
    const { db } = await import('@/lib/db');
    (db.signal.findUnique as jest.Mock).mockResolvedValue({
      id: 'parent-123',
      position: { closeReason: 'TP' },
      closedAt: new Date(Date.now() - 10000), // 10 seconds ago
    });
    
    const config = {
      ...baseConfig,
      signalChaining: { parentId: 'parent-123', condition: 'TP_HIT', delay: 5 }, // 5 second delay
    };
    
    const result = await checkChainCondition({} as ParsedSignal, config);
    expect(result.shouldExecute).toBe(true);
  });

  test('blocks execution if delay not elapsed', async () => {
    const { db } = await import('@/lib/db');
    (db.signal.findUnique as jest.Mock).mockResolvedValue({
      id: 'parent-123',
      position: { closeReason: 'TP' },
      closedAt: new Date(Date.now() - 2000), // 2 seconds ago
    });
    
    const config = {
      ...baseConfig,
      signalChaining: { parentId: 'parent-123', condition: 'TP_HIT', delay: 10 }, // 10 second delay
    };
    
    const result = await checkChainCondition({} as ParsedSignal, config);
    expect(result.shouldExecute).toBe(false);
    expect(result.reason).toBe('DELAY_NOT_ELAPSED');
  });
});

// ==================== INTEGRATION TEST ====================

describe('executeEnhancedSignal (integration)', () => {
  // This would test the full orchestration
  // For brevity, we test the key integration points
  
  test('rejects signal below minimum score', async () => {
    // Would mock all dependencies and test the full flow
    // Simplified: just verify the score check happens
    const score = calculateSignalScore(
      { confidence: 0.3 } as ParsedSignal,
      {
        positionSizingMode: 'FIXED',
        minPositionSize: 10,
        requiresConfirmation: false,
        minSignalScore: 0.5,
        paperTradeFirst: false,
        paperTradeDuration: 60,
        reputationThreshold: 0.6,
        trackSourcePerformance: true,
      }
    );
    
    expect(score.total).toBeLessThan(0.5);
    // In full integration, this would cause executeEnhancedSignal to return early
  });
});
