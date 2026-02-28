import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const endpointStats = await db.exchangeApiLog.groupBy({
      by: ['endpoint'],
      where: { timestamp: { gte: fiveMinutesAgo } },
      _count: true,
      _avg: { responseTime: true },
      _sum: { isError: true },
    });

    const metrics = endpointStats.map(stat => ({
      endpoint: stat.endpoint,
      avgResponseTime: stat._avg.responseTime || 0,
      requestsPerMinute: Math.round(stat._count / 5),
      errorRate: stat._sum.isError ? (stat._sum.isError / stat._count * 100) : 0,
      successRate: stat._sum.isError ? (100 - (stat._sum.isError / stat._count * 100)) : 100,
    }));

    return NextResponse.json({ success: true, data: metrics });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch metrics');
    return NextResponse.json({ success: false, error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
