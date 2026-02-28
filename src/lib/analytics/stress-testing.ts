/**
 * Stress Testing & Scenario Analysis
 * 
 * Test strategies under extreme market conditions:
 * - Market crash scenarios
 * - Flash crash simulation
 * - High volatility periods
 * - Liquidity crisis
 * - Correlation breakdown
 * - Monte Carlo simulation
 * 
 * @module lib/analytics/stress-testing
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface StressScenario {
  id: string;
  name: string;
  type: 'CRASH' | 'FLASH_CRASH' | 'HIGH_VOLATILITY' | 'LIQUIDITY_CRISIS' | 'CORRELATION_BREAKDOWN';
  severity: 'MODERATE' | 'SEVERE' | 'EXTREME';
  parameters: StressParameters;
}

export interface StressParameters {
  priceDropPercent: number;
  volatilityIncrease: number;
  volumeDecrease: number;
  spreadIncrease: number;
  correlationChange: number;
  duration: number; // Hours
}

export interface StressTestResult {
  scenarioId: string;
  scenarioName: string;
  initialEquity: number;
  finalEquity: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  liquidations: number;
  marginCalls: number;
  survivalRate: number;
  recoveryTime: number; // Hours to recover
  passed: boolean;
  details: StressTestDetails;
}

export interface StressTestDetails {
  worstDay: {
    date: string;
    pnl: number;
    drawdown: number;
  };
  worstTrade: {
    symbol: string;
    pnl: number;
    drawdown: number;
  };
  riskMetrics: {
    var95: number;
    var99: number;
    expectedShortfall: number;
  };
  recommendations: string[];
}

export interface MonteCarloResult {
  simulations: number;
  confidenceIntervals: {
    90: { lower: number; upper: number };
    95: { lower: number; upper: number };
    99: { lower: number; upper: number };
  };
  probabilityOfRuin: number;
  expectedReturn: number;
  expectedMaxDrawdown: number;
  distribution: number[];
}

// ==================== PREDEFINED SCENARIOS ====================

export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: 'scenario_1',
    name: 'Moderate Market Correction',
    type: 'CRASH',
    severity: 'MODERATE',
    parameters: {
      priceDropPercent: 10,
      volatilityIncrease: 1.5,
      volumeDecrease: 0.2,
      spreadIncrease: 2,
      correlationChange: 0.1,
      duration: 48,
    },
  },
  {
    id: 'scenario_2',
    name: 'Severe Market Crash',
    type: 'CRASH',
    severity: 'SEVERE',
    parameters: {
      priceDropPercent: 30,
      volatilityIncrease: 3,
      volumeDecrease: 0.5,
      spreadIncrease: 5,
      correlationChange: 0.3,
      duration: 168,
    },
  },
  {
    id: 'scenario_3',
    name: 'Flash Crash',
    type: 'FLASH_CRASH',
    severity: 'SEVERE',
    parameters: {
      priceDropPercent: 20,
      volatilityIncrease: 5,
      volumeDecrease: 0.8,
      spreadIncrease: 10,
      correlationChange: 0.5,
      duration: 1,
    },
  },
  {
    id: 'scenario_4',
    name: 'High Volatility Period',
    type: 'HIGH_VOLATILITY',
    severity: 'MODERATE',
    parameters: {
      priceDropPercent: 5,
      volatilityIncrease: 4,
      volumeDecrease: 0,
      spreadIncrease: 3,
      correlationChange: 0.2,
      duration: 72,
    },
  },
  {
    id: 'scenario_5',
    name: 'Liquidity Crisis',
    type: 'LIQUIDITY_CRISIS',
    severity: 'SEVERE',
    parameters: {
      priceDropPercent: 15,
      volatilityIncrease: 2,
      volumeDecrease: 0.9,
      spreadIncrease: 20,
      correlationChange: 0.4,
      duration: 120,
    },
  },
  {
    id: 'scenario_6',
    name: 'Black Swan Event',
    type: 'CRASH',
    severity: 'EXTREME',
    parameters: {
      priceDropPercent: 50,
      volatilityIncrease: 10,
      volumeDecrease: 0.95,
      spreadIncrease: 50,
      correlationChange: 0.8,
      duration: 720,
    },
  },
];

// ==================== STRESS TEST ENGINE ====================

export class StressTestEngine {
  /**
   * Run stress test for a strategy
   */
  async runStressTest(params: {
    symbol: string;
    scenario: StressScenario;
    initialEquity: number;
    positions: Array<{
      symbol: string;
      quantity: number;
      entryPrice: number;
      direction: 'LONG' | 'SHORT';
      leverage: number;
    }>;
  }): Promise<StressTestResult> {
    logger.info({
      scenario: params.scenario.name,
      symbol: params.symbol,
    }, 'Running stress test...');

    const { scenario, initialEquity, positions } = params;

    // Simulate price movements
    const pricePath = await this.simulatePricePath(params.symbol, scenario);

    // Calculate PnL throughout scenario
    const equityPath: number[] = [];
    let currentEquity = initialEquity;
    let maxDrawdown = 0;
    let maxDrawdownDuration = 0;
    let currentDrawdownDuration = 0;
    let peakEquity = initialEquity;
    let liquidations = 0;
    let marginCalls = 0;

    const dailyPnL: Array<{ date: string; pnl: number; drawdown: number }> = [];

    for (let i = 0; i < pricePath.length; i++) {
      const prices = pricePath[i];

      // Calculate portfolio value
      let portfolioValue = 0;
      for (const position of positions) {
        const priceChange = (prices[position.symbol] - position.entryPrice) / position.entryPrice;
        const pnl = position.direction === 'LONG' ? priceChange : -priceChange;
        const leveragedPnl = pnl * position.leverage * position.quantity * position.entryPrice;
        portfolioValue += leveragedPnl;
      }

      currentEquity = initialEquity + portfolioValue;
      equityPath.push(currentEquity);

      // Track drawdown
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
        currentDrawdownDuration = 0;
      } else {
        currentDrawdownDuration++;
        if (currentDrawdownDuration > maxDrawdownDuration) {
          maxDrawdownDuration = currentDrawdownDuration;
        }
      }

      const drawdown = (peakEquity - currentEquity) / peakEquity;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      // Check for margin call / liquidation
      const maintenanceMargin = positions.reduce((sum, pos) => {
        return sum + (pos.quantity * pos.entryPrice * prices[pos.symbol]) / pos.leverage;
      }, 0);

      if (currentEquity < maintenanceMargin * 1.2) {
        marginCalls++;
      }

      if (currentEquity < maintenanceMargin) {
        liquidations++;
      }

      // Record daily PnL
      if (i % 24 === 0) { // Every 24 hours (assuming hourly data)
        dailyPnL.push({
          date: new Date(Date.now() - (pricePath.length - i) * 3600000).toISOString(),
          pnl: currentEquity - initialEquity,
          drawdown,
        });
      }
    }

    const finalEquity = equityPath[equityPath.length - 1];
    const survivalRate = finalEquity > 0 ? 1 : 0;

    // Calculate risk metrics
    const returns = equityPath.map((e, i) => i > 0 ? (e - equityPath[i - 1]) / equityPath[i - 1] : 0);
    const var95 = this.calculateVaR(returns, 0.95);
    const var99 = this.calculateVaR(returns, 0.99);
    const expectedShortfall = this.calculateExpectedShortfall(returns, 0.95);

    // Find worst day and trade
    const worstDay = dailyPnL.reduce((worst, day) => day.pnl < worst.pnl ? day : worst, dailyPnL[0]);
    const worstTrade = this.findWorstTrade(positions, pricePath);

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      maxDrawdown,
      liquidations,
      marginCalls,
      survivalRate,
      var95,
    });

    const result: StressTestResult = {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      initialEquity,
      finalEquity,
      maxDrawdown,
      maxDrawdownDuration,
      liquidations,
      marginCalls,
      survivalRate,
      recoveryTime: this.calculateRecoveryTime(equityPath, initialEquity),
      passed: survivalRate > 0 && maxDrawdown < 0.5,
      details: {
        worstDay,
        worstTrade,
        riskMetrics: {
          var95,
          var99,
          expectedShortfall,
        },
        recommendations,
      },
    };

    // Save to database
    await db.stressTest.create({
      data: {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        initialEquity,
        finalEquity,
        maxDrawdown,
        liquidations,
        marginCalls,
        survivalRate,
        passed: result.passed,
        details: result.details as any,
      },
    });

    logger.info({
      scenario: scenario.name,
      passed: result.passed,
      maxDrawdown: (maxDrawdown * 100).toFixed(1) + '%',
      finalEquity: finalEquity.toFixed(2),
    }, 'Stress test completed');

    return result;
  }

  /**
   * Run Monte Carlo simulation
   */
  async runMonteCarlo(params: {
    symbol: string;
    initialEquity: number;
    simulations: number;
    timeHorizon: number; // Days
    strategy: {
      winRate: number;
      avgWin: number;
      avgLoss: number;
      positionSize: number;
    };
  }): Promise<MonteCarloResult> {
    logger.info({
      simulations: params.simulations,
      timeHorizon: params.timeHorizon,
    }, 'Running Monte Carlo simulation...');

    const { simulations, initialEquity, timeHorizon, strategy } = params;
    const finalEquities: number[] = [];
    const maxDrawdowns: number[] = [];

    for (let sim = 0; sim < simulations; sim++) {
      let equity = initialEquity;
      let peakEquity = initialEquity;
      let maxDrawdown = 0;

      for (let day = 0; day < timeHorizon; day++) {
        // Simulate trade outcome
        const isWin = Math.random() < strategy.winRate;
        const pnlPercent = isWin ? strategy.avgWin : -strategy.avgLoss;
        const pnl = equity * strategy.positionSize * pnlPercent;
        
        equity += pnl;

        // Track drawdown
        if (equity > peakEquity) {
          peakEquity = equity;
        } else {
          const drawdown = (peakEquity - equity) / peakEquity;
          if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
          }
        }

        // Stop if ruined
        if (equity <= 0) {
          equity = 0;
          break;
        }
      }

      finalEquities.push(equity);
      maxDrawdowns.push(maxDrawdown);
    }

    // Calculate statistics
    finalEquities.sort((a, b) => a - b);

    const probabilityOfRuin = finalEquities.filter(e => e <= 0).length / simulations;
    const expectedReturn = finalEquities.reduce((a, b) => a + b, 0) / simulations;
    const expectedMaxDrawdown = maxDrawdowns.reduce((a, b) => a + b, 0) / simulations;

    // Confidence intervals
    const confidenceIntervals = {
      90: {
        lower: finalEquities[Math.floor(simulations * 0.05)],
        upper: finalEquities[Math.floor(simulations * 0.95)],
      },
      95: {
        lower: finalEquities[Math.floor(simulations * 0.025)],
        upper: finalEquities[Math.floor(simulations * 0.975)],
      },
      99: {
        lower: finalEquities[Math.floor(simulations * 0.005)],
        upper: finalEquities[Math.floor(simulations * 0.995)],
      },
    };

    const result: MonteCarloResult = {
      simulations,
      confidenceIntervals,
      probabilityOfRuin,
      expectedReturn,
      expectedMaxDrawdown,
      distribution: finalEquities.slice(0, 100), // Sample for visualization
    };

    logger.info({
      probabilityOfRuin: (probabilityOfRuin * 100).toFixed(1) + '%',
      expectedReturn: expectedReturn.toFixed(2),
      expectedMaxDrawdown: (expectedMaxDrawdown * 100).toFixed(1) + '%',
    }, 'Monte Carlo simulation completed');

    return result;
  }

  /**
   * Simulate price path under stress scenario
   */
  private async simulatePricePath(symbol: string, scenario: StressScenario): Promise<Record<string, number>[]> {
    // Get base volatility from historical data
    const baseVolatility = await this.getHistoricalVolatility(symbol);

    const pricePath: Record<string, number>[] = [];
    let currentPrice = await this.getCurrentPrice(symbol);

    for (let hour = 0; hour < scenario.parameters.duration; hour++) {
      // Apply scenario parameters
      const volatility = baseVolatility * scenario.parameters.volatilityIncrease;
      
      // Random price movement with bias toward crash
      const randomShock = (Math.random() - 0.5) * volatility * 2;
      const crashBias = scenario.parameters.priceDropPercent / scenario.parameters.duration / 100;
      
      currentPrice *= (1 + randomShock - crashBias);

      pricePath.push({
        [symbol]: currentPrice,
      });
    }

    return pricePath;
  }

  /**
   * Calculate Value at Risk
   */
  private calculateVaR(returns: number[], confidence: number): number {
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor(returns.length * (1 - confidence));
    return Math.abs(sorted[index] || 0);
  }

  /**
   * Calculate Expected Shortfall (CVaR)
   */
  private calculateExpectedShortfall(returns: number[], confidence: number): number {
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor(returns.length * (1 - confidence));
    const tailReturns = sorted.slice(0, index);
    
    if (tailReturns.length === 0) return 0;
    
    return Math.abs(tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length);
  }

  /**
   * Find worst trade in simulation
   */
  private findWorstTrade(positions: any[], pricePath: Record<string, number>[]): {
    symbol: string;
    pnl: number;
    drawdown: number;
  } {
    let worstPnl = 0;
    let worstSymbol = '';

    for (const position of positions) {
      const entryPrice = position.entryPrice;
      const finalPrice = pricePath[pricePath.length - 1][position.symbol];
      const priceChange = (finalPrice - entryPrice) / entryPrice;
      const pnl = position.direction === 'LONG' ? priceChange : -priceChange;
      
      if (pnl < worstPnl) {
        worstPnl = pnl;
        worstSymbol = position.symbol;
      }
    }

    return {
      symbol: worstSymbol,
      pnl: worstPnl,
      drawdown: Math.abs(worstPnl),
    };
  }

  /**
   * Calculate recovery time
   */
  private calculateRecoveryTime(equityPath: number[], initialEquity: number): number {
    const peakIndex = equityPath.indexOf(Math.max(...equityPath));
    
    for (let i = peakIndex; i < equityPath.length; i++) {
      if (equityPath[i] >= initialEquity) {
        return i - peakIndex;
      }
    }

    return -1; // Did not recover
  }

  /**
   * Generate recommendations based on results
   */
  private generateRecommendations(results: {
    maxDrawdown: number;
    liquidations: number;
    marginCalls: number;
    survivalRate: number;
    var95: number;
  }): string[] {
    const recommendations: string[] = [];

    if (results.maxDrawdown > 0.5) {
      recommendations.push('Reduce leverage - drawdown exceeded 50%');
    }

    if (results.liquidations > 0) {
      recommendations.push('CRITICAL: Liquidations occurred - significantly reduce position sizes');
    }

    if (results.marginCalls > 2) {
      recommendations.push('Frequent margin calls - increase margin buffer');
    }

    if (results.survivalRate < 1) {
      recommendations.push('Strategy did not survive scenario - review risk parameters');
    }

    if (results.var95 > 0.1) {
      recommendations.push('High VaR - consider hedging strategies');
    }

    if (recommendations.length === 0) {
      recommendations.push('Strategy passed stress test - parameters appear robust');
    }

    return recommendations;
  }

  /**
   * Helper: Get historical volatility
   */
  private async getHistoricalVolatility(symbol: string): Promise<number> {
    const candles = await db.ohlcvCandle.findMany({
      where: { symbol },
      orderBy: { openTime: 'desc' },
      take: 30,
    });

    if (candles.length < 30) return 0.02;

    const returns = [];
    for (let i = 1; i < candles.length; i++) {
      const ret = (candles[i - 1].close - candles[i].close) / candles[i].close;
      returns.push(ret);
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }

  /**
   * Helper: Get current price
   */
  private async getCurrentPrice(symbol: string): Promise<number> {
    const candle = await db.ohlcvCandle.findFirst({
      where: { symbol },
      orderBy: { openTime: 'desc' },
    });

    return candle?.close || 50000;
  }
}

// ==================== SINGLETON ====================

let engineInstance: StressTestEngine | null = null;

export function getStressTestEngine(): StressTestEngine {
  if (!engineInstance) {
    engineInstance = new StressTestEngine();
  }
  return engineInstance;
}

// ==================== EXPORTS ====================

export default {
  StressTestEngine,
  getStressTestEngine,
  STRESS_SCENARIOS,
};
