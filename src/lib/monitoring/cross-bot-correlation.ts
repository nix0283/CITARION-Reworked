/**
 * Cross-Bot Correlation Monitoring
 * 
 * Monitors position correlation across all active bots to prevent
 * concentration risk and overexposure to single market factors.
 * 
 * Based on: Modern Portfolio Theory (Markowitz, 1952)
 * - Tracks notional exposure per symbol across bots
 * - Calculates portfolio-level correlation
 * - Alerts when concentration exceeds thresholds
 * - Provides diversification recommendations
 * 
 * @module lib/monitoring/cross-bot-correlation
 */

import { logger } from '@/lib/logger';
import { db } from '@/lib/db';

export interface BotPosition {
  botId: string;
  botType: 'ARGUS' | 'GRID' | 'DCA' | 'VISION' | 'BB';
  symbol: string;
  direction: 'LONG' | 'SHORT';
  notional: number;  // USD value
  entryPrice: number;
  entryTime: Date;
  leverage: number;
}

export interface CorrelationMetrics {
  // Per-symbol concentration
  symbolExposure: Map<string, {
    totalNotional: number;
    longNotional: number;
    shortNotional: number;
    botCount: number;
    concentrationPct: number;  // % of total portfolio
  }>;
  
  // Portfolio-level metrics
  totalExposure: number;
  netExposure: number;  // Long - Short
  grossExposure: number;  // Long + Short
  leverageRatio: number;  // Gross / Equity
  
  // Correlation analysis
  avgCorrelation: number;  // Average pairwise correlation
  maxCorrelation: number;  // Highest pairwise correlation
  concentrationRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Diversification score (0-1, higher = better diversified)
  diversificationScore: number;
  
  // Alerts
  alerts: Array<{
    type: 'CONCENTRATION' | 'CORRELATION' | 'LEVERAGE';
    severity: 'WARNING' | 'CRITICAL';
    message: string;
    symbol?: string;
    value: number;
    threshold: number;
  }>;
}

export interface CorrelationConfig {
  // Concentration thresholds
  maxSymbolConcentrationPct: number;    // Default: 0.25 (25% of portfolio)
  maxNetExposurePct: number;             // Default: 0.50 (50% net long/short)
  maxLeverageRatio: number;              // Default: 3.0
  
  // Correlation thresholds
  correlationLookbackHours: number;      // Default: 24
  maxAvgCorrelation: number;             // Default: 0.70
  maxPairwiseCorrelation: number;        // Default: 0.85
  
  // Alert settings
  alertOnConcentration: boolean;         // Default: true
  alertOnCorrelation: boolean;           // Default: true
  alertCooldownMinutes: number;          // Default: 30
  
  // Diversification scoring
  minSymbolsForDiversification: number;  // Default: 5
  idealCorrelation: number;              // Default: 0.30 (target for scoring)
}

export class CrossBotCorrelationMonitor {
  private config: CorrelationConfig;
  private priceHistory: Map<string, number[]> = new Map();
  private lastAlertTime: Map<string, Date> = new Map();
  
  constructor(config: Partial<CorrelationConfig> = {}) {
    this.config = {
      maxSymbolConcentrationPct: 0.25,
      maxNetExposurePct: 0.50,
      maxLeverageRatio: 3.0,
      correlationLookbackHours: 24,
      maxAvgCorrelation: 0.70,
      maxPairwiseCorrelation: 0.85,
      alertOnConcentration: true,
      alertOnCorrelation: true,
      alertCooldownMinutes: 30,
      minSymbolsForDiversification: 5,
      idealCorrelation: 0.30,
      ...config,
    };
  }

  /**
   * Fetch all active positions from database
   */
  async fetchActivePositions(): Promise<BotPosition[]> {
    // Query all active trades across bot types
    const trades = await db.trade.findMany({
      where: {
        status: 'OPEN',
        isDemo: false,  // Exclude paper trading
      },
      include: {
        account: true,
      },
    });
    
    return trades.map(trade => ({
      botId: trade.botId || 'unknown',
      botType: (trade.signalSource?.toUpperCase() || 'UNKNOWN') as BotPosition['botType'],
      symbol: trade.symbol,
      direction: trade.direction,
      notional: trade.amount * trade.entryPrice * trade.leverage,
      entryPrice: trade.entryPrice,
      entryTime: trade.entryTime,
      leverage: trade.leverage,
    }));
  }

  /**
   * Calculate pairwise correlation between two symbols
   */
  private calculateCorrelation(returns1: number[], returns2: number[]): number {
    if (returns1.length !== returns2.length || returns1.length < 10) return 0;
    
    const n = returns1.length;
    const mean1 = returns1.reduce((a, b) => a + b, 0) / n;
    const mean2 = returns2.reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0, sumSq1 = 0, sumSq2 = 0;
    
    for (let i = 0; i < n; i++) {
      const d1 = returns1[i] - mean1;
      const d2 = returns2[i] - mean2;
      numerator += d1 * d2;
      sumSq1 += d1 * d1;
      sumSq2 += d2 * d2;
    }
    
    const denominator = Math.sqrt(sumSq1 * sumSq2);
    return denominator > 0 ? numerator / denominator : 0;
  }

  /**
   * Get or calculate returns for a symbol
   */
  private async getReturns(symbol: string, hours: number): Promise<number[]> {
    // Check cache first
    const cached = this.priceHistory.get(symbol);
    if (cached && cached.length >= hours) {
      return cached.slice(-hours);
    }
    
    // Fetch from database (simplified - in production, use OHLCV service)
    const candles = await db.ohlcvCandle.findMany({
      where: {
        symbol,
        timeframe: '1h',
        openTime: { gte: new Date(Date.now() - hours * 60 * 60 * 1000) },
      },
      orderBy: { openTime: 'asc' },
    });
    
    if (candles.length < 2) return [];
    
    // Calculate log returns
    const returns: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const ret = Math.log(candles[i].close / candles[i - 1].close);
      returns.push(ret);
    }
    
    // Cache result
    this.priceHistory.set(symbol, returns);
    return returns;
  }

  /**
   * Calculate concentration metrics for a symbol
   */
  private calculateSymbolConcentration(
    positions: BotPosition[],
    totalExposure: number
  ): Map<string, CorrelationMetrics['symbolExposure'][string]> {
    const exposure = new Map<string, CorrelationMetrics['symbolExposure'][string]>();
    
    for (const pos of positions) {
      const existing = exposure.get(pos.symbol) || {
        totalNotional: 0,
        longNotional: 0,
        shortNotional: 0,
        botCount: 0,
        concentrationPct: 0,
      };
      
      existing.totalNotional += Math.abs(pos.notional);
      if (pos.direction === 'LONG') {
        existing.longNotional += pos.notional;
      } else {
        existing.shortNotional += pos.notional;
      }
      
      // Count unique bots (avoid double-counting same bot)
      const bots = exposure.get(pos.symbol)?.botCount || 0;
      // Simplified: assume each position is from different bot instance
      existing.botCount = bots + 1;
      
      existing.concentrationPct = totalExposure > 0 
        ? existing.totalNotional / totalExposure 
        : 0;
      
      exposure.set(pos.symbol, existing);
    }
    
    return exposure;
  }

  /**
   * Calculate portfolio-level correlation metrics
   */
  private async calculateCorrelationMetrics(positions: BotPosition[]): Promise<{
    avgCorrelation: number;
    maxCorrelation: number;
    pairwiseCorrelations: Map<string, number>;
  }> {
    const symbols = [...new Set(positions.map(p => p.symbol))];
    if (symbols.length < 2) {
      return { avgCorrelation: 0, maxCorrelation: 0, pairwiseCorrelations: new Map() };
    }
    
    // Fetch returns for all symbols
    const returnsMap = new Map<string, number[]>();
    for (const symbol of symbols) {
      const returns = await this.getReturns(symbol, this.config.correlationLookbackHours);
      if (returns.length > 0) {
        returnsMap.set(symbol, returns);
      }
    }
    
    // Calculate pairwise correlations
    const correlations: number[] = [];
    let maxCorr = 0;
    const pairwise = new Map<string, number>();
    
    const symbolsWithReturns = [...returnsMap.keys()];
    for (let i = 0; i < symbolsWithReturns.length; i++) {
      for (let j = i + 1; j < symbolsWithReturns.length; j++) {
        const s1 = symbolsWithReturns[i];
        const s2 = symbolsWithReturns[j];
        
        const r1 = returnsMap.get(s1)!;
        const r2 = returnsMap.get(s2)!;
        
        // Align returns to same length
        const minLen = Math.min(r1.length, r2.length);
        const corr = this.calculateCorrelation(r1.slice(-minLen), r2.slice(-minLen));
        
        correlations.push(Math.abs(corr));
        maxCorr = Math.max(maxCorr, Math.abs(corr));
        pairwise.set(`${s1}:${s2}`, corr);
      }
    }
    
    const avgCorr = correlations.length > 0 
      ? correlations.reduce((a, b) => a + b, 0) / correlations.length 
      : 0;
    
    return { avgCorrelation: avgCorr, maxCorrelation: maxCorr, pairwiseCorrelations: pairwise };
  }

  /**
   * Calculate diversification score (0-1, higher = better)
   */
  private calculateDiversificationScore(
    symbolExposure: Map<string, any>,
    avgCorrelation: number,
    totalSymbols: number
  ): number {
    if (totalSymbols < this.config.minSymbolsForDiversification) {
      return totalSymbols / this.config.minSymbolsForDiversification * 0.5;
    }
    
    // Component 1: Symbol concentration (Herfindahl-like)
    const concentrations = [...symbolExposure.values()].map(e => e.concentrationPct);
    const hhi = concentrations.reduce((sum, c) => sum + c * c, 0);
    const concentrationScore = 1 - hhi;  // Lower HHI = better diversification
    
    // Component 2: Correlation score
    const correlationScore = 1 - Math.max(0, (avgCorrelation - this.config.idealCorrelation) / (1 - this.config.idealCorrelation));
    
    // Weighted combination
    return 0.6 * concentrationScore + 0.4 * correlationScore;
  }

  /**
   * Generate alerts based on thresholds
   */
  private generateAlerts(
    metrics: CorrelationMetrics,
    positions: BotPosition[]
  ): CorrelationMetrics['alerts'] {
    const alerts: CorrelationMetrics['alerts'] = [];
    const now = new Date();
    
    // Concentration alerts
    for (const [symbol, exposure] of metrics.symbolExposure) {
      if (exposure.concentrationPct > this.config.maxSymbolConcentrationPct) {
        const alertKey = `concentration:${symbol}`;
        if (this.shouldAlert(alertKey, now)) {
          alerts.push({
            type: 'CONCENTRATION',
            severity: exposure.concentrationPct > this.config.maxSymbolConcentrationPct * 1.5 ? 'CRITICAL' : 'WARNING',
            message: `High concentration in ${symbol}: ${(exposure.concentrationPct * 100).toFixed(1)}% of portfolio`,
            symbol,
            value: exposure.concentrationPct,
            threshold: this.config.maxSymbolConcentrationPct,
          });
          this.lastAlertTime.set(alertKey, now);
        }
      }
    }
    
    // Correlation alerts
    if (metrics.avgCorrelation > this.config.maxAvgCorrelation) {
      const alertKey = 'correlation:avg';
      if (this.shouldAlert(alertKey, now)) {
        alerts.push({
          type: 'CORRELATION',
          severity: metrics.avgCorrelation > this.config.maxAvgCorrelation * 1.2 ? 'CRITICAL' : 'WARNING',
          message: `High average correlation: ${(metrics.avgCorrelation * 100).toFixed(1)}%`,
          value: metrics.avgCorrelation,
          threshold: this.config.maxAvgCorrelation,
        });
        this.lastAlertTime.set(alertKey, now);
      }
    }
    
    // Leverage alerts
    if (metrics.leverageRatio > this.config.maxLeverageRatio) {
      const alertKey = 'leverage:total';
      if (this.shouldAlert(alertKey, now)) {
        alerts.push({
          type: 'LEVERAGE',
          severity: metrics.leverageRatio > this.config.maxLeverageRatio * 1.3 ? 'CRITICAL' : 'WARNING',
          message: `High leverage ratio: ${metrics.leverageRatio.toFixed(2)}x`,
          value: metrics.leverageRatio,
          threshold: this.config.maxLeverageRatio,
        });
        this.lastAlertTime.set(alertKey, now);
      }
    }
    
    return alerts;
  }

  /**
   * Check if alert should be sent (respecting cooldown)
   */
  private shouldAlert(key: string, now: Date): boolean {
    const lastAlert = this.lastAlertTime.get(key);
    if (!lastAlert) return true;
    
    const cooldownMs = this.config.alertCooldownMinutes * 60 * 1000;
    return now.getTime() - lastAlert.getTime() > cooldownMs;
  }

  /**
   * Main analysis method - calculate all correlation metrics
   */
  async analyze(positions?: BotPosition[]): Promise<CorrelationMetrics> {
    const activePositions = positions || await this.fetchActivePositions();
    
    if (activePositions.length === 0) {
      return {
        symbolExposure: new Map(),
        totalExposure: 0,
        netExposure: 0,
        grossExposure: 0,
        leverageRatio: 0,
        avgCorrelation: 0,
        maxCorrelation: 0,
        concentrationRisk: 'LOW',
        diversificationScore: 1,
        alerts: [],
      };
    }
    
    // Calculate exposure metrics
    const totalExposure = activePositions.reduce((sum, p) => sum + Math.abs(p.notional), 0);
    const longExposure = activePositions.filter(p => p.direction === 'LONG').reduce((sum, p) => sum + p.notional, 0);
    const shortExposure = activePositions.filter(p => p.direction === 'SHORT').reduce((sum, p) => sum + Math.abs(p.notional), 0);
    const netExposure = longExposure - shortExposure;
    const grossExposure = longExposure + shortExposure;
    
    // Estimate equity (simplified - in production, fetch from accounts)
    const estimatedEquity = totalExposure / 2; // Assume ~50% margin
    const leverageRatio = estimatedEquity > 0 ? grossExposure / estimatedEquity : 0;
    
    // Symbol concentration
    const symbolExposure = this.calculateSymbolConcentration(activePositions, totalExposure);
    
    // Correlation analysis
    const { avgCorrelation, maxCorrelation } = await this.calculateCorrelationMetrics(activePositions);
    
    // Diversification score
    const diversificationScore = this.calculateDiversificationScore(
      symbolExposure, 
      avgCorrelation, 
      symbolExposure.size
    );
    
    // Concentration risk level
    let concentrationRisk: CorrelationMetrics['concentrationRisk'] = 'LOW';
    const maxConcentration = Math.max(...[...symbolExposure.values()].map(e => e.concentrationPct));
    if (maxConcentration > 0.50) concentrationRisk = 'CRITICAL';
    else if (maxConcentration > 0.35) concentrationRisk = 'HIGH';
    else if (maxConcentration > 0.25) concentrationRisk = 'MEDIUM';
    
    // Generate alerts
    const alerts = this.generateAlerts({
      symbolExposure,
      totalExposure,
      netExposure,
      grossExposure,
      leverageRatio,
      avgCorrelation,
      maxCorrelation,
      concentrationRisk,
      diversificationScore,
      alerts: [],
    }, activePositions);
    
    // Log summary
    logger.info({
      totalPositions: activePositions.length,
      uniqueSymbols: symbolExposure.size,
      totalExposure: totalExposure.toFixed(2),
      netExposure: netExposure.toFixed(2),
      leverageRatio: leverageRatio.toFixed(2),
      avgCorrelation: avgCorrelation.toFixed(3),
      diversificationScore: diversificationScore.toFixed(3),
      concentrationRisk,
      alertCount: alerts.length,
    }, 'Cross-bot correlation analysis complete');
    
    return {
      symbolExposure,
      totalExposure,
      netExposure,
      grossExposure,
      leverageRatio,
      avgCorrelation,
      maxCorrelation,
      concentrationRisk,
      diversificationScore,
      alerts,
    };
  }

  /**
   * Get diversification recommendations
   */
  getRecommendations(metrics: CorrelationMetrics): Array<{
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    action: string;
    rationale: string;
    expectedImpact: string;
  }> {
    const recommendations: Array<{
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      action: string;
      rationale: string;
      expectedImpact: string;
    }> = [];
    
    // High concentration recommendations
    for (const [symbol, exposure] of metrics.symbolExposure) {
      if (exposure.concentrationPct > this.config.maxSymbolConcentrationPct) {
        recommendations.push({
          priority: 'HIGH',
          action: `Reduce exposure to ${symbol}`,
          rationale: `Current concentration ${(exposure.concentrationPct * 100).toFixed(1)}% exceeds ${(this.config.maxSymbolConcentrationPct * 100).toFixed(0)}% threshold`,
          expectedImpact: 'Reduce single-asset risk, improve diversification score',
        });
      }
    }
    
    // High correlation recommendations
    if (metrics.avgCorrelation > this.config.maxAvgCorrelation) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Add uncorrelated assets to portfolio',
        rationale: `Average correlation ${(metrics.avgCorrelation * 100).toFixed(1)}% indicates high systemic risk`,
        expectedImpact: 'Reduce portfolio volatility, improve risk-adjusted returns',
      });
    }
    
    // Low diversification score
    if (metrics.diversificationScore < 0.5) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Increase number of uncorrelated positions',
        rationale: `Diversification score ${metrics.diversificationScore.toFixed(2)} below target 0.7`,
        expectedImpact: 'Improve portfolio resilience to market shocks',
      });
    }
    
    // High leverage
    if (metrics.leverageRatio > this.config.maxLeverageRatio) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Reduce overall leverage or increase equity',
        rationale: `Leverage ratio ${metrics.leverageRatio.toFixed(2)}x exceeds ${(this.config.maxLeverageRatio).toFixed(1)}x limit`,
        expectedImpact: 'Reduce liquidation risk, improve margin safety',
      });
    }
    
    // Net exposure imbalance
    if (Math.abs(metrics.netExposure) / metrics.grossExposure > this.config.maxNetExposurePct) {
      const direction = metrics.netExposure > 0 ? 'long' : 'short';
      recommendations.push({
        priority: 'MEDIUM',
        action: `Rebalance ${direction} exposure`,
        rationale: `Net ${direction} exposure ${(Math.abs(metrics.netExposure) / metrics.grossExposure * 100).toFixed(1)}% of gross`,
        expectedImpact: 'Reduce directional bias, improve market-neutral positioning',
      });
    }
    
    return recommendations.sort((a, b) => {
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }
}

// ==================== Singleton ====================

let _monitor: CrossBotCorrelationMonitor | null = null;

export function getCrossBotCorrelationMonitor(
  config?: Partial<CorrelationConfig>
): CrossBotCorrelationMonitor {
  if (!_monitor) {
    _monitor = new CrossBotCorrelationMonitor(config);
  }
  return _monitor;
}

export default {
  CrossBotCorrelationMonitor,
  getCrossBotCorrelationMonitor,
  type CorrelationConfig,
  type CorrelationMetrics,
  type BotPosition,
};
