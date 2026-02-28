/**
 * Paper Trading Types
 * 
 * Типы и интерфейсы для виртуальной торговли (Paper Trading).
 */

import { TacticsSet, TacticsExecutionState } from "../strategy/tactics/types";
import { Timeframe, StrategySignal } from "../strategy/types";

// ==================== PAPER TRADING CONFIG ====================

/**
 * Конфигурация Paper Trading
 */
export interface PaperTradingConfig {
  /** ID конфигурации */
  id: string;
  /** Название */
  name: string;
  
  // === Account Settings ===
  /** Начальный баланс */
  initialBalance: number;
  /** Валюта */
  currency: string;
  /** Баланс виртуальных активов */
  virtualBalances?: Record<string, number>;
  
  // === Trading Settings ===
  /** Биржа (для реальных цен) */
  exchange: string;
  /** Символы для торговли */
  symbols: string[];
  /** Таймфрейм для анализа */
  timeframe: Timeframe;
  
  // === Strategy Settings ===
  /** ID стратегии */
  strategyId: string;
  /** Параметры стратегии */
  strategyParameters?: Record<string, number | boolean | string>;
  /** Наборы тактик для разных ситуаций */
  tacticsSets: TacticsSet[];
  
  // === Risk Management ===
  /** Максимальный риск на сделку (%) */
  maxRiskPerTrade: number;
  /** Максимальная просадка (%) */
  maxDrawdown: number;
  /** Максимальное количество открытых позиций */
  maxOpenPositions: number;
  /** Максимальное плечо */
  maxLeverage: number;
  /** Комиссия (%) */
  feePercent: number;
  /** Slippage (%) */
  slippagePercent: number;
  
  // === Execution Settings ===
  /** Автоматическая торговля */
  autoTrading: boolean;
  /** Интервал проверки (мс) */
  checkInterval: number;
  /** Уведомления */
  notifications: {
    onEntry: boolean;
    onExit: boolean;
    onError: boolean;
    onMaxDrawdown: boolean;
  };
}

// ==================== PAPER POSITION ====================

/**
 * Виртуальная позиция
 */
export interface PaperPosition {
  /** ID позиции */
  id: string;
  /** Символ */
  symbol: string;
  /** Направление */
  direction: "LONG" | "SHORT";
  /** Статус */
  status: "PENDING" | "OPEN" | "CLOSING" | "CLOSED" | "LIQUIDATED";
  
  // === Entry ===
  /** Средняя цена входа */
  avgEntryPrice: number;
  /** Записи о входах */
  entries: PaperTradeEntry[];
  /** Размер позиции */
  totalSize: number;
  /** Время открытия */
  openedAt: Date;
  
  // === Exit ===
  /** Средняя цена выхода */
  avgExitPrice?: number;
  /** Записи о выходах */
  exits: PaperTradeExit[];
  /** Время закрытия */
  closedAt?: Date;
  /** Причина закрытия */
  closeReason?: "TP" | "SL" | "SIGNAL" | "MANUAL" | "LIQUIDATION" | "MAX_DRAWDOWN" | "TRAILING_STOP";
  
  // === Prices ===
  /** Текущая цена */
  currentPrice: number;
  /** Stop Loss */
  stopLoss?: number;
  /** Take Profit targets */
  takeProfitTargets: PaperTPTarget[];
  
  // === PnL ===
  /** Нереализованный PnL */
  unrealizedPnl: number;
  /** Нереализованный PnL (%) */
  unrealizedPnlPercent: number;
  /** Реализованный PnL */
  realizedPnl: number;
  /** Комиссии */
  totalFees: number;
  
  // === Leverage ===
  leverage: number;
  marginMode: "isolated" | "cross";
  margin: number;
  liquidationPrice?: number;
  
  // === Tactics State ===
  tacticsState: TacticsExecutionState;
  
  // === Signal Info ===
  /** ID сигнала, открывшего позицию */
  signalId?: string;
  /** Уверенность в сигнале */
  signalConfidence?: number;
}

/**
 * Запись о входе
 */
export interface PaperTradeEntry {
  index: number;
  price: number;
  size: number;
  fee: number;
  timestamp: Date;
  orderType: "MARKET" | "LIMIT";
}

/**
 * Запись о выходе
 */
export interface PaperTradeExit {
  index: number;
  price: number;
  size: number;
  fee: number;
  pnl: number;
  reason: "TP" | "SL" | "SIGNAL" | "PARTIAL" | "TRAILING_STOP" | "MANUAL" | "LIQUIDATION";
  timestamp: Date;
  tpIndex?: number;
}

/**
 * Цель Take Profit
 */
export interface PaperTPTarget {
  index: number;
  price: number;
  closePercent: number;
  filled: boolean;
  filledAt?: Date;
}

// ==================== PAPER ACCOUNT ====================

/**
 * Виртуальный счёт
 */
export interface PaperAccount {
  /** ID счёта */
  id: string;
  /** Название */
  name: string;
  /** Конфигурация */
  config: PaperTradingConfig;
  
  // === Balance ===
  /** Начальный баланс */
  initialBalance: number;
  /** Текущий баланс */
  balance: number;
  /** Эквити (баланс + нереализованный PnL) */
  equity: number;
  /** Доступная маржа */
  availableMargin: number;
  /** Максимальное достигнутое эквити */
  maxEquity: number;
  
  // === Positions ===
  /** Открытые позиции */
  positions: PaperPosition[];
  /** История сделок */
  tradeHistory: PaperTrade[];
  
  // === Equity Curve ===
  /** Кривая эквити */
  equityCurve: PaperEquityPoint[];
  
  // === Statistics ===
  /** Общий PnL */
  totalPnl: number;
  /** Общий PnL (%) */
  totalPnlPercent: number;
  /** Реализованный PnL */
  realizedPnl: number;
  /** Нереализованный PnL */
  unrealizedPnl: number;
  /** Максимальная просадка */
  maxDrawdown: number;
  /** Текущая просадка */
  currentDrawdown: number;
  
  // === Status ===
  /** Статус */
  status: "IDLE" | "RUNNING" | "PAUSED" | "STOPPED";
  /** Время запуска */
  startedAt?: Date;
  /** Время остановки */
  stoppedAt?: Date;
  /** Последнее обновление */
  lastUpdate: Date;
  
  // === Metrics ===
  /** Метрики */
  metrics: PaperTradingMetrics;
}

/**
 * Завершённая сделка
 */
export interface PaperTrade {
  id: string;
  positionId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  
  avgEntryPrice: number;
  totalSize: number;
  openedAt: Date;
  
  avgExitPrice: number;
  closedAt: Date;
  closeReason: "TP" | "SL" | "SIGNAL" | "MANUAL" | "LIQUIDATION" | "MAX_DRAWDOWN" | "TRAILING_STOP";
  
  pnl: number;
  pnlPercent: number;
  fees: number;
  netPnl: number;
  
  durationMinutes: number;
  tacticsSetId: string;
}

/**
 * Метрики Paper Trading (полные, как в Backtesting)
 */
export interface PaperTradingMetrics {
  // === Basic Stats ===
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  
  // === PnL ===
  totalPnl: number;
  totalPnlPercent: number;
  avgPnl: number;
  avgWin: number;
  avgLoss: number;
  maxWin: number;
  maxLoss: number;
  
  // === Ratios ===
  profitFactor: number;
  riskRewardRatio: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  
  // === Drawdown ===
  maxDrawdown: number;
  maxDrawdownPercent: number;
  avgDrawdown: number;
  timeInDrawdown: number;
  maxDrawdownDuration: number;
  
  // === Streaks ===
  maxWinStreak: number;
  maxLossStreak: number;
  currentStreak: { type: "WIN" | "LOSS" | "NONE"; count: number };
  
  // === Time ===
  tradingDays: number;
  avgTradeDuration: number;
  avgWinDuration: number;
  avgLossDuration: number;
  
  // === Returns ===
  avgDailyReturn: number;
  avgWeeklyReturn: number;
  avgMonthlyReturn: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  
  // === Exposure ===
  marketExposure: number;
  avgPositionSize: number;
  avgLeverage: number;
  
  // === Risk ===
  var95: number;
  expectedShortfall95: number;
}

// ==================== EQUITY CURVE ====================

/**
 * Точка на кривой эквити (как в Backtesting)
 */
export interface PaperEquityPoint {
  timestamp: Date;
  balance: number;
  equity: number;
  availableMargin: number;
  
  // PnL
  unrealizedPnl: number;
  realizedPnl: number;
  dailyPnl: number;
  cumulativePnl: number;
  
  // Drawdown
  drawdown: number;
  drawdownPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  
  // Stats
  openPositions: number;
  tradesCount: number;
  winsCount: number;
  lossesCount: number;
  
  // Price info
  prices?: Record<string, number>;
}

// ==================== PAPER TRADING STATE ====================

/**
 * Состояние Paper Trading Engine
 */
export interface PaperTradingState {
  /** Активные счета */
  accounts: Map<string, PaperAccount>;
  /** Последние сигналы по символам */
  lastSignals: Map<string, StrategySignal>;
  /** История состояний */
  stateHistory: PaperStateSnapshot[];
}

/**
 * Снимок состояния
 */
export interface PaperStateSnapshot {
  timestamp: Date;
  balance: number;
  equity: number;
  openPositions: number;
  unrealizedPnl: number;
  dailyPnl: number;
  drawdown: number;
}

// ==================== EVENTS ====================

/**
 * Событие Paper Trading
 */
export interface PaperTradingEvent {
  type: "POSITION_OPENED" | "POSITION_CLOSED" | "POSITION_UPDATED" | "SIGNAL_GENERATED" | 
        "ERROR" | "MAX_DRAWDOWN_REACHED" | "BALANCE_UPDATE";
  timestamp: Date;
  accountId: string;
  data: Record<string, unknown>;
}

/**
 * Callback для событий
 */
export type PaperTradingEventCallback = (event: PaperTradingEvent) => void;
