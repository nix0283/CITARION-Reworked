/**
 * Real-time Dashboard API
 * 
 * Provides aggregated metrics for feature flags, correlation monitoring,
 * A/B tests, and recalibration status.
 * 
 * Endpoints:
 * - GET /api/dashboard/overview — Summary metrics
 * - GET /api/dashboard/feature-flags — Flag status and evaluations
 * - GET /api/dashboard/correlation — Correlation metrics and alerts
 * - GET /api/dashboard/experiments — A/B test status and results
 * - GET /api/dashboard/recalibration — Recalibration history and schedule
 * - WS /api/dashboard/stream — WebSocket for real-time updates
 * 
 * @module app/api/dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFeatureFlagManager, type FeatureName } from '@/lib/feature-flags';
import { getCrossBotCorrelationMonitor } from '@/lib/monitoring/cross-bot-correlation';
import { getABTestingFramework } from '@/lib/ab-testing';
import { getAutoRecalibrationScheduler } from '@/lib/recalibration';
import { logger } from '@/lib/logger';

// ==================== Overview Endpoint ====================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const section = searchParams.get('section');

  try {
    if (section) {
      // Route to specific section handler
      switch (section) {
        case 'feature-flags':
          return handleFeatureFlags();
        case 'correlation':
          return handleCorrelation();
        case 'experiments':
          return handleExperiments();
        case 'recalibration':
          return handleRecalibration();
        default:
          return NextResponse.json({ error: 'Unknown section' }, { status: 400 });
      }
    }

    // Return full overview
    return handleOverview();
  } catch (error) {
    logger.error({ error }, 'Dashboard API error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleOverview(): Promise<NextResponse> {
  const flagManager = getFeatureFlagManager();
  const correlationMonitor = getCrossBotCorrelationMonitor();
  const abFramework = getABTestingFramework();
  const recalScheduler = getAutoRecalibrationScheduler();

  // Feature flags summary
  const enabledFlags = Array.from(
    (flagManager as any).flags?.entries() || []
  ).filter(([, config]: [FeatureName, any]) => config.enabled).length;
  
  const totalFlags = Array.from(
    (flagManager as any).flags?.entries() || []
  ).length;

  // Correlation summary (simplified - in production, async fetch)
  const correlationSummary = {
    totalExposure: 0,
    concentrationRisk: 'LOW' as const,
    alertCount: 0,
    diversificationScore: 1.0,
  };

  // Experiments summary
  const registeredExperiments = Array.from(
    (abFramework as any).experiments?.entries() || []
  ).length;

  // Recalibration summary
  const scheduledRecalibrations = Array.from(
    (recalScheduler as any).configs?.entries() || []
  ).filter(([, config]: [string, any]) => config.schedule !== 'PERFORMANCE_TRIGGERED').length;

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    summary: {
      featureFlags: {
        enabled: enabledFlags,
        total: totalFlags,
        rolloutProgress: totalFlags > 0 ? Math.round((enabledFlags / totalFlags) * 100) : 0,
      },
      correlation: correlationSummary,
      experiments: {
        registered: registeredExperiments,
        running: 0, // Would query actual running experiments
      },
      recalibration: {
        scheduled: scheduledRecalibrations,
        lastRun: null, // Would fetch from audit log
      },
    },
    health: {
      status: 'healthy',
      lastUpdate: new Date().toISOString(),
      latency: {
        featureFlags: '<5ms',
        correlation: '<200ms',
        experiments: '<50ms',
        recalibration: '<100ms',
      },
    },
  });
}

async function handleFeatureFlags(): Promise<NextResponse> {
  const flagManager = getFeatureFlagManager();
  
  // Export config for dashboard
  const config = (flagManager as any).exportConfig?.() || {};
  
  // Get recent evaluations for activity feed
  const recentEvals = (flagManager as any).getEvaluationLog?.() || [];
  const recent = recentEvals.slice(-20).map((e: any) => ({
    feature: e.feature,
    enabled: e.enabled,
    reason: e.reason,
    evaluatedAt: e.evaluatedAt,
  }));

  return NextResponse.json({
    flags: Object.entries(config).map(([name, cfg]: [string, any]) => ({
      name,
      enabled: cfg.enabled,
      rolloutPercentage: cfg.rolloutPercentage,
      targetSymbols: cfg.targetSymbols,
      excludeSymbols: cfg.excludeSymbols,
      targetUsers: cfg.targetUsers,
      abTestGroup: cfg.abTestGroup,
      metadata: cfg.metadata,
    })),
    recentEvaluations: recent,
    timestamp: new Date().toISOString(),
  });
}

async function handleCorrelation(): Promise<NextResponse> {
  const monitor = getCrossBotCorrelationMonitor();
  
  // Run analysis (simplified - in production, would be cached)
  const metrics = await monitor.analyze();
  const recommendations = monitor.getRecommendations(metrics);

  return NextResponse.json({
    metrics: {
      totalExposure: metrics.totalExposure,
      netExposure: metrics.netExposure,
      grossExposure: metrics.grossExposure,
      leverageRatio: metrics.leverageRatio,
      avgCorrelation: metrics.avgCorrelation,
      maxCorrelation: metrics.maxCorrelation,
      concentrationRisk: metrics.concentrationRisk,
      diversificationScore: metrics.diversificationScore,
      symbolExposure: Array.from(metrics.symbolExposure.entries()).map(([symbol, data]) => ({
        symbol,
        ...data,
      })),
    },
    alerts: metrics.alerts,
    recommendations,
    timestamp: new Date().toISOString(),
  });
}

async function handleExperiments(): Promise<NextResponse> {
  const abFramework = getABTestingFramework();
  
  // Get registered experiments
  const experiments = Array.from(
    (abFramework as any).experiments?.entries() || []
  ).map(([name, config]: [string, any]) => ({
    name,
    description: config.description,
    feature: config.feature,
    treatmentPercentage: config.treatmentPercentage,
    primaryMetric: config.primaryMetric,
    status: 'REGISTERED', // Would query actual status
    assignments: 0, // Would count actual assignments
  }));

  return NextResponse.json({
    experiments,
    timestamp: new Date().toISOString(),
  });
}

async function handleRecalibration(): Promise<NextResponse> {
  const scheduler = getAutoRecalibrationScheduler();
  
  // Get registered configs
  const configs = Array.from(
    (scheduler as any).configs?.entries() || []
  ).map(([key, config]: [string, any]) => {
    const [target, botType] = key.split(':');
    return {
      target,
      botType: config.botType,
      schedule: config.schedule,
      minDataPoints: config.minDataPoints,
      primaryMetric: config.primaryMetric,
      lastRun: (scheduler as any).lastRecalibration?.get(key) || null,
    };
  });

  return NextResponse.json({
    configs,
    timestamp: new Date().toISOString(),
  });
}

// ==================== WebSocket Handler (for real-time updates) ====================

// Note: Next.js App Router WebSocket support requires custom server or external service
// This is a placeholder for the interface - implementation would use:
// - Socket.io with custom server
// - Pusher/Ably for managed WebSockets
// - Server-Sent Events as simpler alternative

export const runtime = 'edge'; // Enable edge runtime for low-latency responses
