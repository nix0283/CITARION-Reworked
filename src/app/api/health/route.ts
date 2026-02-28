/**
 * Health Check API Endpoint
 * 
 * Returns service health status for monitoring and load balancers
 * Supports readiness and liveness probes
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: 'ok' | 'error';
    memory: 'ok' | 'warning' | 'critical';
    disk?: 'ok' | 'warning' | 'critical';
  };
  details?: {
    databaseLatency?: number;
    memoryUsage?: {
      used: number;
      total: number;
      percent: number;
    };
    error?: string;
  };
}

// Application start time for uptime calculation
const startTime = Date.now();

/**
 * Check database connectivity and response time
 */
async function checkDatabase(): Promise<{ ok: boolean; latency?: number; error?: string }> {
  try {
    const start = Date.now();
    await db.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    return { ok: true, latency };
  } catch (error) {
    logger.error(error, 'Database health check failed');
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Check memory usage
 */
function checkMemory(): { status: 'ok' | 'warning' | 'critical'; usage: { used: number; total: number; percent: number } } {
  const mem = process.memoryUsage();
  const total = mem.heapTotal;
  const used = mem.heapUsed;
  const percent = (used / total) * 100;
  
  if (percent > 90) return { status: 'critical', usage: { used, total, percent } };
  if (percent > 75) return { status: 'warning', usage: { used, total, percent } };
  return { status: 'ok', usage: { used, total, percent } };
}

/**
 * Main health check handler
 */
export async function GET(request: NextRequest) {
  try {
    const [dbCheck, memoryCheck] = await Promise.all([
      checkDatabase(),
      Promise.resolve(checkMemory()),
    ]);

    // Determine overall status
    let status: HealthCheckResponse['status'] = 'healthy';
    
    if (!dbCheck.ok || memoryCheck.status === 'critical') {
      status = 'unhealthy';
    } else if (memoryCheck.status === 'warning' || dbCheck.latency && dbCheck.latency > 1000) {
      status = 'degraded';
    }

    const response: HealthCheckResponse = {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks: {
        database: dbCheck.ok ? 'ok' : 'error',
        memory: memoryCheck.status,
      },
      details: {
        databaseLatency: dbCheck.latency,
        memoryUsage: memoryCheck.usage,
        error: dbCheck.error,
      },
    };

    // Return appropriate HTTP status code
    const httpStatus = status === 'unhealthy' ? 503 : status === 'degraded' ? 200 : 200;
    
    return NextResponse.json(response, { 
      status: httpStatus,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    logger.error(error, 'Health check endpoint error');
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      } as HealthCheckResponse,
      { status: 503 }
    );
  }
}

/**
 * HEAD endpoint for lightweight health checks (load balancers)
 */
export async function HEAD() {
  try {
    await db.$queryRaw`SELECT 1`;
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
