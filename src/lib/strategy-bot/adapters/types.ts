/**
 * Bot Adapter Types
 * 
 * Shared types for all bot adapters
 */

// ==================== BASE TYPES ====================

/**
 * Тип бота
 */
export type BotType = "GRID" | "DCA" | "BBOT" | "ARGUS" | "STRATEGY";

/**
 * Режим работы бота
 */
export type BotMode = "BACKTEST" | "PAPER" | "LIVE";

/**
 * Базовая конфигурация для любого бота
 */
export interface BaseBotConfig {
  id: string;
  name: string;
  type: BotType;
  symbol: string;
  isActive: boolean;
  
  // Risk Management
  initialBalance: number;
  maxDrawdown?: number;
  takeProfit?: number;
  stopLoss?: number;
  
  // Mode
  mode: BotMode;
  accountId?: string;
}

// ==================== SIMULATION RESULT ====================

/**
 * Результат симуляции бота
 */
export interface BotSimulationResult {
  botId: string;
  botType: BotType;
  mode: BotMode;
  
  // Performance
  initialBalance: number;
  finalBalance: number;
  finalEquity: number;
  totalPnl: number;
  totalPnlPercent: number;
  
  // Metrics
  metrics: BotSimulationMetrics;
  
  // Data
  trades: BotTrade[];
  equityCurve: BotEquityPoint[];
  positions: BotPosition[];
  
  // Timing
  startedAt: Date;
  completedAt: Date;
  duration: number;
  
  // Logs
  logs: BotLogEntry[];
}

/**
 * Метрики симуляции
 */
export interface BotSimulationMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  
  totalPnl: number;
  totalPnlPercent: number;
  avgPnl: number;
  avgWin: number;
  avgLoss: number;
  maxWin: number;
  maxLoss: number;
  
  profitFactor: number;
  riskRewardRatio: number;
}

// ==================== TRADE & POSITION ====================

/**
 * Сделка бота
 */
export interface BotTrade {
  id: string;
  botId: string;
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  amount: number;
  fee: number;
  timestamp: Date;
  pnl: number;
}

/**
 * Позиция бота
 */
export interface BotPosition {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  currentPrice: number;
  amount: number;
  leverage: number;
  unrealizedPnl: number;
}

/**
 * Точка кривой эквити
 */
export interface BotEquityPoint {
  timestamp: Date;
  balance: number;
  equity: number;
  unrealizedPnl: number;
}

// ==================== LOGGING ====================

/**
 * Запись лога бота
 */
export interface BotLogEntry {
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  message: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

// ==================== ADAPTER INTERFACE ====================

/**
 * Интерфейс адаптера бота
 */
export interface BotAdapter<TConfig extends BaseBotConfig> {
  /**
   * Запустить симуляцию бота на исторических данных
   */
  simulate(config: TConfig, candles: Array<{ close: number; closeTime: Date }>): Promise<BotSimulationResult>;
  
  /**
   * Обработать одну свечу в реальном времени (Paper Trading)
   */
  processCandle?(state: unknown, candle: unknown, config: TConfig): {
    trades: BotTrade[];
    logs: BotLogEntry[];
    exited?: boolean;
  };
  
  /**
   * Рассчитать текущую эквити
   */
  calculateEquity?(state: unknown, config: TConfig): number;
}

// ==================== EXPORTS ====================

export type {
  BotType,
  BotMode,
  BaseBotConfig,
  BotSimulationResult,
  BotSimulationMetrics,
  BotTrade,
  BotPosition,
  BotEquityPoint,
  BotLogEntry,
  BotAdapter,
};
