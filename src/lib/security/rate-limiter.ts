/**
 * Rate Limiting Module
 * 
 * Implements token bucket algorithm for API rate limiting
 * Protects against DDoS, brute force, and API abuse
 * 
 * Features:
 * - Per-IP and per-user rate limiting
 * - Configurable limits per endpoint type
 * - In-memory storage (Redis option available)
 * - Rate limit headers in responses
 * - Whitelist for trusted IPs
 * 
 * @security CRITICAL - Protects against abuse
 */

import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface RateLimitConfig {
  windowMs: number;        // Time window in milliseconds
  maxRequests: number;     // Max requests per window
  message?: string;        // Error message when limit exceeded
  statusCode?: number;     // HTTP status code (default: 429)
  skipSuccessfulRequests?: boolean;  // Don't count successful requests
  skipFailedRequests?: boolean;      // Don't count failed requests
}

export interface RateLimitInfo {
  total: number;           // Total requests allowed
  remaining: number;       // Remaining requests
  resetTime: number;       // Unix timestamp when limit resets
  retryAfter?: number;     // Seconds to wait before retrying
}

export interface RateLimitResult {
  success: boolean;
  limit: RateLimitInfo;
  error?: string;
}

export interface Bucket {
  tokens: number;
  lastRefill: number;
}

// ==================== CONSTANTS ====================

const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_REQUESTS = 100;
const CLEANUP_INTERVAL = 60 * 1000; // Clean up old entries every minute

// Predefined configurations for common use cases
export const RATE_LIMIT_PRESETS = {
  // General API endpoints
  general: {
    windowMs: 60 * 1000,
    maxRequests: 100,
    message: 'Too many requests, please try again later',
  },
  
  // Authentication endpoints (stricter)
  auth: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 10,
    message: 'Too many authentication attempts, please try again in 15 minutes',
  },
  
  // Trade endpoints (very strict)
  trade: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many trade requests, please slow down',
  },
  
  // Webhook endpoints (moderate)
  webhook: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Too many webhook requests',
  },
  
  // Public endpoints (lenient)
  public: {
    windowMs: 60 * 1000,
    maxRequests: 200,
    message: 'Too many requests',
  },
  
  // Admin endpoints (strict)
  admin: {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Too many admin requests',
  },
};

// ==================== RATE LIMITER CLASS ====================

export class RateLimiter {
  private buckets: Map<string, Bucket> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();
  private whitelist: Set<string> = new Set();
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.startCleanup();
  }
  
  /**
   * Configure rate limit for a specific key pattern
   */
  configure(key: string, config: RateLimitConfig): void {
    this.configs.set(key, config);
    logger.debug({ key, config }, '[RateLimiter] Configuration set');
  }
  
  /**
   * Add IP to whitelist (bypasses rate limiting)
   */
  addToWhitelist(ip: string): void {
    this.whitelist.add(ip);
    logger.info({ ip }, '[RateLimiter] IP added to whitelist');
  }
  
  /**
   * Remove IP from whitelist
   */
  removeFromWhitelist(ip: string): void {
    this.whitelist.delete(ip);
    logger.info({ ip }, '[RateLimiter] IP removed from whitelist');
  }
  
  /**
   * Check if request is allowed
   */
  async checkLimit(
    identifier: string,
    configKey: keyof typeof RATE_LIMIT_PRESETS = 'general',
    customConfig?: Partial<RateLimitConfig>
  ): Promise<RateLimitResult> {
    // Check whitelist
    if (this.whitelist.has(identifier)) {
      return {
        success: true,
        limit: {
          total: 999999,
          remaining: 999999,
          resetTime: Date.now() + DEFAULT_WINDOW_MS,
        },
      };
    }
    
    // Get configuration
    const preset = RATE_LIMIT_PRESETS[configKey];
    const config: RateLimitConfig = {
      ...preset,
      ...customConfig,
    };
    
    const bucketKey = `${configKey}:${identifier}`;
    const now = Date.now();
    
    // Get or create bucket
    let bucket = this.buckets.get(bucketKey);
    
    if (!bucket) {
      bucket = {
        tokens: config.maxRequests,
        lastRefill: now,
      };
      this.buckets.set(bucketKey, bucket);
    }
    
    // Refill tokens based on time elapsed
    const elapsed = now - bucket.lastRefill;
    const refillRate = config.maxRequests / config.windowMs;
    const tokensToAdd = elapsed * refillRate;
    
    bucket.tokens = Math.min(config.maxRequests, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
    
    // Calculate limit info
    const resetTime = now + config.windowMs;
    const limit: RateLimitInfo = {
      total: config.maxRequests,
      remaining: Math.floor(bucket.tokens),
      resetTime,
      retryAfter: bucket.tokens < 1 ? Math.ceil((config.windowMs - elapsed) / 1000) : undefined,
    };
    
    // Check if request is allowed
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      
      return {
        success: true,
        limit,
      };
    } else {
      // Rate limit exceeded
      logger.warn(
        { identifier, configKey, limit },
        '[RateLimiter] Rate limit exceeded'
      );
      
      return {
        success: false,
        limit,
        error: config.message || 'Too many requests',
      };
    }
  }
  
  /**
   * Get current rate limit status for an identifier
   */
  getStatus(
    identifier: string,
    configKey: keyof typeof RATE_LIMIT_PRESETS = 'general'
  ): RateLimitInfo {
    const preset = RATE_LIMIT_PRESETS[configKey];
    const bucketKey = `${configKey}:${identifier}`;
    const bucket = this.buckets.get(bucketKey);
    
    if (!bucket) {
      return {
        total: preset.maxRequests,
        remaining: preset.maxRequests,
        resetTime: Date.now() + preset.windowMs,
      };
    }
    
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const refillRate = preset.maxRequests / preset.windowMs;
    const tokensToAdd = elapsed * refillRate;
    const currentTokens = Math.min(preset.maxRequests, bucket.tokens + tokensToAdd);
    
    return {
      total: preset.maxRequests,
      remaining: Math.floor(currentTokens),
      resetTime: now + preset.windowMs,
    };
  }
  
  /**
   * Reset rate limit for an identifier
   */
  reset(identifier: string, configKey: keyof typeof RATE_LIMIT_PRESETS = 'general'): void {
    const bucketKey = `${configKey}:${identifier}`;
    this.buckets.delete(bucketKey);
    logger.debug({ identifier, configKey }, '[RateLimiter] Rate limit reset');
  }
  
  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.buckets.clear();
    logger.info('[RateLimiter] All rate limits reset');
  }
  
  /**
   * Get statistics
   */
  getStats(): {
    totalBuckets: number;
    whitelistSize: number;
    configsCount: number;
  } {
    return {
      totalBuckets: this.buckets.size,
      whitelistSize: this.whitelist.size,
      configsCount: this.configs.size,
    };
  }
  
  /**
   * Start cleanup interval to remove old buckets
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxAge = 5 * 60 * 1000; // 5 minutes
      
      for (const [key, bucket] of this.buckets.entries()) {
        if (now - bucket.lastRefill > maxAge) {
          this.buckets.delete(key);
        }
      }
      
      logger.debug({ cleaned: this.buckets.size }, '[RateLimiter] Cleanup completed');
    }, CLEANUP_INTERVAL);
    
    logger.info('[RateLimiter] Cleanup interval started');
  }
  
  /**
   * Stop cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('[RateLimiter] Cleanup interval stopped');
    }
  }
}

// ==================== MIDDLEWARE HELPER ====================

/**
 * Create Next.js middleware for rate limiting
 */
export function createRateLimitMiddleware(
  configKey: keyof typeof RATE_LIMIT_PRESETS = 'general',
  customConfig?: Partial<RateLimitConfig>
) {
  const limiter = new RateLimiter();
  
  return async function rateLimitMiddleware(
    request: Request,
    identifier?: string
  ): Promise<{ success: boolean; limit: RateLimitInfo; error?: string }> {
    // Get identifier (IP or user ID)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    const userId = identifier || ip;
    
    // Check rate limit
    const result = await limiter.checkLimit(userId, configKey, customConfig);
    
    return result;
  };
}

// ==================== EXPRESS/NEXT.JS COMPATIBLE ====================

/**
 * Higher-order function for API route protection
 */
export function withRateLimit<T extends (...args: any[]) => Promise<any>>(
  handler: T,
  configKey: keyof typeof RATE_LIMIT_PRESETS = 'general',
  customConfig?: Partial<RateLimitConfig>
) {
  const limiter = new RateLimiter();
  
  return async function protectedHandler(...args: any[]) {
    // Extract request from arguments (Next.js API route format)
    const request = args[0]; // NextRequest or Request
    
    // Get identifier
    let identifier = 'unknown';
    
    if (request && typeof request === 'object') {
      if ('headers' in request) {
        identifier = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
      }
    }
    
    // Check rate limit
    const result = await limiter.checkLimit(identifier, configKey, customConfig);
    
    if (!result.success) {
      // Import NextResponse dynamically to avoid circular dependencies
      const { NextResponse } = await import('next/server');
      
      return NextResponse.json(
        {
          error: result.error,
          limit: result.limit,
        },
        { 
          status: customConfig?.statusCode || 429,
          headers: {
            'X-RateLimit-Limit': result.limit.total.toString(),
            'X-RateLimit-Remaining': result.limit.remaining.toString(),
            'X-RateLimit-Reset': result.limit.resetTime.toString(),
            'Retry-After': result.limit.retryAfter?.toString() || '60',
          },
        }
      );
    }
    
    // Proceed with handler
    return handler(...args);
  };
}

// ==================== SINGLETON ====================

let globalLimiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!globalLimiter) {
    globalLimiter = new RateLimiter();
    
    // Configure default limits
    Object.entries(RATE_LIMIT_PRESETS).forEach(([key, config]) => {
      globalLimiter!.configure(key, config);
    });
  }
  return globalLimiter;
}

// ==================== REDIS-BACKED IMPLEMENTATION (OPTIONAL) ====================

/**
 * Redis-backed rate limiter for distributed systems
 * Requires ioredis package
 */
export class RedisRateLimiter {
  private redis: any; // Redis client
  
  constructor(redisClient: any) {
    this.redis = redisClient;
  }
  
  async checkLimit(
    identifier: string,
    configKey: keyof typeof RATE_LIMIT_PRESETS = 'general',
    customConfig?: Partial<RateLimitConfig>
  ): Promise<RateLimitResult> {
    const preset = RATE_LIMIT_PRESETS[configKey];
    const config: RateLimitConfig = {
      ...preset,
      ...customConfig,
    };
    
    const key = `ratelimit:${configKey}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    // Use Redis MULTI for atomic operations
    const multi = this.redis.multi();
    multi.zremrangebyscore(key, 0, windowStart);
    multi.zadd(key, now, now);
    multi.zcard(key);
    multi.expire(key, Math.ceil(config.windowMs / 1000));
    
    const results = await multi.exec();
    const count = results[2][1];
    
    const limit: RateLimitInfo = {
      total: config.maxRequests,
      remaining: Math.max(0, config.maxRequests - count),
      resetTime: now + config.windowMs,
      retryAfter: count >= config.maxRequests ? Math.ceil(config.windowMs / 1000) : undefined,
    };
    
    if (count >= config.maxRequests) {
      return {
        success: false,
        limit,
        error: config.message || 'Too many requests',
      };
    }
    
    return {
      success: true,
      limit,
    };
  }
}

// ==================== EXPORTS ====================

export default {
  RateLimiter,
  RedisRateLimiter,
  RATE_LIMIT_PRESETS,
  createRateLimitMiddleware,
  withRateLimit,
  getRateLimiter,
};
