/**
 * DCA Bot Adapter
 * 
 * Адаптер для DCA (Dollar Cost Averaging) Bot
 * для Backtesting и Paper Trading
 */

import { Candle } from "../../strategy/types";
import { BotPosition, BotTrade, BotEquityPoint, BotLogEntry } from "../types";
import { BaseBotConfig, BotSimulationResult, BotSimulationMetrics } from "./types";

// ==================== DCA BOT CONFIG ====================

export interface DcaBotConfig extends BaseBotConfig {
  type: "DCA";
  
  // Entry settings
  entryType: "MARKET" | "LIMIT";
  entryPrice?: number;
  baseAmount: number;
  
  // DCA levels
  dcaLevels: number;
  dcaPercent: number; // Price drop % for each DCA level
  dcaMultiplier: number; // Amount multiplier for each DCA level
  
  // Alternative: Custom DCA levels
  dcaCustomLevels?: Array<{ priceDrop: number; amountMult: number }>;
  
  // Take Profit
  tpType: "PERCENT" | "PRICE";
  tpValue: number;
  tpSellBase: boolean;
  
  // Stop Loss
  slEnabled: boolean;
  slType: "PERCENT" | "PRICE";
  slValue?: number;
  
  // Leverage
  leverage: number;
  marginMode: "ISOLATED" | "CROSSED";
  
  // Trailing
  trailingEnabled: boolean;
  trailingPercent?: number;
}

// ==================== DCA STATE ====================

interface DcaLevel {
  level: number;
  triggerPrice: number;
  amount: number;
  status: "PENDING" | "TRIGGERED" | "FILLED";
}

interface DcaBotState {
  levels: DcaLevel[];
  currentLevel: number;
  totalInvested: number;
  totalAmount: number;
  avgEntryPrice: number;
  currentPrice: number;
  balance: number;
  equity: number;
  positionOpen: boolean;
  trailingActivated: boolean;
  highestPrice: number;
}

// ==================== DCA CALCULATIONS ====================

/**
 * Calculate DCA levels based on config
 */
export function calculateDcaLevels(config: DcaBotConfig, entryPrice: number): DcaLevel[] {
  const levels: DcaLevel[] = [];
  const { dcaLevels, dcaPercent, dcaMultiplier, baseAmount, dcaCustomLevels } = config;
  
  for (let i = 0; i <= dcaLevels; i++) {
    const customLevel = dcaCustomLevels?.[i - 1];
    
    const priceDrop = customLevel?.priceDrop || (dcaPercent * i);
    const amountMult = customLevel?.amountMult || Math.pow(dcaMultiplier, i);
    
    const triggerPrice = entryPrice * (1 - priceDrop / 100);
    const amount = baseAmount * amountMult;
    
    levels.push({
      level: i,
      triggerPrice: Math.round(triggerPrice * 100) / 100,
      amount,
      status: i === 0 ? "TRIGGERED" : "PENDING",
    });
  }
  
  return levels;
}

/**
 * Process a candle and execute DCA trades
 */
export function processDcaCandle(
  state: DcaBotState,
  candle: Candle,
  config: DcaBotConfig
): { trades: BotTrade[]; logs: BotLogEntry[]; exited?: boolean } {
  const trades: BotTrade[] = [];
  const logs: BotLogEntry[] = [];
  const { low, high, close } = candle;
  
  // Update current price and highest price for trailing
  state.currentPrice = close;
  if (close > state.highestPrice) {
    state.highestPrice = close;
  }
  
  // Check for take profit exit
  if (state.positionOpen && config.tpType === "PERCENT") {
    const tpPrice = state.avgEntryPrice * (1 + config.tpValue / 100);
    if (high >= tpPrice) {
      return exitDcaPosition(state, config, tpPrice, "TP", trades, logs);
    }
  }
  
  if (state.positionOpen && config.tpType === "PRICE" && config.tpValue) {
    if (high >= config.tpValue) {
      return exitDcaPosition(state, config, config.tpValue, "TP", trades, logs);
    }
  }
  
  // Check for stop loss exit
  if (state.positionOpen && config.slEnabled && config.slValue) {
    const slPrice = config.slType === "PERCENT"
      ? state.avgEntryPrice * (1 - config.slValue / 100)
      : config.slValue;
    
    if (low <= slPrice) {
      return exitDcaPosition(state, config, slPrice, "SL", trades, logs);
    }
  }
  
  // Check for trailing stop exit
  if (state.positionOpen && config.trailingEnabled && config.trailingPercent && state.trailingActivated) {
    const trailingPrice = state.highestPrice * (1 - config.trailingPercent / 100);
    if (low <= trailingPrice) {
      return exitDcaPosition(state, config, trailingPrice, "TRAILING", trades, logs);
    }
  }
  
  // Activate trailing when profit threshold reached
  if (config.trailingEnabled && config.trailingPercent && !state.trailingActivated) {
    const activationPrice = state.avgEntryPrice * (1 + config.trailingPercent / 100);
    if (high >= activationPrice) {
      state.trailingActivated = true;
      logs.push({
        level: "INFO",
        message: "Trailing stop activated",
        timestamp: new Date(),
        data: { activationPrice },
      });
    }
  }
  
  // Check DCA levels for entry
  if (!state.positionOpen) {
    for (const level of state.levels) {
      if (level.status !== "PENDING") continue;
      
      if (low <= level.triggerPrice) {
        // Execute DCA buy
        const trade: BotTrade = {
          id: `dca-${config.id}-L${level.level}-${Date.now()}`,
          botId: config.id,
          symbol: config.symbol,
          side: "BUY",
          price: level.triggerPrice,
          amount: level.amount / level.triggerPrice,
          fee: level.amount * 0.0004,
          timestamp: new Date(candle.closeTime),
          pnl: 0,
        };
        
        level.status = "FILLED";
        state.currentLevel = level.level;
        state.totalInvested += level.amount;
        state.totalAmount += trade.amount;
        state.avgEntryPrice = state.totalInvested / state.totalAmount;
        state.balance -= level.amount;
        state.positionOpen = true;
        
        trades.push(trade);
        
        logs.push({
          level: "INFO",
          message: `DCA Level ${level.level} filled at $${level.triggerPrice}`,
          timestamp: new Date(),
          data: { level: level.level, price: level.triggerPrice, amount: trade.amount },
        });
        
        break; // Only one DCA level per candle
      }
    }
  }
  
  // Calculate equity
  state.equity = calculateDcaEquity(state, config);
  
  return { trades, logs };
}

/**
 * Exit DCA position (TP/SL/Trailing)
 */
function exitDcaPosition(
  state: DcaBotState,
  config: DcaBotConfig,
  exitPrice: number,
  reason: "TP" | "SL" | "TRAILING",
  trades: BotTrade[],
  logs: BotLogEntry[]
): { trades: BotTrade[]; logs: BotLogEntry[]; exited: true } {
  const sellAmount = state.totalAmount;
  const sellValue = sellAmount * exitPrice;
  const fee = sellValue * 0.0004;
  const pnl = sellValue - state.totalInvested - fee;
  
  const exitTrade: BotTrade = {
    id: `dca-${config.id}-EXIT-${Date.now()}`,
    botId: config.id,
    symbol: config.symbol,
    side: "SELL",
    price: exitPrice,
    amount: sellAmount,
    fee,
    timestamp: new Date(),
    pnl,
  };
  
  state.balance += sellValue - fee;
  state.equity = state.balance;
  state.positionOpen = false;
  
  trades.push(exitTrade);
  
  logs.push({
    level: reason === "TP" ? "INFO" : "WARN",
    message: `DCA position closed via ${reason} at $${exitPrice}`,
    timestamp: new Date(),
    data: { exitPrice, pnl, reason },
  });
  
  return { trades, logs, exited: true };
}

/**
 * Calculate current equity for DCA bot
 */
export function calculateDcaEquity(state: DcaBotState, config: DcaBotConfig): number {
  if (!state.positionOpen) {
    return state.balance;
  }
  
  // Equity = balance + position value
  const positionValue = state.totalAmount * state.currentPrice;
  return state.balance + positionValue;
}

// ==================== SIMULATION ====================

/**
 * Run full DCA bot simulation
 */
export async function simulateDcaBot(
  config: DcaBotConfig,
  candles: Candle[]
): Promise<BotSimulationResult> {
  const entryPrice = config.entryPrice || candles[0]?.close || 100;
  
  const state: DcaBotState = {
    levels: calculateDcaLevels(config, entryPrice),
    currentLevel: 0,
    totalInvested: 0,
    totalAmount: 0,
    avgEntryPrice: 0,
    currentPrice: entryPrice,
    balance: config.initialBalance,
    equity: config.initialBalance,
    positionOpen: false,
    trailingActivated: false,
    highestPrice: entryPrice,
  };
  
  const allTrades: BotTrade[] = [];
  const allLogs: BotLogEntry[] = [];
  const equityCurve: BotEquityPoint[] = [];
  
  const startTime = new Date();
  let exited = false;
  
  // Process each candle
  for (const candle of candles) {
    if (exited) break;
    
    const result = processDcaCandle(state, candle, config);
    allTrades.push(...result.trades);
    allLogs.push(...result.logs);
    
    if (result.exited) {
      exited = true;
    }
    
    // Record equity point every N candles
    if (candles.indexOf(candle) % 10 === 0) {
      equityCurve.push({
        timestamp: new Date(candle.closeTime),
        balance: state.balance,
        equity: state.equity,
        unrealizedPnl: state.equity - config.initialBalance,
      });
    }
  }
  
  const completedAt = new Date();
  
  // Calculate metrics
  const metrics = calculateDcaMetrics(allTrades, config.initialBalance);
  
  return {
    botId: config.id,
    botType: "DCA",
    mode: config.mode,
    initialBalance: config.initialBalance,
    finalBalance: state.balance,
    finalEquity: state.equity,
    totalPnl: state.equity - config.initialBalance,
    totalPnlPercent: ((state.equity - config.initialBalance) / config.initialBalance) * 100,
    metrics,
    trades: allTrades,
    equityCurve,
    positions: state.positionOpen ? [{
      id: `dca-pos-${config.id}`,
      symbol: config.symbol,
      direction: "LONG",
      entryPrice: state.avgEntryPrice,
      currentPrice: state.currentPrice,
      amount: state.totalAmount,
      leverage: config.leverage,
      unrealizedPnl: state.equity - state.balance - config.initialBalance,
    }] : [],
    startedAt: startTime,
    completedAt,
    duration: completedAt.getTime() - startTime.getTime(),
    logs: allLogs,
  };
}

/**
 * Calculate performance metrics for DCA bot
 */
export function calculateDcaMetrics(
  trades: BotTrade[],
  initialBalance: number
): BotSimulationMetrics {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      avgPnl: 0,
      avgWin: 0,
      avgLoss: 0,
      maxWin: 0,
      maxLoss: 0,
      profitFactor: 0,
      riskRewardRatio: 0,
    };
  }
  
  // For DCA, we consider the full cycle (entry + exit) as one trade
  const exitTrade = trades.find(t => t.side === "SELL");
  if (!exitTrade) {
    // Position still open
    return {
      totalTrades: trades.length,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      avgPnl: 0,
      avgWin: 0,
      avgLoss: 0,
      maxWin: 0,
      maxLoss: 0,
      profitFactor: 0,
      riskRewardRatio: 0,
    };
  }
  
  const pnl = exitTrade.pnl;
  const isWin = pnl > 0;
  
  return {
    totalTrades: 1,
    winningTrades: isWin ? 1 : 0,
    losingTrades: isWin ? 0 : 1,
    winRate: isWin ? 100 : 0,
    totalPnl: pnl,
    totalPnlPercent: (pnl / initialBalance) * 100,
    avgPnl: pnl,
    avgWin: isWin ? pnl : 0,
    avgLoss: isWin ? 0 : Math.abs(pnl),
    maxWin: isWin ? pnl : 0,
    maxLoss: isWin ? 0 : Math.abs(pnl),
    profitFactor: isWin ? Infinity : 0,
    riskRewardRatio: isWin ? Math.abs(pnl) / initialBalance : 0,
  };
}

// ==================== EXPORTS ====================

export type { DcaBotConfig, DcaLevel, DcaBotState };

export default {
  calculateDcaLevels,
  processDcaCandle,
  calculateDcaEquity,
  simulateDcaBot,
  calculateDcaMetrics,
};
