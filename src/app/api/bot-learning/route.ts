import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// GET /api/bot-learning
export async function GET() {
  try {
    const bots = await db.botLearningState.findMany({
      orderBy: { lastUpdated: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: bots,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch bot learning data');
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch bot learning data',
    }, { status: 500 });
  }
}

// POST /api/bot-learning/start
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { botId, botType, config } = body;

    if (!botId || !botType) {
      return NextResponse.json({
        success: false,
        error: 'botId and botType are required',
      }, { status: 400 });
    }

    // Create or update learning state
    await db.botLearningState.upsert({
      where: { botId },
      update: {
        status: 'LEARNING',
        currentPhase: 'BACKTEST',
        phaseProgress: 0,
        lastUpdated: new Date(),
      },
      create: {
        botId,
        botType,
        status: 'LEARNING',
        currentPhase: 'BACKTEST',
        phaseProgress: 0,
        generation: 0,
        fitnessScore: 0,
        config: JSON.stringify(config || {}),
      },
    });

    logger.info({ botId, botType }, 'Bot learning started');

    return NextResponse.json({
      success: true,
      message: 'Bot learning started',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start bot learning');
    return NextResponse.json({
      success: false,
      error: 'Failed to start bot learning',
    }, { status: 500 });
  }
}

// PATCH /api/bot-learning
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { botId, action } = body;

    if (!botId || !action) {
      return NextResponse.json({
        success: false,
        error: 'botId and action are required',
      }, { status: 400 });
    }

    const status = action === 'pause' ? 'PAUSED' : 'LEARNING';

    await db.botLearningState.update({
      where: { botId },
      data: {
        status,
        lastUpdated: new Date(),
      },
    });

    logger.info({ botId, action }, 'Bot learning state updated');

    return NextResponse.json({
      success: true,
      message: `Bot learning ${action}d`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update bot learning');
    return NextResponse.json({
      success: false,
      error: 'Failed to update bot learning',
    }, { status: 500 });
  }
}
