/**
 * Particle Swarm Optimization (PSO) Optimizer
 * 
 * Быстрая оптимизация непрерывных параметров:
 * - Шаг сетки (GRID)
 * - Уровни TP/SL
 * - Множители DCA
 * - Периоды индикаторов
 * 
 * @module lib/optimization/pso-optimizer
 */

import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface Particle {
  position: number[];
  velocity: number[];
  bestPosition: number[];
  bestFitness: number;
  fitness: number;
}

export interface PSOConfig {
  swarmSize: number;
  maxIterations: number;
  inertiaWeight: number;
  cognitiveCoefficient: number;
  socialCoefficient: number;
  minPosition: number[];
  maxPosition: number[];
  minVelocity: number[];
  maxVelocity: number[];
}

export interface PSOResult {
  bestPosition: number[];
  bestFitness: number;
  history: number[];
  iterations: number;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: PSOConfig = {
  swarmSize: 30,
  maxIterations: 50,
  inertiaWeight: 0.7,
  cognitiveCoefficient: 1.5,
  socialCoefficient: 1.5,
  minPosition: [],
  maxPosition: [],
  minVelocity: [],
  maxVelocity: [],
};

// ==================== PSO OPTIMIZER ====================

export class PSOOptimizer {
  private config: PSOConfig;
  private swarm: Particle[] = [];
  private globalBestPosition: number[] = [];
  private globalBestFitness: number = -Infinity;
  private fitnessHistory: number[] = [];

  constructor(config?: Partial<PSOConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Оптимизировать функцию fitness
   */
  async optimize(
    fitnessFunction: (position: number[]) => Promise<number>
  ): Promise<PSOResult> {
    const dimensions = this.config.minPosition.length;

    if (dimensions === 0) {
      throw new Error('minPosition and maxPosition must be set');
    }

    // Инициализация роя
    this.initializeSwarm(dimensions);

    // Основной цикл PSO
    for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
      for (const particle of this.swarm) {
        // Оценка fitness
        particle.fitness = await fitnessFunction(particle.position);

        // Обновление личного лучшего
        if (particle.fitness > particle.bestFitness) {
          particle.bestFitness = particle.fitness;
          particle.bestPosition = [...particle.position];
        }

        // Обновление глобального лучшего
        if (particle.fitness > this.globalBestFitness) {
          this.globalBestFitness = particle.fitness;
          this.globalBestPosition = [...particle.position];
        }
      }

      // Обновление скоростей и позиций
      this.updateParticles();

      // Сохранение истории
      this.fitnessHistory.push(this.globalBestFitness);

      logger.debug({ iteration, bestFitness: this.globalBestFitness }, 'PSO iteration');

      // Ранняя остановка если сошлось
      if (this.hasConverged()) {
        logger.info({ iteration, bestFitness: this.globalBestFitness }, 'PSO converged');
        break;
      }
    }

    return {
      bestPosition: this.globalBestPosition,
      bestFitness: this.globalBestFitness,
      history: this.fitnessHistory,
      iterations: this.fitnessHistory.length,
    };
  }

  /**
   * Инициализация роя
   */
  private initializeSwarm(dimensions: number): void {
    this.swarm = [];
    this.globalBestPosition = [];
    this.globalBestFitness = -Infinity;
    this.fitnessHistory = [];

    for (let i = 0; i < this.config.swarmSize; i++) {
      const position: number[] = [];
      const velocity: number[] = [];

      for (let d = 0; d < dimensions; d++) {
        const min = this.config.minPosition[d] || 0;
        const max = this.config.maxPosition[d] || 1;

        position.push(min + Math.random() * (max - min));
        velocity.push((Math.random() * 2 - 1) * (max - min) * 0.1);
      }

      this.swarm.push({
        position,
        velocity,
        bestPosition: [...position],
        bestFitness: -Infinity,
        fitness: -Infinity,
      });
    }
  }

  /**
   * Обновление частиц
   */
  private updateParticles(): void {
    for (const particle of this.swarm) {
      for (let d = 0; d < particle.position.length; d++) {
        const r1 = Math.random();
        const r2 = Math.random();

        // Обновление скорости
        particle.velocity[d] =
          this.config.inertiaWeight * particle.velocity[d] +
          this.config.cognitiveCoefficient * r1 * (particle.bestPosition[d] - particle.position[d]) +
          this.config.socialCoefficient * r2 * (this.globalBestPosition[d] - particle.position[d]);

        // Ограничение скорости
        const minVel = this.config.minVelocity[d] || -Infinity;
        const maxVel = this.config.maxVelocity[d] || Infinity;
        particle.velocity[d] = Math.max(minVel, Math.min(maxVel, particle.velocity[d]));

        // Обновление позиции
        particle.position[d] += particle.velocity[d];

        // Ограничение позиции
        const minPos = this.config.minPosition[d] || 0;
        const maxPos = this.config.maxPosition[d] || 1;
        particle.position[d] = Math.max(minPos, Math.min(maxPos, particle.position[d]));
      }
    }
  }

  /**
   * Проверка сходимости
   */
  private hasConverged(): boolean {
    if (this.fitnessHistory.length < 10) return false;

    const recent = this.fitnessHistory.slice(-10);
    const variance = recent.reduce((sum, f) => sum + Math.pow(f - recent[0], 2), 0) / recent.length;

    return variance < 0.0001;
  }

  /**
   * Получить лучшую позицию
   */
  getBestPosition(): number[] {
    return [...this.globalBestPosition];
  }

  /**
   * Получить лучшую fitness
   */
  getBestFitness(): number {
    return this.globalBestFitness;
  }

  /**
   * Сбросить оптимизатор
   */
  reset(): void {
    this.swarm = [];
    this.globalBestPosition = [];
    this.globalBestFitness = -Infinity;
    this.fitnessHistory = [];
  }
}

// ==================== EXPORTS ====================

export default { PSOOptimizer };
