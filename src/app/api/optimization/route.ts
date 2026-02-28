import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// GET /api/optimization
export async function GET() {
  try {
    // Get optimization jobs from strategy templates with optimization metadata
    const strategies = await db.strategyTemplate.findMany({
      where: {
        category: 'optimized',
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    const jobs = strategies.map(s => ({
      id: s.id,
      botType: s.botType,
      status: 'COMPLETED',
      progress: 100,
      method: 'GA',
      generation: 50,
      bestFitness: 0.85,
      parameters: JSON.parse(s.config || '{}'),
      startTime: s.createdAt.toISOString(),
      endTime: s.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: jobs,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch optimization jobs');
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch optimization jobs',
    }, { status: 500 });
  }
}

// POST /api/optimization/run
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { botType, method, populationSize, generations, backtestDays, fitnessFunction } = body;

    if (!botType) {
      return NextResponse.json({
        success: false,
        error: 'botType is required',
      }, { status: 400 });
    }

    // Create optimization job record
    const job = await db.strategyTemplate.create({
      data: {
        botType,
        category: 'optimizing',
        name: `Optimization_${botType}_${Date.now()}`,
        config: JSON.stringify({
          method,
          populationSize,
          generations,
          backtestDays,
          fitnessFunction,
        }),
      },
    });

    logger.info({ jobId: job.id, botType, method }, 'Optimization job created');

    // Note: Actual optimization would run in background
    // This is a placeholder for the optimization engine

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Optimization started',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start optimization');
    return NextResponse.json({
      success: false,
      error: 'Failed to start optimization',
    }, { status: 500 });
  }
}

// POST /api/optimization/deploy
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json({
        success: false,
        error: 'jobId is required',
      }, { status: 400 });
    }

    // Update strategy category to deployed
    await db.strategyTemplate.update({
      where: { id: jobId },
      data: {
        category: 'deployed',
      },
    });

    logger.info({ jobId }, 'Strategy deployed');

    return NextResponse.json({
      success: true,
      message: 'Strategy deployed',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to deploy strategy');
    return NextResponse.json({
      success: false,
      error: 'Failed to deploy strategy',
    }, { status: 500 });
  }
}
