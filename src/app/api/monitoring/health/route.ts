import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const startTime = Date.now();
    await db.user.count();
    const uptime = process.uptime();
    
    return NextResponse.json({
      success: true,
      data: {
        status: 'HEALTHY',
        uptime: Math.floor(uptime),
        lastCheck: new Date().toISOString(),
        responseTime: Date.now() - startTime,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Health check failed');
    return NextResponse.json({
      success: false,
      data: {
        status: 'CRITICAL',
        uptime: process.uptime(),
        lastCheck: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    }, { status: 500 });
  }
}
