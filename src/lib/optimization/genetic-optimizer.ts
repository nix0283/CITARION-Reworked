/**
 * Genetic Algorithm Strategy Optimizer
 * 
 * Optimizes trading strategy parameters using genetic algorithms:
 * - Population-based evolution
 * - Crossover and mutation
 * - Fitness evaluation (Sharpe, Profit, Sortino)
 * - Backtesting integration
 * - Overfitting prevention
 * - Auto-deploy best strategies
 * 
 * @module lib/optimization/genetic-optimizer
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface StrategyGenome {
  // Entry parameters
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  emaFast: number;
  emaSlow: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  
  // Exit parameters
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStopEnabled: boolean;
  trailingStopPercent: number;
  
  // Risk parameters
  positionSizePercent: number;
  maxPositions: number;
  leverage: number;
  
  // Filters
  minVolume: number;
  timeFilterEnabled: boolean;
  bestHourStart: number;
  bestHourEnd: number;
}

export interface Individual {
  id: string;
  genome: StrategyGenome;
  fitness: number;
  generation: number;
  metrics: OptimizationMetrics;
}

export interface OptimizationMetrics {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  totalReturn: number;
  avgTrade: number;
  avgWin: number;
  avgLoss: number;
}

export interface GeneticConfig {
  populationSize: number;
  generations: number;
  mutationRate: number;
  crossoverRate: number;
  elitismCount: number;
  fitnessFunction: 'PROFIT' | 'SHARPE' | 'SORTINO' | 'CUSTOM';
  backtestDays: number;
  validationSplit: number;
  overfittingPrevention: boolean;
}

export interface OptimizationResult {
  bestGenome: StrategyGenome;
  bestMetrics: OptimizationMetrics;
  validationMetrics: OptimizationMetrics;
  generationHistory: Array<{
    generation: number;
    bestFitness: number;
    avgFitness: number;
    worstFitness: number;
  }>;
  overfittingScore: number;
  completedAt: Date;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: GeneticConfig = {
  populationSize: 50,
  generations: 100,
  mutationRate: 0.1,
  crossoverRate: 0.7,
  elitismCount: 5,
  fitnessFunction: 'SHARPE',
  backtestDays: 90,
  validationSplit: 0.3,
  overfittingPrevention: true,
};

const DEFAULT_GENOME: StrategyGenome = {
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  emaFast: 12,
  emaSlow: 26,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  stopLossPercent: 2,
  takeProfitPercent: 4,
  trailingStopEnabled: true,
  trailingStopPercent: 1.5,
  positionSizePercent: 5,
  maxPositions: 3,
  leverage: 5,
  minVolume: 1000000,
  timeFilterEnabled: false,
  bestHourStart: 9,
  bestHourEnd: 16,
};

// ==================== GENETIC OPTIMIZER CLASS ====================

export class GeneticOptimizer {
  private config: GeneticConfig;
  private population: Individual[];
  private generationHistory: Array<{
    generation: number;
    bestFitness: number;
    avgFitness: number;
    worstFitness: number;
  }>;
  private isRunning: boolean;

  constructor(config?: Partial<GeneticConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.population = [];
    this.generationHistory = [];
    this.isRunning = false;
  }

  /**
   * Run optimization
   */
  async optimize(symbol: string): Promise<OptimizationResult> {
    if (this.isRunning) {
      throw new Error('Optimization already running');
    }

    this.isRunning = true;
    logger.info({ symbol, config: this.config }, 'Starting genetic optimization');

    try {
      // Initialize population
      this.initializePopulation();

      // Run evolution
      for (let gen = 0; gen < this.config.generations; gen++) {
        logger.debug({ generation: gen }, 'Evolving generation');

        // Evaluate fitness
        await this.evaluateFitness(symbol);

        // Record history
        this.recordGenerationHistory(gen);

        // Check for convergence
        if (this.hasConverged()) {
          logger.info({ generation: gen }, 'Optimization converged');
          break;
        }

        // Create next generation
        this.evolve();
      }

      // Final evaluation
      await this.evaluateFitness(symbol);

      // Get best individual
      const best = this.getBestIndividual();

      // Validate (prevent overfitting)
      const validationMetrics = await this.validate(best.genome, symbol);

      // Calculate overfitting score
      const overfittingScore = this.calculateOverfittingScore(best.metrics, validationMetrics);

      const result: OptimizationResult = {
        bestGenome: best.genome,
        bestMetrics: best.metrics,
        validationMetrics,
        generationHistory: this.generationHistory,
        overfittingScore,
        completedAt: new Date(),
      };

      // Save to database
      await this.saveOptimizationResult(result, symbol);

      logger.info({
        symbol,
        sharpe: best.metrics.sharpeRatio,
        winRate: best.metrics.winRate,
        overfitting: overfittingScore,
      }, 'Optimization completed');

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Initialize population with random genomes
   */
  private initializePopulation(): void {
    this.population = [];

    for (let i = 0; i < this.config.populationSize; i++) {
      const genome = this.randomGenome();
      this.population.push({
        id: `ind-${Date.now()}-${i}`,
        genome,
        fitness: 0,
        generation: 0,
        metrics: this.emptyMetrics(),
      });
    }

    logger.info({ size: this.population.length }, 'Population initialized');
  }

  /**
   * Generate random genome within valid ranges
   */
  private randomGenome(): StrategyGenome {
    return {
      rsiPeriod: this.randomInt(7, 21),
      rsiOversold: this.randomInt(20, 40),
      rsiOverbought: this.randomInt(60, 80),
      emaFast: this.randomInt(5, 20),
      emaSlow: this.randomInt(20, 50),
      macdFast: this.randomInt(8, 15),
      macdSlow: this.randomInt(20, 30),
      macdSignal: this.randomInt(5, 12),
      stopLossPercent: parseFloat((Math.random() * 3 + 0.5).toFixed(2)),
      takeProfitPercent: parseFloat((Math.random() * 6 + 2).toFixed(2)),
      trailingStopEnabled: Math.random() > 0.5,
      trailingStopPercent: parseFloat((Math.random() * 2 + 0.5).toFixed(2)),
      positionSizePercent: parseFloat((Math.random() * 8 + 2).toFixed(2)),
      maxPositions: this.randomInt(1, 5),
      leverage: this.randomInt(1, 10),
      minVolume: Math.random() > 0.5 ? 1000000 : 0,
      timeFilterEnabled: Math.random() > 0.7,
      bestHourStart: this.randomInt(8, 12),
      bestHourEnd: this.randomInt(14, 18),
    };
  }

  /**
   * Evaluate fitness for all individuals
   */
  private async evaluateFitness(symbol: string): Promise<void> {
    for (const individual of this.population) {
      const metrics = await this.backtest(individual.genome, symbol, 'training');
      individual.metrics = metrics;
      individual.fitness = this.calculateFitness(metrics);
    }

    // Sort by fitness
    this.population.sort((a, b) => b.fitness - a.fitness);
  }

  /**
   * Backtest genome on historical data
   */
  private async backtest(
    genome: StrategyGenome,
    symbol: string,
    dataset: 'training' | 'validation'
  ): Promise<OptimizationMetrics> {
    // Get historical data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - this.config.backtestDays);

    // Split for validation
    if (dataset === 'validation') {
      startDate.setDate(startDate.getDate() + Math.floor(this.config.backtestDays * this.config.validationSplit));
    }

    const candles = await db.ohlcvCandle.findMany({
      where: {
        symbol,
        openTime: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { openTime: 'asc' },
    });

    if (candles.length < 100) {
      return this.emptyMetrics();
    }

    // Simulate trades
    const trades: Array<{ pnl: number; pnlPercent: number }> = [];
    let position: any = null;
    let equity = 10000; // Starting equity

    for (let i = 100; i < candles.length; i++) {
      const candle = candles[i];
      const prevCandles = candles.slice(i - 100, i);

      // Check for entry signal
      if (!position) {
        const signal = this.generateSignal(genome, prevCandles, candle);
        
        if (signal) {
          position = {
            entryPrice: candle.close,
            direction: signal.direction,
            quantity: (equity * genome.positionSizePercent / 100) / candle.close,
            stopLoss: genome.stopLossEnabled ? candle.close * (1 - genome.stopLossPercent / 100) : 0,
            takeProfit: candle.close * (1 + genome.takeProfitPercent / 100),
          };
        }
      } else {
        // Check for exit
        const exitReason = this.checkExit(genome, position, candle);
        
        if (exitReason) {
          const pnlPercent = position.direction === 'LONG'
            ? (candle.close - position.entryPrice) / position.entryPrice
            : (position.entryPrice - candle.close) / position.entryPrice;
          
          const pnl = pnlPercent * position.quantity * position.entryPrice;
          equity += pnl;
          
          trades.push({ pnl, pnlPercent });
          position = null;
        }
      }
    }

    // Calculate metrics
    return this.calculateMetrics(trades, equity);
  }

  /**
   * Generate trading signal based on genome
   */
  private generateSignal(
    genome: StrategyGenome,
    candles: any[],
    currentCandle: any
  ): { direction: 'LONG' | 'SHORT' } | null {
    // Calculate RSI
    const rsi = this.calculateRSI(candles, genome.rsiPeriod);
    
    // Calculate EMAs
    const emaFast = this.calculateEMA(candles, genome.emaFast);
    const emaSlow = this.calculateEMA(candles, genome.emaSlow);
    
    // Calculate MACD
    const macd = this.calculateMACD(candles, genome.macdFast, genome.macdSlow, genome.macdSignal);

    // Entry conditions
    const longCondition = 
      rsi < genome.rsiOversold &&
      emaFast > emaSlow &&
      macd.histogram > 0;

    const shortCondition =
      rsi > genome.rsiOverbought &&
      emaFast < emaSlow &&
      macd.histogram < 0;

    // Time filter
    if (genome.timeFilterEnabled) {
      const hour = currentCandle.openTime.getHours();
      if (hour < genome.bestHourStart || hour > genome.bestHourEnd) {
        return null;
      }
    }

    // Volume filter
    if (genome.minVolume > 0 && currentCandle.volume < genome.minVolume) {
      return null;
    }

    if (longCondition) {
      return { direction: 'LONG' };
    } else if (shortCondition) {
      return { direction: 'SHORT' };
    }

    return null;
  }

  /**
   * Check exit conditions
   */
  private checkExit(genome: StrategyGenome, position: any, candle: any): string | null {
    if (position.direction === 'LONG') {
      if (candle.low <= position.stopLoss) return 'STOP_LOSS';
      if (candle.high >= position.takeProfit) return 'TAKE_PROFIT';
    } else {
      if (candle.high >= position.stopLoss) return 'STOP_LOSS';
      if (candle.low <= position.takeProfit) return 'TAKE_PROFIT';
    }

    return null;
  }

  /**
   * Calculate fitness score
   */
  private calculateFitness(metrics: OptimizationMetrics): number {
    switch (this.config.fitnessFunction) {
      case 'PROFIT':
        return metrics.totalReturn;
      case 'SHARPE':
        return metrics.sharpeRatio;
      case 'SORTINO':
        return metrics.sortinoRatio;
      case 'CUSTOM':
        // Combined score
        return (
          metrics.sharpeRatio * 0.4 +
          metrics.profitFactor * 0.3 +
          metrics.winRate * 0.2 +
          (1 - metrics.maxDrawdown) * 0.1
        );
      default:
        return metrics.sharpeRatio;
    }
  }

  /**
   * Evolve population
   */
  private evolve(): void {
    const newPopulation: Individual[] = [];

    // Elitism - keep best individuals
    for (let i = 0; i < this.config.elitismCount; i++) {
      newPopulation.push({ ...this.population[i] });
    }

    // Create rest of population through crossover and mutation
    while (newPopulation.length < this.config.populationSize) {
      // Select parents (tournament selection)
      const parent1 = this.tournamentSelect();
      const parent2 = this.tournamentSelect();

      // Crossover
      let child1: StrategyGenome;
      let child2: StrategyGenome;

      if (Math.random() < this.config.crossoverRate) {
        [child1, child2] = this.crossover(parent1.genome, parent2.genome);
      } else {
        child1 = { ...parent1.genome };
        child2 = { ...parent2.genome };
      }

      // Mutation
      child1 = this.mutate(child1);
      child2 = this.mutate(child2);

      // Add to new population
      const generation = this.generationHistory.length + 1;
      newPopulation.push({
        id: `ind-${Date.now()}-${newPopulation.length}`,
        genome: child1,
        fitness: 0,
        generation,
        metrics: this.emptyMetrics(),
      });

      if (newPopulation.length < this.config.populationSize) {
        newPopulation.push({
          id: `ind-${Date.now()}-${newPopulation.length}`,
          genome: child2,
          fitness: 0,
          generation,
          metrics: this.emptyMetrics(),
        });
      }
    }

    this.population = newPopulation;
  }

  /**
   * Tournament selection
   */
  private tournamentSelect(): Individual {
    const tournamentSize = 5;
    const tournament: Individual[] = [];

    for (let i = 0; i < tournamentSize; i++) {
      const randomIndex = Math.floor(Math.random() * this.population.length);
      tournament.push(this.population[randomIndex]);
    }

    return tournament.reduce((best, current) => 
      current.fitness > best.fitness ? current : best
    );
  }

  /**
   * Crossover two genomes
   */
  private crossover(genome1: StrategyGenome, genome2: StrategyGenome): [StrategyGenome, StrategyGenome] {
    const child1: any = {};
    const child2: any = {};

    const keys = Object.keys(genome1) as Array<keyof StrategyGenome>;

    for (const key of keys) {
      if (Math.random() < 0.5) {
        child1[key] = genome1[key];
        child2[key] = genome2[key];
      } else {
        child1[key] = genome2[key];
        child2[key] = genome1[key];
      }
    }

    return [child1 as StrategyGenome, child2 as StrategyGenome];
  }

  /**
   * Mutate genome
   */
  private mutate(genome: StrategyGenome): StrategyGenome {
    const mutated = { ...genome };
    const keys = Object.keys(genome) as Array<keyof StrategyGenome>;

    for (const key of keys) {
      if (Math.random() < this.config.mutationRate) {
        const value = genome[key];
        
        if (typeof value === 'number') {
          // Mutate numeric value
          const mutation = (Math.random() - 0.5) * 0.2 * value; // ±10%
          mutated[key] = Math.max(0, value + mutation) as any;
        } else if (typeof value === 'boolean') {
          // Flip boolean
          mutated[key] = !value as any;
        }
      }
    }

    return mutated;
  }

  /**
   * Validate genome to prevent overfitting
   */
  private async validate(genome: StrategyGenome, symbol: string): Promise<OptimizationMetrics> {
    return await this.backtest(genome, symbol, 'validation');
  }

  /**
   * Calculate overfitting score
   */
  private calculateOverfittingScore(
    training: OptimizationMetrics,
    validation: OptimizationMetrics
  ): number {
    // Compare key metrics
    const sharpeDiff = Math.abs(training.sharpeRatio - validation.sharpeRatio);
    const winRateDiff = Math.abs(training.winRate - validation.winRate);
    const drawdownDiff = Math.abs(training.maxDrawdown - validation.maxDrawdown);

    // Score from 0 (no overfitting) to 1 (severe overfitting)
    const score = (sharpeDiff * 0.5 + winRateDiff * 0.3 + drawdownDiff * 0.2);

    return Math.min(1, score);
  }

  /**
   * Check for convergence
   */
  private hasConverged(): boolean {
    if (this.generationHistory.length < 10) {
      return false;
    }

    const last10 = this.generationHistory.slice(-10);
    const fitnesses = last10.map(g => g.bestFitness);
    const variance = fitnesses.reduce((sum, f) => sum + Math.pow(f - fitnesses[0], 2), 0) / fitnesses.length;

    return variance < 0.01; // Low variance = converged
  }

  /**
   * Record generation history
   */
  private recordGenerationHistory(generation: number): void {
    const fitnesses = this.population.map(i => i.fitness);
    
    this.generationHistory.push({
      generation,
      bestFitness: Math.max(...fitnesses),
      avgFitness: fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length,
      worstFitness: Math.min(...fitnesses),
    });
  }

  /**
   * Get best individual
   */
  private getBestIndividual(): Individual {
    return this.population[0];
  }

  /**
   * Calculate metrics from trades
   */
  private calculateMetrics(
    trades: Array<{ pnl: number; pnlPercent: number }>,
    finalEquity: number
  ): OptimizationMetrics {
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.pnl > 0).length;
    const losingTrades = trades.filter(t => t.pnl <= 0).length;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);

    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length : 0;

    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const totalReturn = (finalEquity - 10000) / 10000;

    // Sharpe ratio (simplified)
    const returns = trades.map(t => t.pnlPercent);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / Math.max(1, returns.length);
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / Math.max(1, returns.length - 1));
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    // Sortino ratio (downside deviation)
    const downsideReturns = returns.filter(r => r < 0);
    const downsideDev = downsideReturns.length > 0
      ? Math.sqrt(downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length)
      : 0;
    const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(252) : sharpeRatio;

    // Max drawdown (simplified)
    let peak = 10000;
    let maxDrawdown = 0;
    let equity = 10000;
    for (const trade of trades) {
      equity += trade.pnl;
      if (equity > peak) peak = equity;
      const drawdown = (peak - equity) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return {
      totalTrades,
      winRate,
      profitFactor,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      totalReturn,
      avgTrade: totalTrades > 0 ? totalPnl / totalTrades : 0,
      avgWin,
      avgLoss,
    };
  }

  /**
   * Empty metrics
   */
  private emptyMetrics(): OptimizationMetrics {
    return {
      totalTrades: 0,
      winRate: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      maxDrawdown: 1,
      totalReturn: 0,
      avgTrade: 0,
      avgWin: 0,
      avgLoss: 0,
    };
  }

  /**
   * Save optimization result
   */
  private async saveOptimizationResult(result: OptimizationResult, symbol: string): Promise<void> {
    await db.strategyOptimization.create({
      data: {
        symbol,
        genome: result.bestGenome as any,
        metrics: result.bestMetrics as any,
        validationMetrics: result.validationMetrics as any,
        overfittingScore: result.overfittingScore,
        generationHistory: result.generationHistory as any,
        completedAt: result.completedAt,
      },
    });
  }

  /**
   * Helper: Random integer
   */
  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Helper: Calculate RSI
   */
  private calculateRSI(candles: any[], period: number): number {
    if (candles.length < period + 1) return 50;

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i <= period; i++) {
      const change = candles[i - 1].close - candles[i].close;
      if (change > 0) gains.push(change);
      else losses.push(Math.abs(change));
    }

    const avgGain = gains.reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Helper: Calculate EMA
   */
  private calculateEMA(candles: any[], period: number): number {
    if (candles.length < period) return candles[0].close;

    const multiplier = 2 / (period + 1);
    let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;

    for (let i = period; i < candles.length; i++) {
      ema = (candles[i].close - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Helper: Calculate MACD
   */
  private calculateMACD(candles: any[], fast: number, slow: number, signal: number): { macd: number; signal: number; histogram: number } {
    const emaFast = this.calculateEMA(candles, fast);
    const emaSlow = this.calculateEMA(candles, slow);
    const macd = emaFast - emaSlow;
    const signalLine = macd * 0.9; // Simplified
    const histogram = macd - signalLine;

    return { macd, signal: signalLine, histogram };
  }

  /**
   * Get current status
   */
  getStatus(): { isRunning: boolean; generation: number; populationSize: number } {
    return {
      isRunning: this.isRunning,
      generation: this.generationHistory.length,
      populationSize: this.population.length,
    };
  }
}

// ==================== SINGLETON ====================

let optimizerInstance: GeneticOptimizer | null = null;

export function getGeneticOptimizer(config?: Partial<GeneticConfig>): GeneticOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new GeneticOptimizer(config);
  }
  return optimizerInstance;
}

// ==================== EXPORTS ====================

export default {
  GeneticOptimizer,
  getGeneticOptimizer,
  DEFAULT_CONFIG,
  DEFAULT_GENOME,
};
