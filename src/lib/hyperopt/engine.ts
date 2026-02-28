/**
 * Hyperopt Engine
 * 
 * Движок для оптимизации параметров стратегий и тактик.
 * Поддерживает: Random Search, Grid Search, TPE, Genetic Algorithm
 */

import {
  HyperoptConfig,
  HyperoptResult,
  HyperoptTrial,
  HyperoptParameter,
  HyperoptStatistics,
  getObjectiveValue,
  checkConstraints,
  createDefaultHyperoptConfig,
} from "./types";
import { BacktestEngine } from "../backtesting/engine";
import { BacktestResult } from "../backtesting/types";
import { TacticsSet, PREDEFINED_TACTICS_SETS } from "../strategy/tactics/types";
import { getStrategyManager } from "../strategy/manager";

// ==================== HYPEROPT ENGINE ====================

export class HyperoptEngine {
  private results: Map<string, HyperoptResult> = new Map();
  private running: boolean = false;
  private cancelled: boolean = false;
  private trialIdCounter: number = 0;

  /**
   * Запустить оптимизацию
   */
  async run(
    config: HyperoptConfig,
    candles: { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[],
    onProgress?: (progress: number, trial: HyperoptTrial) => void
  ): Promise<HyperoptResult> {
    const result = this.createResult(config);
    this.results.set(result.id, result);
    this.running = true;
    this.cancelled = false;

    result.status = "RUNNING";
    result.startedAt = new Date();

    try {
      // Запускаем baseline с параметрами по умолчанию
      const baselineParams = this.getDefaultParams(config);
      const baselineTrial = await this.runTrial(
        config,
        baselineParams,
        candles,
        result
      );
      
      if (baselineTrial.backtestResult) {
        result.statistics.baselineValue = baselineTrial.objectiveValue || 0;
      }

      // Запускаем оптимизацию в зависимости от метода
      switch (config.method) {
        case "RANDOM":
          await this.runRandomSearch(config, candles, result, onProgress);
          break;
        case "GRID":
          await this.runGridSearch(config, candles, result, onProgress);
          break;
        case "TPE":
          await this.runTPESearch(config, candles, result, onProgress);
          break;
        case "GENETIC":
          await this.runGeneticSearch(config, candles, result, onProgress);
          break;
        default:
          await this.runRandomSearch(config, candles, result, onProgress);
      }

      // Финализация
      result.status = this.cancelled ? "CANCELLED" : "COMPLETED";
      result.completedAt = new Date();
      result.duration = result.completedAt.getTime() - (result.startedAt?.getTime() || 0);
      result.progress = 100;

      // Рассчитываем статистику
      this.calculateStatistics(result);

    } catch (error) {
      result.status = "FAILED";
      result.completedAt = new Date();
      result.duration = result.completedAt.getTime() - (result.startedAt?.getTime() || 0);
      console.error("Hyperopt error:", error);
    }

    this.running = false;
    return result;
  }

  /**
   * Отменить оптимизацию
   */
  cancel(resultId: string): void {
    this.cancelled = true;
    const result = this.results.get(resultId);
    if (result) {
      result.status = "CANCELLED";
    }
  }

  /**
   * Получить результат
   */
  getResult(resultId: string): HyperoptResult | undefined {
    return this.results.get(resultId);
  }

  /**
   * Получить все результаты
   */
  getAllResults(): HyperoptResult[] {
    return Array.from(this.results.values());
  }

  // ==================== OPTIMIZATION METHODS ====================

  /**
   * Random Search
   */
  private async runRandomSearch(
    config: HyperoptConfig,
    candles: any[],
    result: HyperoptResult,
    onProgress?: (progress: number, trial: HyperoptTrial) => void
  ): Promise<void> {
    for (let i = 0; i < config.maxEvals && !this.cancelled; i++) {
      const params = this.sampleRandomParams(config);
      const trial = await this.runTrial(config, params, candles, result);

      result.progress = ((i + 1) / config.maxEvals) * 100;
      onProgress?.(result.progress, trial);
    }
  }

  /**
   * Grid Search
   */
  private async runGridSearch(
    config: HyperoptConfig,
    candles: any[],
    result: HyperoptResult,
    onProgress?: (progress: number, trial: HyperoptTrial) => void
  ): Promise<void> {
    const grid = this.generateGrid(config);
    const totalCombinations = grid.length;
    const maxEvals = Math.min(config.maxEvals, totalCombinations);

    for (let i = 0; i < maxEvals && !this.cancelled; i++) {
      const params = grid[i];
      const trial = await this.runTrial(config, params, candles, result);

      result.progress = ((i + 1) / maxEvals) * 100;
      onProgress?.(result.progress, trial);
    }
  }

  /**
   * TPE (Tree-structured Parzen Estimator)
   */
  private async runTPESearch(
    config: HyperoptConfig,
    candles: any[],
    result: HyperoptResult,
    onProgress?: (progress: number, trial: HyperoptTrial) => void
  ): Promise<void> {
    // Сначала собираем данные для TPE с помощью random search
    const warmupTrials = Math.min(20, Math.floor(config.maxEvals * 0.2));

    for (let i = 0; i < warmupTrials && !this.cancelled; i++) {
      const params = this.sampleRandomParams(config);
      await this.runTrial(config, params, candles, result);
    }

    // Затем используем TPE для предложения новых параметров
    for (let i = warmupTrials; i < config.maxEvals && !this.cancelled; i++) {
      const params = this.sampleTPEParams(config, result);
      const trial = await this.runTrial(config, params, candles, result);

      result.progress = ((i + 1) / config.maxEvals) * 100;
      onProgress?.(result.progress, trial);
    }
  }

  /**
   * Genetic Algorithm
   */
  private async runGeneticSearch(
    config: HyperoptConfig,
    candles: any[],
    result: HyperoptResult,
    onProgress?: (progress: number, trial: HyperoptTrial) => void
  ): Promise<void> {
    const populationSize = Math.min(20, Math.floor(config.maxEvals * 0.2));
    const generations = Math.ceil(config.maxEvals / populationSize);

    // Начальная популяция
    let population: { params: Record<string, any>; fitness: number }[] = [];

    for (let i = 0; i < populationSize && !this.cancelled; i++) {
      const params = this.sampleRandomParams(config);
      const trial = await this.runTrial(config, params, candles, result);
      population.push({
        params,
        fitness: trial.objectiveValue || 0,
      });
    }

    // Эволюция
    for (let gen = 1; gen < generations && !this.cancelled; gen++) {
      // Сортируем по fitness
      population.sort((a, b) => 
        config.direction === "maximize" ? b.fitness - a.fitness : a.fitness - b.fitness
      );

      // Selection - оставляем лучших
      const elite = population.slice(0, Math.floor(populationSize * 0.3));

      // Crossover и Mutation
      const newPopulation = [...elite];

      while (newPopulation.length < populationSize && !this.cancelled) {
        const parent1 = this.selectParent(population);
        const parent2 = this.selectParent(population);
        const child = this.crossover(parent1, parent2, config);
        this.mutate(child, config);

        const trial = await this.runTrial(config, child, candles, result);
        newPopulation.push({
          params: child,
          fitness: trial.objectiveValue || 0,
        });
      }

      population = newPopulation;
      result.progress = ((gen + 1) / generations) * 100;
    }
  }

  // ==================== PARAMETER SAMPLING ====================

  /**
   * Случайная выборка параметров
   */
  private sampleRandomParams(config: HyperoptConfig): Record<string, any> {
    const params: Record<string, any> = {};

    // Параметры стратегии
    if (config.strategyParameters) {
      for (const param of config.strategyParameters) {
        params[param.name] = this.sampleParameter(param);
      }
    }

    // Параметры тактик
    if (config.tacticsParameters) {
      const tacticsParams = config.tacticsParameters;
      if (tacticsParams.positionSize) {
        params.positionSize = this.sampleParameter(tacticsParams.positionSize);
      }
      if (tacticsParams.tpPercent) {
        params.tpPercent = this.sampleParameter(tacticsParams.tpPercent);
      }
      if (tacticsParams.slPercent) {
        params.slPercent = this.sampleParameter(tacticsParams.slPercent);
      }
      if (tacticsParams.trailingPercent) {
        params.trailingPercent = this.sampleParameter(tacticsParams.trailingPercent);
      }
    }

    return params;
  }

  /**
   * Выборка одного параметра
   */
  private sampleParameter(param: HyperoptParameter): any {
    switch (param.space) {
      case "categorical":
        if (!param.choices || param.choices.length === 0) return param.defaultValue;
        return param.choices[Math.floor(Math.random() * param.choices.length)];

      case "uniform":
      case "loguniform":
        const min = param.min || 0;
        const max = param.max || 1;
        let value = min + Math.random() * (max - min);
        if (param.space === "loguniform") {
          value = Math.exp(Math.log(min) + Math.random() * (Math.log(max) - Math.log(min)));
        }
        return value;

      case "quniform":
      case "qloguniform":
        const q = param.q || 1;
        const qmin = param.min || 0;
        const qmax = param.max || 10;
        let qvalue = Math.round((qmin + Math.random() * (qmax - qmin)) / q) * q;
        if (param.space === "qloguniform") {
          qvalue = Math.exp(Math.round(Math.log(Math.exp(qmin) + Math.random() * (Math.exp(qmax) - Math.exp(qmin))) / q) * q);
        }
        return qvalue;

      case "normal":
        const mu = param.mu || 0;
        const sigma = param.sigma || 1;
        // Box-Muller transform
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mu + z * sigma;

      default:
        return param.defaultValue;
    }
  }

  /**
   * TPE выборка параметров
   */
  private sampleTPEParams(config: HyperoptConfig, result: HyperoptResult): Record<string, any> {
    // Упрощённая реализация TPE
    // Разделяем пробу на хорошие и плохие
    const trials = result.trials.filter(t => t.status === "COMPLETED");
    if (trials.length < 10) {
      return this.sampleRandomParams(config);
    }

    // Сортируем по objective
    trials.sort((a, b) => {
      const aVal = a.objectiveValue || 0;
      const bVal = b.objectiveValue || 0;
      return config.direction === "maximize" ? bVal - aVal : aVal - bVal;
    });

    // Берём лучшие 25%
    const goodTrials = trials.slice(0, Math.floor(trials.length * 0.25));

    // Выбираем случайный из хороших и немного мутируем
    const baseParams = goodTrials[Math.floor(Math.random() * goodTrials.length)].params;
    const newParams = { ...baseParams };

    // Мутация
    if (config.strategyParameters) {
      for (const param of config.strategyParameters) {
        if (Math.random() < 0.3) {
          newParams[param.name] = this.sampleParameter(param);
        } else {
          // Небольшая вариация вокруг текущего значения
          const current = newParams[param.name];
          if (typeof current === "number") {
            const range = ((param.max || 1) - (param.min || 0)) * 0.1;
            let newValue = current + (Math.random() - 0.5) * range;
            if (param.min !== undefined) newValue = Math.max(param.min, newValue);
            if (param.max !== undefined) newValue = Math.min(param.max, newValue);
            newParams[param.name] = newValue;
          }
        }
      }
    }

    return newParams;
  }

  /**
   * Генерация сетки параметров
   */
  private generateGrid(config: HyperoptConfig): Record<string, any>[] {
    const paramArrays: Record<string, any[]> = {};

    if (config.strategyParameters) {
      for (const param of config.strategyParameters) {
        paramArrays[param.name] = this.generateParamGrid(param);
      }
    }

    // Cartesian product
    return this.cartesianProduct(paramArrays);
  }

  /**
   * Генерация значений для сетки
   */
  private generateParamGrid(param: HyperoptParameter): any[] {
    if (param.space === "categorical") {
      return param.choices || [];
    }

    const min = param.min || 0;
    const max = param.max || 10;
    const step = param.q || (max - min) / 10;
    const values: any[] = [];

    for (let v = min; v <= max; v += step) {
      values.push(v);
    }

    return values;
  }

  /**
   * Декартово произведение
   */
  private cartesianProduct(obj: Record<string, any[]>): Record<string, any>[] {
    const keys = Object.keys(obj);
    if (keys.length === 0) return [{}];

    const [first, ...rest] = keys;
    const firstValues = obj[first];
    const restProducts = this.cartesianProduct(
      Object.fromEntries(rest.map(k => [k, obj[k]]))
    );

    const result: Record<string, any>[] = [];
    for (const v of firstValues) {
      for (const p of restProducts) {
        result.push({ [first]: v, ...p });
      }
    }
    return result;
  }

  // ==================== GENETIC OPERATORS ====================

  private selectParent(population: { params: any; fitness: number }[]): any {
    // Tournament selection
    const tournament = 3;
    let best = population[Math.floor(Math.random() * population.length)];
    for (let i = 1; i < tournament; i++) {
      const candidate = population[Math.floor(Math.random() * population.length)];
      if (candidate.fitness > best.fitness) {
        best = candidate;
      }
    }
    return best.params;
  }

  private crossover(p1: any, p2: any, config: HyperoptConfig): any {
    const child: any = {};
    const keys = Array.from(new Set([...Object.keys(p1), ...Object.keys(p2)]));

    for (const key of keys) {
      child[key] = Math.random() < 0.5 ? p1[key] : p2[key];
    }

    return child;
  }

  private mutate(params: any, config: HyperoptConfig): void {
    const mutationRate = 0.1;

    if (config.strategyParameters) {
      for (const param of config.strategyParameters) {
        if (Math.random() < mutationRate) {
          params[param.name] = this.sampleParameter(param);
        }
      }
    }
  }

  // ==================== TRIAL EXECUTION ====================

  /**
   * Выполнить пробу
   */
  private async runTrial(
    config: HyperoptConfig,
    params: Record<string, any>,
    candles: any[],
    result: HyperoptResult
  ): Promise<HyperoptTrial> {
    const trial: HyperoptTrial = {
      id: ++this.trialIdCounter,
      params,
      status: "RUNNING",
      startedAt: new Date(),
    };

    result.trials.push(trial);

    try {
      // Создаём набор тактик на основе параметров
      const tacticsSet = this.createTacticsSet(config, params);

      // Создаём конфигурацию бэктеста
      const backtestConfig = {
        id: `backtest-${trial.id}`,
        name: `Trial ${trial.id}`,
        symbol: config.symbol,
        timeframe: config.timeframe as any,
        startDate: config.startDate,
        endDate: config.endDate,
        initialBalance: config.initialBalance,
        balanceCurrency: "USDT",
        strategyId: config.strategyId || "",
        strategyParameters: params,
        tacticsSet,
        feePercent: 0.1,
        slippagePercent: 0.05,
        maxLeverage: 10,
        marginMode: "isolated" as const,
        allowShort: true,
      };

      // Запускаем бэктест
      const engine = new BacktestEngine(backtestConfig);
      const backtestResult = await engine.run(candles);

      trial.backtestResult = backtestResult;

      // Проверяем ограничения
      const constraintsCheck = checkConstraints(backtestResult, config);
      if (!constraintsCheck.valid) {
        trial.status = "PRUNED";
        trial.error = constraintsCheck.reason;
      } else {
        trial.status = "COMPLETED";
        trial.objectiveValue = getObjectiveValue(backtestResult, config.objective);
        trial.backtestObjectiveValue = trial.objectiveValue;
      }

      // Обновляем лучший результат
      if (trial.objectiveValue !== undefined) {
        result.objectiveHistory.push({ 
          trialId: trial.id, 
          value: trial.objectiveValue,
          mode: "BACKTESTING"
        });

        const isBetter = config.direction === "maximize"
          ? !result.bestObjectiveValue || trial.objectiveValue > result.bestObjectiveValue
          : !result.bestObjectiveValue || trial.objectiveValue < result.bestObjectiveValue;

        if (isBetter) {
          result.bestObjectiveValue = trial.objectiveValue;
          result.bestParams = params;
          result.bestBacktestResult = backtestResult;
          result.bestTrialId = trial.id;
        }

        result.bestValueHistory.push({
          trialId: trial.id,
          value: result.bestObjectiveValue,
          mode: "BACKTESTING"
        });
      }

      result.completedTrials++;

    } catch (error) {
      trial.status = "FAILED";
      trial.error = error instanceof Error ? error.message : "Unknown error";
      result.failedTrials++;
    }

    trial.completedAt = new Date();
    trial.duration = trial.completedAt.getTime() - (trial.startedAt?.getTime() || 0);

    return trial;
  }

  /**
   * Создать набор тактик из параметров
   */
  private createTacticsSet(
    config: HyperoptConfig,
    params: Record<string, any>
  ): TacticsSet {
    const base = config.baseTacticsSet || PREDEFINED_TACTICS_SETS[0];

    return {
      ...base,
      id: `tactics-${Date.now()}`,
      entry: {
        ...base.entry,
        positionSizeValue: params.positionSize || base.entry.positionSizeValue,
      },
      takeProfit: {
        ...base.takeProfit,
        tpPercent: params.tpPercent || base.takeProfit.tpPercent,
        trailingConfig: base.takeProfit.trailingConfig ? {
          ...base.takeProfit.trailingConfig,
          percentValue: params.trailingPercent || base.takeProfit.trailingConfig.percentValue,
        } : undefined,
      },
      stopLoss: {
        ...base.stopLoss,
        slPercent: params.slPercent || base.stopLoss.slPercent,
      },
    };
  }

  // ==================== HELPER METHODS ====================

  private createResult(config: HyperoptConfig): HyperoptResult {
    return {
      id: config.id,
      config,
      status: "PENDING",
      progress: 0,
      trials: [],
      completedTrials: 0,
      failedTrials: 0,
      statistics: {
        avgObjective: 0,
        stdObjective: 0,
        minObjective: 0,
        maxObjective: 0,
        medianObjective: 0,
        improvement: 0,
        baselineValue: 0,
        convergenceRate: 0,
        plateauReached: false,
        trialsWithoutImprovement: 0,
        quantiles: { q25: 0, q50: 0, q75: 0, q90: 0, q95: 0 },
      },
      objectiveHistory: [],
      bestValueHistory: [],
    };
  }

  private getDefaultParams(config: HyperoptConfig): Record<string, any> {
    const params: Record<string, any> = {};

    if (config.strategyParameters) {
      for (const param of config.strategyParameters) {
        params[param.name] = param.defaultValue;
      }
    }

    return params;
  }

  private calculateStatistics(result: HyperoptResult): void {
    const values = result.objectiveHistory.map(h => h.value);

    if (values.length === 0) return;

    // Basic statistics
    const sum = values.reduce((a, b) => a + b, 0);
    result.statistics.avgObjective = sum / values.length;

    const sortedValues = [...values].sort((a, b) => a - b);
    result.statistics.minObjective = sortedValues[0];
    result.statistics.maxObjective = sortedValues[sortedValues.length - 1];
    result.statistics.medianObjective = sortedValues[Math.floor(sortedValues.length / 2)];

    // Standard deviation
    const squaredDiffs = values.map(v => Math.pow(v - result.statistics.avgObjective, 2));
    result.statistics.stdObjective = Math.sqrt(
      squaredDiffs.reduce((a, b) => a + b, 0) / values.length
    );

    // Quantiles
    const q = (p: number) => sortedValues[Math.floor(sortedValues.length * p)];
    result.statistics.quantiles = {
      q25: q(0.25),
      q50: q(0.5),
      q75: q(0.75),
      q90: q(0.9),
      q95: q(0.95),
    };

    // Improvement
    if (result.statistics.baselineValue !== 0) {
      result.statistics.improvement = 
        ((result.bestObjectiveValue || 0) - result.statistics.baselineValue) / 
        Math.abs(result.statistics.baselineValue) * 100;
    }

    // Convergence
    const lastN = Math.min(20, values.length);
    const lastValues = values.slice(-lastN);
    const lastAvg = lastValues.reduce((a, b) => a + b, 0) / lastN;
    const prevAvg = values.length > lastN 
      ? values.slice(-lastN * 2, -lastN).reduce((a, b) => a + b, 0) / lastN 
      : lastAvg;

    result.statistics.convergenceRate = lastAvg !== 0 
      ? Math.abs((lastAvg - prevAvg) / lastAvg) 
      : 0;
  }
}

// ==================== SINGLETON INSTANCE ====================

let hyperoptInstance: HyperoptEngine | null = null;

/**
 * Получить singleton экземпляр HyperoptEngine
 */
export function getHyperoptEngine(): HyperoptEngine {
  if (!hyperoptInstance) {
    hyperoptInstance = new HyperoptEngine();
  }
  return hyperoptInstance;
}
