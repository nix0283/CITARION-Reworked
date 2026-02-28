# ⚡ Circuit Breaker Pattern

**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Last Updated:** 2025-01-22

---

## 📋 Overview

The Circuit Breaker pattern prevents cascading failures in distributed systems by failing fast when a service is unhealthy, giving it time to recover.

### Key Features

- ✅ **Three-State Pattern** - CLOSED, OPEN, HALF_OPEN
- ✅ **Configurable Thresholds** - Customize failure/success counts
- ✅ **Automatic Recovery** - Self-healing with half-open state
- ✅ **Fallback Support** - Graceful degradation
- ✅ **Statistics & Monitoring** - Track circuit health
- ✅ **Error Filtering** - Ignore expected errors

---

## 🎯 When to Use

| Scenario | Recommended | Why |
|----------|-------------|-----|
| External API calls | ✅ Yes | APIs can be unreliable |
| Database operations | ✅ Yes | DB can be overloaded |
| Network requests | ✅ Yes | Network can fail |
| Pure functions | ❌ No | No external dependencies |
| In-memory operations | ❌ No | Very low failure rate |

---

## 🔄 State Machine

```
                    ┌─────────────┐
                    │   CLOSED    │
                    │  (Normal)   │
                    └──────┬──────┘
                           │
              Failures >= threshold
                           │
                           ▼
                    ┌─────────────┐
          ┌────────│    OPEN     │────────┐
          │        │  (Failing)  │        │
          │        └──────┬──────┘        │
          │               │               │
          │   Timeout     │               │
          │   elapsed     │               │
          │               ▼               │
          │        ┌─────────────┐        │
          │        │  HALF_OPEN  │        │
          │        │  (Testing)  │        │
          │        └──────┬──────┘        │
          │               │               │
          │    Success    │    Failure    │
          │   >= threshold│               │
          │               │               │
          └───────────────┴───────────────┘
```

### State Descriptions

| State | Behavior | When |
|-------|----------|------|
| **CLOSED** | Requests pass through normally | System is healthy |
| **OPEN** | Requests fail immediately | System is unhealthy |
| **HALF_OPEN** | Limited test requests allowed | Testing recovery |

---

## 🔧 Installation

No additional dependencies required. Uses built-in JavaScript.

---

## 📖 Usage

### Basic Example

```typescript
import { getCircuitBreaker } from '@/lib/security/circuit-breaker';

const breaker = getCircuitBreaker('binance-api', {
  failureThreshold: 5,      // Open after 5 failures
  successThreshold: 3,      // Close after 3 successes
  resetTimeout: 60_000,     // Try again after 1 minute
});

// Use with async function
const result = await breaker.execute(async () => {
  return await binanceClient.getBalance();
});

if (result.success) {
  console.log('Balance:', result.data);
} else {
  console.error('Failed:', result.error);
  console.log('Circuit state:', result.circuitState);
}
```

### With Fallback

```typescript
import { CircuitBreaker } from '@/lib/security/circuit-breaker';

const breaker = new CircuitBreaker(
  'price-feed',
  {
    failureThreshold: 3,
    resetTimeout: 30_000,
  },
  // Fallback function
  () => {
    return { price: 50000, source: 'cached' };
  }
);

const result = await breaker.execute(async () => {
  return await fetchPriceFromExchange();
});

// If circuit is open, returns fallback data
console.log(result.data); // { price: 50000, source: 'cached' }
```

### Predefined Breakers

```typescript
import {
  getExchangeCircuitBreaker,
  getDatabaseCircuitBreaker,
  getExternalApiCircuitBreaker,
} from '@/lib/security/circuit-breaker';

// Exchange API
const binanceBreaker = getExchangeCircuitBreaker('binance');

// Database
const dbBreaker = getDatabaseCircuitBreaker();

// External API
const cmcBreaker = getExternalApiCircuitBreaker('coinmarketcap');
```

### Integration with Exchange Client

```typescript
// src/lib/exchange/binance-client.ts
import { getExchangeCircuitBreaker } from '@/lib/security/circuit-breaker';

export class BinanceClient {
  private breaker = getExchangeCircuitBreaker('binance');
  
  async getBalance(): Promise<Balance> {
    const result = await this.breaker.execute(async () => {
      return await this.fetchBalance();
    });
    
    if (!result.success) {
      throw result.error;
    }
    
    return result.data!;
  }
  
  async createOrder(params: OrderParams): Promise<OrderResult> {
    const result = await this.breaker.execute(async () => {
      return await this.placeOrder(params);
    });
    
    if (!result.success) {
      logger.warn({ 
        error: result.error,
        circuitState: result.circuitState,
        responseTime: result.responseTime 
      }, 'Order execution failed');
      
      throw result.error;
    }
    
    return result.data!;
  }
}
```

### Error Filtering

```typescript
import { CircuitBreaker } from '@/lib/security/circuit-breaker';

const breaker = new CircuitBreaker('api', {
  failureThreshold: 5,
  errorFilter: (error: Error) => {
    // Don't count validation errors as failures
    if (error.message.includes('validation')) {
      return false;
    }
    
    // Don't count auth errors as failures
    if (error.message.includes('unauthorized')) {
      return false;
    }
    
    // Count everything else
    return true;
  },
});
```

### With Decorator (TypeScript)

```typescript
import { circuitBreaker } from '@/lib/security/circuit-breaker';

class TradingService {
  @circuitBreaker('exchange-api', {
    failureThreshold: 5,
    resetTimeout: 60_000,
  })
  async executeTrade(params: TradeParams): Promise<TradeResult> {
    // This method is now protected by circuit breaker
    return await this.exchange.placeOrder(params);
  }
}
```

---

## 📊 Configuration

### Default Configuration

```typescript
const DEFAULT_CONFIG = {
  failureThreshold: 5,           // Failures before opening
  successThreshold: 3,           // Successes to close from half-open
  resetTimeout: 60_000,          // ms before open → half-open
  monitoringWindow: 60_000,      // ms window for counting failures
  halfOpenMaxRequests: 3,        // Max requests in half-open
};
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `failureThreshold` | `number` | 5 | Failures to open circuit |
| `successThreshold` | `number` | 3 | Successes to close circuit |
| `resetTimeout` | `number` | 60000 | ms before testing recovery |
| `monitoringWindow` | `number` | 60000 | Window for failure counting |
| `halfOpenMaxRequests` | `number` | 3 | Test requests in half-open |
| `errorFilter` | `function` | undefined | Filter which errors count |

### Recommended Configurations

#### For Exchange APIs

```typescript
{
  failureThreshold: 5,
  successThreshold: 3,
  resetTimeout: 60_000,      // 1 minute
  monitoringWindow: 60_000,
}
```

#### For Databases

```typescript
{
  failureThreshold: 10,
  successThreshold: 5,
  resetTimeout: 30_000,      // 30 seconds
  monitoringWindow: 120_000, // 2 minutes
}
```

#### For External APIs

```typescript
{
  failureThreshold: 3,
  successThreshold: 2,
  resetTimeout: 120_000,     // 2 minutes
  monitoringWindow: 60_000,
}
```

#### For Critical Operations

```typescript
{
  failureThreshold: 2,       // Very sensitive
  successThreshold: 5,       // Require more proof of recovery
  resetTimeout: 300_000,     // 5 minutes
  monitoringWindow: 300_000,
}
```

---

## 📈 Monitoring

### Get Statistics

```typescript
import { getCircuitBreaker } from '@/lib/security/circuit-breaker';

const breaker = getCircuitBreaker('binance-api');
const stats = breaker.getStats();

console.log(stats);
// {
//   state: 'CLOSED',
//   failureCount: 2,
//   successCount: 0,
//   lastFailureTime: 2025-01-22T10:30:00Z,
//   lastSuccessTime: 2025-01-22T10:29:00Z,
//   lastStateChange: 2025-01-22T10:00:00Z,
//   totalRequests: 150,
//   totalFailures: 12,
//   totalSuccesses: 138,
//   avgResponseTime: 245.5,
// }
```

### Health Check Endpoint

```typescript
// src/app/api/health/circuits/route.ts
import { getCircuitBreakerRegistry } from '@/lib/security/circuit-breaker';
import { NextResponse } from 'next/server';

export async function GET() {
  const registry = getCircuitBreakerRegistry();
  const stats = registry.getAllStats();
  
  // Check if any circuits are open
  const openCircuits = Object.entries(stats)
    .filter(([_, s]) => s.state === 'OPEN')
    .map(([name]) => name);
  
  return NextResponse.json({
    status: openCircuits.length > 0 ? 'degraded' : 'healthy',
    circuits: stats,
    openCircuits,
    timestamp: new Date(),
  });
}
```

### Prometheus Metrics

```typescript
import { Counter, Gauge } from 'prom-client';

const circuitState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Current state of circuit breaker (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
  labelNames: ['name'],
});

const circuitFailures = new Counter({
  name: 'circuit_breaker_failures_total',
  help: 'Total number of failures',
  labelNames: ['name'],
});

// Update metrics
function updateMetrics(name: string, stats: CircuitStats) {
  circuitState.set({ name }, stats.state === 'CLOSED' ? 0 : stats.state === 'OPEN' ? 1 : 2);
  circuitFailures.inc({ name }, stats.totalFailures);
}
```

---

## 🧪 Testing

### Unit Tests

```typescript
// __tests__/security/circuit-breaker.test.ts
import { CircuitBreaker } from '@/lib/security/circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;
  
  beforeEach(() => {
    breaker = new CircuitBreaker('test', {
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 100,  // Short for testing
    });
  });
  
  it('should start in CLOSED state', () => {
    expect(breaker.getState()).toBe('CLOSED');
  });
  
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
    const failingFn = async () => {
      throw new Error('Test error');
    };
    
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await breaker.execute(failingFn);
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
  
  it('should use fallback when circuit is open', async () => {
    const breaker = new CircuitBreaker(
      'test',
      { failureThreshold: 1 },
      () => 'fallback-value'
    );
    
    // Open the circuit
    await breaker.execute(async () => {
      throw new Error('Test error');
    });
    
    // Should return fallback
    const result = await breaker.execute(async () => {
      throw new Error('Another error');
    });
    
    expect(result.success).toBe(true);
    expect(result.data).toBe('fallback-value');
    expect(result.fromCache).toBe(true);
  });
  
  it('should filter errors correctly', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 1,
      errorFilter: (error: Error) => {
        return !error.message.includes('validation');
      },
    });
    
    // Validation error should not count
    await breaker.execute(async () => {
      throw new Error('validation error');
    });
    
    expect(breaker.getState()).toBe('CLOSED');
    
    // Other error should count
    await breaker.execute(async () => {
      throw new Error('network error');
    });
    
    expect(breaker.getState()).toBe('OPEN');
  });
});
```

### Integration Tests

```typescript
// __tests__/integration/circuit-breaker.test.ts
import { getExchangeCircuitBreaker } from '@/lib/security/circuit-breaker';
import { BinanceClient } from '@/lib/exchange/binance-client';

describe('Circuit Breaker Integration', () => {
  it('should protect exchange calls', async () => {
    const client = new BinanceClient(credentials);
    const breaker = getExchangeCircuitBreaker('binance');
    
    // Simulate exchange downtime
    jest.spyOn(client, 'getBalance').mockRejectedValue(
      new Error('Exchange unavailable')
    );
    
    // Multiple failures should open circuit
    for (let i = 0; i < 5; i++) {
      try {
        await client.getBalance();
      } catch (error) {
        // Expected
      }
    }
    
    expect(breaker.getState()).toBe('OPEN');
    
    // Subsequent calls should fail fast
    const start = Date.now();
    try {
      await client.getBalance();
    } catch (error) {
      expect(Date.now() - start).toBeLessThan(100); // Fast failure
    }
  });
});
```

---

## 🚨 Best Practices

### 1. Set Appropriate Thresholds

```typescript
// ❌ Too sensitive - opens too easily
{ failureThreshold: 1 }

// ❌ Too lenient - allows too many failures
{ failureThreshold: 100 }

// ✅ Balanced for most cases
{ failureThreshold: 5 }
```

### 2. Use Different Breakers Per Service

```typescript
// ❌ Single breaker for everything
const breaker = getCircuitBreaker('all');

// ✅ Separate breakers per dependency
const binanceBreaker = getExchangeCircuitBreaker('binance');
const bybitBreaker = getExchangeCircuitBreaker('bybit');
const dbBreaker = getDatabaseCircuitBreaker();
```

### 3. Implement Fallbacks

```typescript
// ✅ Graceful degradation
const breaker = new CircuitBreaker(
  'price-feed',
  config,
  () => getCachedPrice()  // Fallback to cache
);

// ❌ No fallback
const breaker = new CircuitBreaker('price-feed', config);
```

### 4. Monitor Circuit States

```typescript
// ✅ Alert on open circuits
setInterval(() => {
  const stats = breaker.getStats();
  if (stats.state === 'OPEN') {
    sendAlert(`Circuit ${breakerName} is OPEN`);
  }
}, 60_000);
```

### 5. Log State Transitions

```typescript
// Already built into the implementation
// Check logs for:
// [CircuitBreaker] State transition
// [CircuitBreaker] Circuit OPEN
// [CircuitBreaker] Circuit CLOSED
```

---

## 🔍 Troubleshooting

### Issue: Circuit opens too frequently

**Solutions:**
1. Increase `failureThreshold`
2. Increase `monitoringWindow`
3. Add `errorFilter` to exclude expected errors
4. Check if underlying service has issues

### Issue: Circuit stays open too long

**Solutions:**
1. Decrease `resetTimeout`
2. Decrease `successThreshold`
3. Check if service is actually recovering
4. Manually reset: `breaker.reset()`

### Issue: Fallback not working

**Check:**
1. Fallback function is provided
2. Fallback doesn't throw errors
3. Fallback returns compatible data type

---

## 📝 API Reference

### CircuitBreaker Class

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `execute` | `fn: () => Promise<T>` | `Promise<CircuitBreakerResult<T>>` | Execute with protection |
| `getStats` | none | `CircuitStats` | Get statistics |
| `reset` | none | `void` | Reset to closed |
| `forceOpen` | none | `void` | Force open state |
| `forceClose` | none | `void` | Force closed state |
| `isOpen` | none | `boolean` | Check if open |
| `isClosed` | none | `boolean` | Check if closed |
| `isHalfOpen` | none | `boolean` | Check if half-open |
| `getState` | none | `CircuitState` | Get current state |

### CircuitBreakerResult

| Property | Type | Description |
|----------|------|-------------|
| `success` | `boolean` | Operation succeeded |
| `data` | `T` | Result data (if successful) |
| `error` | `Error` | Error (if failed) |
| `circuitState` | `CircuitState` | State when executed |
| `fromCache` | `boolean` | From fallback |
| `responseTime` | `number` | Execution time in ms |

---

## 📚 Related Documentation

- [Security Module](./SECURITY_ENCRYPTION.md)
- [Rate Limiting](./RATE_LIMITING.md)
- [Exchange Integration](./EXCHANGE_INTEGRATION.md)
- [Monitoring](./MONITORING.md)

---

**Last Reviewed:** 2025-01-22  
**Next Review:** 2025-04-22
