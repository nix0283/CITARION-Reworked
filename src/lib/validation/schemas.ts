/**
 * Zod validation schemas for API endpoints
 * Centralized validation logic for all API requests
 */

import { z } from 'zod';

// ==================== COMMON SCHEMAS ====================

export const SymbolSchema = z.string()
  .regex(/^[A-Z0-9]+\/?[A-Z0-9]+$/, 'Invalid symbol format. Use BTCUSDT or BTC/USDT')
  .transform(val => val.replace('/', ''));

export const DirectionSchema = z.enum(['LONG', 'SHORT']);

export const MarketTypeSchema = z.enum(['spot', 'futures', 'inverse']).default('futures');

export const OrderTypeSchema = z.enum(['market', 'limit']).default('market');

export const TradingModeSchema = z.enum(['LIVE', 'TESTNET', 'DEMO']).default('DEMO');

// ==================== TRADE REQUEST ====================

export const TradeRequestSchema = z.object({
  symbol: SymbolSchema,
  direction: DirectionSchema,
  amount: z.number()
    .positive('Amount must be greater than 0')
    .finite('Amount must be a finite number'),
  leverage: z.number()
    .int('Leverage must be an integer')
    .min(1, 'Leverage must be at least 1')
    .max(125, 'Leverage cannot exceed 125x'),
  stopLoss: z.number().nullable().optional(),
  takeProfit: z.number().nullable().optional(),
  isDemo: z.boolean().default(true),
  accountId: z.string().cuid().optional(),
  exchangeId: z.string().optional(),
  orderType: OrderTypeSchema,
  price: z.number().positive().optional(),
  clientOrderId: z.string().max(64).optional(),
  tradingMode: TradingModeSchema,
}).refine(
  (data) => {
    // If limit order, price is required
    if (data.orderType === 'limit' && !data.price) {
      return false;
    }
    return true;
  },
  { message: 'Price is required for limit orders', path: ['price'] }
);

export type TradeRequest = z.infer<typeof TradeRequestSchema>;

// ==================== POSITION REQUEST ====================

export const ClosePositionRequestSchema = z.object({
  positionId: z.string().cuid('Invalid position ID'),
  symbol: SymbolSchema.optional(),
  amount: z.number().positive().optional(), // Partial close
});

export type ClosePositionRequest = z.infer<typeof ClosePositionRequestSchema>;

// ==================== BOT CONFIG REQUEST ====================

export const BotConfigRequestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  exchangeId: z.string().min(1),
  exchangeType: MarketTypeSchema,
  tradeAmount: z.number().positive(),
  amountType: z.enum(['FIXED', 'PERCENTAGE']).default('FIXED'),
  leverage: z.number().int().min(1).max(125).default(1),
  stopLossEnabled: z.boolean().default(true),
  defaultStopLoss: z.number().min(0).max(100).optional(),
  takeProfitEnabled: z.boolean().default(true),
  trailingEnabled: z.boolean().default(false),
  trailingValue: z.number().min(0).max(100).optional(),
  isActive: z.boolean().default(false),
  
  // === POSITION SIZING ===
  positionSizingMode: z.enum(['FIXED', 'PERCENTAGE', 'RISK_BASED']).default('FIXED'),
  riskPerTrade: z.number().min(0.1).max(10).optional(),
  maxPositionSize: z.number().positive().optional(),
  minPositionSize: z.number().positive().default(10),
  
  // === EXECUTION FILTERS ===
  executionFilters: z.object({
    minVolume24h: z.number().positive().optional(),
    minPriceChange24h: z.number().optional(),
    maxPriceChange24h: z.number().optional(),
    minAtrPercent: z.number().positive().optional(),
    maxAtrPercent: z.number().positive().optional(),
    tradingHours: z.object({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
      timezone: z.string().default('UTC'),
    }).optional(),
    maxCorrelatedPositions: z.number().int().positive().optional(),
    allowInHighVolatility: z.boolean().default(true),
    allowInLowVolatility: z.boolean().default(true),
  }).optional(),
  
  // === CONFIRMATION WEBHOOK ===
  confirmationWebhook: z.object({
    url: z.string().url(),
    method: z.enum(['POST', 'GET']).default('POST'),
    headers: z.record(z.string()).optional(),
    timeout: z.number().int().positive().default(30),
    retryCount: z.number().int().min(0).max(10).default(3),
  }).optional(),
  
  // === SIGNAL SCORING ===
  minSignalScore: z.number().min(0).max(1).default(0.5),
  scoreWeights: z.object({
    confidence: z.number().min(0).default(1),
    rr_ratio: z.number().min(0).default(1),
    volume: z.number().min(0).default(0.5),
    volatility: z.number().min(0).default(0.5),
    trend: z.number().min(0).default(0.5),
    source_reliability: z.number().min(0).default(1),
  }).optional(),
  
  // === MULTI-EXCHANGE EXECUTION ===
  executionStrategy: z.object({
    primaryExchange: z.string().min(1),
    fallbackExchanges: z.array(z.string()).optional(),
    fallbackOn: z.enum(['ERROR', 'RATE_LIMIT', 'INSUFFICIENT_BALANCE', 'ANY']).default('ERROR'),
    maxAttempts: z.number().int().min(1).max(5).default(3),
    retryDelayMs: z.number().int().min(100).max(10000).default(1000),
  }).optional(),
  
  // === DEDUPLICATION ===
  deduplication: z.object({
    enabled: z.boolean().default(true),
    timeWindow: z.number().int().positive().default(300),
    matchFields: z.array(z.enum(['symbol', 'direction', 'entry', 'sl', 'tp'])).default(['symbol', 'direction']),
    fuzzyMatch: z.object({
      entryTolerance: z.number().min(0).max(1).default(0.01),
      slTolerance: z.number().min(0).max(1).default(0.02),
      tpTolerance: z.number().min(0).max(1).default(0.02),
    }).optional(),
  }).optional(),
  
  // === PAPER TRADE FIRST ===
  paperTradeFirst: z.boolean().default(false),
  paperTradeDuration: z.number().int().positive().default(60),
  paperTradeThreshold: z.object({
    minWinRate: z.number().min(0).max(1).optional(),
    minProfitFactor: z.number().positive().optional(),
    maxDrawdown: z.number().min(0).max(1).optional(),
  }).optional(),
  
  // === SOURCE REPUTATION ===
  reputationThreshold: z.number().min(0).max(1).default(0.6),
  trackSourcePerformance: z.boolean().default(true),
  
  // === ADAPTIVE RISK MANAGEMENT ===
  adaptiveRiskMgmt: z.object({
    enabled: z.boolean().default(false),
    volatilityMultiplier: z.number().min(0.5).max(3).default(1),
    timeDecay: z.object({
      enabled: z.boolean().default(true),
      slTighteningAfter: z.number().int().positive().default(30),
      tighteningRate: z.number().min(0).max(0.1).default(0.01),
    }).optional(),
  }).optional(),
  
  // === SIGNAL CHAINING ===
  signalChaining: z.object({
    parentId: z.string().optional(),
    condition: z.enum(['TP_HIT', 'SL_HIT', 'TIMEOUT', 'MANUAL']).optional(),
    delay: z.number().int().positive().optional(),
  }).optional(),
});

export type BotConfigRequest = z.infer<typeof BotConfigRequestSchema>;

// ==================== SIGNAL REQUEST ====================

export const SignalRequestSchema = z.object({
  symbol: SymbolSchema,
  direction: DirectionSchema,
  action: z.enum(['BUY', 'SELL', 'CLOSE']),
  marketType: MarketTypeSchema,
  entryPrices: z.array(z.number().positive()).optional(),
  entryZone: z.object({
    min: z.number(),
    max: z.number(),
  }).optional(),
  takeProfits: z.array(z.object({
    price: z.number().positive(),
    percentage: z.number().min(0).max(100),
  })).optional(),
  stopLoss: z.number().positive().optional(),
  leverage: z.number().int().min(1).max(125).default(1),
  source: z.enum(['TELEGRAM', 'DISCORD', 'TRADINGVIEW', 'MANUAL', 'APP']),
  sourceChannel: z.string().optional(),
  sourceMessage: z.string().optional(),
});

export type SignalRequest = z.infer<typeof SignalRequestSchema>;

// ==================== EXCHANGE CONNECTION ====================

export const ExchangeConnectRequestSchema = z.object({
  exchangeId: z.string().min(1, 'Exchange ID is required'),
  exchangeType: MarketTypeSchema,
  apiKey: z.string().min(1, 'API Key is required'),
  apiSecret: z.string().min(1, 'API Secret is required'),
  apiPassphrase: z.string().optional(),
  apiUid: z.string().optional(),
  isTestnet: z.boolean().default(false),
  subAccount: z.string().optional(),
});

export type ExchangeConnectRequest = z.infer<typeof ExchangeConnectRequestSchema>;

// ==================== TRADINGVIEW WEBHOOK ====================

export const TradingViewWebhookSchema = z.object({
  symbol: SymbolSchema,
  action: z.enum(['buy', 'sell', 'close']).transform(val => val.toUpperCase()),
  direction: DirectionSchema.optional(),
  price: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  takeProfits: z.string().optional(), // JSON string of array
  leverage: z.number().int().min(1).max(125).default(1),
  secret: z.string().optional(), // For signature validation
  timestamp: z.number().optional(), // For replay attack prevention
});

export type TradingViewWebhookPayload = z.infer<typeof TradingViewWebhookSchema>;

// ==================== UTILITY FUNCTIONS ====================

/**
 * Validate and parse request body with Zod
 * Returns either the validated data or an error response
 */
export function validateRequest<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: string; details?: any } {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    return {
      success: false,
      error: 'Validation failed',
      details: result.error.flatten(),
    };
  }
  
  return { success: true, data: result.data };
}

/**
 * Create API error response for validation failures
 */
export function validationErrorResponse(details: any) {
  return {
    error: 'Validation failed',
    details,
    timestamp: new Date().toISOString(),
  };
}
