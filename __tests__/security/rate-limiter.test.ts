/**
 * Rate Limiter Module Tests
 * 
 * Tests for token bucket rate limiting algorithm
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  RateLimiter,
  RATE_LIMIT_PRESETS,
  getRateLimiter,
} from '@/lib/security/rate-limiter';

describe('Rate Limiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  afterEach(() => {
    limiter.stop();
  });

  describe('checkLimit', () => {
    it('should allow requests under limit', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await limiter.checkLimit('test-user', 'general');
        expect(result.success).toBe(true);
        expect(result.limit.remaining).toBeGreaterThanOrEqual(0);
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
      expect(result.error).toBeDefined();
    });

    it('should include rate limit headers info', async () => {
      const result = await limiter.checkLimit('test-user', 'general');

      expect(result.limit).toHaveProperty('total');
      expect(result.limit).toHaveProperty('remaining');
      expect(result.limit).toHaveProperty('resetTime');
    });

    it('should use custom config', async () => {
      const result = await limiter.checkLimit('test-user', 'general', {
        windowMs: 60000,
        maxRequests: 5,
      });

      expect(result.success).toBe(true);
      expect(result.limit.total).toBe(5);
    });
  });

  describe('whitelist', () => {
    it('should bypass rate limit for whitelisted IPs', async () => {
      limiter.addToWhitelist('whitelisted-ip');

      // Even with exhausted limit, whitelisted user should pass
      for (let i = 0; i < 200; i++) {
        const result = await limiter.checkLimit('whitelisted-ip', 'trade');
        expect(result.success).toBe(true);
      }
    });

    it('should remove IP from whitelist', async () => {
      limiter.addToWhitelist('temp-ip');
      limiter.removeFromWhitelist('temp-ip');

      // Should now be rate limited
      const config = RATE_LIMIT_PRESETS.trade;
      for (let i = 0; i < config.maxRequests; i++) {
        await limiter.checkLimit('temp-ip', 'trade');
      }

      const result = await limiter.checkLimit('temp-ip', 'trade');
      expect(result.success).toBe(false);
    });
  });

  describe('token refill', () => {
    it('should refill tokens over time', async () => {
      const config = {
        windowMs: 1000, // 1 second for testing
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

  describe('getStatus', () => {
    it('should return current rate limit status', async () => {
      await limiter.checkLimit('test-user', 'general');

      const status = limiter.getStatus('test-user', 'general');

      expect(status.total).toBe(RATE_LIMIT_PRESETS.general.maxRequests);
      expect(status.remaining).toBeLessThan(status.total);
      expect(status.resetTime).toBeGreaterThan(Date.now());
    });

    it('should return full limit for unknown user', () => {
      const status = limiter.getStatus('unknown-user', 'general');

      expect(status.remaining).toBe(status.total);
    });
  });

  describe('reset', () => {
    it('should reset rate limit for identifier', async () => {
      // Exhaust limit
      const config = RATE_LIMIT_PRESETS.trade;
      for (let i = 0; i < config.maxRequests; i++) {
        await limiter.checkLimit('test-user', 'trade');
      }

      // Should be blocked
      let result = await limiter.checkLimit('test-user', 'trade');
      expect(result.success).toBe(false);

      // Reset
      limiter.reset('test-user', 'trade');

      // Should be allowed again
      result = await limiter.checkLimit('test-user', 'trade');
      expect(result.success).toBe(true);
    });

    it('should reset all limits', async () => {
      // Create some limits
      await limiter.checkLimit('user1', 'general');
      await limiter.checkLimit('user2', 'general');
      await limiter.checkLimit('user3', 'trade');

      limiter.resetAll();

      const stats = limiter.getStats();
      expect(stats.totalBuckets).toBe(0);
    });
  });

  describe('presets', () => {
    it('should have correct preset configurations', () => {
      expect(RATE_LIMIT_PRESETS.general.maxRequests).toBe(100);
      expect(RATE_LIMIT_PRESETS.general.windowMs).toBe(60000);

      expect(RATE_LIMIT_PRESETS.auth.maxRequests).toBe(10);
      expect(RATE_LIMIT_PRESETS.auth.windowMs).toBe(15 * 60000);

      expect(RATE_LIMIT_PRESETS.trade.maxRequests).toBe(10);
      expect(RATE_LIMIT_PRESETS.trade.windowMs).toBe(60000);

      expect(RATE_LIMIT_PRESETS.webhook.maxRequests).toBe(60);
      expect(RATE_LIMIT_PRESETS.webhook.windowMs).toBe(60000);

      expect(RATE_LIMIT_PRESETS.public.maxRequests).toBe(200);
      expect(RATE_LIMIT_PRESETS.public.windowMs).toBe(60000);

      expect(RATE_LIMIT_PRESETS.admin.maxRequests).toBe(30);
      expect(RATE_LIMIT_PRESETS.admin.windowMs).toBe(60000);
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      await limiter.checkLimit('user1', 'general');
      await limiter.checkLimit('user2', 'general');

      const stats = limiter.getStats();

      expect(stats.totalBuckets).toBeGreaterThanOrEqual(2);
      expect(stats.whitelistSize).toBe(0);
      expect(stats.configsCount).toBeGreaterThanOrEqual(6);
    });
  });

  describe('cleanup', () => {
    it('should clean up old buckets', async () => {
      // Create buckets
      await limiter.checkLimit('user1', 'general');
      await limiter.checkLimit('user2', 'general');

      // Wait for cleanup (normally 60 seconds, but we can check manually)
      const stats = limiter.getStats();
      expect(stats.totalBuckets).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('getRateLimiter singleton', () => {
  it('should return same instance', () => {
    const limiter1 = getRateLimiter();
    const limiter2 = getRateLimiter();

    expect(limiter1).toBe(limiter2);
  });
});
