/**
 * Next.js Middleware
 * 
 * Handles:
 * - CORS preflight requests (OPTIONS)
 * - Rate limiting for API routes
 * - Request logging
 * - Security headers
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getRateLimiter, RATE_LIMIT_PRESETS } from '@/lib/security/rate-limiter';

// ==================== RATE LIMITER ====================

const rateLimiter = getRateLimiter();

// ==================== MIDDLEWARE ====================

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const method = request.method;
  const startTime = Date.now();

  // ==================== CORS PREFLIGHT ====================
  if (method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': getCorsOrigin(request),
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Webhook-Signature, X-Client-Id',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // ==================== RATE LIMITING ====================
  if (pathname.startsWith('/api/')) {
    // Get client IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    // Determine rate limit preset based on endpoint
    let preset: keyof typeof RATE_LIMIT_PRESETS = 'general';
    let identifier = ip;
    
    // Trade endpoints - strictest limits
    if (pathname.includes('/trade/')) {
      preset = 'trade';
    }
    // Auth endpoints - strict limits
    else if (pathname.includes('/auth/') || pathname.includes('/login') || pathname.includes('/register')) {
      preset = 'auth';
    }
    // Exchange connection endpoints - strict
    else if (pathname.includes('/exchange/')) {
      preset = 'trade';
    }
    // Webhook endpoints - moderate
    else if (pathname.includes('/webhook/')) {
      preset = 'webhook';
    }
    // Admin endpoints - strict
    else if (pathname.includes('/admin/')) {
      preset = 'admin';
    }
    // Public endpoints - lenient
    else if (pathname.includes('/public/') || pathname.includes('/prices') || pathname.includes('/market')) {
      preset = 'public';
    }
    
    // Check rate limit
    const result = await rateLimiter.checkLimit(identifier, preset);
    
    if (!result.success) {
      logger.warn(
        { 
          ip, 
          pathname, 
          preset, 
          remaining: result.limit.remaining,
          resetTime: result.limit.resetTime 
        },
        'Rate limit exceeded'
      );
      
      return NextResponse.json(
        {
          error: result.error || 'Too many requests',
          limit: result.limit,
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': result.limit.total.toString(),
            'X-RateLimit-Remaining': result.limit.remaining.toString(),
            'X-RateLimit-Reset': result.limit.resetTime.toString(),
            'Retry-After': result.limit.retryAfter?.toString() || '60',
          },
        }
      );
    }
    
    // Create response and add rate limit headers
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', result.limit.total.toString());
    response.headers.set('X-RateLimit-Remaining', result.limit.remaining.toString());
    response.headers.set('X-RateLimit-Reset', result.limit.resetTime.toString());
    
    // Continue to security headers
    addSecurityHeaders(response);
    
    // Log request asynchronously
    logRequest(request, pathname, method, ip, startTime);
    
    return response;
  }

  // For non-API routes, just add security headers
  const response = NextResponse.next();
  addSecurityHeaders(response);
  
  return response;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Add security headers to response
 */
function addSecurityHeaders(response: NextResponse): void {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Only set CSP in production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: wss:; font-src 'self' data:; frame-ancestors 'none';"
    );
  }
}

/**
 * Log API request asynchronously
 */
function logRequest(
  request: NextRequest,
  pathname: string,
  method: string,
  ip: string,
  startTime: number
): void {
  const searchParams = request.nextUrl.searchParams;
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  // Log in background to avoid blocking
  Promise.resolve().then(() => {
    logger.info(
      {
        method,
        pathname,
        ip,
        userAgent: userAgent.substring(0, 100),
        query: Object.fromEntries(searchParams.entries()),
        duration: Date.now() - startTime,
      },
      `API Request: ${method} ${pathname}`
    );
  });
}

/**
 * Determine allowed CORS origin based on request
 */
function getCorsOrigin(request: NextRequest): string {
  const origin = request.headers.get('origin');
  const isProd = process.env.NODE_ENV === 'production';
  
  // In development, allow all origins
  if (!isProd) {
    return origin || '*';
  }
  
  // In production, check against allowed origins
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://citarion.app').split(',');
  
  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }
  
  // Default to primary domain if no match
  return allowedOrigins[0] || 'https://citarion.app';
}

// ==================== CONFIG ====================

export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
    // Match webhook routes
    '/webhook/:path*',
  ],
};
