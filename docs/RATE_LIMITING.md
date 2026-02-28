# 🛡️ Rate Limiting Module

**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Last Updated:** 2025-01-22

---

## 📋 Overview

The Rate Limiting Module protects your API from abuse, DDoS attacks, and brute force attempts using the token bucket algorithm.

### Key Features

- ✅ **Token Bucket Algorithm** - Smooth rate limiting with burst allowance
- ✅ **Per-IP and Per-User Limits** - Flexible identification strategies
- ✅ **Preset Configurations** - Ready-to-use limits for common scenarios
- ✅ **Rate Limit Headers** - Standard headers for client awareness
- ✅ **Whitelist Support** - Bypass rate limiting for trusted IPs
- ✅ **Automatic Cleanup** - Memory management for old entries
- ✅ **Redis Support** - Distributed rate limiting option

---

## 🔧 Installation

### 1. Basic Setup (In-Memory)

No additional dependencies required. Uses built-in Map for storage.

### 2. Redis Setup (Distributed)

For multi-server deployments:

```bash
npm install ioredis
```

Add to `.env`:
```bash
REDIS_URL=redis://localhost:6379
```

---

## 📖 Usage

### Basic Rate Limiting

```typescript
import { getRateLimiter, RATE_LIMIT_PRESETS } from '@/lib/security/rate-limiter';

const limiter = getRateLimiter();

// Check rate limit
const result = await limiter.checkLimit('user-123', 'general');

if (!result.success) {
  console.log('Rate limit exceeded:', result.error);
  console.log('Retry after:', result.limit.retryAfter, 'seconds');
} else {
  console.log('Requests remaining:', result.limit.remaining);
}
```

### Using Presets

```typescript
import { RATE_LIMIT_PRESETS } from '@/lib/security/rate-limiter';

// Available presets:
RATE_LIMIT_PRESETS.general   // 100 requests / minute
RATE_LIMIT_PRESETS.auth      // 10 requests / 15 minutes
RATE_LIMIT_PRESETS.trade     // 10 requests / minute
RATE_LIMIT_PRESETS.webhook   // 60 requests / minute
RATE_LIMIT_PRESETS.public    // 200 requests / minute
RATE_LIMIT_PRESETS.admin     // 30 requests / minute
```

### Custom Configuration

```typescript
import { RateLimiter } from '@/lib/security/rate-limiter';

const limiter = new RateLimiter();

// Configure custom limit
limiter.configure('custom-endpoint', {
  windowMs: 30 * 1000,      // 30 seconds
  maxRequests: 5,           // 5 requests per window
  message: 'Custom rate limit exceeded',
  statusCode: 429,
});

// Use custom config
const result = await limiter.checkLimit('user-123', 'general', {
  windowMs: 30 * 1000,
  maxRequests: 5,
});
```

### API Route Protection

```typescript
// src/app/api/trade/open/route.ts
import { withRateLimit } from '@/lib/security/rate-limiter';
import { NextRequest, NextResponse } from 'next/server';

export const POST = withRateLimit(
  async function handler(request: NextRequest) {
    // Your trade logic here
    return NextResponse.json({ success: true });
  },
  'trade',  // Use trade preset (10 req/min)
  {
    message: 'Too many trade requests',
  }
);
```

### Middleware Integration

```typescript
// middleware.ts
import { createRateLimitMiddleware, RATE_LIMIT_PRESETS } from '@/lib/security/rate-limiter';

const apiLimiter = createRateLimitMiddleware('general');
const tradeLimiter = createRateLimitMiddleware('trade');

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  if (pathname.startsWith('/api/trade/')) {
    const result = await tradeLimiter(request);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error, limit: result.limit },
        { status: 429 }
      );
    }
  }
  
  return NextResponse.next();
}
```

### Whitelist Management

```typescript
import { getRateLimiter } from '@/lib/security/rate-limiter';

const limiter = getRateLimiter();

// Add trusted IP
limiter.addToWhitelist('192.168.1.100');

// Remove from whitelist
limiter.removeFromWhitelist('192.168.1.100');
```

---

## 📊 Rate Limit Headers

All responses include standard rate limit headers:

| Header | Description | Example |
|--------|-------------|---------|
| `X-RateLimit-Limit` | Total requests allowed per window | `100` |
| `X-RateLimit-Remaining` | Remaining requests in current window | `42` |
| `X-RateLimit-Reset` | Unix timestamp when limit resets | `1705920000` |
| `Retry-After` | Seconds to wait before retrying (when limited) | `45` |

### Example Response (Limited)

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705920060
Retry-After: 45
Content-Type: application/json

{
  "error": "Too many trade requests, please slow down",
  "limit": {
    "total": 10,
    "remaining": 0,
    "resetTime": 1705920060000,
    "retryAfter": 45
  }
}
```

---

## 🔍 Token Bucket Algorithm

### How It Works

```
Bucket Capacity: 100 tokens
Refill Rate: 100 tokens / 60 seconds = 1.67 tokens/second

Initial State:
[████████████████████] 100/100 tokens

After 10 requests:
[██████████          ] 90/100 tokens

After 60 seconds (auto-refill):
[████████████████████] 100/100 tokens (capped at max)
```

### Benefits

- ✅ Allows short bursts of traffic
- ✅ Smooth rate limiting over time
- ✅ Fair to all users
- ✅ Memory efficient

---

## 🎯 Preset Configurations

### General API Endpoints

```typescript
{
  windowMs: 60_000,      // 1 minute
  maxRequests: 100,      // 100 requests
  message: 'Too many requests, please try again later'
}
```

**Use for:** Most API endpoints, general usage

---

### Authentication Endpoints

```typescript
{
  windowMs: 15 * 60_000, // 15 minutes
  maxRequests: 10,       // 10 attempts
  message: 'Too many authentication attempts, please try again in 15 minutes'
}
```

**Use for:** Login, registration, password reset

**Security:** Prevents brute force attacks

---

### Trade Endpoints

```typescript
{
  windowMs: 60_000,      // 1 minute
  maxRequests: 10,       // 10 trades
  message: 'Too many trade requests, please slow down'
}
```

**Use for:** Order creation, modification, cancellation

**Security:** Prevents accidental/excessive trading

---

### Webhook Endpoints

```typescript
{
  windowMs: 60_000,      // 1 minute
  maxRequests: 60,       // 60 webhooks
  message: 'Too many webhook requests'
}
```

**Use for:** TradingView, Telegram, external integrations

**Security:** Prevents webhook spam

---

### Public Endpoints

```typescript
{
  windowMs: 60_000,      // 1 minute
  maxRequests: 200,      // 200 requests
  message: 'Too many requests'
}
```

**Use for:** Public data, market prices, documentation

---

### Admin Endpoints

```typescript
{
  windowMs: 60_000,      // 1 minute
  maxRequests: 30,       // 30 requests
  message: 'Too many admin requests'
}
```

**Use for:** Admin panel, user management, system configuration

---

## 🧪 Testing

### Unit Tests

```typescript
// __tests__/security/rate-limiter.test.ts
import { RateLimiter, RATE_LIMIT_PRESETS } from '@/lib/security/rate-limiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;
  
  beforeEach(() => {
    limiter = new RateLimiter();
  });
  
  afterEach(() => {
    limiter.stop();
  });
  
  it('should allow requests under limit', async () => {
    for (let i = 0; i < 10; i++) {
      const result = await limiter.checkLimit('test-user', 'general');
      expect(result.success).toBe(true);
    }
  });
  
  it('should block requests over limit', async () => {
    const config = RATE_LIMIT_PRESETS.trade; // 10 per minute
    
    // Exhaust limit
    for (let i = 0; i < config.maxRequests; i++) {
      await limiter.checkLimit('test-user', 'trade');
    }
    
    // Next request should fail
    const result = await limiter.checkLimit('test-user', 'trade');
    expect(result.success).toBe(false);
    expect(result.limit.remaining).toBe(0);
    expect(result.limit.retryAfter).toBeGreaterThan(0);
  });
  
  it('should respect whitelist', async () => {
    limiter.addToWhitelist('whitelisted-user');
    
    // Even with exhausted limit, whitelisted user should pass
    for (let i = 0; i < 200; i++) {
      const result = await limiter.checkLimit('whitelisted-user', 'trade');
      expect(result.success).toBe(true);
    }
  });
  
  it('should refill tokens over time', async () => {
    const config = {
      windowMs: 1000,  // 1 second for testing
      maxRequests: 5,
    };
    
    // Exhaust limit
    for (let i = 0; i < 5; i++) {
      await limiter.checkLimit('test-user', 'general', config);
    }
    
    // Should be blocked
    let result = await limiter.checkLimit('test-user', 'general', config);
    expect(result.success).toBe(false);
    
    // Wait for refill
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // Should have tokens again
    result = await limiter.checkLimit('test-user', 'general', config);
    expect(result.success).toBe(true);
  });
});
```

### Integration Tests

```typescript
// __tests__/api/rate-limit.test.ts
import { createTestClient } from '../utils/test-client';

describe('API Rate Limiting', () => {
  const client = createTestClient();
  
  it('should rate limit trade endpoints', async () => {
    // Make 10 requests (limit)
    for (let i = 0; i < 10; i++) {
      const response = await client.post('/api/trade/open', {
        symbol: 'BTCUSDT',
        side: 'BUY',
        amount: 100,
      });
      
      expect(response.status).toBeLessThan(400);
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    }
    
    // 11th request should be rate limited
    const response = await client.post('/api/trade/open', {
      symbol: 'BTCUSDT',
      side: 'BUY',
      amount: 100,
    });
    
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBeDefined();
  });
  
  it('should include rate limit headers', async () => {
    const response = await client.get('/api/prices');
    
    expect(response.headers).toMatchObject({
      'x-ratelimit-limit': expect.any(String),
      'x-ratelimit-remaining': expect.any(String),
      'x-ratelimit-reset': expect.any(String),
    });
  });
});
```

---

## 🔧 Redis Implementation

### Setup

```typescript
import { Redis } from 'ioredis';
import { RedisRateLimiter } from '@/lib/security/rate-limiter';

const redis = new Redis(process.env.REDIS_URL);
const limiter = new RedisRateLimiter(redis);

// Use same API
const result = await limiter.checkLimit('user-123', 'trade');
```

### Benefits

- ✅ **Distributed** - Works across multiple server instances
- ✅ **Persistent** - Survives server restarts
- ✅ **Scalable** - Handles high traffic volumes
- ✅ **Atomic** - No race conditions

### When to Use Redis

| Scenario | Recommendation |
|----------|---------------|
| Single server, low traffic | In-memory (default) |
| Single server, high traffic | In-memory (default) |
| Multiple servers | Redis |
| Need persistence | Redis |
| Need exact limits across servers | Redis |

---

## 🚨 Best Practices

### 1. Set Appropriate Limits

```typescript
// ❌ Too strict - blocks legitimate users
{ windowMs: 60_000, maxRequests: 5 }

// ❌ Too lenient - allows abuse
{ windowMs: 60_000, maxRequests: 10000 }

// ✅ Balanced
{ windowMs: 60_000, maxRequests: 100 }
```

### 2. Different Limits Per Endpoint

```typescript
// Public data - lenient
GET /api/prices: 200/min

// User actions - moderate
POST /api/account/update: 30/min

// Sensitive operations - strict
POST /api/trade/open: 10/min
POST /api/auth/login: 10/15min
```

### 3. Inform Users

Always include rate limit headers so clients can adjust:

```typescript
response.headers.set('X-RateLimit-Limit', limit.total.toString());
response.headers.set('X-RateLimit-Remaining', limit.remaining.toString());
response.headers.set('X-RateLimit-Reset', limit.resetTime.toString());
```

### 4. Monitor and Adjust

```typescript
// Log rate limit events
limiter.on('limit-exceeded', (data) => {
  logger.warn(data, 'Rate limit exceeded');
  
  // Alert if unusual pattern
  if (data.count > 100) {
    sendAlert('Potential DDoS attack detected');
  }
});
```

### 5. Graceful Degradation

```typescript
// Queue requests instead of rejecting
if (!result.success) {
  await queueRequest(request, result.limit.retryAfter);
  return { status: 'queued', retryAfter: result.limit.retryAfter };
}
```

---

## 📈 Monitoring

### Metrics to Track

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Rate limit hits | Number of blocked requests | > 1000/hour |
| Unique IPs limited | Number of unique IPs blocked | > 100/hour |
| Endpoint-specific limits | Limits hit per endpoint | Varies |
| False positives | Legitimate users blocked | > 1% of traffic |

### Example Dashboard

```typescript
// Prometheus metrics
const rateLimitHits = new Counter({
  name: 'ratelimit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['endpoint', 'identifier'],
});

const rateLimitRemaining = new Gauge({
  name: 'ratelimit_remaining',
  help: 'Remaining requests in current window',
  labelNames: ['endpoint', 'identifier'],
});
```

---

## 🔍 Troubleshooting

### Issue: Legitimate users getting rate limited

**Solutions:**
1. Increase limits for the endpoint
2. Implement user-based instead of IP-based limiting
3. Add whitelist for known good IPs
4. Implement progressive limits (higher for authenticated users)

### Issue: Rate limits not working across servers

**Solution:** Use Redis-backed rate limiter

```typescript
import { RedisRateLimiter } from '@/lib/security/rate-limiter';
const limiter = new RedisRateLimiter(redisClient);
```

### Issue: Memory usage growing

**Solutions:**
1. Reduce cleanup interval
2. Decrease maxAge for bucket retention
3. Switch to Redis for storage

---

## 📝 API Reference

### RateLimiter Class

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `configure` | `key: string, config: RateLimitConfig` | `void` | Set config for key |
| `addToWhitelist` | `ip: string` | `void` | Add IP to whitelist |
| `removeFromWhitelist` | `ip: string` | `void` | Remove IP from whitelist |
| `checkLimit` | `identifier: string, configKey, customConfig` | `Promise<RateLimitResult>` | Check if request allowed |
| `getStatus` | `identifier: string, configKey` | `RateLimitInfo` | Get current status |
| `reset` | `identifier: string, configKey` | `void` | Reset limit for identifier |
| `resetAll` | none | `void` | Reset all limits |
| `getStats` | none | `object` | Get statistics |
| `stop` | none | `void` | Stop cleanup interval |

### RateLimitConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `windowMs` | `number` | 60000 | Time window in milliseconds |
| `maxRequests` | `number` | 100 | Max requests per window |
| `message` | `string` | 'Too many requests' | Error message |
| `statusCode` | `number` | 429 | HTTP status code |
| `skipSuccessfulRequests` | `boolean` | false | Don't count successful |
| `skipFailedRequests` | `boolean` | false | Don't count failed |

---

## 📚 Related Documentation

- [Security Module](./SECURITY_ENCRYPTION.md)
- [Circuit Breaker](./CIRCUIT_BREAKER.md)
- [API Security](./API_SECURITY.md)
- [Deployment Guide](./DEPLOYMENT.md)

---

**Last Reviewed:** 2025-01-22  
**Next Review:** 2025-04-22
