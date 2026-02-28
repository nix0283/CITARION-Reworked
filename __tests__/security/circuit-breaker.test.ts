/**
 * Circuit Breaker Module Tests
 * 
 * Tests for three-state circuit breaker pattern
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  getCircuitBreaker,
  getCircuitBreakerRegistry,
  getExchangeCircuitBreaker,
  getDatabaseCircuitBreaker,
  getExternalApiCircuitBreaker,
} from '@/lib/security/circuit-breaker';

describe('Circuit Breaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test', {
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 100, // Short for testing
      monitoringWindow: 100,
    });
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.isClosed()).toBe(true);
      expect(breaker.isOpen()).toBe(false);
      expect(breaker.isHalfOpen()).toBe(false);
    });

    it('should have zero counts initially', () => {
      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('execute', () => {
    it('should pass through successful operations', async () => {
      const result = await breaker.execute(async () => {
        return 'success';
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.circuitState).toBe('CLOSED');
    });

    it('should handle errors', async () => {
      const result = await breaker.execute(async () => {
        throw new Error('Test error');
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.circuitState).toBe('CLOSED');
    });

    it('should track response time', async () => {
      const result = await breaker.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'done';
      });

      expect(result.responseTime).toBeGreaterThanOrEqual(10);
    });
  });

  describe('state transitions', () => {
    it('should open after failure threshold', async () => {
      const failingFn = async () => {
        throw new Error('Test error');
      };

      // Cause 3 failures
      for (let i = 0; i < 3; i++) {
        await breaker.execute(failingFn);
      }

      expect(breaker.getState()).toBe('OPEN');
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.execute(async () => {
          throw new Error('Test error');
        });
      }

      expect(breaker.getState()).toBe('OPEN');

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Next request should trigger half-open
      await breaker.execute(async () => 'success');

      expect(breaker.getState()).toBe('HALF_OPEN');
    });

    it('should close after success threshold in half-open', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.execute(async () => {
          throw new Error('Test error');
        });
      }

      // Wait for half-open
      await new Promise(resolve => setTimeout(resolve, 150));

      // Successful requests in half-open
      for (let i = 0; i < 2; i++) {
        await breaker.execute(async () => 'success');
      }

      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should reopen on failure in half-open', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.execute(async () => {
          throw new Error('Test error');
        });
      }

      // Wait for half-open
      await new Promise(resolve => setTimeout(resolve, 150));

      // One success
      await breaker.execute(async () => 'success');

      // Then failure
      await breaker.execute(async () => {
        throw new Error('Test error');
      });

      expect(breaker.getState()).toBe('OPEN');
    });
  });

  describe('fallback', () => {
    it('should use fallback when circuit is open', async () => {
      const breakerWithFallback = new CircuitBreaker(
        'test-fallback',
        { failureThreshold: 1 },
        () => 'fallback-value'
      );

      // Open the circuit
      await breakerWithFallback.execute(async () => {
        throw new Error('Test error');
      });

      // Should return fallback
      const result = await breakerWithFallback.execute(async () => {
        throw new Error('Another error');
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('fallback-value');
      expect(result.fromCache).toBe(true);
    });

    it('should handle fallback errors', async () => {
      const breakerWithFallback = new CircuitBreaker(
        'test-fallback-error',
        { failureThreshold: 1 },
        () => {
          throw new Error('Fallback also failed');
        }
      );

      // Open the circuit
      await breakerWithFallback.execute(async () => {
        throw new Error('Test error');
      });

      // Fallback also fails
      const result = await breakerWithFallback.execute(async () => {
        throw new Error('Main error');
      });

      expect(result.success).toBe(false);
    });
  });

  describe('error filtering', () => {
    it('should filter errors based on custom filter', async () => {
      const breakerWithFilter = new CircuitBreaker('test-filter', {
        failureThreshold: 1,
        errorFilter: (error: Error) => {
          return !error.message.includes('validation');
        },
      });

      // Validation error should not count
      await breakerWithFilter.execute(async () => {
        throw new Error('validation error');
      });

      expect(breakerWithFilter.getState()).toBe('CLOSED');

      // Other error should count
      await breakerWithFilter.execute(async () => {
        throw new Error('network error');
      });

      expect(breakerWithFilter.getState()).toBe('OPEN');
    });

    it('should not count validation errors by default', async () => {
      const breakerWithDefault = new CircuitBreaker('test-default', {
        failureThreshold: 1,
      });

      // These should not count as failures
      await breakerWithDefault.execute(async () => {
        throw new Error('validation failed');
      });

      await breakerWithDefault.execute(async () => {
        throw new Error('unauthorized');
      });

      await breakerWithDefault.execute(async () => {
        throw new Error('not found');
      });

      expect(breakerWithDefault.getState()).toBe('CLOSED');
    });
  });

  describe('manual control', () => {
    it('should reset to closed state', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.execute(async () => {
          throw new Error('Test error');
        });
      }

      expect(breaker.getState()).toBe('OPEN');

      // Manual reset
      breaker.reset();

      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.getStats().failureCount).toBe(0);
    });

    it('should force open', () => {
      breaker.forceOpen();
      expect(breaker.getState()).toBe('OPEN');
    });

    it('should force close', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.execute(async () => {
          throw new Error('Test error');
        });
      }

      breaker.forceClose();
      expect(breaker.getState()).toBe('CLOSED');
    });
  });

  describe('statistics', () => {
    it('should track all statistics', async () => {
      // Execute some operations
      for (let i = 0; i < 5; i++) {
        await breaker.execute(async () => 'success');
      }

      for (let i = 0; i < 2; i++) {
        await breaker.execute(async () => {
          throw new Error('Test');
        });
      }

      const stats = breaker.getStats();

      expect(stats.totalRequests).toBe(7);
      expect(stats.totalSuccesses).toBe(5);
      expect(stats.totalFailures).toBe(2);
      expect(stats.avgResponseTime).toBeGreaterThanOrEqual(0);
      expect(stats.lastSuccessTime).toBeDefined();
      expect(stats.lastFailureTime).toBeDefined();
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  it('should create and retrieve breakers', () => {
    const breaker1 = registry.get('test1');
    const breaker2 = registry.get('test1');

    expect(breaker1).toBe(breaker2);
  });

  it('should get all breakers', () => {
    registry.get('test1');
    registry.get('test2');

    const all = registry.getAll();
    expect(all.size).toBe(2);
  });

  it('should get all stats', () => {
    registry.get('test1');
    registry.get('test2');

    const stats = registry.getAllStats();
    expect(Object.keys(stats).length).toBe(2);
  });

  it('should reset all breakers', () => {
    const breaker1 = registry.get('test1');
    breaker1.forceOpen();

    registry.resetAll();

    expect(breaker1.getState()).toBe('CLOSED');
  });

  it('should remove breakers', () => {
    registry.get('test1');
    registry.remove('test1');

    const all = registry.getAll();
    expect(all.size).toBe(0);
  });
});

describe('Predefined breakers', () => {
  it('should create exchange circuit breaker', () => {
    const breaker = getExchangeCircuitBreaker('binance');
    expect(breaker).toBeDefined();
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should create database circuit breaker', () => {
    const breaker = getDatabaseCircuitBreaker();
    expect(breaker).toBeDefined();
  });

  it('should create external API circuit breaker', () => {
    const breaker = getExternalApiCircuitBreaker('coinmarketcap');
    expect(breaker).toBeDefined();
  });
});

describe('getCircuitBreaker singleton', () => {
  it('should return same instance', () => {
    const breaker1 = getCircuitBreaker('test');
    const breaker2 = getCircuitBreaker('test');

    expect(breaker1).toBe(breaker2);
  });

  it('should return registry singleton', () => {
    const registry1 = getCircuitBreakerRegistry();
    const registry2 = getCircuitBreakerRegistry();

    expect(registry1).toBe(registry2);
  });
});
