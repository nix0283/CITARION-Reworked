/**
 * Rate Limiting Middleware for Next.js API Routes
 * 
 * Implements token bucket algorithm for flexible rate limiting
 * Supports different limits per endpoint, IP, or API key
 * 
 * Features:
 * - Per-IP rate limiting
 * - Per-API-key rate limiting (for authenticated requests)
 * - Different limits for different endpoints
 * - Sliding window algorithm
 * - Redis-ready architecture (currently in-memory)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';

// ==================== TYPES ====================

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string; // Custom error message
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

export interface RateLimitEntry {
  count: number;
  firstRequest: number;
  lastRequest: number;
}

// ==================== DEFAULT CONFIGS ====================

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000, // 1 minute
  maxRequests: 100,
  message: 'Too many requests, please try again later',
};

export const STRICT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 10,
  message: 'Rate limit exceeded for this endpoint',
};

export const API_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 60, // 1 per second average
  message: 'API rate limit exceeded',
};

// ==================== IN-MEMORY STORE ====================
// Note: For production, replace with Redis store

class RateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  
  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key);
  }
  
  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }
  
  delete(key: string): boolean {
    return this.store.delete(key);
  }
  
  // Cleanup old entries (call periodically)
  cleanup(maxAge: number): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.lastRequest > maxAge) {
        this.store.delete(key);
      }
    }
  }
}

const store = new RateLimitStore();

// ==================== RATE LIMITER CLASS ====================

export class RateLimiter {
  private config: RateLimitConfig;
  
  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT, ...config };
  }
  
  /**
   * Generate unique key for rate limiting
   */
  private makeKey(request: NextRequest, identifier?: string): string {
    // Use provided identifier (e.g., API key, user ID) if available
    if (identifier) {
      return `rl:${identifier}`;
    }
    
    // Fall back to IP address
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    
    return `rl:ip:${ip}`;
  }
  
  /**
   * Check if request is allowed
   */
  async check(
    request: NextRequest,
    identifier?: string
  ): Promise<{ allowed: boolean; remaining: number; reset: number }> {
    const key = this.makeKey(request, identifier);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    let entry = store.get(key);
    
    // Create new entry or reset expired one
    if (!entry || entry.firstRequest < windowStart) {
      entry = {
        count: 1,
        firstRequest: now,
        lastRequest: now,
      };
      store.set(key, entry);
      
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        reset: now + this.config.windowMs,
      };
    }
    
    // Check if within limit
    if (entry.count >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        reset: entry.firstRequest + this.config.windowMs,
      };
    }
    
    // Increment counter
    entry.count += 1;
    entry.lastRequest = now;
    store.set(key, entry);
    
    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.count,
      reset: entry.firstRequest + this.config.windowMs,
    };
  }
  
  /**
   * Create Next.js middleware handler
   */
  handler(config?: Partial<RateLimitConfig>) {
    const limiter = new RateLimiter({ ...this.config, ...config });
    
    return async (request: NextRequest, identifier?: string) => {
      const result = await limiter.check(request, identifier);
      
      if (!result.allowed) {
        logger.warn(
          {
            ip: request.headers.get('x-forwarded-for'),
            url: request.url,
            identifier,
          },
          'Rate limit exceeded'
        );
        
        return NextResponse.json(
          {
            error: this.config.message || 'Too many requests',
            retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': String(this.config.maxRequests),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.ceil(result.reset / 1000)),
              'Retry-After': String(Math.ceil((result.reset - Date.now()) / 1000)),
            },
          }
        );
      }
      
      // Add rate limit headers to response
      const response = NextResponse.next();
      response.headers.set('X-RateLimit-Limit', String(this.config.maxRequests));
      response.headers.set('X-RateLimit-Remaining', String(result.remaining));
      response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.reset / 1000)));
      
      return response;
    };
  }
}

// ==================== MIDDLEWARE EXPORT ====================

/**
 * Create rate limiting middleware for Next.js
 * 
 * Usage in middleware.ts:
 * ```
 * import { createRateLimitMiddleware } from '@/lib/rate-limit';
 * 
 * const apiLimiter = createRateLimitMiddleware(API_RATE_LIMIT);
 * 
 * export async function middleware(request: NextRequest) {
 *   if (request.nextUrl.pathname.startsWith('/api/')) {
 *     return await apiLimiter(request);
 *   }
 *   return NextResponse.next();
 * }
 * ```
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  const limiter = new RateLimiter(config);
  
  return async (request: NextRequest, identifier?: string) => {
    return await limiter.handler()(request, identifier);
  };
}

// ==================== CLEANUP JOB ====================

// Cleanup old entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    store.cleanup(5 * 60_000); // Remove entries older than 5 minutes
  }, 5 * 60_000);
}

export default RateLimiter;
