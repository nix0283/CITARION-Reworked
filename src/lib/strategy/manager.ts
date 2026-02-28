/**
 * Strategy Manager
 * 
 * Управление стратегиями: регистрация, выполнение, кэширование.
 */

import { 
  IStrategy, 
  StrategyConfig, 
  StrategyState, 
  Candle, 
  StrategySignal, 
  StrategyAnalysisResult,
  Timeframe,
  IndicatorResult,
  validateStrategyParameters,
} from "./types";
import { BUILTIN_STRATEGIES } from "./builtin";

// ==================== TYPES ====================

/**
 * Статус стратегии
 */
export type StrategyStatus = "IDLE" | "RUNNING" | "PAUSED" | "ERROR";

/**
 * Информация о запущенной стратегии
 */
export interface RunningStrategy {
  id: string;
  strategy: IStrategy;
  symbol: string;
  timeframe: Timeframe;
  status: StrategyStatus;
  lastSignal?: StrategySignal;
  lastUpdate: Date;
  error?: string;
}

/**
 * Результат выполнения стратегии
 */
export interface StrategyExecutionResult {
  strategyId: string;
  symbol: string;
  timeframe: Timeframe;
  timestamp: Date;
  signal: StrategySignal | null;
  indicators?: IndicatorResult;
  status: StrategyStatus;
  error?: string;
}

// ==================== STRATEGY MANAGER ====================

export class StrategyManager {
  private strategies: Map<string, IStrategy> = new Map();
  private runningStrategies: Map<string, RunningStrategy> = new Map();
  private candleCache: Map<string, Candle[]> = new Map();

  constructor() {
    this.registerBuiltInStrategies();
  }

  // ==================== REGISTRATION ====================

  /**
   * Зарегистрировать стратегию
   */
  register(strategy: IStrategy): void {
    const config = strategy.getConfig();
    this.strategies.set(config.id, strategy);
  }

  /**
   * Отменить регистрацию стратегии
   */
  unregister(strategyId: string): void {
    this.strategies.delete(strategyId);
    this.stop(strategyId);
  }

  /**
   * Получить стратегию по ID
   */
  getStrategy(strategyId: string): IStrategy | undefined {
    return this.strategies.get(strategyId);
  }

  /**
   * Получить все зарегистрированные стратегии
   */
  getAllStrategies(): IStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Получить конфигурации всех стратегий
   */
  getAllConfigs(): StrategyConfig[] {
    return this.getAllStrategies().map(s => s.getConfig());
  }

  /**
   * Зарегистрировать встроенные стратегии
   */
  private registerBuiltInStrategies(): void {
    for (const StrategyClass of BUILTIN_STRATEGIES) {
      try {
        const strategy = new StrategyClass();
        this.register(strategy);
      } catch (error) {
        console.error(`Failed to register built-in strategy: ${error}`);
      }
    }
  }

  // ==================== EXECUTION ====================

  /**
   * Запустить стратегию для символа
   */
  start(
    strategyId: string,
    symbol: string,
    timeframe: Timeframe,
    parameters?: Record<string, number | boolean | string>
  ): { success: boolean; error?: string } {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      return { success: false, error: `Strategy ${strategyId} not found` };
    }

    // Валидация параметров
    const config = strategy.getConfig();
    if (parameters) {
      const validation = validateStrategyParameters(config, parameters);
      if (!validation.valid) {
        return { success: false, error: validation.errors.join("; ") };
      }
    }

    // Инициализация
    strategy.initialize(parameters);

    // Создаём уникальный ID для запущенной стратегии
    const runningId = `${strategyId}_${symbol}_${timeframe}`;

    const running: RunningStrategy = {
      id: runningId,
      strategy,
      symbol,
      timeframe,
      status: "IDLE",
      lastUpdate: new Date(),
    };

    this.runningStrategies.set(runningId, running);

    return { success: true };
  }

  /**
   * Остановить стратегию
   */
  stop(runningId: string): void {
    this.runningStrategies.delete(runningId);
  }

  /**
   * Остановить все стратегии
   */
  stopAll(): void {
    this.runningStrategies.clear();
  }

  /**
   * Выполнить анализ для стратегии
   */
  async analyze(
    strategyId: string,
    symbol: string,
    candles: Candle[]
  ): Promise<StrategyAnalysisResult> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      return {
        strategyId,
        symbol,
        timeframe: "1h",
        timestamp: new Date(),
        currentPrice: 0,
        indicators: {},
        signal: null,
        errors: [`Strategy ${strategyId} not found`],
      };
    }

    const config = strategy.getConfig();
    const state = strategy.getState();

    try {
      // Проверяем достаточность данных
      if (candles.length < config.minCandlesRequired) {
        return {
          strategyId,
          symbol,
          timeframe: state.parameters.timeframe as Timeframe || config.defaultTimeframe,
          timestamp: new Date(),
          currentPrice: candles[candles.length - 1]?.close || 0,
          indicators: {},
          signal: null,
          errors: [`Insufficient candles: ${candles.length} < ${config.minCandlesRequired}`],
        };
      }

      // Рассчитываем индикаторы
      const indicators = strategy.populateIndicators(candles);

      // Генерируем сигнал
      const currentPrice = candles[candles.length - 1].close;
      const signal = strategy.populateEntrySignal(candles, indicators, currentPrice);

      if (signal) {
        signal.symbol = symbol;
      }

      return {
        strategyId,
        symbol,
        timeframe: state.parameters.timeframe as Timeframe || config.defaultTimeframe,
        timestamp: new Date(),
        currentPrice,
        indicators,
        signal,
      };
    } catch (error) {
      return {
        strategyId,
        symbol,
        timeframe: config.defaultTimeframe,
        timestamp: new Date(),
        currentPrice: candles[candles.length - 1]?.close || 0,
        indicators: {},
        signal: null,
        errors: [error instanceof Error ? error.message : "Unknown error"],
      };
    }
  }

  /**
   * Проверить выход для позиции
   */
  checkExit(
    strategyId: string,
    candles: Candle[],
    position: {
      direction: "LONG" | "SHORT";
      entryPrice: number;
      currentPrice: number;
      size: number;
      openTime: Date;
    }
  ): StrategySignal | null {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) return null;

    try {
      const indicators = strategy.populateIndicators(candles);
      return strategy.populateExitSignal(candles, indicators, position);
    } catch (error) {
      console.error(`Exit check error for ${strategyId}:`, error);
      return null;
    }
  }

  // ==================== RUNNING STRATEGIES ====================

  /**
   * Получить все запущенные стратегии
   */
  getRunningStrategies(): RunningStrategy[] {
    return Array.from(this.runningStrategies.values());
  }

  /**
   * Получить запущенную стратегию по ID
   */
  getRunningStrategy(runningId: string): RunningStrategy | undefined {
    return this.runningStrategies.get(runningId);
  }

  /**
   * Обновить данные для запущенной стратегии
   */
  async update(
    runningId: string,
    candles: Candle[]
  ): Promise<StrategyExecutionResult> {
    const running = this.runningStrategies.get(runningId);
    if (!running) {
      return {
        strategyId: runningId,
        symbol: "",
        timeframe: "1h",
        timestamp: new Date(),
        signal: null,
        status: "ERROR",
        error: `Running strategy ${runningId} not found`,
      };
    }

    running.status = "RUNNING";

    try {
      const result = await this.analyze(
        running.strategy.getConfig().id,
        running.symbol,
        candles
      );

      running.lastSignal = result.signal || running.lastSignal;
      running.lastUpdate = new Date();
      running.status = "IDLE";

      return {
        strategyId: running.strategy.getConfig().id,
        symbol: running.symbol,
        timeframe: running.timeframe,
        timestamp: result.timestamp,
        signal: result.signal,
        indicators: result.indicators,
        status: "IDLE",
      };
    } catch (error) {
      running.status = "ERROR";
      running.error = error instanceof Error ? error.message : "Unknown error";

      return {
        strategyId: running.strategy.getConfig().id,
        symbol: running.symbol,
        timeframe: running.timeframe,
        timestamp: new Date(),
        signal: null,
        status: "ERROR",
        error: running.error,
      };
    }
  }

  // ==================== CANDLE CACHE ====================

  /**
   * Кэшировать свечи
   */
  cacheCandles(key: string, candles: Candle[]): void {
    this.candleCache.set(key, candles);
  }

  /**
   * Получить кэшированные свечи
   */
  getCachedCandles(key: string): Candle[] | undefined {
    return this.candleCache.get(key);
  }

  /**
   * Очистить кэш свечей
   */
  clearCache(): void {
    this.candleCache.clear();
  }

  // ==================== PARAMETERS ====================

  /**
   * Обновить параметры стратегии
   */
  updateParameters(
    strategyId: string,
    parameters: Record<string, number | boolean | string>
  ): { success: boolean; error?: string } {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      return { success: false, error: `Strategy ${strategyId} not found` };
    }

    const config = strategy.getConfig();
    const validation = validateStrategyParameters(config, parameters);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join("; ") };
    }

    strategy.setParameters(parameters);
    return { success: true };
  }

  /**
   * Сбросить стратегию
   */
  reset(strategyId: string): void {
    const strategy = this.strategies.get(strategyId);
    if (strategy) {
      strategy.reset();
    }
  }
}

// ==================== SINGLETON INSTANCE ====================

let strategyManagerInstance: StrategyManager | null = null;

/**
 * Получить singleton экземпляр StrategyManager
 */
export function getStrategyManager(): StrategyManager {
  if (!strategyManagerInstance) {
    strategyManagerInstance = new StrategyManager();
  }
  return strategyManagerInstance;
}
