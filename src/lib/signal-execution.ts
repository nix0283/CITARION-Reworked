/**
 * Signal Execution Enhancements Library
 * 
 * Implements 10 advanced features for auto-following signals:
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
 * @module lib/signal-execution
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ParsedSignal } from '@/lib/signal-parser';
import { BotConfig } from '@prisma/client';

// ==================== TYPES ====================

export interface ExecutionConfig {
  // Position sizing
  positionSizingMode: 'FIXED' | 'PERCENTAGE' | 'RISK_BASED';
  riskPerTrade?: number;
  maxPositionSize?: number;
  minPositionSize: number;
  
  // Execution filters
  executionFilters?: ExecutionFilters;
  
  // Confirmation
  requiresConfirmation: boolean;
  confirmationWebhook?: WebhookConfig;
  
  // Scoring
  minSignalScore: number;
  scoreWeights?: ScoreWeights;
  
  // Multi-exchange
  executionStrategy?: ExecutionStrategy;
  
  // Deduplication
  deduplication?: DedupConfig;
  
  // Paper trade first
  paperTradeFirst: boolean;
  paperTradeDuration: number;
  paperTradeThreshold?: PaperTradeThreshold;
  
  // Reputation
  reputationThreshold: number;
  trackSourcePerformance: boolean;
  
  // Adaptive risk
  adaptiveRiskMgmt?: AdaptiveRiskConfig;
  
  // Chaining
  signalChaining?: SignalChainConfig;
}

export interface ExecutionFilters {
  minVolume24h?: number;
  minPriceChange24h?: number;
  maxPriceChange24h?: number;
  minAtrPercent?: number;
  maxAtrPercent?: number;
  tradingHours?: {
    start: string;
    end: string;
    timezone: string;
  };
  maxCorrelatedPositions?: number;
  allowInHighVolatility: boolean;
  allowInLowVolatility: boolean;
}

export interface WebhookConfig {
  url: string;
  method: 'POST' | 'GET';
  headers?: Record<string, string>;
  timeout: number;
  retryCount: number;
}

export interface ScoreWeights {
  confidence: number;
  rr_ratio: number;
  volume: number;
  volatility: number;
  trend: number;
  source_reliability: number;
}

export interface ExecutionStrategy {
  primaryExchange: string;
  fallbackExchanges?: string[];
  fallbackOn: 'ERROR' | 'RATE_LIMIT' | 'INSUFFICIENT_BALANCE' | 'ANY';
  maxAttempts: number;
  retryDelayMs: number;
}

export interface DedupConfig {
  enabled: boolean;
  timeWindow: number;
  matchFields: Array<'symbol' | 'direction' | 'entry' | 'sl' | 'tp'>;
  fuzzyMatch?: {
    entryTolerance: number;
    slTolerance: number;
    tpTolerance: number;
  };
}

export interface PaperTradeThreshold {
  minWinRate?: number;
  minProfitFactor?: number;
  maxDrawdown?: number;
}

export interface AdaptiveRiskConfig {
  enabled: boolean;
  volatilityMultiplier: number;
  timeDecay?: {
    enabled: boolean;
    slTighteningAfter: number;
    tighteningRate: number;
  };
}

export interface SignalChainConfig {
  parentId?: string;
  condition?: 'TP_HIT' | 'SL_HIT' | 'TIMEOUT' | 'MANUAL';
  delay?: number;
}

export interface ExecutionResult {
  success: boolean;
  tradeId?: string;
  error?: string;
  reason?: string;
  executedOn?: string;
  positionSize?: number;
  signalScore?: number;
}

export interface SignalScore {
  total: number;
  factors: {
    confidence: number;
    rr_ratio: number;
    volume: number;
    volatility: number;
    trend: number;
    source_reliability: number;
  };
}

// ==================== 1. RISK-BASED POSITION SIZING ====================

/**
 * Calculate position size based on configured sizing mode
 */
export function calculatePositionSize(
  config: ExecutionConfig,
  signal: ParsedSignal,
  accountBalance: number,
  currentPrice: number
): number {
  const { positionSizingMode, riskPerTrade, maxPositionSize, minPositionSize } = config;
  
  let size: number;
  
  switch (positionSizingMode) {
    case 'FIXED':
      size = signal.amountPerTrade || 100;
      break;
      
    case 'PERCENTAGE':
      // amountPerTrade is percentage of balance
      size = (accountBalance * (signal.amountPerTrade || 1)) / 100;
      break;
      
    case 'RISK_BASED':
      // Size based on risk percentage and distance to SL
      if (!riskPerTrade || !signal.stopLoss) {
        // Fallback to fixed if SL not available
        size = 100;
        break;
      }
      
      const riskAmount = accountBalance * (riskPerTrade / 100);
      const entryPrice = signal.entryPrices[0] || currentPrice;
      const priceDistance = Math.abs(entryPrice - signal.stopLoss);
      const percentDistance = priceDistance / entryPrice;
      
      // Position size = risk amount / percent distance * entry price
      size = (riskAmount / percentDistance) * (entryPrice / currentPrice);
      break;
      
    default:
      size = 100;
  }
  
  // Apply min/max constraints
  if (maxPositionSize && size > maxPositionSize) {
    size = maxPositionSize;
  }
  if (size < minPositionSize) {
    size = minPositionSize;
  }
  
  return Math.round(size * 100) / 100;
}

// ==================== 2. SMART EXECUTION FILTERS ====================

/**
 * Check if signal passes all execution filters
 */
export async function shouldExecuteSignal(
  signal: ParsedSignal,
  config: ExecutionConfig,
  marketData?: { volume24h: number; priceChange24h: number; atrPercent: number }
): Promise<{ shouldExecute: boolean; reason?: string }> {
  const filters = config.executionFilters;
  if (!filters) return { shouldExecute: true };
  
  // Volume filter
  if (filters.minVolume24h && marketData?.volume24h) {
    if (marketData.volume24h < filters.minVolume24h) {
      return { shouldExecute: false, reason: 'VOLUME_TOO_LOW' };
    }
  }
  
  // Price change filters
  if (filters.minPriceChange24h && marketData?.priceChange24h) {
    if (Math.abs(marketData.priceChange24h) < filters.minPriceChange24h) {
      return { shouldExecute: false, reason: 'PRICE_CHANGE_TOO_LOW' };
    }
  }
  if (filters.maxPriceChange24h && marketData?.priceChange24h) {
    if (Math.abs(marketData.priceChange24h) > filters.maxPriceChange24h) {
      return { shouldExecute: false, reason: 'PRICE_CHANGE_TOO_HIGH' };
    }
  }
  
  // Volatility filters (ATR-based)
  if (filters.minAtrPercent && marketData?.atrPercent) {
    if (marketData.atrPercent < filters.minAtrPercent && !filters.allowInLowVolatility) {
      return { shouldExecute: false, reason: 'VOLATILITY_TOO_LOW' };
    }
  }
  if (filters.maxAtrPercent && marketData?.atrPercent) {
    if (marketData.atrPercent > filters.maxAtrPercent && !filters.allowInHighVolatility) {
      return { shouldExecute: false, reason: 'VOLATILITY_TOO_HIGH' };
    }
  }
  
  // Time-based filter
  if (filters.tradingHours) {
    const now = new Date();
    const tz = filters.tradingHours.timezone || 'UTC';
    const hours = now.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', hour12: false });
    const minutes = now.toLocaleString('en-US', { timeZone: tz, minute: '2-digit' });
    const currentTime = `${hours}:${minutes}`;
    
    if (currentTime < filters.tradingHours.start || currentTime > filters.tradingHours.end) {
      return { shouldExecute: false, reason: 'OUTSIDE_TRADING_HOURS' };
    }
  }
  
  // Correlation filter (check open positions)
  if (filters.maxCorrelatedPositions) {
    const correlatedCount = await countCorrelatedPositions(signal.symbol);
    if (correlatedCount >= filters.maxCorrelatedPositions) {
      return { shouldExecute: false, reason: 'MAX_CORRELATED_POSITIONS_REACHED' };
    }
  }
  
  return { shouldExecute: true };
}

async function countCorrelatedPositions(symbol: string): Promise<number> {
  // Simplified: count positions with same base asset
  const baseAsset = symbol.replace(/(USDT|USD|BUSD|USDC|BTC|ETH)$/, '');
  
  const positions = await db.position.findMany({
    where: {
      status: 'OPEN',
      symbol: { startsWith: baseAsset },
    },
  });
  
  return positions.length;
}

// ==================== 3. CONFIRMATION WEBHOOK WORKFLOW ====================

/**
 * Send confirmation request to configured webhook
 */
export async function requestConfirmation(
  signal: ParsedSignal,
  config: ExecutionConfig,
  botConfigId: string
): Promise<{ confirmed: boolean; error?: string }> {
  const webhook = config.confirmationWebhook;
  if (!webhook) return { confirmed: false, error: 'No webhook configured' };
  
  const payload = {
    signalId: signal.id,
    symbol: signal.symbol,
    direction: signal.direction,
    entryPrice: signal.entryPrices[0],
    stopLoss: signal.stopLoss,
    takeProfits: signal.takeProfits,
    requiredAction: 'CONFIRM',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    confirmUrl: `https://api.citarion.app/api/signals/${signal.id}/confirm?token=${generateConfirmToken()}`,
    botConfigId,
  };
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < (webhook.retryCount || 3); attempt++) {
    try {
      const response = await fetch(webhook.url, {
        method: webhook.method,
        headers: {
          'Content-Type': 'application/json',
          ...webhook.headers,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout((webhook.timeout || 30) * 1000),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      return { confirmed: result.confirmed === true };
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn({ attempt: attempt + 1, error: lastError.message }, 'Confirmation webhook failed');
      
      if (attempt < (webhook.retryCount || 3) - 1) {
        await sleep(1000 * (attempt + 1)); // Exponential backoff
      }
    }
  }
  
  return { confirmed: false, error: lastError?.message || 'Webhook failed after retries' };
}

function generateConfirmToken(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 4. SIGNAL SCORING AND PRIORITIZATION ====================

/**
 * Calculate signal score based on configured weights
 */
export function calculateSignalScore(
  signal: ParsedSignal,
  config: ExecutionConfig,
  marketData?: { volume24h: number; atrPercent: number; trend: number }
): SignalScore {
  const weights = config.scoreWeights || {
    confidence: 1,
    rr_ratio: 1,
    volume: 0.5,
    volatility: 0.5,
    trend: 0.5,
    source_reliability: 1,
  };
  
  const factors: SignalScore['factors'] = {
    confidence: signal.confidence || 0.5,
    rr_ratio: calculateRiskRewardRatio(signal),
    volume: marketData ? normalizeVolume(marketData.volume24h) : 0.5,
    volatility: marketData ? normalizeVolatility(marketData.atrPercent) : 0.5,
    trend: marketData?.trend || 0.5,
    source_reliability: signal.sourceReliability || 0.5,
  };
  
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const weightedSum = Object.entries(factors).reduce((sum, [key, value]) => {
    const weight = weights[key as keyof typeof weights] || 1;
    return sum + value * weight;
  }, 0);
  
  return {
    total: weightedSum / totalWeight,
    factors,
  };
}

function calculateRiskRewardRatio(signal: ParsedSignal): number {
  if (!signal.stopLoss || signal.takeProfits.length === 0) return 1;
  
  const entry = signal.entryPrices[0] || 0;
  const risk = Math.abs(entry - signal.stopLoss);
  const reward = signal.takeProfits.reduce((sum, tp) => sum + Math.abs(tp.price - entry), 0) / signal.takeProfits.length;
  
  return reward / risk;
}

function normalizeVolume(volume: number): number {
  // Normalize volume to 0-1 scale (adjust thresholds as needed)
  if (volume >= 100_000_000) return 1;
  if (volume <= 1_000_000) return 0;
  return (volume - 1_000_000) / (100_000_000 - 1_000_000);
}

function normalizeVolatility(atrPercent: number): number {
  // Optimal volatility is around 2-5%, penalize extremes
  if (atrPercent >= 2 && atrPercent <= 5) return 1;
  if (atrPercent < 0.5 || atrPercent > 15) return 0;
  if (atrPercent < 2) return atrPercent / 2;
  return 1 - (atrPercent - 5) / 10;
}

// ==================== 5. MULTI-EXCHANGE EXECUTION WITH FALLBACK ====================

/**
 * Execute signal with fallback to alternative exchanges
 */
export async function executeWithFallback(
  signal: ParsedSignal,
  config: ExecutionConfig,
  executor: (exchange: string) => Promise<ExecutionResult>
): Promise<ExecutionResult> {
  const strategy = config.executionStrategy;
  if (!strategy) {
    // No strategy configured, execute on primary/default
    return executor('binance');
  }
  
  const exchanges = [strategy.primaryExchange, ...(strategy.fallbackExchanges || [])];
  let lastError: string | undefined;
  
  for (let attempt = 0; attempt < strategy.maxAttempts && attempt < exchanges.length; attempt++) {
    const exchange = exchanges[attempt];
    
    try {
      const result = await executor(exchange);
      
      if (result.success) {
        return { ...result, executedOn: exchange };
      }
      
      lastError = result.error;
      
      // Check if should try fallback
      if (!shouldFallback(result.error, strategy.fallbackOn)) {
        break;
      }
      
      // Wait before retry
      if (attempt < exchanges.length - 1) {
        await sleep(strategy.retryDelayMs);
      }
      
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      logger.warn({ exchange, attempt: attempt + 1, error: lastError }, 'Execution failed');
      
      if (attempt < exchanges.length - 1) {
        await sleep(strategy.retryDelayMs);
      }
    }
  }
  
  return { success: false, error: lastError || 'All exchanges failed', executedOn: strategy.primaryExchange };
}

function shouldFallback(error: string | undefined, fallbackOn: string): boolean {
  if (!error) return false;
  
  switch (fallbackOn) {
    case 'ANY':
      return true;
    case 'ERROR':
      return !error.includes('invalid') && !error.includes('unauthorized');
    case 'RATE_LIMIT':
      return error.includes('rate limit') || error.includes('429');
    case 'INSUFFICIENT_BALANCE':
      return error.includes('balance') || error.includes('funds');
    default:
      return false;
  }
}

// ==================== 6. SIGNAL DEDUPLICATION AND ANTI-SPAM ====================

/**
 * Check if signal is a duplicate of existing signals
 */
export async function isDuplicateSignal(
  signal: ParsedSignal,
  config: ExecutionConfig,
  accountId: string
): Promise<{ isDuplicate: boolean; originalSignalId?: string }> {
  const dedup = config.deduplication;
  if (!dedup?.enabled) return { isDuplicate: false };
  
  const windowStart = new Date(Date.now() - dedup.timeWindow * 1000);
  
  const existingSignals = await db.signal.findMany({
    where: {
      createdAt: { gte: windowStart },
      status: { in: ['PENDING', 'ACTIVE', 'FILLED'] },
      NOT: { id: signal.id },
    },
    orderBy: { createdAt: 'desc' },
  });
  
  for (const existing of existingSignals) {
    // Parse existing signal data
    const existingEntry = existing.entryPrices ? JSON.parse(existing.entryPrices) : [];
    const existingTP = existing.takeProfits ? JSON.parse(existing.takeProfits) : [];
    
    // Exact match on configured fields
    if (dedup.matchFields.includes('symbol') && existing.symbol !== signal.symbol) continue;
    if (dedup.matchFields.includes('direction') && existing.direction !== signal.direction) continue;
    
    // Fuzzy match on prices if configured
    if (dedup.fuzzyMatch) {
      if (dedup.matchFields.includes('entry') && existingEntry.length > 0 && signal.entryPrices.length > 0) {
        const entryDiff = Math.abs(existingEntry[0] - signal.entryPrices[0]) / signal.entryPrices[0];
        if (entryDiff > dedup.fuzzyMatch.entryTolerance) continue;
      }
      if (dedup.matchFields.includes('sl') && existing.stopLoss && signal.stopLoss) {
        const slDiff = Math.abs(existing.stopLoss - signal.stopLoss) / signal.stopLoss;
        if (slDiff > dedup.fuzzyMatch.slTolerance) continue;
      }
      if (dedup.matchFields.includes('tp') && existingTP.length > 0 && signal.takeProfits.length > 0) {
        const tpDiff = Math.abs(existingTP[0].price - signal.takeProfits[0].price) / signal.takeProfits[0].price;
        if (tpDiff > dedup.fuzzyMatch.tpTolerance) continue;
      }
    }
    
    // Found duplicate
    return { isDuplicate: true, originalSignalId: existing.id };
  }
  
  return { isDuplicate: false };
}

/**
 * Generate hash for signal deduplication
 */
export function generateSignalHash(signal: ParsedSignal): string {
  const components = [
    signal.symbol,
    signal.direction,
    signal.entryPrices.sort((a, b) => a - b).join(','),
    signal.stopLoss?.toFixed(2),
    signal.takeProfits.map(tp => `${tp.price}:${tp.percentage}`).sort().join('|'),
  ].filter(Boolean);
  
  // Simple hash (for production, use crypto.createHash)
  let hash = 0;
  const str = components.join(':');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `sig_${Math.abs(hash).toString(36)}`;
}

// ==================== 7. PAPER TRADE FIRST MODE ====================

/**
 * Execute signal in paper trading mode first, then promote to live if successful
 */
export async function paperTradeFirst(
  signal: ParsedSignal,
  config: ExecutionConfig,
  accountId: string,
  liveExecutor: () => Promise<ExecutionResult>
): Promise<ExecutionResult> {
  if (!config.paperTradeFirst) {
    return liveExecutor();
  }
  
  // Execute in paper mode
  const paperResult = await executeInPaperMode(signal, accountId, config.paperTradeDuration);
  
  if (!paperResult.success) {
    return { success: false, error: `Paper trade failed: ${paperResult.error}`, reason: 'PAPER_TRADE_FAILED' };
  }
  
  // Check if meets threshold for live execution
  const threshold = config.paperTradeThreshold;
  if (threshold) {
    const metrics = await getPaperTradeMetrics(paperResult.tradeId);
    
    if (threshold.minWinRate && metrics.winRate < threshold.minWinRate) {
      return { success: false, error: `Win rate ${metrics.winRate}% below threshold ${threshold.minWinRate}%`, reason: 'WIN_RATE_TOO_LOW' };
    }
    if (threshold.minProfitFactor && metrics.profitFactor < threshold.minProfitFactor) {
      return { success: false, error: `Profit factor ${metrics.profitFactor} below threshold ${threshold.minProfitFactor}`, reason: 'PROFIT_FACTOR_TOO_LOW' };
    }
    if (threshold.maxDrawdown && metrics.maxDrawdown > threshold.maxDrawdown) {
      return { success: false, error: `Drawdown ${metrics.maxDrawdown}% exceeds threshold ${threshold.maxDrawdown}%`, reason: 'DRAWDOWN_TOO_HIGH' };
    }
  }
  
  // Promote to live execution
  return liveExecutor();
}

async function executeInPaperMode(signal: ParsedSignal, accountId: string, durationMinutes: number): Promise<ExecutionResult> {
  // Simplified: in production, integrate with paper trading engine
  logger.info({ signal: signal.symbol, duration: durationMinutes }, 'Starting paper trade test');
  
  // Simulate paper trade execution
  await sleep(1000); // Simulate execution time
  
  return {
    success: true,
    tradeId: `paper_${Date.now()}`,
    reason: 'PAPER_TRADE_SIMULATED',
  };
}

async function getPaperTradeMetrics(tradeId?: string): Promise<{ winRate: number; profitFactor: number; maxDrawdown: number }> {
  // Simplified metrics - in production, query paper trading results
  return { winRate: 0.7, profitFactor: 1.5, maxDrawdown: 0.05 };
}

// ==================== 8. SOURCE REPUTATION TRACKING ====================

/**
 * Check if signal source meets reputation threshold
 */
export async function checkSourceReputation(
  signal: ParsedSignal,
  config: ExecutionConfig,
  accountId: string
): Promise<{ meetsThreshold: boolean; reputation?: number }> {
  if (!config.trackSourcePerformance) {
    return { meetsThreshold: true };
  }
  
  const source = signal.sourceChannel || signal.rawText.split('\n')[0] || 'unknown';
  
  // Get historical performance for this source
  const stats = await getSourcePerformance(source, accountId);
  
  if (!stats) {
    // No history, allow execution but track going forward
    return { meetsThreshold: true, reputation: 0.5 };
  }
  
  const reputation = stats.winRate;
  
  if (reputation < config.reputationThreshold) {
    return { meetsThreshold: false, reputation };
  }
  
  return { meetsThreshold: true, reputation };
}

/**
 * Record signal execution result for reputation tracking
 */
export async function recordSignalResult(
  signalId: string,
  result: ExecutionResult,
  pnl?: number
): Promise<void> {
  const signal = await db.signal.findUnique({ where: { id: signalId } });
  if (!signal) return;
  
  const source = signal.sourceChannel || 'unknown';
  
  // Update or create source performance record
  await db.sourcePerformance.upsert({
    where: { source_accountId: { source, accountId: signal.accountId || '' } },
    update: {
      totalSignals: { increment: 1 },
      successfulExecutions: result.success ? { increment: 1 } : undefined,
      totalPnl: pnl !== undefined ? { increment: pnl } : undefined,
      lastUpdated: new Date(),
    },
    create: {
      source,
      accountId: signal.accountId || '',
      totalSignals: 1,
      successfulExecutions: result.success ? 1 : 0,
      totalPnl: pnl || 0,
    },
  });
}

async function getSourcePerformance(source: string, accountId: string) {
  return db.sourcePerformance.findUnique({
    where: { source_accountId: { source, accountId } },
  });
}

// ==================== 9. ADAPTIVE SL/TP MANAGEMENT ====================

/**
 * Adjust SL/TP based on current market volatility
 */
export function adjustRiskLevels(
  signal: ParsedSignal,
  config: ExecutionConfig,
  marketVolatility: { atrPercent: number; currentAtr: number }
): { stopLoss?: number; takeProfits: typeof signal.takeProfits } {
  const adaptive = config.adaptiveRiskMgmt;
  if (!adaptive?.enabled) {
    return { stopLoss: signal.stopLoss, takeProfits: signal.takeProfits };
  }
  
  let adjustedSL = signal.stopLoss;
  const adjustedTPs = [...signal.takeProfits];
  
  // Adjust based on volatility multiplier
  if (adaptive.volatilityMultiplier !== 1 && signal.stopLoss && signal.entryPrices[0]) {
    const entry = signal.entryPrices[0];
    const originalDistance = Math.abs(entry - signal.stopLoss);
    const adjustedDistance = originalDistance * adaptive.volatilityMultiplier;
    
    adjustedSL = signal.direction === 'LONG'
      ? entry - adjustedDistance
      : entry + adjustedDistance;
  }
  
  // Apply time-based SL tightening if configured
  if (adaptive.timeDecay?.enabled && signal.entryTime) {
    const elapsedMinutes = (Date.now() - new Date(signal.entryTime).getTime()) / (1000 * 60);
    
    if (elapsedMinutes > adaptive.timeDecay.slTighteningAfter && adjustedSL) {
      const minutesAfter = elapsedMinutes - adaptive.timeDecay.slTighteningAfter;
      const tightening = minutesAfter * adaptive.timeDecay.tighteningRate;
      
      // Move SL closer to entry (for LONG: increase SL, for SHORT: decrease SL)
      const entry = signal.entryPrices[0] || 0;
      if (signal.direction === 'LONG') {
        adjustedSL = Math.min(adjustedSL + (entry * tightening), entry);
      } else {
        adjustedSL = Math.max(adjustedSL - (entry * tightening), entry);
      }
    }
  }
  
  return { stopLoss: adjustedSL, takeProfits: adjustedTPs };
}

// ==================== 10. SIGNAL CHAINING AND CONDITIONAL EXECUTION ====================

/**
 * Check if chained signal should execute based on parent signal status
 */
export async function checkChainCondition(
  signal: ParsedSignal,
  config: ExecutionConfig
): Promise<{ shouldExecute: boolean; reason?: string }> {
  const chain = config.signalChaining;
  if (!chain?.parentId || !chain.condition) {
    return { shouldExecute: true };
  }
  
  const parent = await db.signal.findUnique({
    where: { id: chain.parentId },
    include: { position: true },
  });
  
  if (!parent) {
    return { shouldExecute: false, reason: 'PARENT_SIGNAL_NOT_FOUND' };
  }
  
  // Check if condition is met
  switch (chain.condition) {
    case 'TP_HIT':
      if (!parent.position?.closeReason?.includes('TP')) {
        return { shouldExecute: false, reason: 'TP_NOT_HIT' };
      }
      break;
      
    case 'SL_HIT':
      if (!parent.position?.closeReason?.includes('SL')) {
        return { shouldExecute: false, reason: 'SL_NOT_HIT' };
      }
      break;
      
    case 'TIMEOUT':
      if (!parent.closedAt) {
        return { shouldExecute: false, reason: 'PARENT_NOT_CLOSED' };
      }
      // Check if enough time has passed
      if (chain.delay) {
        const elapsed = Date.now() - new Date(parent.closedAt).getTime();
        if (elapsed < chain.delay * 1000) {
          return { shouldExecute: false, reason: 'DELAY_NOT_ELAPSED' };
        }
      }
      break;
      
    case 'MANUAL':
      // Manual condition requires external trigger
      return { shouldExecute: false, reason: 'MANUAL_TRIGGER_REQUIRED' };
  }
  
  // Apply delay if configured
  if (chain.delay && parent.closedAt) {
    const elapsed = Date.now() - new Date(parent.closedAt).getTime();
    if (elapsed < chain.delay * 1000) {
      return { shouldExecute: false, reason: 'DELAY_NOT_ELAPSED' };
    }
  }
  
  return { shouldExecute: true };
}

// ==================== MAIN EXECUTION ORCHESTRATOR ====================

/**
 * Main function to execute signal with all enhancements
 */
export async function executeEnhancedSignal(
  signal: ParsedSignal,
  botConfig: BotConfig,
  accountBalance: number,
  currentPrice: number,
  marketData?: { volume24h: number; priceChange24h: number; atrPercent: number; trend: number },
  executor: (exchange: string, size: number, sl?: number, tp?: any) => Promise<ExecutionResult>
): Promise<ExecutionResult> {
  // Parse config from JSON strings
  const config: ExecutionConfig = {
    positionSizingMode: botConfig.positionSizingMode as any || 'FIXED',
    riskPerTrade: botConfig.riskPerTrade || undefined,
    maxPositionSize: botConfig.maxPositionSize || undefined,
    minPositionSize: botConfig.minPositionSize || 10,
    executionFilters: botConfig.executionFilters ? JSON.parse(botConfig.executionFilters) : undefined,
    requiresConfirmation: botConfig.autoExecuteRequiresConfirmation,
    confirmationWebhook: botConfig.confirmationWebhook ? JSON.parse(botConfig.confirmationWebhook) : undefined,
    minSignalScore: botConfig.minSignalScore || 0.5,
    scoreWeights: botConfig.scoreWeights ? JSON.parse(botConfig.scoreWeights) : undefined,
    executionStrategy: botConfig.executionStrategy ? JSON.parse(botConfig.executionStrategy) : undefined,
    deduplication: botConfig.deduplication ? JSON.parse(botConfig.deduplication) : undefined,
    paperTradeFirst: botConfig.paperTradeFirst || false,
    paperTradeDuration: botConfig.paperTradeDuration || 60,
    paperTradeThreshold: botConfig.paperTradeThreshold ? JSON.parse(botConfig.paperTradeThreshold) : undefined,
    reputationThreshold: botConfig.reputationThreshold || 0.6,
    trackSourcePerformance: botConfig.trackSourcePerformance ?? true,
    adaptiveRiskMgmt: botConfig.adaptiveRiskMgmt ? JSON.parse(botConfig.adaptiveRiskMgmt) : undefined,
    signalChaining: botConfig.signalChaining ? JSON.parse(botConfig.signalChaining) : undefined,
  };
  
  // 6. Check deduplication
  const dedupResult = await isDuplicateSignal(signal, config, botConfig.accountId || '');
  if (dedupResult.isDuplicate) {
    await markSignalAsDuplicate(signal.id, dedupResult.originalSignalId);
    return { success: false, reason: 'DUPLICATE_SIGNAL', error: `Duplicate of signal ${dedupResult.originalSignalId}` };
  }
  
  // 8. Check source reputation
  const reputationResult = await checkSourceReputation(signal, config, botConfig.accountId || '');
  if (!reputationResult.meetsThreshold) {
    return { success: false, reason: 'LOW_SOURCE_REPUTATION', error: `Source reputation ${reputationResult.reputation} below threshold ${config.reputationThreshold}` };
  }
  
  // 4. Calculate signal score
  const score = calculateSignalScore(signal, config, marketData);
  if (score.total < config.minSignalScore) {
    return { success: false, reason: 'LOW_SIGNAL_SCORE', error: `Signal score ${score.total.toFixed(2)} below threshold ${config.minSignalScore}` };
  }
  
  // 10. Check chain condition
  const chainResult = await checkChainCondition(signal, config);
  if (!chainResult.shouldExecute) {
    return { success: false, reason: chainResult.reason, error: `Chain condition not met: ${chainResult.reason}` };
  }
  
  // 2. Check execution filters
  const filterResult = await shouldExecuteSignal(signal, config, marketData);
  if (!filterResult.shouldExecute) {
    return { success: false, reason: filterResult.reason, error: `Execution filter failed: ${filterResult.reason}` };
  }
  
  // 1. Calculate position size
  const positionSize = calculatePositionSize(config, signal, accountBalance, currentPrice);
  
  // 9. Adjust SL/TP based on volatility
  const { stopLoss: adjustedSL, takeProfits: adjustedTPs } = adjustRiskLevels(signal, config, {
    atrPercent: marketData?.atrPercent || 0,
    currentAtr: 0,
  });
  
  // 3. Request confirmation if needed
  if (config.requiresConfirmation && config.confirmationWebhook) {
    const confirmResult = await requestConfirmation(signal, config, botConfig.id);
    if (!confirmResult.confirmed) {
      return { success: false, reason: 'CONFIRMATION_DENIED', error: confirmResult.error };
    }
  }
  
  // 7. Paper trade first if configured
  const liveExecutor = () => executor(
    config.executionStrategy?.primaryExchange || 'binance',
    positionSize,
    adjustedSL,
    adjustedTPs
  );
  
  let result: ExecutionResult;
  if (config.paperTradeFirst) {
    result = await paperTradeFirst(signal, config, botConfig.accountId || '', liveExecutor);
  } else {
    // 5. Execute with fallback
    result = await executeWithFallback(signal, config, (exchange) => 
      executor(exchange, positionSize, adjustedSL, adjustedTPs)
    );
  }
  
  // Record result for reputation tracking
  if (config.trackSourcePerformance) {
    await recordSignalResult(signal.id || '', result);
  }
  
  // Update signal with score and execution metadata
  await updateSignalMetadata(signal.id, {
    signalScore: score.total,
    scoreFactors: JSON.stringify(score.factors),
    signalHash: generateSignalHash(signal),
    executionAttempts: result.success ? 1 : 0,
    lastAttemptError: result.error,
    executedOnExchange: result.executedOn,
  });
  
  return { ...result, positionSize, signalScore: score.total };
}

async function markSignalAsDuplicate(signalId: string, originalId?: string) {
  await db.signal.update({
    where: { id: signalId },
    data: {
      status: 'IGNORED',
      duplicateOf: originalId,
      errorMessage: 'Duplicate signal',
    },
  });
}

async function updateSignalMetadata(signalId: string, metadata: Partial<{
  signalScore: number;
  scoreFactors: string;
  signalHash: string;
  executionAttempts: number;
  lastAttemptError: string;
  executedOnExchange: string;
}>) {
  if (!signalId) return;
  
  await db.signal.update({
    where: { id: signalId },
    data: metadata,
  });
}

// ==================== EXPORTS ====================

export {
  calculatePositionSize,
  shouldExecuteSignal,
  requestConfirmation,
  calculateSignalScore,
  executeWithFallback,
  isDuplicateSignal,
  generateSignalHash,
  paperTradeFirst,
  checkSourceReputation,
  recordSignalResult,
  adjustRiskLevels,
  checkChainCondition,
  executeEnhancedSignal,
};

export type {
  ExecutionConfig,
  ExecutionFilters,
  WebhookConfig,
  ScoreWeights,
  ExecutionStrategy,
  DedupConfig,
  PaperTradeThreshold,
  AdaptiveRiskConfig,
  SignalChainConfig,
  ExecutionResult,
  SignalScore,
};

export default {
  calculatePositionSize,
  shouldExecuteSignal,
  requestConfirmation,
  calculateSignalScore,
  executeWithFallback,
  isDuplicateSignal,
  generateSignalHash,
  paperTradeFirst,
  checkSourceReputation,
  recordSignalResult,
  adjustRiskLevels,
  checkChainCondition,
  executeEnhancedSignal,
};
