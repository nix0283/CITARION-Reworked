/**
 * Unified Bot Manager
 * 
 * Централизованное управление всеми торговыми ботами:
 * - Strategy Bot (на основе Strategy Framework)
 * - Grid Bot (сеточная торговля)
 * - DCA Bot (усреднение)
 * - BBot (простой бот с SL/TP/Trailing)
 * - Argus Bot (pump/dump detection)
 * 
 * Интеграция с:
 * - Backtesting Engine
 * - Paper Trading Engine
 * - Hyperopt Engine
 * 
 * Workflow:
 * 1. Создание бота → Конфигурация
 * 2. Backtest → Проверка на истории
 * 3. Hyperopt → Оптимизация параметров
 * 4. Paper Trading → Виртуальная торговля
 * 5. Live Trading → Реальная торговля
 */

import { db } from "@/lib/db";
import { notifyTelegram, notifyUI } from "@/lib/notification-service";
import { getDefaultUserId } from "@/lib/default-user";
import { Candle, Timeframe } from "../strategy/types";
import { TacticsSet } from "../strategy/tactics/types";
import { getStrategyBotManager, StrategyBot } from "../strategy-bot/engine";
import {
  StrategyBotConfig,
  BotMode,
  BotStatus,
  BotPosition,
  BotTrade,
  BotEquityPoint,
} from "../strategy-bot/types";
import {
  GridBotSimulator,
  DCABotSimulator,
  BBotSimulator,
  BotType,
  BotSimulationResult,
  GridBotSimulationConfig,
  DCABotSimulationConfig,
  BBotSimulationConfig,
} from "../strategy-bot/adapters";
import { BacktestEngine } from "../backtesting/engine";
import { BacktestConfig, BacktestResult } from "../backtesting/types";
import { getPaperTradingEngine, PaperTradingEngine } from "../paper-trading/engine";
import { PaperTradingConfig } from "../paper-trading/types";

// ==================== TYPES ====================

/**
 * Унифицированный статус бота
 */
export interface UnifiedBotStatus {
  id: string;
  name: string;
  type: BotType;
  mode: BotMode;
  status: BotStatus;
  
  // Performance
  balance: number;
  equity: number;
  totalPnl: number;
  totalPnlPercent: number;
  unrealizedPnl: number;
  
  // Risk
  maxDrawdown: number;
  currentDrawdown: number;
  
  // Positions
  openPositions: number;
  totalTrades: number;
  winRate: number;
  
  // Timing
  startedAt?: Date;
  lastUpdate: Date;
  
  // Error
  error?: string;
}

/**
 * Результат создания бота из стратегии
 */
export interface CreateBotFromStrategyResult {
  success: boolean;
  bot?: {
    id: string;
    type: BotType;
    config: StrategyBotConfig | GridBotSimulationConfig | DCABotSimulationConfig | BBotSimulationConfig;
  };
  error?: string;
}

/**
 * Результат запуска бота в Paper Trading
 */
export interface StartPaperTradingResult {
  success: boolean;
  accountId?: string;
  error?: string;
}

/**
 * Результат бэктеста бота
 */
export interface BotBacktestResult {
  success: boolean;
  result?: BotSimulationResult | BacktestResult;
  error?: string;
}

// ==================== UNIFIED BOT MANAGER ====================

export class UnifiedBotManager {
  private strategyBotManager = getStrategyBotManager();
  private paperEngine = getPaperTradingEngine();
  
  // Active bots by type
  private activeBots: Map<string, {
    type: BotType;
    instance: StrategyBot | GridBotSimulator | DCABotSimulator | BBotSimulator;
    mode: BotMode;
  }> = new Map();

  // ==================== BOT CREATION ====================

  /**
   * Создать Strategy Bot из протестированной стратегии
   */
  async createStrategyBot(params: {
    name: string;
    strategyId: string;
    strategyParameters?: Record<string, number | boolean | string>;
    tacticsSet: TacticsSet;
    symbol: string;
    timeframe: Timeframe;
    initialBalance: number;
    mode: BotMode;
    accountId?: string;
  }): Promise<CreateBotFromStrategyResult> {
    try {
      const botId = `strategy-${Date.now()}`;
      
      const config: StrategyBotConfig = {
        id: botId,
        name: params.name,
        mode: params.mode,
        strategyId: params.strategyId,
        strategyParameters: params.strategyParameters,
        tacticsSet: params.tacticsSet,
        symbol: params.symbol,
        timeframe: params.timeframe,
        initialBalance: params.initialBalance,
        maxOpenPositions: 3,
        maxRiskPerTrade: 2,
        maxDrawdown: 20,
        maxLeverage: 10,
        allowShort: true,
        feePercent: 0.04,
        createdAt: new Date(),
        updatedAt: new Date(),
        liveSettings: params.mode === "LIVE" ? {
          accountId: params.accountId || "",
          autoTrading: true,
        } : undefined,
        paperSettings: params.mode === "PAPER" ? {
          autoTrading: true,
          checkInterval: 60000,
        } : undefined,
      };

      return {
        success: true,
        bot: {
          id: botId,
          type: "STRATEGY",
          config,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Создать Grid Bot с возможностью Backtesting
   */
  async createGridBot(params: {
    name: string;
    symbol: string;
    upperPrice: number;
    lowerPrice: number;
    gridCount: number;
    gridType: "ARITHMETIC" | "GEOMETRIC";
    direction: "LONG" | "SHORT" | "NEUTRAL";
    totalInvestment: number;
    leverage: number;
    initialBalance: number;
  }): Promise<CreateBotFromStrategyResult> {
    try {
      const botId = `grid-${Date.now()}`;
      
      const config: GridBotSimulationConfig = {
        id: botId,
        name: params.name,
        type: "GRID",
        symbol: params.symbol,
        isActive: false,
        initialBalance: params.initialBalance,
        mode: "BACKTEST",
        upperPrice: params.upperPrice,
        lowerPrice: params.lowerPrice,
        gridCount: params.gridCount,
        gridType: params.gridType,
        direction: params.direction,
        totalInvestment: params.totalInvestment,
        leverage: params.leverage,
      };

      return {
        success: true,
        bot: {
          id: botId,
          type: "GRID",
          config,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Создать DCA Bot с возможностью Backtesting
   */
  async createDCABot(params: {
    name: string;
    symbol: string;
    direction: "LONG" | "SHORT";
    baseAmount: number;
    dcaLevels: number;
    dcaPercent: number;
    dcaMultiplier: number;
    tpValue: number;
    tpType: "PERCENT" | "FIXED";
    slEnabled: boolean;
    slValue?: number;
    slType?: "PERCENT" | "FIXED";
    initialBalance: number;
  }): Promise<CreateBotFromStrategyResult> {
    try {
      const botId = `dca-${Date.now()}`;
      
      const config: DCABotSimulationConfig = {
        id: botId,
        name: params.name,
        type: "DCA",
        symbol: params.symbol,
        isActive: false,
        initialBalance: params.initialBalance,
        mode: "BACKTEST",
        direction: params.direction,
        baseAmount: params.baseAmount,
        dcaLevels: params.dcaLevels,
        dcaPercent: params.dcaPercent,
        dcaMultiplier: params.dcaMultiplier,
        tpValue: params.tpValue,
        tpType: params.tpType,
        slEnabled: params.slEnabled,
        slValue: params.slValue,
        slType: params.slType,
      };

      return {
        success: true,
        bot: {
          id: botId,
          type: "DCA",
          config,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Создать BBot с возможностью Backtesting
   */
  async createBBot(params: {
    name: string;
    symbol: string;
    direction: "LONG" | "SHORT";
    positionSize: number;
    leverage: number;
    stopLossPercent: number;
    takeProfitPercent: number;
    trailingStopEnabled: boolean;
    trailingStopPercent?: number;
    trailingActivationPercent?: number;
    initialBalance: number;
  }): Promise<CreateBotFromStrategyResult> {
    try {
      const botId = `bbot-${Date.now()}`;
      
      const config: BBotSimulationConfig = {
        id: botId,
        name: params.name,
        type: "BBOT",
        symbol: params.symbol,
        isActive: false,
        initialBalance: params.initialBalance,
        mode: "BACKTEST",
        direction: params.direction,
        positionSize: params.positionSize,
        leverage: params.leverage,
        entryType: "MARKET",
        stopLossPercent: params.stopLossPercent,
        takeProfitPercent: params.takeProfitPercent,
        trailingStopEnabled: params.trailingStopEnabled,
        trailingStopPercent: params.trailingStopPercent,
        trailingActivationPercent: params.trailingActivationPercent,
      };

      return {
        success: true,
        bot: {
          id: botId,
          type: "BBOT",
          config,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ==================== BACKTEST ====================

  /**
   * Запустить бэктест для любого типа бота
   */
  async runBacktest(
    botId: string,
    botType: BotType,
    candles: Candle[],
    config: unknown
  ): Promise<BotBacktestResult> {
    try {
      let result: BotSimulationResult;

      switch (botType) {
        case "GRID": {
          const simulator = new GridBotSimulator(config as GridBotSimulationConfig);
          result = await simulator.runBacktest(candles);
          break;
        }
        case "DCA": {
          const simulator = new DCABotSimulator(config as DCABotSimulationConfig);
          result = await simulator.runBacktest(candles);
          break;
        }
        case "BBOT": {
          const simulator = new BBotSimulator(config as BBotSimulationConfig);
          result = await simulator.runBacktest(candles);
          break;
        }
        case "STRATEGY": {
          const cfg = config as StrategyBotConfig;
          // Для Strategy Bot используем BacktestEngine
          const backtestConfig: BacktestConfig = {
            id: `backtest-${botId}`,
            name: cfg.name,
            strategyId: cfg.strategyId,
            strategyParameters: cfg.strategyParameters,
            tacticsSet: cfg.tacticsSet,
            symbol: cfg.symbol,
            timeframe: cfg.timeframe,
            startDate: cfg.backtestSettings?.startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
            endDate: cfg.backtestSettings?.endDate || new Date(),
            initialBalance: cfg.initialBalance,
            balanceCurrency: "USDT",
            maxOpenPositions: cfg.maxOpenPositions,
            maxDrawdown: cfg.maxDrawdown,
            maxLeverage: cfg.maxLeverage,
            allowShort: cfg.allowShort,
            feePercent: cfg.feePercent,
            slippagePercent: 0.05,
            marginMode: "isolated",
          };
          
          const engine = new BacktestEngine(backtestConfig);
          const backtestResult = await engine.run(candles);
          
          return {
            success: true,
            result: backtestResult,
          };
        }
        default:
          return {
            success: false,
            error: `Unknown bot type: ${botType}`,
          };
      }

      return {
        success: true,
        result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ==================== PAPER TRADING ====================

  /**
   * Запустить бота в Paper Trading режиме
   */
  async startPaperTrading(
    botId: string,
    botType: BotType,
    config: unknown
  ): Promise<StartPaperTradingResult> {
    try {
      const accountId = `paper-${botId}`;
      const cfg = config as { 
        name?: string; 
        initialBalance?: number; 
        strategyId?: string; 
        tacticsSet?: TacticsSet; 
        maxOpenPositions?: number; 
        maxRiskPerTrade?: number; 
        maxDrawdown?: number; 
        maxLeverage?: number; 
        feePercent?: number;
        symbol?: string;
        timeframe?: Timeframe;
      };

      // Создаём виртуальный счёт
      const paperConfig: PaperTradingConfig = {
        id: accountId,
        name: `Paper Trading - ${cfg.name || botId}`,
        strategyId: botType === "STRATEGY" ? (cfg.strategyId || "default") : "default",
        tacticsSets: cfg.tacticsSet ? [cfg.tacticsSet] : [],
        initialBalance: cfg.initialBalance || 10000,
        currency: "USDT",
        exchange: "binance",
        symbols: cfg.symbol ? [cfg.symbol] : [],
        timeframe: cfg.timeframe || "1h",
        maxOpenPositions: cfg.maxOpenPositions || 3,
        maxRiskPerTrade: cfg.maxRiskPerTrade || 2,
        maxDrawdown: cfg.maxDrawdown || 20,
        maxLeverage: cfg.maxLeverage || 10,
        feePercent: cfg.feePercent || 0.04,
        slippagePercent: 0.05,
        autoTrading: true,
        checkInterval: 60000,
        notifications: {
          onEntry: true,
          onExit: true,
          onError: true,
          onMaxDrawdown: true,
        },
      };

      this.paperEngine.createAccount(paperConfig);
      this.paperEngine.start(accountId);

      return {
        success: true,
        accountId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Остановить Paper Trading
   */
  async stopPaperTrading(accountId: string): Promise<void> {
    this.paperEngine.stop(accountId);
  }

  // ==================== STOP ALL ====================

  /**
   * Остановить всех ботов
   */
  async stopAllBots(): Promise<void> {
    // Strategy bots
    await this.strategyBotManager.stopAll();

    // Paper trading accounts
    for (const account of this.paperEngine.getAllAccounts()) {
      this.paperEngine.stop(account.id);
    }

    await notifyTelegram({
      type: "SYSTEM_ERROR",
      title: "🛑 All Bots Stopped",
      message: "All trading bots have been stopped",
    });
  }
}

// ==================== SINGLETON ====================

let managerInstance: UnifiedBotManager | null = null;

export function getUnifiedBotManager(): UnifiedBotManager {
  if (!managerInstance) {
    managerInstance = new UnifiedBotManager();
  }
  return managerInstance;
}
