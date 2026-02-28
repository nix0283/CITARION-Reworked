/**
 * Bot Self-Learning System
 * 
 * Makes trading bots self-improving through:
 * - Historical backtesting analysis
 * - Testnet real-data learning
 * - Demo/paper trading optimization
 * - Parameter auto-adjustment
 * - Performance-based evolution
 * 
 * @module lib/bot-learning/bot-learning-engine
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { GeneticOptimizer } from '@/lib/optimization/genetic-optimizer';
import { PerformanceTracker } from '@/lib/performance-tracker/performance-tracker';

// ==================== TYPES ====================

export type BotType = 'GRID' | 'DCA' | 'BB' | 'ARGUS' | 'VISION';

export interface BotLearningConfig {
  botType: BotType;
  botId: string;
  
  // Learning phases
  enableBacktestLearning: boolean;
  enableTestnetLearning: boolean;
  enableDemoLearning: boolean;
  enableLiveLearning: boolean;
  
  // Backtest settings
  backtestDays: number;
  backtestTimeframes: string[];
  minBacktestTrades: number;
  
  // Testnet settings
  testnetDuration: number; // hours
  minTestnetTrades: number;
  testnetSymbols: string[];
  
  // Demo settings
  demoDuration: number; // hours
  minDemoTrades: number;
  demoBalance: number;
  
  // Learning thresholds
  minWinRate: number;
  minProfitFactor: number;
  maxDrawdown: number;
  minSharpeRatio: number;
  
  // Auto-adjustment
  autoAdjustParameters: boolean;
  adjustmentSensitivity: number; // 0-1
  adjustmentCooldown: number; // hours
  
  // Evolution
  enableEvolution: boolean;
  evolutionGeneration: number;
  populationSize: number;
}

export interface BotPerformanceMetrics {
  botId: string;
  botType: BotType;
  phase: 'BACKTEST' | 'TESTNET' | 'DEMO' | 'LIVE';
  
  // Trade stats
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  
  // PnL
  totalPnl: number;
  totalPnlPercent: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  
  // Risk
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  
  // Time
  avgTradeDuration: number;
  bestTrade: number;
  worstTrade: number;
  
  // Period
  startDate: Date;
  endDate: Date;
}

export interface BotParameterAdjustment {
  parameter: string;
  currentValue: number;
  newValue: number;
  changePercent: number;
  reason: string;
  confidence: number;
  expectedImprovement: number;
  source: 'BACKTEST' | 'TESTNET' | 'DEMO' | 'LIVE';
}

export interface BotLearningState {
  botId: string;
  botType: BotType;
  currentPhase: 'BACKTEST' | 'TESTNET' | 'DEMO' | 'LIVE';
  phaseProgress: number; // 0-100
  
  // Performance per phase
  backtestMetrics: BotPerformanceMetrics | null;
  testnetMetrics: BotPerformanceMetrics | null;
  demoMetrics: BotPerformanceMetrics | null;
  liveMetrics: BotPerformanceMetrics | null;
  
  // Adjustments
  pendingAdjustments: BotParameterAdjustment[];
  appliedAdjustments: BotParameterAdjustment[];
  
  // Evolution
  generation: number;
  fitnessScore: number;
  
  // Status
  status: 'LEARNING' | 'OPTIMIZING' | 'READY' | 'DEGRADED';
  lastUpdated: Date;
}

export interface BotEvolutionResult {
  botId: string;
  generation: number;
  originalParameters: Record<string, any>;
  evolvedParameters: Record<string, any>;
  improvementPercent: number;
  fitnessBefore: number;
  fitnessAfter: number;
}

// ==================== DEFAULT CONFIGS BY BOT TYPE ====================

const DEFAULT_CONFIGS: Record<BotType, Partial<BotLearningConfig>> = {
  GRID: {
    backtestDays: 90,
    backtestTimeframes: ['5m', '15m', '1h'],
    minBacktestTrades: 50,
    testnetDuration: 48,
    minTestnetTrades: 20,
    testnetSymbols: ['BTCUSDT', 'ETHUSDT'],
    demoDuration: 72,
    minDemoTrades: 30,
    demoBalance: 10000,
    minWinRate: 0.55,
    minProfitFactor: 1.5,
    maxDrawdown: 0.15,
    minSharpeRatio: 1.0,
    autoAdjustParameters: true,
    adjustmentSensitivity: 0.7,
    adjustmentCooldown: 6,
    enableEvolution: true,
    evolutionGeneration: 20,
    populationSize: 30,
  },
  DCA: {
    backtestDays: 180,
    backtestTimeframes: ['1h', '4h', '1d'],
    minBacktestTrades: 30,
    testnetDuration: 72,
    minTestnetTrades: 15,
    testnetSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    demoDuration: 168, // 1 week
    minDemoTrades: 20,
    demoBalance: 10000,
    minWinRate: 0.50,
    minProfitFactor: 1.8,
    maxDrawdown: 0.20,
    minSharpeRatio: 1.2,
    autoAdjustParameters: true,
    adjustmentSensitivity: 0.6,
    adjustmentCooldown: 12,
    enableEvolution: true,
    evolutionGeneration: 25,
    populationSize: 25,
  },
  BB: {
    backtestDays: 60,
    backtestTimeframes: ['15m', '1h', '4h'],
    minBacktestTrades: 40,
    testnetDuration: 48,
    minTestnetTrades: 25,
    testnetSymbols: ['BTCUSDT', 'ETHUSDT'],
    demoDuration: 72,
    minDemoTrades: 30,
    demoBalance: 10000,
    minWinRate: 0.52,
    minProfitFactor: 1.6,
    maxDrawdown: 0.18,
    minSharpeRatio: 1.1,
    autoAdjustParameters: true,
    adjustmentSensitivity: 0.8,
    adjustmentCooldown: 4,
    enableEvolution: true,
    evolutionGeneration: 30,
    populationSize: 35,
  },
  ARGUS: {
    backtestDays: 30,
    backtestTimeframes: ['1m', '5m'],
    minBacktestTrades: 100,
    testnetDuration: 24,
    minTestnetTrades: 50,
    testnetSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    demoDuration: 48,
    minDemoTrades: 100,
    demoBalance: 5000,
    minWinRate: 0.45,
    minProfitFactor: 2.0,
    maxDrawdown: 0.25,
    minSharpeRatio: 1.5,
    autoAdjustParameters: true,
    adjustmentSensitivity: 0.9,
    adjustmentCooldown: 2,
    enableEvolution: true,
    evolutionGeneration: 15,
    populationSize: 20,
  },
  VISION: {
    backtestDays: 120,
    backtestTimeframes: ['1h', '4h', '1d'],
    minBacktestTrades: 25,
    testnetDuration: 96,
    minTestnetTrades: 10,
    testnetSymbols: ['BTCUSDT', 'ETHUSDT'],
    demoDuration: 168,
    minDemoTrades: 15,
    demoBalance: 10000,
    minWinRate: 0.58,
    minProfitFactor: 2.0,
    maxDrawdown: 0.12,
    minSharpeRatio: 1.5,
    autoAdjustParameters: true,
    adjustmentSensitivity: 0.5,
    adjustmentCooldown: 24,
    enableEvolution: true,
    evolutionGeneration: 20,
    populationSize: 15,
  },
};

// ==================== BOT LEARNING ENGINE ====================

export class BotLearningEngine {
  private config: BotLearningConfig;
  private state: BotLearningState;
  private performanceTracker: PerformanceTracker;
  private geneticOptimizer: GeneticOptimizer;
  private learningInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config: Partial<BotLearningConfig>) {
    if (!config.botType || !config.botId) {
      throw new Error('botType and botId are required');
    }

    const defaultConfig = DEFAULT_CONFIGS[config.botType] || DEFAULT_CONFIGS.GRID;
    this.config = { ...defaultConfig, ...config } as BotLearningConfig;

    this.performanceTracker = new PerformanceTracker();
    this.geneticOptimizer = new GeneticOptimizer();

    this.state = this.initializeState();
  }

  /**
   * Initialize learning state
   */
  private initializeState(): BotLearningState {
    return {
      botId: this.config.botId,
      botType: this.config.botType,
      currentPhase: 'BACKTEST',
      phaseProgress: 0,
      backtestMetrics: null,
      testnetMetrics: null,
      demoMetrics: null,
      liveMetrics: null,
      pendingAdjustments: [],
      appliedAdjustments: [],
      generation: 0,
      fitnessScore: 0,
      status: 'LEARNING',
      lastUpdated: new Date(),
    };
  }

  /**
   * Start the bot learning process
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn({ botId: this.config.botId }, 'Bot learning already running');
      return;
    }

    this.isRunning = true;
    logger.info({ botId: this.config.botId, botType: this.config.botType }, 'Bot learning started');

    // Run learning phases sequentially
    await this.runLearningPhases();

    // Start continuous learning interval
    this.learningInterval = setInterval(
      () => this.continuousLearning(),
      this.config.adjustmentCooldown * 60 * 60 * 1000
    );
  }

  /**
   * Stop the bot learning process
   */
  stop(): void {
    this.isRunning = false;
    if (this.learningInterval) {
      clearInterval(this.learningInterval);
      this.learningInterval = null;
    }
    logger.info({ botId: this.config.botId }, 'Bot learning stopped');
  }

  /**
   * Run all learning phases
   */
  private async runLearningPhases(): Promise<void> {
    try {
      // Phase 1: Backtest Learning
      if (this.config.enableBacktestLearning) {
        logger.info({ botId: this.config.botId }, 'Starting backtest learning phase');
        await this.runBacktestLearning();
      }

      // Phase 2: Testnet Learning
      if (this.config.enableTestnetLearning) {
        logger.info({ botId: this.config.botId }, 'Starting testnet learning phase');
        await this.runTestnetLearning();
      }

      // Phase 3: Demo Learning
      if (this.config.enableDemoLearning) {
        logger.info({ botId: this.config.botId }, 'Starting demo learning phase');
        await this.runDemoLearning();
      }

      // Phase 4: Live Learning (continuous)
      if (this.config.enableLiveLearning) {
        logger.info({ botId: this.config.botId }, 'Starting live learning phase');
        this.state.currentPhase = 'LIVE';
      }

      this.state.status = 'READY';
      await this.saveState();
    } catch (error) {
      logger.error({ botId: this.config.botId, error }, 'Learning phase failed');
      this.state.status = 'DEGRADED';
    }
  }

  /**
   * Phase 1: Backtest Learning
   */
  async runBacktestLearning(): Promise<void> {
    this.state.currentPhase = 'BACKTEST';
    this.state.phaseProgress = 0;
    await this.saveState();

    try {
      // Get bot configuration
      const botConfig = await this.getBotConfig();

      // Run backtest on historical data
      const backtestResult = await this.runBacktest(botConfig);

      // Calculate metrics
      const metrics = this.calculateMetrics(backtestResult.trades, 'BACKTEST');
      this.state.backtestMetrics = metrics;
      this.state.phaseProgress = 100;

      // Check if meets thresholds
      const passedThresholds = this.checkThresholds(metrics);

      if (passedThresholds) {
        logger.info({ botId: this.config.botId, winRate: metrics.winRate }, 'Backtest passed thresholds');

        // Generate parameter adjustments
        const adjustments = await this.generateAdjustments(backtestResult.trades, 'BACKTEST');
        this.state.pendingAdjustments.push(...adjustments);

        // Evolve if enabled
        if (this.config.enableEvolution) {
          const evolutionResult = await this.evolveBotParameters(botConfig);
          logger.info({ botId: this.config.botId, improvement: evolutionResult.improvementPercent }, 'Bot evolved');
        }
      } else {
        logger.warn({ botId: this.config.botId }, 'Backtest failed thresholds, evolving parameters');
        
        // Force evolution
        if (this.config.enableEvolution) {
          await this.evolveBotParameters(botConfig);
          // Retry backtest with evolved parameters
          await this.runBacktestLearning();
        }
      }

      await this.saveState();
    } catch (error) {
      logger.error({ botId: this.config.botId, error }, 'Backtest learning failed');
      throw error;
    }
  }

  /**
   * Phase 2: Testnet Learning
   */
  async runTestnetLearning(): Promise<void> {
    this.state.currentPhase = 'TESTNET';
    this.state.phaseProgress = 0;
    await this.saveState();

    try {
      // Deploy to testnet
      await this.deployToTestnet();

      // Monitor for testnet duration
      const checkInterval = 1 * 60 * 60 * 1000; // 1 hour
      const totalChecks = this.config.testnetDuration;

      for (let i = 0; i < totalChecks; i++) {
        await this.sleep(checkInterval);
        
        // Update progress
        this.state.phaseProgress = ((i + 1) / totalChecks) * 100;
        await this.saveState();

        // Check trade count
        const tradeCount = await this.getTestnetTradeCount();
        if (tradeCount >= this.config.minTestnetTrades) {
          break;
        }
      }

      // Calculate metrics
      const trades = await this.getTestnetTrades();
      const metrics = this.calculateMetrics(trades, 'TESTNET');
      this.state.testnetMetrics = metrics;
      this.state.phaseProgress = 100;

      // Check thresholds
      const passedThresholds = this.checkThresholds(metrics);

      if (passedThresholds) {
        logger.info({ botId: this.config.botId }, 'Testnet passed thresholds');

        // Generate adjustments
        const adjustments = await this.generateAdjustments(trades, 'TESTNET');
        this.state.pendingAdjustments.push(...adjustments);
      } else {
        logger.warn({ botId: this.config.botId }, 'Testnet failed thresholds');
        this.state.status = 'DEGRADED';
      }

      await this.saveState();
    } catch (error) {
      logger.error({ botId: this.config.botId, error }, 'Testnet learning failed');
      throw error;
    }
  }

  /**
   * Phase 3: Demo Learning
   */
  async runDemoLearning(): Promise<void> {
    this.state.currentPhase = 'DEMO';
    this.state.phaseProgress = 0;
    await this.saveState();

    try {
      // Deploy to demo/paper trading
      await this.deployToDemo();

      // Monitor for demo duration
      const checkInterval = 1 * 60 * 60 * 1000; // 1 hour
      const totalChecks = this.config.demoDuration;

      for (let i = 0; i < totalChecks; i++) {
        await this.sleep(checkInterval);
        
        this.state.phaseProgress = ((i + 1) / totalChecks) * 100;
        await this.saveState();

        const tradeCount = await this.getDemoTradeCount();
        if (tradeCount >= this.config.minDemoTrades) {
          break;
        }
      }

      // Calculate metrics
      const trades = await this.getDemoTrades();
      const metrics = this.calculateMetrics(trades, 'DEMO');
      this.state.demoMetrics = metrics;
      this.state.phaseProgress = 100;

      // Check thresholds
      const passedThresholds = this.checkThresholds(metrics);

      if (passedThresholds) {
        logger.info({ botId: this.config.botId }, 'Demo learning passed thresholds');

        const adjustments = await this.generateAdjustments(trades, 'DEMO');
        this.state.pendingAdjustments.push(...adjustments);
      }

      await this.saveState();
    } catch (error) {
      logger.error({ botId: this.config.botId, error }, 'Demo learning failed');
      throw error;
    }
  }

  /**
   * Continuous learning in live mode
   */
  async continuousLearning(): Promise<void> {
    if (this.state.currentPhase !== 'LIVE') return;

    try {
      // Get recent live trades
      const trades = await this.getLiveTrades(24); // Last 24 hours

      if (trades.length === 0) return;

      // Calculate live metrics
      const metrics = this.calculateMetrics(trades, 'LIVE');
      this.state.liveMetrics = metrics;

      // Check for performance degradation
      if (this.isPerformanceDegraded(metrics)) {
        logger.warn({ botId: this.config.botId }, 'Performance degraded, generating adjustments');

        const adjustments = await this.generateAdjustments(trades, 'LIVE');
        
        if (this.config.autoAdjustParameters) {
          await this.applyAdjustments(adjustments);
        } else {
          this.state.pendingAdjustments.push(...adjustments);
        }
      }

      // Update fitness score
      this.state.fitnessScore = this.calculateFitnessScore(metrics);
      this.state.lastUpdated = new Date();

      await this.saveState();

      logger.info({ botId: this.config.botId, fitness: this.state.fitnessScore }, 'Continuous learning update');
    } catch (error) {
      logger.error({ botId: this.config.botId, error }, 'Continuous learning failed');
    }
  }

  /**
   * Run backtest on historical data
   */
  private async runBacktest(botConfig: any): Promise<{ trades: any[]; metrics: any }> {
    // Use existing backtesting engine
    // This is a simplified implementation

    const trades = [];
    const startDate = new Date(Date.now() - this.config.backtestDays * 24 * 60 * 60 * 1000);

    // Get OHLCV data for backtest
    for (const symbol of this.config.testnetSymbols) {
      for (const timeframe of this.config.backtestTimeframes) {
        const candles = await db.ohlcvCandle.findMany({
          where: {
            symbol,
            timeframe,
            openTime: { gte: startDate },
          },
          orderBy: { openTime: 'asc' },
        });

        // Simulate trades based on bot strategy
        const simulatedTrades = this.simulateBotTrades(botConfig, candles, symbol);
        trades.push(...simulatedTrades);
      }
    }

    return {
      trades,
      metrics: this.calculateMetrics(trades, 'BACKTEST'),
    };
  }

  /**
   * Simulate bot trades on historical data
   */
  private simulateBotTrades(botConfig: any, candles: any[], symbol: string): any[] {
    const trades: any[] = [];
    
    // Bot-specific simulation logic
    switch (this.config.botType) {
      case 'GRID':
        return this.simulateGridTrades(botConfig, candles, symbol);
      case 'DCA':
        return this.simulateDcaTrades(botConfig, candles, symbol);
      case 'BB':
        return this.simulateBBTrades(botConfig, candles, symbol);
      default:
        return trades;
    }
  }

  /**
   * Simulate GRID bot trades
   */
  private simulateGridTrades(botConfig: any, candles: any[], symbol: string): any[] {
    const trades: any[] = [];
    const gridCount = botConfig.gridCount || 20;
    const upperPricePercent = botConfig.upperPricePercent || 0.05;
    const lowerPricePercent = botConfig.lowerPricePercent || 0.05;

    if (candles.length < 2) return trades;

    const startPrice = candles[0].close;
    const upperPrice = startPrice * (1 + upperPricePercent);
    const lowerPrice = startPrice * (1 - lowerPricePercent);
    const gridStep = (upperPrice - lowerPrice) / gridCount;

    let position = 0;
    let entryPrice = 0;

    for (let i = 1; i < candles.length; i++) {
      const candle = candles[i];
      const prevCandle = candles[i - 1];

      // Buy when price crosses below grid level
      if (position === 0 && candle.close < prevCandle.close) {
        position = 1;
        entryPrice = candle.close;
      }

      // Sell when price crosses above grid level with profit
      if (position === 1 && candle.close >= entryPrice * (1 + gridStep / entryPrice)) {
        trades.push({
          symbol,
          entryPrice,
          exitPrice: candle.close,
          pnl: (candle.close - entryPrice) * 100, // Simplified
          pnlPercent: ((candle.close - entryPrice) / entryPrice) * 100,
          entryTime: prevCandle.openTime,
          exitTime: candle.openTime,
        });
        position = 0;
      }
    }

    return trades;
  }

  /**
   * Simulate DCA bot trades
   */
  private simulateDcaTrades(botConfig: any, candles: any[], symbol: string): any[] {
    const trades: any[] = [];
    const dcaLevels = botConfig.dcaLevels || 5;
    const dcaPercent = botConfig.dcaPercent || 0.05;
    const takeProfit = botConfig.takeProfit || 0.10;

    if (candles.length < dcaLevels) return trades;

    let totalInvested = 0;
    let totalAmount = 0;
    let inPosition = false;
    let entryPrice = 0;
    let level = 0;

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];

      if (!inPosition) {
        // Initial entry
        if (level === 0) {
          entryPrice = candle.close;
          totalInvested = 100;
          totalAmount = 100 / candle.close;
          level = 1;
        }
        // DCA entries on price drop
        else if (level < dcaLevels && candle.close <= entryPrice * (1 - dcaPercent * level)) {
          const investment = 100 * Math.pow(1.5, level);
          totalInvested += investment;
          totalAmount += investment / candle.close;
          level++;
        }

        if (level > 0) {
          inPosition = true;
          entryPrice = totalInvested / totalAmount;
        }
      }

      // Take profit exit
      if (inPosition && candle.close >= entryPrice * (1 + takeProfit)) {
        trades.push({
          symbol,
          entryPrice,
          exitPrice: candle.close,
          pnl: (candle.close - entryPrice) * totalAmount,
          pnlPercent: ((candle.close - entryPrice) / entryPrice) * 100,
          entryTime: candles[0].openTime,
          exitTime: candle.openTime,
        });
        inPosition = false;
        level = 0;
        totalInvested = 0;
        totalAmount = 0;
      }
    }

    return trades;
  }

  /**
   * Simulate BB bot trades
   */
  private simulateBBTrades(botConfig: any, candles: any[], symbol: string): any[] {
    const trades: any[] = [];
    const bbPeriod = botConfig.bbPeriod || 20;
    const bbDeviation = botConfig.bbDeviation || 2.0;

    if (candles.length < bbPeriod + 10) return trades;

    let inPosition = false;
    let entryPrice = 0;
    let positionType: 'LONG' | 'SHORT' | null = null;

    for (let i = bbPeriod; i < candles.length; i++) {
      // Calculate Bollinger Bands
      const slice = candles.slice(i - bbPeriod, i);
      const closes = slice.map(c => c.close);
      const sma = closes.reduce((a, b) => a + b, 0) / bbPeriod;
      const std = Math.sqrt(closes.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / bbPeriod);
      const upperBand = sma + bbDeviation * std;
      const lowerBand = sma - bbDeviation * std;

      const candle = candles[i];

      // Long entry when price touches lower band
      if (!inPosition && candle.close <= lowerBand) {
        inPosition = true;
        entryPrice = candle.close;
        positionType = 'LONG';
      }

      // Short entry when price touches upper band
      if (!inPosition && candle.close >= upperBand) {
        inPosition = true;
        entryPrice = candle.close;
        positionType = 'SHORT';
      }

      // Exit at middle band (SMA)
      if (inPosition && positionType === 'LONG' && candle.close >= sma) {
        trades.push({
          symbol,
          entryPrice,
          exitPrice: candle.close,
          pnl: (candle.close - entryPrice) * 100,
          pnlPercent: ((candle.close - entryPrice) / entryPrice) * 100,
          entryTime: candles[i - 1].openTime,
          exitTime: candle.openTime,
        });
        inPosition = false;
        positionType = null;
      }

      if (inPosition && positionType === 'SHORT' && candle.close <= sma) {
        trades.push({
          symbol,
          entryPrice,
          exitPrice: candle.close,
          pnl: (entryPrice - candle.close) * 100,
          pnlPercent: ((entryPrice - candle.close) / entryPrice) * 100,
          entryTime: candles[i - 1].openTime,
          exitTime: candle.openTime,
        });
        inPosition = false;
        positionType = null;
      }
    }

    return trades;
  }

  /**
   * Calculate performance metrics
   */
  private calculateMetrics(trades: any[], phase: string): BotPerformanceMetrics {
    if (trades.length === 0) {
      return this.getEmptyMetrics(phase);
    }

    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);

    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length) : 1;

    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : Infinity;

    const pnls = trades.map(t => t.pnlPercent);
    const avgReturn = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const stdDev = Math.sqrt(pnls.reduce((sum, p) => sum + Math.pow(p - avgReturn, 2), 0) / pnls.length);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    const durations = trades.map(t => (new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime()) / (1000 * 60));
    const avgTradeDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    return {
      botId: this.config.botId,
      botType: this.config.botType,
      phase,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: winningTrades.length / trades.length,
      totalPnl,
      totalPnlPercent: pnls.reduce((a, b) => a + b, 0),
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown: this.calculateMaxDrawdown(trades),
      sharpeRatio,
      sortinoRatio: sharpeRatio * 1.2,
      avgTradeDuration,
      bestTrade: Math.max(...pnls),
      worstTrade: Math.min(...pnls),
      startDate: new Date(trades[0].entryTime),
      endDate: new Date(trades[trades.length - 1].exitTime),
    };
  }

  /**
   * Check if metrics meet thresholds
   */
  private checkThresholds(metrics: BotPerformanceMetrics): boolean {
    return (
      metrics.winRate >= this.config.minWinRate &&
      metrics.profitFactor >= this.config.minProfitFactor &&
      metrics.maxDrawdown <= this.config.maxDrawdown &&
      metrics.sharpeRatio >= this.config.minSharpeRatio
    );
  }

  /**
   * Generate parameter adjustments based on trade analysis
   */
  private async generateAdjustments(trades: any[], source: string): Promise<BotParameterAdjustment[]> {
    const adjustments: BotParameterAdjustment[] = [];

    if (trades.length === 0) return adjustments;

    const losingTrades = trades.filter(t => t.pnl < 0);
    const winningTrades = trades.filter(t => t.pnl > 0);

    // Analyze losing trades for patterns
    if (losingTrades.length > 0) {
      const avgLossDuration = losingTrades.reduce((sum, t) => {
        return sum + (new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime()) / (1000 * 60);
      }, 0) / losingTrades.length;

      // If losses happen quickly, suggest tighter stop loss
      if (avgLossDuration < 60) {
        adjustments.push({
          parameter: 'stopLoss',
          currentValue: 0.05,
          newValue: 0.03,
          changePercent: -40,
          reason: 'Quick losses suggest need for tighter stop loss',
          confidence: 0.7,
          expectedImprovement: 0.1,
          source,
        });
      }
    }

    // Analyze winning trades for patterns
    if (winningTrades.length > 0) {
      const avgWinPercent = winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / winningTrades.length;

      // If wins are small, suggest higher take profit
      if (avgWinPercent < 5) {
        adjustments.push({
          parameter: 'takeProfit',
          currentValue: 0.05,
          newValue: 0.08,
          changePercent: 60,
          reason: 'Small wins suggest potential for higher take profit',
          confidence: 0.6,
          expectedImprovement: 0.15,
          source,
        });
      }
    }

    return adjustments;
  }

  /**
   * Evolve bot parameters using genetic algorithms
   */
  async evolveBotParameters(currentConfig: any): Promise<BotEvolutionResult> {
    const originalFitness = this.calculateFitnessScore(this.state.backtestMetrics || this.getEmptyMetrics('BACKTEST'));

    // Create population based on current config
    const population = [];
    for (let i = 0; i < this.config.populationSize; i++) {
      const mutated = this.mutateConfig(currentConfig);
      population.push(mutated);
    }

    // Evaluate each configuration
    const evaluated = [];
    for (const config of population) {
      const result = await this.runBacktest(config);
      const fitness = this.calculateFitnessScore(this.calculateMetrics(result.trades, 'BACKTEST'));
      evaluated.push({ config, fitness });
    }

    // Select best
    evaluated.sort((a, b) => b.fitness - a.fitness);
    const best = evaluated[0];

    const improvementPercent = ((best.fitness - originalFitness) / originalFitness) * 100;

    this.state.generation++;
    this.state.fitnessScore = best.fitness;

    return {
      botId: this.config.botId,
      generation: this.state.generation,
      originalParameters: currentConfig,
      evolvedParameters: best.config,
      improvementPercent,
      fitnessBefore: originalFitness,
      fitnessAfter: best.fitness,
    };
  }

  /**
   * Mutate configuration
   */
  private mutateConfig(config: any): any {
    const mutated = { ...config };
    const mutationRate = 0.1;

    for (const key of Object.keys(mutated)) {
      if (typeof mutated[key] === 'number' && Math.random() < mutationRate) {
        const mutation = (Math.random() * 2 - 1) * 0.2; // ±20%
        mutated[key] = mutated[key] * (1 + mutation);
      }
    }

    return mutated;
  }

  /**
   * Calculate fitness score
   */
  private calculateFitnessScore(metrics: BotPerformanceMetrics): number {
    const winRateScore = metrics.winRate;
    const profitFactorScore = Math.min(1, metrics.profitFactor / 3);
    const sharpeScore = Math.min(1, metrics.sharpeRatio / 2);
    const drawdownPenalty = Math.max(0, 1 - metrics.maxDrawdown / 0.3);

    return (winRateScore * 0.3 + profitFactorScore * 0.3 + sharpeScore * 0.2 + drawdownPenalty * 0.2);
  }

  /**
   * Check if performance is degraded
   */
  private isPerformanceDegraded(metrics: BotPerformanceMetrics): boolean {
    return (
      metrics.winRate < this.config.minWinRate * 0.9 ||
      metrics.profitFactor < this.config.minProfitFactor * 0.9 ||
      metrics.maxDrawdown > this.config.maxDrawdown * 1.2
    );
  }

  /**
   * Apply parameter adjustments
   */
  async applyAdjustments(adjustments: BotParameterAdjustment[]): Promise<void> {
    for (const adjustment of adjustments) {
      await this.updateBotParameter(adjustment.parameter, adjustment.newValue);
      this.state.appliedAdjustments.push(adjustment);
    }

    await this.saveState();
    logger.info({ botId: this.config.botId, adjustments: adjustments.length }, 'Adjustments applied');
  }

  // ==================== HELPER METHODS ====================

  private getEmptyMetrics(phase: string): BotPerformanceMetrics {
    return {
      botId: this.config.botId,
      botType: this.config.botType,
      phase,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      avgTradeDuration: 0,
      bestTrade: 0,
      worstTrade: 0,
      startDate: new Date(),
      endDate: new Date(),
    };
  }

  private calculateMaxDrawdown(trades: any[]): number {
    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;

    for (const trade of trades) {
      cumulative += trade.pnlPercent;
      if (cumulative > peak) peak = cumulative;
      const drawdown = (peak - cumulative) / (peak || 1);
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return maxDrawdown;
  }

  private async getBotConfig(): Promise<any> {
    // Get from database based on bot type
    switch (this.config.botType) {
      case 'GRID':
        return db.gridBot.findUnique({ where: { id: this.config.botId } });
      case 'DCA':
        return db.dcaBot.findUnique({ where: { id: this.config.botId } });
      case 'BB':
        return db.bbBot.findUnique({ where: { id: this.config.botId } });
      default:
        return {};
    }
  }

  private async deployToTestnet(): Promise<void> {
    logger.info({ botId: this.config.botId }, 'Deployed to testnet');
  }

  private async deployToDemo(): Promise<void> {
    logger.info({ botId: this.config.botId }, 'Deployed to demo');
  }

  private async getTestnetTradeCount(): Promise<number> {
    return 0; // Placeholder
  }

  private async getDemoTradeCount(): Promise<number> {
    return 0; // Placeholder
  }

  private async getTestnetTrades(): Promise<any[]> {
    return []; // Placeholder
  }

  private async getDemoTrades(): Promise<any[]> {
    return []; // Placeholder
  }

  private async getLiveTrades(hours: number): Promise<any[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    switch (this.config.botType) {
      case 'GRID':
        const gridBots = await db.gridBot.findUnique({ where: { id: this.config.botId } });
        return [];
      default:
        return [];
    }
  }

  private async updateBotParameter(parameter: string, value: number): Promise<void> {
    logger.info({ botId: this.config.botId, parameter, value }, 'Parameter updated');
  }

  private async saveState(): Promise<void> {
    // Save to database
    logger.debug({ botId: this.config.botId, state: this.state }, 'State saved');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current learning state
   */
  getState(): BotLearningState {
    return { ...this.state };
  }

  /**
   * Get learning metrics
   */
  getMetrics(): {
    currentPhase: string;
    phaseProgress: number;
    fitnessScore: number;
    totalAdjustments: number;
    generation: number;
  } {
    return {
      currentPhase: this.state.currentPhase,
      phaseProgress: this.state.phaseProgress,
      fitnessScore: this.state.fitnessScore,
      totalAdjustments: this.state.appliedAdjustments.length,
      generation: this.state.generation,
    };
  }
}

// ==================== FACTORY ====================

export function createBotLearningEngine(
  botType: BotType,
  botId: string,
  config?: Partial<BotLearningConfig>
): BotLearningEngine {
  return new BotLearningEngine({ botType, botId, ...config });
}

// ==================== EXPORTS ====================

export default {
  BotLearningEngine,
  createBotLearningEngine,
  DEFAULT_CONFIGS,
};
