/**
 * Monitoring API Routes
 * 
 * Endpoints for system health and alerts
 * 
 * @routes /api/monitoring/*
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSystemMonitor } from '@/lib/monitoring/system-monitor';
import { getAlertService } from '@/lib/monitoring/alert-service';
import { logger } from '@/lib/logger';

/**
 * GET /api/monitoring/health
 * 
 * Get system health status
 */
export async function GET(request: NextRequest) {
  try {
    const monitor = getSystemMonitor();
    const health = await monitor.getHealth();

    return NextResponse.json({
      success: true,
      health,
    });
  } catch (error) {
    logger.error({ error }, 'Health check failed');
    return NextResponse.json(
      { success: false, error: 'Health check failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/monitoring/alerts
 * 
 * Get active alerts
 */
export async function GET(request: NextRequest, { params }: { params: { endpoint: string } }) {
  const endpoint = params.endpoint;

  if (endpoint === 'alerts') {
    try {
      const monitor = getSystemMonitor();
      const alerts = monitor.getActiveAlerts();

      return NextResponse.json({
        success: true,
        alerts,
        count: alerts.length,
      });
    } catch (error) {
      logger.error({ error }, 'Get alerts failed');
      return NextResponse.json(
        { success: false, error: 'Failed to get alerts' },
        { status: 500 }
      );
    }
  }

  // Default to health
  return GET(request as any);
}

/**
 * POST /api/monitoring/alerts/resolve
 * 
 * Resolve an alert
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { alertId } = body;

    if (!alertId) {
      return NextResponse.json(
        { success: false, error: 'Alert ID required' },
        { status: 400 }
      );
    }

    const monitor = getSystemMonitor();
    await monitor.resolveAlert(alertId);

    return NextResponse.json({
      success: true,
      message: 'Alert resolved',
    });
  } catch (error) {
    logger.error({ error }, 'Resolve alert failed');
    return NextResponse.json(
      { success: false, error: 'Failed to resolve alert' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/monitoring/metrics
 * 
 * Get system metrics
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const history = url.searchParams.get('history') === 'true';

    const monitor = getSystemMonitor();

    if (history) {
      const metricsHistory = monitor.getMetricsHistory();
      return NextResponse.json({
        success: true,
        metrics: null,
        history: metricsHistory,
      });
    } else {
      const health = await monitor.getHealth();
      return NextResponse.json({
        success: true,
        metrics: health.metrics,
      });
    }
  } catch (error) {
    logger.error({ error }, 'Get metrics failed');
    return NextResponse.json(
      { success: false, error: 'Failed to get metrics' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/monitoring/alerts/test
 * 
 * Send test alert
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { severity = 'INFO', message = 'Test alert' } = body;

    const alertService = getAlertService();

    const result = await alertService.send({
      type: 'SYSTEM_ALERT',
      severity: severity as any,
      title: 'Test Alert',
      message,
      timestamp: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: 'Test alert sent',
      channels: result.channels,
    });
  } catch (error) {
    logger.error({ error }, 'Test alert failed');
    return NextResponse.json(
      { success: false, error: 'Failed to send test alert' },
      { status: 500 }
    );
  }
}
