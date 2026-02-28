/**
 * Circuit Breaker Pattern Implementation
 * 
 * Protects against cascading failures in distributed systems
 * Prevents repeated attempts to execute operations that are likely to fail
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is open, requests fail immediately
 * - HALF_OPEN: Testing if service has recovered
 * 
 * @security CRITICAL - Prevents cascade failures
 * @see https://martinfowler.com/bliki/CircuitBreaker.html
 */

import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;      // Failures before opening circuit
  successThreshold: number;      // Successes in half-open to close
  resetTimeout: number;          // ms before transitioning from open to half-open
  monitoringWindow: number;      // ms window for counting failures
  halfOpenMaxRequests: number;   // Max requests allowed in half-open state
  errorFilter?: (error: Error) => boolean; // Should this error count as failure?
}

export interface CircuitStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  lastStateChange: Date;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  avgResponseTime: number;
}

export interface CircuitBreakerResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  circuitState: CircuitState;
  fromCache?: boolean;
  responseTime?: number;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,           // 5 failures to open
  successThreshold: 3,           // 3 successes to close
  resetTimeout: 60_000,          // 1 minute before half-open
  monitoringWindow: 60_000,      // 1 minute window for failures
  halfOpenMaxRequests: 3,        // 3 test requests in half-open
};

// ==================== CIRCUIT BREAKER CLASS ====================

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private halfOpenRequests = 0;
  
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private lastStateChange: Date = new Date();
  
  private failureTimestamps: number[] = [];
  private responseTimes: number[] = [];
  
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  
  private config: CircuitBreakerConfig;
  private name: string;
  private fallback?: () => any;
  
  constructor(
    name: string,
    config: Partial<CircuitBreakerConfig> = {},
    fallback?: () => any
  ) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.fallback = fallback;
    
    logger.info({ name, config }, '[CircuitBreaker] Created');
  }
  
  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<CircuitBreakerResult<T>> {
    const startTime = Date.now();
    this.totalRequests++;
    
    try {
      // Check if we should allow request
      if (!this.allowRequest()) {
        logger.warn(
          { name: this.name, state: this.state },
          '[CircuitBreaker] Request rejected - circuit open'
        );
        
        // Try fallback if available
        if (this.fallback) {
          try {
            const fallbackData = await this.fallback();
            return {
              success: true,
              data: fallbackData,
              circuitState: this.state,
              fromCache: true,
            };
          } catch (fallbackError) {
            logger.error({ error: fallbackError }, '[CircuitBreaker] Fallback failed');
          }
        }
        
        return {
          success: false,
          error: new Error(`Circuit breaker is ${this.state}`),
          circuitState: this.state,
        };
      }
      
      // Execute function
      const result = await fn();
      const responseTime = Date.now() - startTime;
      
      // Record success
      this.onSuccess(responseTime);
      this.totalSuccesses++;
      
      // Keep response time history
      this.responseTimes.push(responseTime);
      if (this.responseTimes.length > 100) {
        this.responseTimes.shift();
      }
      
      return {
        success: true,
        data: result,
        circuitState: this.state,
        responseTime,
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.totalFailures++;
      
      // Check if this error should count as failure
      if (this.shouldCountAsFailure(error)) {
        this.onFailure(error as Error);
      }
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        circuitState: this.state,
        responseTime,
      };
    }
  }
  
  /**
   * Check if request should be allowed
   */
  private allowRequest(): boolean {
    const now = Date.now();
    
    switch (this.state) {
      case 'CLOSED':
        return true;
        
      case 'OPEN':
        // Check if reset timeout has elapsed
        if (this.lastFailureTime && 
            now - this.lastFailureTime.getTime() >= this.config.resetTimeout) {
          this.transitionTo('HALF_OPEN');
          this.halfOpenRequests = 0;
          return true;
        }
        return false;
        
      case 'HALF_OPEN':
        // Allow limited requests in half-open state
        return this.halfOpenRequests < this.config.halfOpenMaxRequests;
        
      default:
        return false;
    }
  }
  
  /**
   * Handle successful execution
   */
  private onSuccess(responseTime: number): void {
    this.lastSuccessTime = new Date();
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      this.halfOpenRequests++;
      
      // Check if we should close the circuit
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo('CLOSED');
        this.failureCount = 0;
        this.successCount = 0;
        logger.info({ name: this.name }, '[CircuitBreaker] Circuit CLOSED after successful tests');
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success in closed state
      this.failureCount = 0;
      this.cleanOldFailures();
    }
  }
  
  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    this.lastFailureTime = new Date();
    this.failureCount++;
    this.failureTimestamps.push(Date.now());
    
    logger.warn(
      { 
        name: this.name, 
        state: this.state, 
        failureCount: this.failureCount,
        error: error.message 
      },
      '[CircuitBreaker] Failure recorded'
    );
    
    if (this.state === 'HALF_OPEN') {
      // Any failure in half-open state opens the circuit
      this.halfOpenRequests++;
      this.transitionTo('OPEN');
      this.successCount = 0;
      logger.warn({ name: this.name }, '[CircuitBreaker] Circuit OPEN - failure in half-open state');
    } else if (this.state === 'CLOSED') {
      // Check if we should open the circuit
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo('OPEN');
        logger.warn(
          { name: this.name, failureCount: this.failureCount },
          '[CircuitBreaker] Circuit OPEN - failure threshold reached'
        );
      }
    }
  }
  
  /**
   * Check if error should count as failure
   */
  private shouldCountAsFailure(error: any): boolean {
    // Custom filter
    if (this.config.errorFilter) {
      return this.config.errorFilter(error instanceof Error ? error : new Error(String(error)));
    }
    
    // Default: count all errors except specific ones
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Don't count these as failures
    const nonFailureErrors = [
      'validation',
      'unauthorized',
      'forbidden',
      'not found',
      'bad request',
    ];
    
    return !nonFailureErrors.some(term => 
      errorMessage.toLowerCase().includes(term.toLowerCase())
    );
  }
  
  /**
   * Clean old failure timestamps outside monitoring window
   */
  private cleanOldFailures(): void {
    const now = Date.now();
    const cutoff = now - this.config.monitoringWindow;
    
    this.failureTimestamps = this.failureTimestamps.filter(
      timestamp => timestamp >= cutoff
    );
    
    // Update failure count based on remaining timestamps
    this.failureCount = this.failureTimestamps.length;
  }
  
  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = new Date();
    
    logger.info(
      { name: this.name, oldState, newState },
      '[CircuitBreaker] State transition'
    );
  }
  
  /**
   * Get current statistics
   */
  getStats(): CircuitStats {
    const avgResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
      : 0;
    
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      avgResponseTime,
    };
  }
  
  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenRequests = 0;
    this.failureTimestamps = [];
    this.lastStateChange = new Date();
    
    logger.info({ name: this.name }, '[CircuitBreaker] Manually reset');
  }
  
  /**
   * Force open circuit (for maintenance)
   */
  forceOpen(): void {
    this.transitionTo('OPEN');
  }
  
  /**
   * Force close circuit (for testing)
   */
  forceClose(): void {
    this.transitionTo('CLOSED');
    this.failureCount = 0;
  }
  
  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.state === 'OPEN';
  }
  
  /**
   * Check if circuit is closed
   */
  isClosed(): boolean {
    return this.state === 'CLOSED';
  }
  
  /**
   * Check if circuit is half-open
   */
  isHalfOpen(): boolean {
    return this.state === 'HALF_OPEN';
  }
  
  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }
}

// ==================== CIRCUIT BREAKER REGISTRY ====================

export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();
  
  /**
   * Get or create circuit breaker
   */
  get(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }
  
  /**
   * Get all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }
  
  /**
   * Get statistics for all breakers
   */
  getAllStats(): Record<string, CircuitStats> {
    const stats: Record<string, CircuitStats> = {};
    
    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }
    
    return stats;
  }
  
  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const [, breaker] of this.breakers.entries()) {
      breaker.reset();
    }
  }
  
  /**
   * Remove circuit breaker
   */
  remove(name: string): void {
    this.breakers.delete(name);
  }
}

// ==================== SINGLETON ====================

let globalRegistry: CircuitBreakerRegistry | null = null;

export function getCircuitBreakerRegistry(): CircuitBreakerRegistry {
  if (!globalRegistry) {
    globalRegistry = new CircuitBreakerRegistry();
  }
  return globalRegistry;
}

export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  return getCircuitBreakerRegistry().get(name, config);
}

// ==================== PREDEFINED BREAKERS ====================

/**
 * Get circuit breaker for exchange API calls
 */
export function getExchangeCircuitBreaker(exchange: string): CircuitBreaker {
  return getCircuitBreaker(`exchange:${exchange}`, {
    failureThreshold: 5,
    successThreshold: 3,
    resetTimeout: 60_000,      // 1 minute
    monitoringWindow: 60_000,
  });
}

/**
 * Get circuit breaker for database operations
 */
export function getDatabaseCircuitBreaker(): CircuitBreaker {
  return getCircuitBreaker('database', {
    failureThreshold: 10,
    successThreshold: 5,
    resetTimeout: 30_000,      // 30 seconds
    monitoringWindow: 120_000, // 2 minutes
  });
}

/**
 * Get circuit breaker for external APIs
 */
export function getExternalApiCircuitBreaker(apiName: string): CircuitBreaker {
  return getCircuitBreaker(`external:${apiName}`, {
    failureThreshold: 3,
    successThreshold: 2,
    resetTimeout: 120_000,     // 2 minutes
    monitoringWindow: 60_000,
  });
}

// ==================== DECORATOR (FOR CLASS METHODS) ====================

/**
 * Decorator for circuit breaker protection
 * Usage: @circuitBreaker('my-operation')
 */
export function circuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const breaker = getCircuitBreaker(name, config);
    
    descriptor.value = async function (...args: any[]) {
      return breaker.execute(() => originalMethod.apply(this, args));
    };
    
    return descriptor;
  };
}

// ==================== EXPORTS ====================

export default {
  CircuitBreaker,
  CircuitBreakerRegistry,
  getCircuitBreaker,
  getCircuitBreakerRegistry,
  getExchangeCircuitBreaker,
  getDatabaseCircuitBreaker,
  getExternalApiCircuitBreaker,
  circuitBreaker,
  DEFAULT_CONFIG,
};
