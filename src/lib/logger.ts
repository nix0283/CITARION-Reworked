/**
 * Logger utility using Pino
 * 
 * Features:
 * - Structured JSON logging for production
 * - Pretty printing for development
 * - Log levels: trace, debug, info, warn, error, fatal
 * - Automatic request/response logging middleware
 */

import pino from 'pino';

// ==================== CONFIGURATION ====================

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

// ==================== LOGGER INSTANCE ====================

export const logger = pino({
  level: logLevel,
  // Pretty print in development
  transport: !isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  // Add common fields to all logs
  base: {
    service: 'citarion',
    env: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
  },
  // Redact sensitive fields
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.apiKey',
      'req.body.apiSecret',
      'req.body.password',
      'res.headers.authorization',
      '*.secret',
      '*.token',
      '*.apiKey',
      '*.apiSecret',
    ],
    remove: true,
  },
});

// ==================== LOGGING HELPERS ====================

/**
 * Log HTTP request details
 */
export function logRequest(
  method: string,
  url: string,
  userId?: string,
  metadata?: Record<string, unknown>
) {
  logger.info(
    {
      method,
      url,
      userId,
      ...metadata,
    },
    `HTTP ${method} ${url}`
  );
}

/**
 * Log HTTP response details
 */
export function logResponse(
  method: string,
  url: string,
  statusCode: number,
  durationMs: number,
  userId?: string
) {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  
  logger[level](
    {
      method,
      url,
      statusCode,
      durationMs,
      userId,
    },
    `HTTP ${method} ${url} - ${statusCode} (${durationMs}ms)`
  );
}

/**
 * Log trading operation
 */
export function logTrade(
  action: 'OPEN' | 'CLOSE' | 'UPDATE',
  symbol: string,
  direction: 'LONG' | 'SHORT',
  amount: number,
  price?: number,
  metadata?: Record<string, unknown>
) {
  logger.info(
    {
      action,
      symbol,
      direction,
      amount,
      price,
      ...metadata,
    },
    `Trade ${action}: ${direction} ${symbol}`
  );
}

/**
 * Log error with context
 */
export function logError(
  error: Error | unknown,
  context: string,
  metadata?: Record<string, unknown>
) {
  const err = error instanceof Error ? error : new Error(String(error));
  
  logger.error(
    {
      err,
      context,
      stack: err.stack,
      ...metadata,
    },
    `Error: ${context} - ${err.message}`
  );
}

/**
 * Log API call to exchange
 */
export function logExchangeApi(
  exchange: string,
  endpoint: string,
  method: string,
  success: boolean,
  durationMs: number,
  metadata?: Record<string, unknown>
) {
  const level = success ? 'debug' : 'warn';
  
  logger[level](
    {
      exchange,
      endpoint,
      method,
      success,
      durationMs,
      ...metadata,
    },
    `Exchange API: ${exchange} ${method} ${endpoint} - ${success ? 'OK' : 'FAILED'} (${durationMs}ms)`
  );
}

// ==================== NEXT.JS MIDDLEWARE LOGGER ====================

/**
 * Create a Next.js API route logger wrapper
 */
export function createApiLogger(handler: Function) {
  return async (req: Request, context: any) => {
    const start = Date.now();
    const method = req.method || 'UNKNOWN';
    const url = req.url || 'UNKNOWN';
    
    try {
      logRequest(method, url);
      const result = await handler(req, context);
      const duration = Date.now() - start;
      
      const statusCode = result?.status || 200;
      logResponse(method, url, statusCode, duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logError(error, `API Handler: ${method} ${url}`, { duration });
      throw error;
    }
  };
}

export default logger;
