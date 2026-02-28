/**
 * Prometheus Metrics Endpoint
 * 
 * GET /api/metrics
 * 
 * Returns application metrics in Prometheus exposition format.
 * 
 * Security:
 * - In production, restrict access via IP whitelist or auth
 * - Metrics endpoint should not be publicly accessible
 * 
 * Usage:
 * ```
 * curl http://localhost:3000/api/metrics
 * ```
 */

import { NextRequest } from 'next/server';
import { GET as metricsHandler } from '@/lib/metrics';

// Re-export the metrics handler
export { metricsHandler as GET };

// Block non-GET requests
export async function POST() {
  return new Response('Method not allowed', { status: 405 });
}

export async function PUT() {
  return new Response('Method not allowed', { status: 405 });
}

export async function DELETE() {
  return new Response('Method not allowed', { status: 405 });
}

// Optional: Add basic auth for production
// Uncomment and configure for production use
/*
import { NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Check for basic auth in production
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    const expectedAuth = `Basic ${Buffer.from(
      `${process.env.METRICS_USER}:${process.env.METRICS_PASSWORD}`
    ).toString('base64')}`;
    
    if (authHeader !== expectedAuth) {
      return new Response('Unauthorized', { 
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Metrics"' }
      });
    }
  }
  
  return metricsHandler(request);
}
*/
