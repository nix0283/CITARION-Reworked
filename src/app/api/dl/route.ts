/**
 * Deep Learning API Routes
 * 
 * Endpoints for DL predictions and model management
 * 
 * @routes /api/dl/*
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDeepLearningPredictor } from '@/lib/deep-learning/predictor';
import { logger } from '@/lib/logger';

/**
 * GET /api/dl/predict
 * 
 * Get DL prediction for symbol
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Symbol required' },
        { status: 400 }
      );
    }

    const predictor = getDeepLearningPredictor();
    const prediction = await predictor.predict(symbol);

    if (!prediction) {
      return NextResponse.json(
        { success: false, error: 'Prediction failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      prediction,
    });
  } catch (error) {
    logger.error({ error }, 'Get prediction failed');
    return NextResponse.json(
      { success: false, error: 'Prediction failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dl/train
 * 
 * Train DL model for symbol
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, config } = body;

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Symbol required' },
        { status: 400 }
      );
    }

    const predictor = getDeepLearningPredictor(config);
    const result = await predictor.train(symbol);

    return NextResponse.json({
      success: true,
      result: {
        modelId: result.modelId,
        accuracy: result.accuracy,
        f1Score: result.f1Score,
        trainingSamples: result.trainingSamples,
        validationSamples: result.validationSamples,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Train model failed');
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Training failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dl/metrics
 * 
 * Get model metrics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    const predictor = getDeepLearningPredictor();

    if (symbol) {
      const metrics = predictor.getModelMetrics(symbol);
      
      if (!metrics) {
        return NextResponse.json(
          { success: false, error: 'No metrics found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        metrics,
      });
    } else {
      const allMetrics = predictor.getAllMetrics();
      const metricsArray = Array.from(allMetrics.entries()).map(([symbol, metrics]) => ({
        symbol,
        ...metrics,
      }));

      return NextResponse.json({
        success: true,
        metrics: metricsArray,
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
 * POST /api/dl/verify
 * 
 * Verify prediction accuracy
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { predictionId } = body;

    if (!predictionId) {
      return NextResponse.json(
        { success: false, error: 'predictionId required' },
        { status: 400 }
      );
    }

    const predictor = getDeepLearningPredictor();
    await predictor.verifyPrediction(predictionId);

    return NextResponse.json({
      success: true,
      message: 'Prediction verified',
    });
  } catch (error) {
    logger.error({ error }, 'Verify prediction failed');
    return NextResponse.json(
      { success: false, error: 'Verification failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dl/predictions
 * 
 * Get historical predictions
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const limit = parseInt(searchParams.get('limit') || '50');

    const { db } = await import('@/lib/db');

    const predictions = await db.dlPrediction.findMany({
      where: symbol ? { symbol } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      predictions,
      count: predictions.length,
    });
  } catch (error) {
    logger.error({ error }, 'Get predictions failed');
    return NextResponse.json(
      { success: false, error: 'Failed to get predictions' },
      { status: 500 }
    );
  }
}
