/**
 * Backtest API Routes
 * 
 * Endpoints for backtesting and walk-forward analysis
 * 
 * @routes /api/backtest/*
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWalkForwardOptimizer } from '@/lib/optimization/walk-forward';
import { getTradingCostsCalculator } from '@/lib/analytics/trading-costs';
import { logger } from '@/lib/logger';

/**
 * POST /api/backtest/run
 * 
 * Run backtest
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      symbol,
      startDate,
      endDate,
      initialCapital,
      commission,
      slippage,
      strategy,
      parameters,
    } = body;

    if (!symbol || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'symbol, startDate, and endDate required' },
        { status: 400 }
      );
    }

    // Get historical data
    const { db } = await import('@/lib/db');
    const candles = await db.ohlcvCandle.findMany({
      where: {
        symbol,
        openTime: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      orderBy: { openTime: 'asc' },
    });

    if (candles.length < 100) {
      return NextResponse.json(
        { success: false, error: 'Insufficient data for backtest' },
        { status: 400 }
      );
    }

    // Initialize cost calculator
    const costCalculator = getTradingCostsCalculator();

    // Run backtest simulation
    let equity = initialCapital;
    let position: any = null;
    const trades: any[] = [];
    const equityCurve: Array<{ date: string; equity: number }> = [];

    for (let i = 50; i < candles.length; i++) {
      const candle = candles[i];
      
      // Simple MA crossover strategy (simplified)
      const sma20 = candles.slice(i - 20, i).reduce((sum, c) => sum + c.close, 0) / 20;
      const sma50 = candles.slice(i - 50, i).reduce((sum, c) => sum + c.close, 0) / 50;
      
      const prevSma20 = candles.slice(i - 21, i - 1).reduce((sum, c) => sum + c.close, 0) / 20;
      const prevSma50 = candles.slice(i - 51, i - 1).reduce((sum, c) => sum + c.close, 0) / 50;

      // Generate signal
      let signal = 0;
      if (prevSma20 <= prevSma50 && sma20 > sma50) {
        signal = 1; // Buy
      } else if (prevSma20 >= prevSma50 && sma20 < sma50) {
        signal = -1; // Sell
      }

      // Execute trades
      if (signal !== 0 && !position) {
        // Open position
        const costs = costCalculator.calculateCosts({
          symbol,
          side: signal === 1 ? 'BUY' : 'SELL',
          orderType: 'MARKET',
          quantity: (equity * 0.1) / candle.close,
          price: candle.close,
        });

        position = {
          symbol,
          side: signal === 1 ? 'BUY' : 'SELL',
          quantity: (equity * 0.1) / candle.close,
          entryPrice: candle.close,
          entryCosts: costs.totalCost,
          entryDate: candle.openTime,
        };
      } else if (position && signal === 0) {
        // Close position (simplified - close after N candles)
        const exitPrice = candle.close;
        const pnlPercent = position.side === 'BUY'
          ? (exitPrice - position.entryPrice) / position.entryPrice
          : (position.entryPrice - exitPrice) / position.entryPrice;

        const exitCosts = costCalculator.calculateCosts({
          symbol,
          side: position.side === 'BUY' ? 'SELL' : 'BUY',
          orderType: 'MARKET',
          quantity: position.quantity,
          price: exitPrice,
        });

        const pnl = (pnlPercent * position.quantity * position.entryPrice) - position.entryCosts - exitCosts.totalCost;
        equity += pnl;

        trades.push({
          date: candle.openTime.toISOString(),
          symbol: position.symbol,
          side: position.side,
          quantity: position.quantity,
          entryPrice: position.entryPrice,
          exitPrice,
          pnl,
        });

        position = null;
      }

      // Record equity
      equityCurve.push({
        date: candle.openTime.toISOString(),
        equity,
      });
    }

    // Calculate metrics
    const totalReturn = (equity - initialCapital) / initialCapital;
    const winningTrades = trades.filter(t => t.pnl > 0).length;
    const losingTrades = trades.filter(t => t.pnl <= 0).length;
    const winRate = trades.length > 0 ? winningTrades / trades.length : 0;

    const avgWin = winningTrades > 0 ? trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? Math.abs(trades.filter(t => t.pnl <= 0).reduce((sum, t) => sum + t.pnl, 0) / losingTrades) : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * winningTrades) / (avgLoss * losingTrades) : 0;

    // Max drawdown
    let peak = initialCapital;
    let maxDrawdown = 0;
    for (const point of equityCurve) {
      if (point.equity > peak) {
        peak = point.equity;
      }
      const drawdown = (peak - point.equity) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Sharpe ratio
    const returns = trades.map(t => t.pnl / initialCapital);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / Math.max(1, returns.length);
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / Math.max(1, returns.length - 1));
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    const result = {
      totalReturn,
      sharpeRatio,
      maxDrawdown,
      winRate,
      profitFactor,
      totalTrades: trades.length,
      winningTrades,
      losingTrades,
      avgWin,
      avgLoss,
      equityCurve,
      trades,
    };

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error({ error }, 'Backtest failed');
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Backtest failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/backtest/walk-forward
 * 
 * Run walk-forward optimization
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol } = body;

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'symbol required' },
        { status: 400 }
      );
    }

    const walkForwardOptimizer = getWalkForwardOptimizer();
    const result = await walkForwardOptimizer.runWalkForward(symbol);

    // Format for frontend
    const formattedResult = {
      recommendation: result.recommendation,
      stabilityScore: result.stabilityScore,
      avgDegradation: result.avgDegradation,
      windows: result.windows.map(w => ({
        windowId: w.windowId,
        inSampleReturn: w.inSampleMetrics.totalReturn,
        outOfSampleReturn: w.outOfSampleMetrics.totalReturn,
        passed: w.passed,
      })),
    };

    return NextResponse.json({
      success: true,
      result: formattedResult,
    });
  } catch (error) {
    logger.error({ error }, 'Walk-forward failed');
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Walk-forward failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/backtest/status
 * 
 * Get backtest status
 */
export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      status: {
        available: true,
        version: '2.2.0',
      },
    });
  } catch (error) {
    logger.error({ error }, 'Get status failed');
    return NextResponse.json(
      { success: false, error: 'Failed to get status' },
      { status: 500 }
    );
  }
}
