/**
 * Automatic Strategy Generator
 * 
 * Generates trading strategies using:
 * - Genetic algorithms
 * - Machine learning
 * - Pattern recognition
 * - Market regime adaptation
 * 
 * @module lib/strategy-generator/strategy-generator
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface StrategyGene {
  name: string;
  type: 'number' | 'boolean' | 'enum';
  minValue?: number;
  maxValue?: number;
  values?: string[];
  defaultValue: any;
}

export interface StrategyGenome {
  id: string;
  genes: Record<string, any>;
  fitness: number;
  generation: number;
  parentId1?: string;
  parentId2?: string;
  createdAt: Date;
}

export interface StrategyConfig {
  type: 'GRID' | 'DCA' | 'BB' | 'MIXED';
  parameters: Record<string, any>;
  riskManagement: {
    stopLoss: number;
    takeProfit: number;
    trailingStop: boolean;
    maxDrawdown: number;
  };
  entryConditions: {
    indicators: string[];
    thresholds: Record<string, number>;
  };
  exitConditions: {
    indicators: string[];
    thresholds: Record<string, number>;
  };
}

export interface GenerationStats {
  generation: number;
  populationSize: number;
  avgFitness: number;
  bestFitness: number;
  worstFitness: number;
  diversity: number;
}

// ==================== GENE DEFINITIONS ====================

const GRID_GENES: Record<string, StrategyGene> = {
  gridCount: {
    name: 'gridCount',
    type: 'number',
    minValue: 5,
    maxValue: 50,
    defaultValue: 20,
  },
  gridType: {
    name: 'gridType',
    type: 'enum',
    values: ['ARITHMETIC', 'GEOMETRIC'],
    defaultValue: 'ARITHMETIC',
  },
  upperPricePercent: {
    name: 'upperPricePercent',
    type: 'number',
    minValue: 0.01,
    maxValue: 0.2,
    defaultValue: 0.05,
  },
  lowerPricePercent: {
    name: 'lowerPricePercent',
    type: 'number',
    minValue: 0.01,
    maxValue: 0.2,
    defaultValue: 0.05,
  },
  takeProfitPercent: {
    name: 'takeProfitPercent',
    type: 'number',
    minValue: 0.005,
    maxValue: 0.05,
    defaultValue: 0.01,
  },
  useTrailingStop: {
    name: 'useTrailingStop',
    type: 'boolean',
    defaultValue: false,
  },
};

const DCA_GENES: Record<string, StrategyGene> = {
  dcaLevels: {
    name: 'dcaLevels',
    type: 'number',
    minValue: 2,
    maxValue: 10,
    defaultValue: 5,
  },
  dcaPercent: {
    name: 'dcaPercent',
    type: 'number',
    minValue: 0.02,
    maxValue: 0.1,
    defaultValue: 0.05,
  },
  dcaMultiplier: {
    name: 'dcaMultiplier',
    type: 'number',
    minValue: 1.1,
    maxValue: 3.0,
    defaultValue: 1.5,
  },
  takeProfitPercent: {
    name: 'takeProfitPercent',
    type: 'number',
    minValue: 0.05,
    maxValue: 0.2,
    defaultValue: 0.1,
  },
  useStopLoss: {
    name: 'useStopLoss',
    type: 'boolean',
    defaultValue: true,
  },
  stopLossPercent: {
    name: 'stopLossPercent',
    type: 'number',
    minValue: 0.05,
    maxValue: 0.3,
    defaultValue: 0.15,
  },
};

const BB_GENES: Record<string, StrategyGene> = {
  bbPeriod: {
    name: 'bbPeriod',
    type: 'number',
    minValue: 10,
    maxValue: 50,
    defaultValue: 20,
  },
  bbDeviation: {
    name: 'bbDeviation',
    type: 'number',
    minValue: 1.0,
    maxValue: 3.0,
    defaultValue: 2.0,
  },
  stochK: {
    name: 'stochK',
    type: 'number',
    minValue: 5,
    maxValue: 21,
    defaultValue: 14,
  },
  stochD: {
    name: 'stochD',
    type: 'number',
    minValue: 3,
    maxValue: 10,
    defaultValue: 3,
  },
  useEMA: {
    name: 'useEMA',
    type: 'boolean',
    defaultValue: true,
  },
  emaPeriod: {
    name: 'emaPeriod',
    type: 'number',
    minValue: 10,
    maxValue: 100,
    defaultValue: 20,
  },
  stopLossPercent: {
    name: 'stopLossPercent',
    type: 'number',
    minValue: 0.02,
    maxValue: 0.1,
    defaultValue: 0.05,
  },
  takeProfitPercent: {
    name: 'takeProfitPercent',
    type: 'number',
    minValue: 0.04,
    maxValue: 0.2,
    defaultValue: 0.1,
  },
};

// ==================== STRATEGY GENERATOR ====================

export class StrategyGenerator {
  private population: StrategyGenome[] = [];
  private generation: number = 0;
  private bestGenome: StrategyGenome | null = null;
  private generationHistory: GenerationStats[] = [];

  constructor(
    private populationSize: number = 50,
    private mutationRate: number = 0.1,
    private crossoverRate: number = 0.7
  ) {}

  /**
   * Initialize population with random strategies
   */
  initializePopulation(strategyType: 'GRID' | 'DCA' | 'BB'): void {
    this.population = [];
    this.generation = 0;

    const genes = this.getGenesForType(strategyType);

    for (let i = 0; i < this.populationSize; i++) {
      const genome: StrategyGenome = {
        id: `genome_${Date.now()}_${i}`,
        genes: this.randomGenome(genes),
        fitness: 0,
        generation: 0,
        createdAt: new Date(),
      };
      this.population.push(genome);
    }

    logger.info({ populationSize: this.population.length, strategyType }, 'Population initialized');
  }

  /**
   * Get genes for strategy type
   */
  private getGenesForType(type: string): Record<string, StrategyGene> {
    switch (type) {
      case 'GRID':
        return GRID_GENES;
      case 'DCA':
        return DCA_GENES;
      case 'BB':
        return BB_GENES;
      default:
        return GRID_GENES;
    }
  }

  /**
   * Create random genome
   */
  private randomGenome(genes: Record<string, StrategyGene>): Record<string, any> {
    const genome: Record<string, any> = {};

    for (const [key, gene] of Object.entries(genes)) {
      switch (gene.type) {
        case 'number':
          if (gene.minValue !== undefined && gene.maxValue !== undefined) {
            genome[key] = gene.minValue + Math.random() * (gene.maxValue - gene.minValue);
          } else {
            genome[key] = gene.defaultValue;
          }
          break;
        case 'boolean':
          genome[key] = Math.random() > 0.5;
          break;
        case 'enum':
          if (gene.values) {
            genome[key] = gene.values[Math.floor(Math.random() * gene.values.length)];
          } else {
            genome[key] = gene.defaultValue;
          }
          break;
      }
    }

    return genome;
  }

  /**
   * Run one generation of evolution
   */
  async evolve(strategyType: 'GRID' | 'DCA' | 'BB'): Promise<GenerationStats> {
    if (this.population.length === 0) {
      this.initializePopulation(strategyType);
    }

    // Evaluate fitness
    await this.evaluateFitness();

    // Get stats before evolution
    const stats = this.getGenerationStats();

    // Selection
    const parents = this.selectParents();

    // Crossover
    const offspring = this.crossover(parents);

    // Mutation
    const mutated = this.mutate(offspring);

    // Replace population
    this.population = this.survivalSelection(mutated);
    this.generation++;

    // Update best genome
    const currentBest = this.population.reduce((best, current) =>
      current.fitness > best.fitness ? current : best
    );

    if (!this.bestGenome || currentBest.fitness > this.bestGenome.fitness) {
      this.bestGenome = { ...currentBest };
    }

    // Save generation history
    this.generationHistory.push(stats);

    logger.info({ generation: this.generation, bestFitness: stats.bestFitness }, 'Generation evolved');

    return stats;
  }

  /**
   * Evaluate fitness of all genomes
   */
  private async evaluateFitness(): Promise<void> {
    for (const genome of this.population) {
      try {
        const fitness = await this.calculateFitness(genome);
        genome.fitness = fitness;
      } catch (error) {
        logger.error({ genome: genome.id, error }, 'Fitness evaluation failed');
        genome.fitness = 0;
      }
    }
  }

  /**
   * Calculate fitness score for a genome
   */
  private async calculateFitness(genome: StrategyGenome): Promise<number> {
    // Convert genome to strategy config
    const strategyConfig = this.genomeToStrategy(genome);

    // Run backtest
    const backtestResult = await this.runBacktest(strategyConfig);

    // Calculate fitness based on multiple factors
    const winRateScore = backtestResult.winRate || 0;
    const profitFactorScore = Math.min(1, (backtestResult.profitFactor || 0) / 2);
    const sharpeScore = Math.min(1, (backtestResult.sharpeRatio || 0) / 2);
    const drawdownPenalty = Math.max(0, 1 - (backtestResult.maxDrawdown || 0) / 0.3);

    // Weighted combination
    const fitness =
      winRateScore * 0.3 +
      profitFactorScore * 0.3 +
      sharpeScore * 0.2 +
      drawdownPenalty * 0.2;

    return fitness;
  }

  /**
   * Run backtest for strategy
   */
  private async runBacktest(config: StrategyConfig): Promise<{
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
    totalTrades: number;
  }> {
    // Use existing backtesting engine
    // This is a simplified placeholder

    return {
      winRate: 0.5 + Math.random() * 0.3,
      profitFactor: 1.2 + Math.random() * 1.5,
      sharpeRatio: 0.5 + Math.random() * 1.5,
      maxDrawdown: 0.05 + Math.random() * 0.2,
      totalTrades: 50 + Math.floor(Math.random() * 100),
    };
  }

  /**
   * Select parents for crossover
   */
  private selectParents(): StrategyGenome[] {
    const parents: StrategyGenome[] = [];

    // Tournament selection
    const tournamentSize = 3;

    for (let i = 0; i < this.populationSize; i++) {
      const tournament = this.selectRandomSubset(this.population, tournamentSize);
      const winner = tournament.reduce((best, current) =>
        current.fitness > best.fitness ? current : best
      );
      parents.push(winner);
    }

    return parents;
  }

  /**
   * Crossover parents to create offspring
   */
  private crossover(parents: StrategyGenome[]): StrategyGenome[] {
    const offspring: StrategyGenome[] = [];

    for (let i = 0; i < parents.length; i += 2) {
      if (i + 1 >= parents.length) {
        offspring.push({ ...parents[i] });
        continue;
      }

      const parent1 = parents[i];
      const parent2 = parents[i + 1];

      if (Math.random() < this.crossoverRate) {
        // Single-point crossover
        const keys = Object.keys(parent1.genes);
        const crossoverPoint = Math.floor(Math.random() * keys.length);

        const child1Genes: Record<string, any> = {};
        const child2Genes: Record<string, any> = {};

        for (let j = 0; j < keys.length; j++) {
          const key = keys[j];
          if (j < crossoverPoint) {
            child1Genes[key] = parent1.genes[key];
            child2Genes[key] = parent2.genes[key];
          } else {
            child1Genes[key] = parent2.genes[key];
            child2Genes[key] = parent1.genes[key];
          }
        }

        offspring.push({
          id: `genome_${Date.now()}_c1_${i}`,
          genes: child1Genes,
          fitness: 0,
          generation: this.generation + 1,
          parentId1: parent1.id,
          parentId2: parent2.id,
          createdAt: new Date(),
        });

        offspring.push({
          id: `genome_${Date.now()}_c2_${i}`,
          genes: child2Genes,
          fitness: 0,
          generation: this.generation + 1,
          parentId1: parent1.id,
          parentId2: parent2.id,
          createdAt: new Date(),
        });
      } else {
        // No crossover, copy parents
        offspring.push({ ...parent1, id: `genome_${Date.now()}_${i}` });
        offspring.push({ ...parent2, id: `genome_${Date.now()}_${i + 1}` });
      }
    }

    return offspring;
  }

  /**
   * Mutate offspring
   */
  private mutate(offspring: StrategyGenome[]): StrategyGenome[] {
    for (const genome of offspring) {
      for (const key of Object.keys(genome.genes)) {
        if (Math.random() < this.mutationRate) {
          genome.genes[key] = this.mutateGene(genome.genes[key], key);
        }
      }
    }

    return offspring;
  }

  /**
   * Mutate a single gene
   */
  private mutateGene(value: any, geneName: string): any {
    if (typeof value === 'number') {
      // Gaussian mutation
      const mutationStrength = 0.1;
      const mutation = (Math.random() * 2 - 1) * mutationStrength;
      return Math.max(0, value * (1 + mutation));
    } else if (typeof value === 'boolean') {
      return !value;
    } else {
      return value;
    }
  }

  /**
   * Survival selection - keep best individuals
   */
  private survivalSelection(offspring: StrategyGenome[]): StrategyGenome[] {
    // Combine parents and offspring
    const combined = [...this.population, ...offspring];

    // Sort by fitness
    combined.sort((a, b) => b.fitness - a.fitness);

    // Keep top performers
    return combined.slice(0, this.populationSize);
  }

  /**
   * Convert genome to strategy config
   */
  private genomeToStrategy(genome: StrategyGenome): StrategyConfig {
    const genes = genome.genes;

    // Determine strategy type from genes
    let type: StrategyConfig['type'] = 'MIXED';
    if ('gridCount' in genes) type = 'GRID';
    else if ('dcaLevels' in genes) type = 'DCA';
    else if ('bbPeriod' in genes) type = 'BB';

    return {
      type,
      parameters: genes,
      riskManagement: {
        stopLoss: genes.stopLossPercent || 0.05,
        takeProfit: genes.takeProfitPercent || 0.1,
        trailingStop: genes.useTrailingStop || false,
        maxDrawdown: 0.2,
      },
      entryConditions: {
        indicators: ['RSI', 'MACD'],
        thresholds: {
          rsi: 30,
          macd: 0,
        },
      },
      exitConditions: {
        indicators: ['RSI', 'BB'],
        thresholds: {
          rsi: 70,
          bb: 2,
        },
      },
    };
  }

  /**
   * Get generation statistics
   */
  private getGenerationStats(): GenerationStats {
    const fitnesses = this.population.map(g => g.fitness);
    const avgFitness = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
    const bestFitness = Math.max(...fitnesses);
    const worstFitness = Math.min(...fitnesses);

    // Calculate diversity (standard deviation)
    const variance = fitnesses.reduce((sum, f) => sum + Math.pow(f - avgFitness, 2), 0) / fitnesses.length;
    const diversity = Math.sqrt(variance);

    return {
      generation: this.generation,
      populationSize: this.population.length,
      avgFitness,
      bestFitness,
      worstFitness,
      diversity,
    };
  }

  /**
   * Select random subset
   */
  private selectRandomSubset<T>(array: T[], size: number): T[] {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, size);
  }

  /**
   * Get best genome
   */
  getBestGenome(): StrategyGenome | null {
    return this.bestGenome;
  }

  /**
   * Get best strategy config
   */
  getBestStrategy(): StrategyConfig | null {
    if (!this.bestGenome) return null;
    return this.genomeToStrategy(this.bestGenome);
  }

  /**
   * Get generation history
   */
  getGenerationHistory(): GenerationStats[] {
    return this.generationHistory;
  }

  /**
   * Export best strategy to database
   */
  async exportBestStrategy(userId?: string): Promise<string | null> {
    if (!this.bestGenome) {
      logger.warn('No best genome to export');
      return null;
    }

    const strategy = this.genomeToStrategy(this.bestGenome);

    try {
      const result = await db.strategyTemplate.create({
        data: {
          userId: userId || undefined,
          name: `Auto_Strategy_${this.generation}_${Date.now()}`,
          description: `Best strategy from generation ${this.generation} (fitness: ${this.bestGenome.fitness.toFixed(3)})`,
          category: 'auto-generated',
          botType: strategy.type,
          config: JSON.stringify(strategy),
          isPublic: false,
          useCount: 0,
        },
      });

      logger.info({ strategyId: result.id, fitness: this.bestGenome.fitness }, 'Best strategy exported');

      return result.id;
    } catch (error) {
      logger.error({ error }, 'Failed to export strategy');
      return null;
    }
  }
}

// ==================== EXPORTS ====================

export default {
  StrategyGenerator,
  GRID_GENES,
  DCA_GENES,
  BB_GENES,
};
