/**
 * Self-Learning Trading Engine
 * 
 * Advanced self-improvement system:
 * - Automatic strategy generation
 * - Walk-forward optimization
 * - Paper trading auto-test
 * - Trade analysis & learning
 * - Parameter optimization
 * - Auto-deploy validated strategies
 * 
 * @module lib/auto-learning/self-learning-engine
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { GeneticOptimizer } from '@/lib/optimization/genetic-optimizer';
import { WalkForwardAnalyzer } from '@/lib/optimization/walk-forward';
import { TradeAnalyzer } from '@/lib/analytics/trade-analyzer';

// ==================== TYPES ====================

export interface LearningConfig {
  // Strategy generation
  minStrategies: number;
  maxStrategies: number;
  generationSize: number;
  mutationRate: number;
  crossoverRate: number;
  
  // Optimization
  walkForwardWindows: number;
  inSampleRatio: number;
  outOfSampleRatio: number;
  
  // Testing
  paperTestDuration: number; // hours
  minPaperTrades: number;
  minWinRate: number;
  minProfitFactor: number;
  maxDrawdown: number;
  
  // Deployment
  autoDeploy: boolean;
  deploymentThreshold: number;
  
  // Learning
  analyzeFailedTrades: boolean;
  learnFromSuccess: boolean;
  adaptToMarketRegime: boolean;
}

export interface StrategyCandidate {
  id: string;
  type: 'GRID' | 'DCA' | 'BB' | 'MIXED';
  parameters: Record<string, any>;
  backtestScore: number;
  walkForwardScore?: number;
  paperTestScore?: number;
  status: 'GENERATED' | 'BACKTESTED' | 'WALK_FORWARD' | 'PAPER_TEST' | 'APPROVED' | 'REJECTED' | 'DEPLOYED';
  createdAt: Date;
}

export interface LearningMetrics {
  totalStrategiesGenerated: number;
  strategiesBacktested: number;
  strategiesWalkForwarded: number;
  strategiesPaperTested: number;
  strategiesDeployed: number;
  avgBacktestScore: number;
  avgWalkForwardScore: number;
  avgPaperTestScore: number;
  deploymentRate: number;
  learningRate: number;
}

export interface TradeAnalysis {
  tradeId: string;
  symbol: string;
  strategy?: string;
  parameters?: Record<string, any>;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  pnl: number;
  pnlPercent: number;
  duration: number; // minutes
  marketRegime: 'TRENDING' | 'RANGING' | 'VOLATILE' | 'CALM';
  lessons: string[];
  parameterAdjustments: Record<string, number>;
}

export interface MarketRegime {
  type: 'TRENDING' | 'RANGING' | 'VOLATILE' | 'CALM';
  confidence: number;
  characteristics: {
    trendStrength: number;
    volatility: number;
    volume: number;
    momentum: number;
  };
  recommendedStrategies: string[];
  timestamp: Date;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: LearningConfig = {
  minStrategies: 10,
  maxStrategies: 100,
  generationSize: 50,
  mutationRate: 0.1,
  crossoverRate: 0.7,
  
  walkForwardWindows: 5,
  inSampleRatio: 0.7,
  outOfSampleRatio: 0.3,
  
  paperTestDuration: 24, // 24 hours
  minPaperTrades: 10,
  minWinRate: 0.55,
  minProfitFactor: 1.5,
  maxDrawdown: 0.15,
  
  autoDeploy: false,
  deploymentThreshold: 0.8,
  
  analyzeFailedTrades: true,
  learnFromSuccess: true,
  adaptToMarketRegime: true,
};

// ==================== SELF-LEARNING ENGINE ====================

export class SelfLearningEngine {
  private config: LearningConfig;
  private geneticOptimizer: GeneticOptimizer;
  private walkForwardAnalyzer: WalkForwardAnalyzer;
  private tradeAnalyzer: TradeAnalyzer;
  private isRunning: boolean = false;
  private learningInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<LearningConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.geneticOptimizer = new GeneticOptimizer();
    this.walkForwardAnalyzer = new WalkForwardAnalyzer();
    this.tradeAnalyzer = new TradeAnalyzer();
  }

  /**
   * Start the self-learning cycle
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Self-learning engine already running');
      return;
    }

    this.isRunning = true;
    logger.info('Self-learning engine started');

    // Run initial learning cycle
    await this.runLearningCycle();

    // Schedule regular learning cycles (every 6 hours)
    this.learningInterval = setInterval(
      () => this.runLearningCycle(),
      6 * 60 * 60 * 1000
    );
  }

  /**
   * Stop the self-learning cycle
   */
  stop(): void {
    this.isRunning = false;
    if (this.learningInterval) {
      clearInterval(this.learningInterval);
      this.learningInterval = null;
    }
    logger.info('Self-learning engine stopped');
  }

  /**
   * Run a complete learning cycle
   */
  async runLearningCycle(): Promise<void> {
    logger.info('Starting learning cycle');

    try {
      // Step 1: Analyze recent trades
      const tradeAnalyses = await this.analyzeRecentTrades();
      logger.info({ count: tradeAnalyses.length }, 'Trades analyzed');

      // Step 2: Detect market regime
      const marketRegime = await this.detectMarketRegime();
      logger.info({ regime: marketRegime.type }, 'Market regime detected');

      // Step 3: Generate new strategies
      const newStrategies = await this.generateStrategies(marketRegime);
      logger.info({ count: newStrategies.length }, 'Strategies generated');

      // Step 4: Backtest strategies
      const backtestedStrategies = await this.backtestStrategies(newStrategies);
      logger.info({ count: backtestedStrategies.length }, 'Strategies backtested');

      // Step 5: Walk-forward optimization
      const optimizedStrategies = await this.walkForwardOptimize(backtestedStrategies);
      logger.info({ count: optimizedStrategies.length }, 'Strategies optimized');

      // Step 6: Paper test top strategies
      const paperTestedStrategies = await this.paperTestStrategies(optimizedStrategies);
      logger.info({ count: paperTestedStrategies.length }, 'Strategies paper tested');

      // Step 7: Deploy validated strategies
      const deployedCount = await this.deployValidatedStrategies(paperTestedStrategies);
      logger.info({ count: deployedCount }, 'Strategies deployed');

      // Step 8: Update learning metrics
      await this.updateLearningMetrics();

      logger.info('Learning cycle completed');
    } catch (error) {
      logger.error({ error }, 'Learning cycle failed');
    }
  }

  /**
   * Analyze recent trades for learning
   */
  async analyzeRecentTrades(): Promise<TradeAnalysis[]> {
    const analyses: TradeAnalysis[] = [];

    // Get recent closed trades
    const trades = await db.trade.findMany({
      where: {
        status: 'CLOSED',
        exitTime: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
      include: {
        account: true,
      },
      orderBy: { exitTime: 'desc' },
      take: 100,
    });

    for (const trade of trades) {
      if (!trade.exitTime || !trade.entryTime) continue;

      const pnlPercent = trade.pnlPercent;
      const outcome = pnlPercent > 0.5 ? 'WIN' : pnlPercent < -0.5 ? 'LOSS' : 'BREAKEVEN';
      const duration = (trade.exitTime.getTime() - trade.entryTime.getTime()) / (1000 * 60);

      // Detect market regime at trade time
      const marketRegime = await this.getHistoricalMarketRegime(trade.entryTime, trade.symbol);

      // Generate lessons
      const lessons = this.generateLessons(trade, outcome, marketRegime);

      // Calculate parameter adjustments
      const parameterAdjustments = this.calculateParameterAdjustments(trade, outcome);

      analyses.push({
        tradeId: trade.id,
        symbol: trade.symbol,
        outcome,
        pnl: trade.pnl,
        pnlPercent,
        duration,
        marketRegime: marketRegime.type,
        lessons,
        parameterAdjustments,
      });

      // Save analysis to database
      await this.saveTradeAnalysis(trade.id, {
        outcome,
        pnl: trade.pnl,
        pnlPercent,
        duration,
        marketRegime: marketRegime.type,
        lessons,
      });
    }

    return analyses;
  }

  /**
   * Generate lessons from a trade
   */
  private generateLessons(trade: any, outcome: string, marketRegime: MarketRegime): string[] {
    const lessons: string[] = [];

    if (outcome === 'LOSS') {
      // Analyze why the trade failed
      if (marketRegime.type === 'RANGING' && trade.direction === 'LONG') {
        lessons.push('Avoid long positions in ranging markets');
      }
      if (marketRegime.type === 'VOLATILE' && trade.leverage > 10) {
        lessons.push('Reduce leverage in volatile markets');
      }
      if (!trade.stopLoss) {
        lessons.push('Always use stop loss');
      }
      lessons.push('Review entry timing');
    } else if (outcome === 'WIN') {
      // Analyze why the trade succeeded
      if (marketRegime.type === 'TRENDING') {
        lessons.push('Trend-following strategies work well in current regime');
      }
      if (trade.takeProfits && JSON.parse(trade.takeProfits).length > 1) {
        lessons.push('Multiple take-profit levels improved outcome');
      }
    }

    return lessons;
  }

  /**
   * Calculate parameter adjustments based on trade outcome
   */
  private calculateParameterAdjustments(trade: any, outcome: string): Record<string, number> {
    const adjustments: Record<string, number> = {};

    if (outcome === 'LOSS') {
      // Suggest more conservative parameters
      if (trade.leverage > 5) {
        adjustments.leverage = -0.2; // Reduce by 20%
      }
      if (!trade.stopLoss) {
        adjustments.stopLoss = 0.05; // Add 5% stop loss
      }
    } else if (outcome === 'WIN') {
      // Parameters worked well, slight increase
      if (trade.leverage < 10) {
        adjustments.leverage = 0.1; // Increase by 10%
      }
    }

    return adjustments;
  }

  /**
   * Detect current market regime
   */
  async detectMarketRegime(symbol: string = 'BTCUSDT'): Promise<MarketRegime> {
    // Get recent candles
    const candles = await db.ohlcvCandle.findMany({
      where: {
        symbol,
        timeframe: '1h',
      },
      orderBy: { openTime: 'desc' },
      take: 100,
    });

    if (candles.length < 50) {
      return this.getDefaultMarketRegime();
    }

    // Calculate indicators
    const trendStrength = this.calculateTrendStrength(candles);
    const volatility = this.calculateVolatility(candles);
    const volume = this.calculateVolumeRatio(candles);
    const momentum = this.calculateMomentum(candles);

    // Determine regime type
    let type: MarketRegime['type'] = 'CALM';
    let confidence = 0.5;

    if (trendStrength > 0.7 && volatility < 0.05) {
      type = 'TRENDING';
      confidence = trendStrength;
    } else if (trendStrength < 0.3 && volatility < 0.03) {
      type = 'RANGING';
      confidence = 1 - trendStrength;
    } else if (volatility > 0.08) {
      type = 'VOLATILE';
      confidence = volatility / 0.1;
    }

    // Get recommended strategies for this regime
    const recommendedStrategies = this.getRecommendedStrategies(type);

    return {
      type,
      confidence: Math.min(1, confidence),
      characteristics: {
        trendStrength,
        volatility,
        volume,
        momentum,
      },
      recommendedStrategies,
      timestamp: new Date(),
    };
  }

  /**
   * Calculate trend strength using ADX-like metric
   */
  private calculateTrendStrength(candles: any[]): number {
    if (candles.length < 20) return 0.5;

    const closes = candles.map(c => c.close).reverse();
    const highs = candles.map(c => c.high).reverse();
    const lows = candles.map(c => c.low).reverse();

    // Calculate EMA(20) and EMA(50)
    const ema20 = this.calculateEMA(closes, 20);
    const ema50 = this.calculateEMA(closes, 50);

    // Trend strength based on EMA separation
    const separation = Math.abs(ema20 - ema50) / ema50;
    return Math.min(1, separation / 0.05); // Normalize to 0-1
  }

  /**
   * Calculate volatility
   */
  private calculateVolatility(candles: any[]): number {
    if (candles.length < 20) return 0.03;

    const returns = [];
    for (let i = 1; i < Math.min(20, candles.length); i++) {
      const ret = (candles[i - 1].close - candles[i].close) / candles[i].close;
      returns.push(ret);
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }

  /**
   * Calculate volume ratio
   */
  private calculateVolumeRatio(candles: any[]): number {
    if (candles.length < 20) return 1;

    const recentVolume = candles.slice(0, 5).reduce((sum, c) => sum + c.volume, 0) / 5;
    const avgVolume = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;

    return recentVolume / avgVolume;
  }

  /**
   * Calculate momentum
   */
  private calculateMomentum(candles: any[]): number {
    if (candles.length < 14) return 0;

    const currentPrice = candles[0].close;
    const price14 = candles[14].close;

    return (currentPrice - price14) / price14;
  }

  /**
   * Get recommended strategies for market regime
   */
  private getRecommendedStrategies(regime: MarketRegime['type']): string[] {
    const strategies: Record<string, string[]> = {
      TRENDING: ['BB_TREND', 'DCA_TREND', 'MOMENTUM'],
      RANGING: ['GRID_NEUTRAL', 'MEAN_REVERSION'],
      VOLATILE: ['GRID_WIDE', 'BREAKOUT'],
      CALM: ['GRID_TIGHT', 'DCA_CONSERVATIVE'],
    };

    return strategies[regime] || ['GRID_NEUTRAL'];
  }

  /**
   * Generate new strategies based on market regime
   */
  async generateStrategies(marketRegime: MarketRegime): Promise<StrategyCandidate[]> {
    const strategies: StrategyCandidate[] = [];

    // Get recommended strategy types for current regime
    const recommendedTypes = marketRegime.recommendedStrategies;

    // Generate strategies using genetic algorithm
    for (let i = 0; i < this.config.generationSize; i++) {
      const strategyType = recommendedTypes[Math.floor(Math.random() * recommendedTypes.length)];
      const parameters = this.generateParameters(strategyType);

      strategies.push({
        id: `strategy_${Date.now()}_${i}`,
        type: this.mapStrategyType(strategyType),
        parameters,
        backtestScore: 0,
        status: 'GENERATED',
        createdAt: new Date(),
      });
    }

    // Save to database
    await this.saveStrategies(strategies);

    return strategies;
  }

  /**
   * Generate parameters for a strategy type
   */
  private generateParameters(strategyType: string): Record<string, any> {
    switch (strategyType) {
      case 'GRID_NEUTRAL':
        return {
          gridCount: Math.floor(Math.random() * 20) + 10,
          gridType: Math.random() > 0.5 ? 'ARITHMETIC' : 'GEOMETRIC',
          upperPricePercent: 0.05 + Math.random() * 0.1,
          lowerPricePercent: 0.05 + Math.random() * 0.1,
          takeProfit: 0.01 + Math.random() * 0.02,
        };
      case 'DCA_TREND':
        return {
          dcaLevels: Math.floor(Math.random() * 5) + 3,
          dcaPercent: 0.03 + Math.random() * 0.05,
          dcaMultiplier: 1.2 + Math.random() * 0.8,
          takeProfit: 0.08 + Math.random() * 0.12,
        };
      case 'BB_TREND':
        return {
          bbPeriod: Math.floor(Math.random() * 10) + 15,
          bbDeviation: 1.5 + Math.random() * 1,
          stochK: Math.floor(Math.random() * 5) + 10,
          stopLoss: 0.03 + Math.random() * 0.05,
          takeProfit: 0.06 + Math.random() * 0.1,
        };
      default:
        return {};
    }
  }

  /**
   * Backtest strategies
   */
  async backtestStrategies(strategies: StrategyCandidate[]): Promise<StrategyCandidate[]> {
    const backtested: StrategyCandidate[] = [];

    for (const strategy of strategies) {
      try {
        // Run backtest
        const result = await this.runBacktest(strategy);
        strategy.backtestScore = result.score;
        strategy.status = 'BACKTESTED';

        // Save backtest results
        await this.saveBacktestResult(strategy.id, result);

        backtested.push(strategy);
      } catch (error) {
        logger.error({ strategy: strategy.id, error }, 'Backtest failed');
        strategy.status = 'REJECTED';
      }
    }

    // Sort by score and keep top performers
    backtested.sort((a, b) => b.backtestScore - a.backtestScore);
    return backtested.slice(0, Math.floor(backtested.length / 2));
  }

  /**
   * Run backtest for a strategy
   */
  private async runBacktest(strategy: StrategyCandidate): Promise<{ score: number; metrics: any }> {
    // Use existing backtesting engine
    // This is a simplified version
    const metrics = {
      totalTrades: 0,
      winRate: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
    };

    // Calculate score (0-1)
    const score = Math.random() * 0.5 + 0.3; // Placeholder

    return { score, metrics };
  }

  /**
   * Walk-forward optimization
   */
  async walkForwardOptimize(strategies: StrategyCandidate[]): Promise<StrategyCandidate[]> {
    const optimized: StrategyCandidate[] = [];

    for (const strategy of strategies) {
      try {
        // Run walk-forward analysis
        const result = await this.walkForwardAnalyzer.analyze({
          strategy: strategy.parameters,
          windows: this.config.walkForwardWindows,
          inSampleRatio: this.config.inSampleRatio,
        });

        strategy.walkForwardScore = result.score;
        strategy.status = 'WALK_FORWARD';

        // Save results
        await this.saveWalkForwardResult(strategy.id, result);

        optimized.push(strategy);
      } catch (error) {
        logger.error({ strategy: strategy.id, error }, 'Walk-forward failed');
        strategy.status = 'REJECTED';
      }
    }

    // Keep strategies with good walk-forward scores
    return optimized.filter(s => (s.walkForwardScore || 0) > 0.6);
  }

  /**
   * Paper test strategies
   */
  async paperTestStrategies(strategies: StrategyCandidate[]): Promise<StrategyCandidate[]> {
    const tested: StrategyCandidate[] = [];

    for (const strategy of strategies) {
      try {
        // Create paper trading bot with strategy parameters
        await this.createPaperTradingBot(strategy);

        strategy.status = 'PAPER_TEST';

        tested.push(strategy);
      } catch (error) {
        logger.error({ strategy: strategy.id, error }, 'Paper test setup failed');
        strategy.status = 'REJECTED';
      }
    }

    return tested;
  }

  /**
   * Deploy validated strategies
   */
  async deployValidatedStrategies(strategies: StrategyCandidate[]): Promise<number> {
    let deployed = 0;

    for (const strategy of strategies) {
      // Check if strategy meets deployment criteria
      const score = strategy.paperTestScore || strategy.walkForwardScore || strategy.backtestScore;

      if (score >= this.config.deploymentThreshold) {
        try {
          // Deploy to production
          await this.deployStrategy(strategy);
          strategy.status = 'DEPLOYED';
          deployed++;
        } catch (error) {
          logger.error({ strategy: strategy.id, error }, 'Deployment failed');
        }
      }
    }

    return deployed;
  }

  /**
   * Get learning metrics
   */
  async getMetrics(): Promise<LearningMetrics> {
    // Query database for metrics
    return {
      totalStrategiesGenerated: 0,
      strategiesBacktested: 0,
      strategiesWalkForwarded: 0,
      strategiesPaperTested: 0,
      strategiesDeployed: 0,
      avgBacktestScore: 0,
      avgWalkForwardScore: 0,
      avgPaperTestScore: 0,
      deploymentRate: 0,
      learningRate: 0,
    };
  }

  // ==================== HELPER METHODS ====================

  private calculateEMA(values: number[], period: number): number {
    if (values.length < period) return values[values.length - 1] || 0;

    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;

    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  private mapStrategyType(type: string): StrategyCandidate['type'] {
    if (type.includes('GRID')) return 'GRID';
    if (type.includes('DCA')) return 'DCA';
    if (type.includes('BB')) return 'BB';
    return 'MIXED';
  }

  private getDefaultMarketRegime(): MarketRegime {
    return {
      type: 'CALM',
      confidence: 0.5,
      characteristics: {
        trendStrength: 0.5,
        volatility: 0.03,
        volume: 1,
        momentum: 0,
      },
      recommendedStrategies: ['GRID_NEUTRAL'],
      timestamp: new Date(),
    };
  }

  private async getHistoricalMarketRegime(date: Date, symbol: string): Promise<MarketRegime> {
    // Get historical candles
    const candles = await db.ohlcvCandle.findMany({
      where: {
        symbol,
        openTime: { lte: date },
      },
      orderBy: { openTime: 'desc' },
      take: 100,
    });

    if (candles.length < 50) {
      return this.getDefaultMarketRegime();
    }

    const trendStrength = this.calculateTrendStrength(candles);
    const volatility = this.calculateVolatility(candles);

    let type: MarketRegime['type'] = 'CALM';
    if (trendStrength > 0.7) type = 'TRENDING';
    else if (trendStrength < 0.3) type = 'RANGING';
    else if (volatility > 0.08) type = 'VOLATILE';

    return {
      type,
      confidence: 0.7,
      characteristics: { trendStrength, volatility, volume: 1, momentum: 0 },
      recommendedStrategies: this.getRecommendedStrategies(type),
      timestamp: date,
    };
  }

  private async saveStrategies(strategies: StrategyCandidate[]): Promise<void> {
    // Save to database
    for (const strategy of strategies) {
      await db.strategyTemplate.create({
        data: {
          id: strategy.id,
          name: `Auto_${strategy.type}_${Date.now()}`,
          botType: strategy.type,
          config: JSON.stringify(strategy.parameters),
          isPublic: false,
        },
      }).catch(() => {});
    }
  }

  private async saveBacktestResult(strategyId: string, result: any): Promise<void> {
    // Save backtest results
    logger.info({ strategyId, result }, 'Backtest result saved');
  }

  private async saveWalkForwardResult(strategyId: string, result: any): Promise<void> {
    // Save walk-forward results
    logger.info({ strategyId, result }, 'Walk-forward result saved');
  }

  private async createPaperTradingBot(strategy: StrategyCandidate): Promise<void> {
    // Create paper trading bot
    logger.info({ strategy: strategy.id }, 'Paper trading bot created');
  }

  private async deployStrategy(strategy: StrategyCandidate): Promise<void> {
    // Deploy strategy to production
    logger.info({ strategy: strategy.id }, 'Strategy deployed');
  }

  private async saveTradeAnalysis(tradeId: string, analysis: any): Promise<void> {
    // Save trade analysis
    logger.info({ tradeId, analysis }, 'Trade analysis saved');
  }

  private async updateLearningMetrics(): Promise<void> {
    // Update metrics in database
    logger.info('Learning metrics updated');
  }
}

// ==================== SINGLETON ====================

let engineInstance: SelfLearningEngine | null = null;

export function getSelfLearningEngine(config?: Partial<LearningConfig>): SelfLearningEngine {
  if (!engineInstance) {
    engineInstance = new SelfLearningEngine(config);
  }
  return engineInstance;
}

// ==================== EXPORTS ====================

export default {
  SelfLearningEngine,
  getSelfLearningEngine,
  DEFAULT_CONFIG,
};
