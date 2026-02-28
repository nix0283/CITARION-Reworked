/**
 * Grid Bot Adapter
 * 
 * Адаптер для Grid Bot - симуляция сеточной торговли
 * для Backtesting и Paper Trading
 */

import { Candle } from "../../strategy/types";
import { BotPosition, BotTrade, BotEquityPoint, BotLogEntry } from "../types";
import { BaseBotConfig, BotSimulationResult, BotSimulationMetrics } from "./types";

// ==================== GRID BOT CONFIG ====================

export interface GridBotConfig extends BaseBotConfig {
  type: "GRID";
  
  // Grid settings
  gridType: "ARITHMETIC" | "GEOMETRIC";
  gridCount: number;
  upperPrice: number;
  lowerPrice: number;
  
  // Investment
  totalInvestment: number;
  perGridAmount?: number;
  
  // Leverage (for futures)
  leverage: number;
  marginMode: "ISOLATED" | "CROSSED";
  
  // Triggers
  triggerPrice?: number;
  triggerType?: "ABOVE" | "BELOW";
}

// ==================== GRID STATE ====================

interface GridLevel {
  level: number;
  price: number;
  side: "BUY" | "SELL";
  status: "PENDING" | "OPEN" | "FILLED" | "CANCELLED";
  amount: number;
  filled: number;
}

interface GridBotState {
  levels: GridLevel[];
  activeBuys: GridLevel[];
  activeSells: GridLevel[];
  filledOrders: BotTrade[];
  currentPrice: number;
  balance: number;
  equity: number;
}

// ==================== GRID CALCULATIONS ====================

/**
 * Calculate grid levels based on config
 */
export function calculateGridLevels(config: GridBotConfig): GridLevel[] {
  const { gridType, gridCount, upperPrice, lowerPrice, totalInvestment } = config;
  const levels: GridLevel[] = [];
  
  const priceStep = gridType === "ARITHMETIC"
    ? (upperPrice - lowerPrice) / gridCount
    : lowerPrice * (Math.pow(upperPrice / lowerPrice, 1 / gridCount) - 1);
  
  const amountPerLevel = config.perGridAmount || totalInvestment / gridCount;
  
  for (let i = 0; i <= gridCount; i++) {
    const price = gridType === "ARITHMETIC"
      ? lowerPrice + (priceStep * i)
      : lowerPrice * Math.pow(1 + priceStep / lowerPrice, i);
    
    // Alternate buy/sell orders
    const side: "BUY" | "SELL" = i % 2 === 0 ? "BUY" : "SELL";
    
    levels.push({
      level: i,
      price: Math.round(price * 100) / 100,
      side,
      status: "PENDING",
      amount: amountPerLevel / price,
      filled: 0,
    });
  }
  
  return levels;
}

/**
 * Process a candle and execute grid trades
 */
export function processGridCandle(
  state: GridBotState,
  candle: Candle,
  config: GridBotConfig
): { trades: BotTrade[]; logs: BotLogEntry[] } {
  const trades: BotTrade[] = [];
  const logs: BotLogEntry[] = [];
  const { high, low, close } = candle;
  
  // Update current price
  state.currentPrice = close;
  
  // Check each grid level
  for (const level of state.levels) {
    if (level.status !== "PENDING") continue;
    
    // Check if price crossed the level
    const crossed = level.side === "BUY" 
      ? low <= level.price && state.currentPrice >= level.price
      : high >= level.price && state.currentPrice <= level.price;
    
    if (crossed) {
      // Execute trade
      const trade: BotTrade = {
        id: `grid-${config.id}-${level.level}-${Date.now()}`,
        botId: config.id,
        symbol: config.symbol,
        side: level.side,
        price: level.price,
        amount: level.amount,
        fee: level.amount * level.price * 0.0004, // 0.04% taker fee
        timestamp: new Date(candle.closeTime),
        pnl: 0,
      };
      
      level.status = "FILLED";
      level.filled = level.amount;
      state.filledOrders.push(trade);
      trades.push(trade);
      
      // Update balance/equity
      if (level.side === "BUY") {
        state.balance -= level.amount * level.price;
      } else {
        state.balance += level.amount * level.price;
      }
      
      logs.push({
        level: "INFO",
        message: `Grid ${level.side} filled at $${level.price}`,
        timestamp: new Date(),
        data: { level: level.level, price: level.price, amount: level.amount },
      });
      
      // Activate opposite order
      activateOppositeOrder(state, level, config);
    }
  }
  
  // Calculate equity
  state.equity = calculateGridEquity(state, config);
  
  return { trades, logs };
}

/**
 * Activate opposite order after a fill
 */
function activateOppositeOrder(
  state: GridBotState,
  filledLevel: GridLevel,
  config: GridBotConfig
): void {
  const oppositeLevel = state.levels.find(l => 
    l.level === filledLevel.level + (filledLevel.side === "BUY" ? 1 : -1)
  );
  
  if (oppositeLevel && oppositeLevel.status === "PENDING") {
    oppositeLevel.status = "OPEN";
  }
}

/**
 * Calculate current equity for grid bot
 */
export function calculateGridEquity(state: GridBotState, config: GridBotConfig): number {
  let equity = state.balance;
  
  // Add value of held positions
  for (const trade of state.filledOrders) {
    if (trade.side === "BUY") {
      // Long position: value = amount * current price
      equity += trade.amount * state.currentPrice;
    }
  }
  
  return equity;
}

// ==================== SIMULATION ====================

/**
 * Run full grid bot simulation
 */
export async function simulateGridBot(
  config: GridBotConfig,
  candles: Candle[]
): Promise<BotSimulationResult> {
  const state: GridBotState = {
    levels: calculateGridLevels(config),
    activeBuys: [],
    activeSells: [],
    filledOrders: [],
    currentPrice: candles[0]?.close || config.lowerPrice,
    balance: config.totalInvestment,
    equity: config.totalInvestment,
  };
  
  const allTrades: BotTrade[] = [];
  const allLogs: BotLogEntry[] = [];
  const equityCurve: BotEquityPoint[] = [];
  
  const startTime = new Date();
  
  // Process each candle
  for (const candle of candles) {
    const { trades, logs } = processGridCandle(state, candle, config);
    allTrades.push(...trades);
    allLogs.push(...logs);
    
    // Record equity point every N candles
    if (candles.indexOf(candle) % 10 === 0) {
      equityCurve.push({
        timestamp: new Date(candle.closeTime),
        balance: state.balance,
        equity: state.equity,
        unrealizedPnl: state.equity - config.totalInvestment,
      });
    }
  }
  
  const completedAt = new Date();
  
  // Calculate metrics
  const metrics = calculateGridMetrics(allTrades, config.totalInvestment);
  
  return {
    botId: config.id,
    botType: "GRID",
    mode: config.mode,
    initialBalance: config.totalInvestment,
    finalBalance: state.balance,
    finalEquity: state.equity,
    totalPnl: state.equity - config.totalInvestment,
    totalPnlPercent: ((state.equity - config.totalInvestment) / config.totalInvestment) * 100,
    metrics,
    trades: allTrades,
    equityCurve,
    positions: [], // Grid bot doesn't track positions like trend bots
    startedAt: startTime,
    completedAt,
    duration: completedAt.getTime() - startTime.getTime(),
    logs: allLogs,
  };
}

/**
 * Calculate performance metrics for grid bot
 */
export function calculateGridMetrics(
  trades: BotTrade[],
  initialBalance: number
): BotSimulationMetrics {
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl < 0);
  
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
  
  return {
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
    totalPnl,
    totalPnlPercent: (totalPnl / initialBalance) * 100,
    avgPnl: trades.length > 0 ? totalPnl / trades.length : 0,
    avgWin: winningTrades.length > 0 ? totalWins / winningTrades.length : 0,
    avgLoss: losingTrades.length > 0 ? totalLosses / losingTrades.length : 0,
    maxWin: Math.max(0, ...winningTrades.map(t => t.pnl)),
    maxLoss: Math.min(0, ...losingTrades.map(t => t.pnl)),
    profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
    riskRewardRatio: winningTrades.length > 0 && losingTrades.length > 0
      ? (totalWins / winningTrades.length) / (totalLosses / losingTrades.length)
      : 0,
  };
}

// ==================== EXPORTS ====================

export type { GridBotConfig, GridLevel, GridBotState };

export default {
  calculateGridLevels,
  processGridCandle,
  calculateGridEquity,
  simulateGridBot,
  calculateGridMetrics,
};
