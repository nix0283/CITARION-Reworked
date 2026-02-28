/**
 * Retry Utility with Exponential Backoff
 * 
 * Handles rate limits and transient errors:
 * - Exponential backoff with jitter
 * - Circuit breaker integration
 * - Rate limit detection
 * - Retry budget tracking
 * 
 * @module lib/utils/retry
 */

import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitter: number;
  retryableStatusCodes: number[];
  retryableErrors: string[];
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelay: 1000, // 1 second
  maxDelay: 60000, // 60 seconds
  jitter: 0.1, // 10% jitter
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'RATE_LIMIT',
    'TEMPORARILY_BANNED',
  ],
};

// ==================== RETRY UTILITIES ====================

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  jitter: number
): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  const jitterRange = cappedDelay * jitter;
  const jitteredDelay = cappedDelay + (Math.random() * 2 - 1) * jitterRange;
  
  return Math.max(0, jitteredDelay);
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any, config: RetryConfig): boolean {
  if (error.status && config.retryableStatusCodes.includes(error.status)) {
    return true;
  }
  
  if (error.statusCode && config.retryableStatusCodes.includes(error.statusCode)) {
    return true;
  }
  
  if (error.code && config.retryableErrors.includes(error.code)) {
    return true;
  }
  
  if (error.message?.includes('rate limit') || error.message?.includes('too many requests')) {
    return true;
  }
  
  return false;
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const fullConfig: RetryConfig = { ...DEFAULT_CONFIG, ...config };
  
  let lastError: Error | undefined;
  let totalDelay = 0;
  
  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    try {
      const result = await fn();
      
      return {
        success: true,
        data: result,
        attempts: attempt + 1,
        totalDelay,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt >= fullConfig.maxRetries) {
        logger.error({ error, attempts: attempt + 1 }, 'Max retries reached');
        break;
      }
      
      if (!isRetryableError(error, fullConfig)) {
        logger.warn({ error, attempt: attempt + 1 }, 'Non-retryable error');
        break;
      }
      
      let delay = calculateDelay(
        attempt,
        fullConfig.baseDelay,
        fullConfig.maxDelay,
        fullConfig.jitter
      );
      
      if (fullConfig.onRetry) {
        fullConfig.onRetry(attempt + 1, lastError, delay);
      }
      
      logger.info({ attempt: attempt + 1, delay, error: lastError.message }, 'Retrying');
      
      totalDelay += delay;
      await sleep(delay);
    }
  }
  
  return {
    success: false,
    error: lastError,
    attempts: fullConfig.maxRetries + 1,
    totalDelay,
  };
}

/**
 * Execute function with rate limit handling
 */
export async function withRateLimit<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    rateLimitDelay?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 10,
    baseDelay = 1000,
    maxDelay = 120000,
    rateLimitDelay = 60000,
  } = options;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimited = 
        error.status === 429 ||
        error.statusCode === 429 ||
        error.code === 'RATE_LIMIT' ||
        error.message?.includes('rate limit');
      
      if (isRateLimited) {
        let delay = rateLimitDelay;
        if (error.headers?.['retry-after']) {
          delay = parseInt(error.headers['retry-after'], 10) * 1000;
        }
        delay = Math.min(delay, maxDelay);
        
        logger.warn({ attempt: attempt + 1, delay }, 'Rate limited, waiting');
        await sleep(delay);
        continue;
      }
      
      if (isRetryableError(error, DEFAULT_CONFIG) && attempt < maxRetries) {
        const delay = calculateDelay(attempt, baseDelay, maxDelay, 0.1);
        logger.info({ attempt: attempt + 1, delay }, 'Retryable error, waiting');
        await sleep(delay);
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

/**
 * Circuit Breaker State
 */
export interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number | null;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  nextAttempt: number | null;
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitBreakerState;
  private failureThreshold: number;
  private resetTimeout: number;
  private halfOpenRequests: number;
  private halfOpenAttempts: number;

  constructor(
    failureThreshold: number = 5,
    resetTimeout: number = 60000,
    halfOpenRequests: number = 3
  ) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.halfOpenRequests = halfOpenRequests;
    
    this.state = {
      failures: 0,
      lastFailureTime: null,
      state: 'CLOSED',
      nextAttempt: null,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state.state === 'OPEN') {
      if (this.state.nextAttempt && Date.now() >= this.state.nextAttempt) {
        this.state.state = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
        logger.info('Circuit breaker transitioning to HALF_OPEN');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      
      if (this.state.state === 'HALF_OPEN') {
        this.halfOpenAttempts++;
        if (this.halfOpenAttempts >= this.halfOpenRequests) {
          this.reset();
        }
      } else {
        this.reset();
      }
      
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();
    
    if (this.state.failures >= this.failureThreshold) {
      this.state.state = 'OPEN';
      this.state.nextAttempt = Date.now() + this.resetTimeout;
      
      logger.warn({
        failures: this.state.failures,
        resetTimeout: this.resetTimeout,
      }, 'Circuit breaker OPEN');
    }
  }

  private reset(): void {
    this.state.failures = 0;
    this.state.lastFailureTime = null;
    this.state.state = 'CLOSED';
    this.state.nextAttempt = null;
    
    logger.info('Circuit breaker reset');
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  isOpen(): boolean {
    return this.state.state === 'OPEN';
  }

  isClosed(): boolean {
    return this.state.state === 'CLOSED';
  }
}

export default {
  withRetry,
  withRateLimit,
  calculateDelay,
  isRetryableError,
  sleep,
  CircuitBreaker,
  DEFAULT_CONFIG,
};
