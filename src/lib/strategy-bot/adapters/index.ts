/**
 * Bot Adapters Index
 * 
 * Универсальные адаптеры для интеграции ботов
 * с Backtesting и Paper Trading системами.
 * 
 * @module strategy-bot/adapters
 */

// ==================== TYPES ====================

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
} from "./adapters/types";

// ==================== GRID BOT ====================

export {
  calculateGridLevels,
  processGridCandle,
  calculateGridEquity,
  simulateGridBot,
  calculateGridMetrics,
  type GridBotConfig,
  type GridLevel,
  type GridBotState,
} from "./adapters/grid-adapter";

export { default as gridAdapter } from "./adapters/grid-adapter";

// ==================== DCA BOT ====================

export {
  calculateDcaLevels,
  processDcaCandle,
  calculateDcaEquity,
  simulateDcaBot,
  calculateDcaMetrics,
  type DcaBotConfig,
  type DcaLevel,
  type DcaBotState,
} from "./adapters/dca-adapter";

export { default as dcaAdapter } from "./adapters/dca-adapter";

// ==================== BBOT (Bollinger Bands) - Placeholder ====================

// BBot adapter will be implemented similarly
// export { simulateBbot, type BbotConfig } from "./adapters/bbot-adapter";

// ==================== FACTORY ====================

/**
 * Factory function to get the appropriate adapter for a bot type
 */
export function getBotAdapter(botType: BotType) {
  switch (botType) {
    case "GRID":
      return gridAdapter;
    case "DCA":
      return dcaAdapter;
    // case "BBOT":
    //   return bbotAdapter;
    default:
      throw new Error(`No adapter found for bot type: ${botType}`);
  }
}

/**
 * Run simulation for any bot type
 */
export async function simulateBot<TConfig extends BaseBotConfig>(
  config: TConfig,
  candles: Array<{ close: number; closeTime: Date; high: number; low: number; open: number }>
): Promise<BotSimulationResult> {
  const adapter = getBotAdapter(config.type);
  
  if (!adapter.simulate) {
    throw new Error(`Adapter for ${config.type} does not support simulation`);
  }
  
  return adapter.simulate(config as any, candles);
}

// ==================== DEFAULT EXPORT ====================

export default {
  getBotAdapter,
  simulateBot,
  grid: gridAdapter,
  dca: dcaAdapter,
};
