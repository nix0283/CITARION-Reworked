/**
 * Analytics API Routes
 * 
 * Endpoints for performance analytics and recommendations
 * 
 * @routes /api/analytics/*
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTradeAnalyzer } from '@/lib/analytics/trade-analyzer';
import { getStressTestEngine, STRESS_SCENARIOS } from '@/lib/analytics/stress-testing';
import { logger } from '@/lib/logger';

/**
 * GET /api/analytics/performance
 * 
 * Get performance metrics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || undefined;

    const analyzer = getTradeAnalyzer();
    const metrics = await analyzer.getPerformanceMetrics(symbol);

    return NextResponse.json({
      success: true,
      metrics,
    });
  } catch (error) {
    logger.error({ error }, 'Get performance metrics failed');
    return NextResponse.json(
      { success: false, error: 'Failed to get metrics' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analytics/recommendations
 * 
 * Get AI recommendations
 */
export async function GET(request: NextRequest) {
  try {
    const analyzer = getTradeAnalyzer();
    const recommendations = analyzer.getRecommendations();

    const formattedRecommendations = recommendations.map((rec, index) => ({
      id: `rec-${index}`,
      type: rec.includes('best') || rec.includes('Excellent') ? 'SUCCESS' as const : 
            rec.includes('Avoid') || rec.includes('cautious') ? 'WARNING' as const : 
            'INFO' as const,
      message: rec,
      priority: index,
    }));

    return NextResponse.json({
      success: true,
      recommendations: formattedRecommendations,
    });
  } catch (error) {
    logger.error({ error }, 'Get recommendations failed');
    return NextResponse.json(
      { success: false, error: 'Failed to get recommendations' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analytics/patterns
 * 
 * Get recognized patterns
 */
export async function GET(request: NextRequest) {
  try {
    const analyzer = getTradeAnalyzer();
    const model = analyzer.getLearningModel();

    if (!model) {
      return NextResponse.json({
        success: true,
        patterns: [],
      });
    }

    const patterns = [
      ...model.patterns.map(p => ({
        name: p.name,
        winRate: p.winRate,
        occurrenceCount: p.occurrenceCount,
        profitable: p.profitable,
      })),
      ...model.avoidPatterns.map(p => ({
        name: `Avoid: ${p.name}`,
        winRate: p.winRate,
        occurrenceCount: p.occurrenceCount,
        profitable: p.profitable,
      })),
    ];

    return NextResponse.json({
      success: true,
      patterns,
    });
  } catch (error) {
    logger.error({ error }, 'Get patterns failed');
    return NextResponse.json(
      { success: false, error: 'Failed to get patterns' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analytics/stress-test
 * 
 * Run stress test
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, scenarioId, initialEquity, positions } = body;

    if (!symbol || !scenarioId) {
      return NextResponse.json(
        { success: false, error: 'symbol and scenarioId required' },
        { status: 400 }
      );
    }

    const stressEngine = getStressTestEngine();
    const scenario = STRESS_SCENARIOS.find(s => s.id === scenarioId);

    if (!scenario) {
      return NextResponse.json(
        { success: false, error: 'Scenario not found' },
        { status: 404 }
      );
    }

    const result = await stressEngine.runStressTest({
      symbol,
      scenario,
      initialEquity: initialEquity || 10000,
      positions: positions || [],
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error({ error }, 'Stress test failed');
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Stress test failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analytics/stress-scenarios
 * 
 * Get available stress scenarios
 */
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      success: true,
      scenarios: STRESS_SCENARIOS,
    });
  } catch (error) {
    logger.error({ error }, 'Get stress scenarios failed');
    return NextResponse.json(
      { success: false, error: 'Failed to get scenarios' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analytics/monte-carlo
 * 
 * Run Monte Carlo simulation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, initialEquity, simulations, timeHorizon, strategy } = body;

    if (!symbol || !strategy) {
      return NextResponse.json(
        { success: false, error: 'symbol and strategy required' },
        { status: 400 }
      );
    }

    const stressEngine = getStressTestEngine();
    const result = await stressEngine.runMonteCarlo({
      symbol,
      initialEquity: initialEquity || 10000,
      simulations: simulations || 1000,
      timeHorizon: timeHorizon || 30,
      strategy,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error({ error }, 'Monte Carlo simulation failed');
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Simulation failed' },
      { status: 500 }
    );
  }
}
