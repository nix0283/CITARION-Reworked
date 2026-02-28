/**
 * Vision Bot - Market Forecast API
 * 
 * Generate market forecasts using ML model
 * Get forecast statistics and accuracy
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMarketForecastService } from '@/lib/vision-bot/ml/service';
import { db } from '@/lib/db';

/**
 * GET /api/vision/forecast
 * 
 * Get market forecast
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'BTC/USDT';
    const timeframe = searchParams.get('timeframe') || '1h';
    
    // Get recent candles from database
    const candles = await db.ohlcvCandle.findMany({
      where: {
        symbol: symbol.replace('/', ''),
        timeframe,
      },
      orderBy: { openTime: 'desc' },
      take: 200,
    });
    
    if (candles.length < 50) {
      return NextResponse.json(
        { error: 'Not enough data for forecast' },
        { status: 400 }
      );
    }
    
    // Reverse to get chronological order
    candles.reverse();
    
    // Convert to Candle format
    const candleData = candles.map(c => ({
      timestamp: c.openTime.getTime(),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
    
    // Generate forecast
    const service = getMarketForecastService({
      symbol,
      timeframe,
      confidenceThreshold: 0.7,
      lookbackDays: 30,
      autoTrade: false,
    });
    
    const forecast = await service.generateForecast(candleData);
    const signal = service.getTradingSignal(forecast);
    
    // Get statistics
    const stats = await service.getStatistics();
    
    return NextResponse.json({
      success: true,
      forecast: {
        direction: forecast.direction,
        confidence: forecast.confidence,
        upwardProb: forecast.upwardProb,
        downwardProb: forecast.downwardProb,
        consolidationProb: forecast.consolidationProb,
        predictedChange24h: forecast.predictedChange24h,
        timestamp: forecast.timestamp,
      },
      signal: {
        action: signal.action,
        leverage: signal.leverage,
        stopLossPercent: signal.stopLossPercent,
        takeProfitPercent: signal.takeProfitPercent,
        reason: signal.reason,
      },
      statistics: stats,
    });
  } catch (error) {
    console.error('[Vision Forecast API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to generate forecast' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/vision/forecast
 * 
 * Force generate new forecast
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol = 'BTC/USDT', timeframe = '1h' } = body;
    
    // Get candles
    const candles = await db.ohlcvCandle.findMany({
      where: {
        symbol: symbol.replace('/', ''),
        timeframe,
      },
      orderBy: { openTime: 'desc' },
      take: 200,
    });
    
    if (candles.length < 50) {
      return NextResponse.json(
        { error: 'Not enough data' },
        { status: 400 }
      );
    }
    
    candles.reverse();
    const candleData = candles.map(c => ({
      timestamp: c.openTime.getTime(),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
    
    // Generate forecast
    const service = getMarketForecastService({
      symbol,
      timeframe,
      confidenceThreshold: 0.7,
      lookbackDays: 30,
      autoTrade: false,
    });
    
    const forecast = await service.generateForecast(candleData);
    const signal = service.getTradingSignal(forecast);
    
    return NextResponse.json({
      success: true,
      forecast,
      signal,
      message: 'Forecast generated successfully',
    });
  } catch (error) {
    console.error('[Vision Forecast API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to generate forecast' },
      { status: 500 }
    );
  }
}
