/**
 * Prometheus Metrics Middleware for CITARION
 * 
 * Exposes application metrics at /api/metrics endpoint
 * Compatible with Prometheus scraping format
 * 
 * Metrics categories:
 * - HTTP requests (count, duration, status)
 * - Trading operations (executions, PnL, positions)
 * - Exchange API calls (errors, latency)
 * - System resources (memory, CPU via process metrics)
 * - Business metrics (win rate, signals processed)
 */

import { NextRequest, NextResponse } from 'next/server';
import client from 'prom-client';

// ==================== PROMETHEUS REGISTRY ====================

// Create a separate registry for the app
export const register = new client.Registry();

// Add default metrics (process, event loop, GC)
client.collectDefaultMetrics({ register });

// ==================== HTTP METRICS ====================

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpActiveRequests = new client.Gauge({
  name: 'http_requests_active',
  help: 'Number of active HTTP requests',
  labelNames: ['method', 'route'],
  registers: [register],
});

// ==================== TRADING METRICS ====================

export const tradeExecutionsTotal = new client.Counter({
  name: 'trade_executions_total',
  help: 'Total number of trade executions',
  labelNames: ['exchange', 'symbol', 'direction', 'mode'], // mode: demo/live
  registers: [register],
});

export const tradeExecutionsFailed = new client.Counter({
  name: 'trade_executions_failed_total',
  help: 'Total number of failed trade executions',
  labelNames: ['exchange', 'symbol', 'error_type'],
  registers: [register],
});

export const tradeExecutionDuration = new client.Histogram({
  name: 'trade_execution_duration_seconds',
  help: 'Duration of trade execution in seconds',
  labelNames: ['exchange', 'symbol'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const tradingTotalPnlUsd = new client.Gauge({
  name: 'trading_total_pnl_usd',
  help: 'Total PnL in USD across all positions',
  labelNames: ['mode'], // demo/live
  registers: [register],
});

export const tradingOpenPositions = new client.Gauge({
  name: 'trading_open_positions',
  help: 'Number of currently open positions',
  labelNames: ['exchange', 'direction'],
  registers: [register],
});

export const tradingWinRatePercent = new client.Gauge({
  name: 'trading_win_rate_percent',
  help: 'Win rate percentage of closed trades',
  labelNames: ['exchange', 'timeframe'], // timeframe: 24h, 7d, 30d
  registers: [register],
});

// ==================== EXCHANGE API METRICS ====================

export const exchangeApiCallsTotal = new client.Counter({
  name: 'exchange_api_calls_total',
  help: 'Total number of API calls to exchanges',
  labelNames: ['exchange', 'endpoint', 'method'],
  registers: [register],
});

export const exchangeApiErrorsTotal = new client.Counter({
  name: 'exchange_api_errors_total',
  help: 'Total number of API errors from exchanges',
  labelNames: ['exchange', 'endpoint', 'error_code'],
  registers: [register],
});

export const exchangeApiLatency = new client.Histogram({
  name: 'exchange_api_latency_seconds',
  help: 'Latency of exchange API calls in seconds',
  labelNames: ['exchange', 'endpoint'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

export const exchangeRateLimitHits = new client.Counter({
  name: 'exchange_rate_limit_hits_total',
  help: 'Number of times rate limit was hit on exchange',
  labelNames: ['exchange'],
  registers: [register],
});

// ==================== SIGNAL METRICS ====================

export const signalsReceivedTotal = new client.Counter({
  name: 'signals_received_total',
  help: 'Total number of signals received',
  labelNames: ['source'], // telegram, discord, tradingview, api
  registers: [register],
});

export const signalsProcessedTotal = new client.Counter({
  name: 'signals_processed_total',
  help: 'Total number of signals successfully processed',
  labelNames: ['source', 'action'], // action: buy, sell, close
  registers: [register],
});

export const signalsFailedTotal = new client.Counter({
  name: 'signals_failed_total',
  help: 'Total number of signals that failed to process',
  labelNames: ['source', 'error_type'],
  registers: [register],
});

// ==================== BOT METRICS ====================

export const botExecutionsTotal = new client.Counter({
  name: 'bot_executions_total',
  help: 'Total number of bot trade executions',
  labelNames: ['bot_type', 'bot_id', 'symbol'],
  registers: [register],
});

export const botActiveCount = new client.Gauge({
  name: 'bot_active_count',
  help: 'Number of currently active bots',
  labelNames: ['bot_type'], // grid, dca, bbot, argus
  registers: [register],
});

// ==================== SYSTEM METRICS ====================

export const appUptimeSeconds = new client.Gauge({
  name: 'app_uptime_seconds',
  help: 'Application uptime in seconds',
  registers: [register],
});

export const appVersion = new client.Gauge({
  name: 'app_version_info',
  help: 'Application version information',
  labelNames: ['version', 'commit', 'env'],
  registers: [register],
});

// ==================== MIDDLEWARE ====================

/**
 * Create metrics middleware for Next.js API routes
 * 
 * Usage:
 * ```typescript
 * import { withMetrics } from '@/lib/metrics';
 * 
 * export const POST = withMetrics(async (request: NextRequest) => {
 *   // Your handler logic
 *   return NextResponse.json({ success: true });
 * });
 * ```
 */
export function withMetrics<T extends NextRequest>(
  handler: (request: T, context?: any) => Promise<NextResponse>
) {
  return async (request: T, context?: any): Promise<NextResponse> => {
    const start = Date.now();
    const method = request.method;
    const url = new URL(request.url);
    const route = url.pathname;
    
    // Track active requests
    httpActiveRequests.inc({ method, route });
    
    try {
      const response = await handler(request, context);
      const duration = (Date.now() - start) / 1000;
      const statusCode = response.status;
      
      // Record metrics
      httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
      httpRequestTotal.inc({ method, route, status_code: statusCode });
      
      return response;
    } catch (error) {
      const duration = (Date.now() - start) / 1000;
      const statusCode = error instanceof Error && 'statusCode' in error 
        ? (error as any).statusCode 
        : 500;
      
      // Record error metrics
      httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
      httpRequestTotal.inc({ method, route, status_code: statusCode });
      
      throw error;
    } finally {
      // Decrement active requests
      httpActiveRequests.dec({ method, route });
    }
  };
}

// ==================== METRICS ENDPOINT ====================

/**
 * GET /api/metrics
 * 
 * Returns Prometheus-formatted metrics for scraping
 */
export async function GET(request: NextRequest) {
  try {
    // Update dynamic metrics
    appUptimeSeconds.set(process.uptime());
    appVersion.set({ 
      version: process.env.npm_package_version || '1.5.0',
      commit: process.env.COMMIT_SHA || 'unknown',
      env: process.env.NODE_ENV || 'development'
    }, 1);
    
    // Get metrics in Prometheus format
    const metrics = await register.metrics();
    
    return new Response(metrics, {
      headers: {
        'Content-Type': register.contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    return new Response(`Error generating metrics: ${error}`, { status: 500 });
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Record a trade execution metric
 */
export function recordTradeExecution(
  exchange: string,
  symbol: string,
  direction: 'LONG' | 'SHORT',
  mode: 'demo' | 'live',
  success: boolean,
  duration: number,
  errorType?: string
) {
  if (success) {
    tradeExecutionsTotal.inc({ exchange, symbol, direction, mode });
  } else {
    tradeExecutionsFailed.inc({ exchange, symbol, error_type: errorType || 'unknown' });
  }
  tradeExecutionDuration.observe({ exchange, symbol }, duration);
}

/**
 * Record an exchange API call metric
 */
export function recordExchangeApiCall(
  exchange: string,
  endpoint: string,
  method: string,
  success: boolean,
  latency: number,
  errorCode?: string
) {
  exchangeApiCallsTotal.inc({ exchange, endpoint, method });
  exchangeApiLatency.observe({ exchange, endpoint }, latency);
  
  if (!success) {
    exchangeApiErrorsTotal.inc({ 
      exchange, 
      endpoint, 
      error_code: errorCode || 'unknown' 
    });
  }
}

/**
 * Record a signal processing metric
 */
export function recordSignal(
  source: string,
  action: 'buy' | 'sell' | 'close',
  success: boolean,
  errorType?: string
) {
  signalsReceivedTotal.inc({ source });
  
  if (success) {
    signalsProcessedTotal.inc({ source, action });
  } else {
    signalsFailedTotal.inc({ source, error_type: errorType || 'unknown' });
  }
}

/**
 * Update trading PnL gauge
 */
export function updateTradingPnl(totalPnl: number, mode: 'demo' | 'live') {
  tradingTotalPnlUsd.set({ mode }, totalPnl);
}

/**
 * Update open positions gauge
 */
export function updateOpenPositions(
  positions: Array<{ exchange: string; direction: 'LONG' | 'SHORT' }>
) {
  // Reset then set new values
  tradingOpenPositions.reset();
  
  const counts: Record<string, Record<string, number>> = {};
  for (const pos of positions) {
    if (!counts[pos.exchange]) counts[pos.exchange] = {};
    counts[pos.exchange][pos.direction] = (counts[pos.exchange][pos.direction] || 0) + 1;
  }
  
  for (const [exchange, directions] of Object.entries(counts)) {
    for (const [direction, count] of Object.entries(directions)) {
      tradingOpenPositions.set({ exchange, direction }, count);
    }
  }
}

// ==================== EXPORTS ====================

export default {
  register,
  withMetrics,
  recordTradeExecution,
  recordExchangeApiCall,
  recordSignal,
  updateTradingPnl,
  updateOpenPositions,
  // Export all metrics for custom use
  metrics: {
    httpRequestDuration,
    httpRequestTotal,
    httpActiveRequests,
    tradeExecutionsTotal,
    tradeExecutionsFailed,
    tradeExecutionDuration,
    tradingTotalPnlUsd,
    tradingOpenPositions,
    tradingWinRatePercent,
    exchangeApiCallsTotal,
    exchangeApiErrorsTotal,
    exchangeApiLatency,
    exchangeRateLimitHits,
    signalsReceivedTotal,
    signalsProcessedTotal,
    signalsFailedTotal,
    botExecutionsTotal,
    botActiveCount,
    appUptimeSeconds,
    appVersion,
  },
};
