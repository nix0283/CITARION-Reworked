/**
 * Trading Store
 * 
 * Handles positions, trades, signals, and PnL calculations
 * 
 * @module stores/domains/trading
 */

import { create } from "zustand"
import type { Position, Trade, Signal } from "@/types"

// ==================== STATE ====================

interface TradingState {
  positions: Position[]
  trades: Trade[]
  signals: Signal[]
}

// ==================== ACTIONS ====================

interface TradingActions {
  // Positions
  setPositions: (positions: Position[]) => void
  addPosition: (position: Position) => void
  updatePosition: (id: string, updates: Partial<Position>) => void
  removePosition: (id: string) => void
  closePosition: (id: string, exitPrice: number) => void
  
  // Trades
  setTrades: (trades: Trade[]) => void
  addTrade: (trade: Trade) => void
  updateTrade: (id: string, updates: Partial<Trade>) => void
  
  // Signals
  setSignals: (signals: Signal[]) => void
  addSignal: (signal: Signal) => void
  updateSignal: (id: string, updates: Partial<Signal>) => void
  removeSignal: (id: string) => void
}

// ==================== STORE ====================

export type TradingStore = TradingState & TradingActions

export const useTradingStore = create<TradingStore>()((set, get) => ({
  // State
  positions: [],
  trades: [],
  signals: [],
  
  // Positions Actions
  setPositions: (positions) => set({ positions }),
  
  addPosition: (position) => set((state) => ({
    positions: [...state.positions, position]
  })),
  
  updatePosition: (id, updates) => set((state) => ({
    positions: state.positions.map((p) =>
      p.id === id ? { ...p, ...updates } : p
    )
  })),
  
  removePosition: (id) => set((state) => ({
    positions: state.positions.filter((p) => p.id !== id)
  })),
  
  closePosition: (id, exitPrice) => set((state) => {
    const position = state.positions.find(p => p.id === id)
    if (!position) return state
    
    // Calculate PnL
    const pnl = position.direction === "LONG"
      ? (exitPrice - position.avgEntryPrice) * position.totalAmount
      : (position.avgEntryPrice - exitPrice) * position.totalAmount
    
    // Create trade record
    const trade: Trade = {
      id: `trade-${Date.now()}`,
      symbol: position.symbol,
      direction: position.direction,
      status: "CLOSED",
      entryPrice: position.avgEntryPrice,
      exitPrice,
      amount: position.totalAmount,
      leverage: position.leverage,
      pnl,
      pnlPercent: (pnl / (position.avgEntryPrice * position.totalAmount)) * 100,
      fee: position.totalAmount * exitPrice * 0.0004,
      closeReason: "MANUAL",
      isDemo: position.isDemo,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    
    return {
      positions: state.positions.filter(p => p.id !== id),
      trades: [trade, ...state.trades].slice(0, 100),
    }
  }),
  
  // Trades Actions
  setTrades: (trades) => set({ trades }),
  
  addTrade: (trade) => set((state) => ({
    trades: [trade, ...state.trades].slice(0, 100)
  })),
  
  updateTrade: (id, updates) => set((state) => ({
    trades: state.trades.map((t) =>
      t.id === id ? { ...t, ...updates } : t
    )
  })),
  
  // Signals Actions
  setSignals: (signals) => set({ signals }),
  
  addSignal: (signal) => set((state) => ({
    signals: [signal, ...state.signals].slice(0, 50)
  })),
  
  updateSignal: (id, updates) => set((state) => ({
    signals: state.signals.map((s) =>
      s.id === id ? { ...s, ...updates } : s
    )
  })),
  
  removeSignal: (id) => set((state) => ({
    signals: state.signals.filter((s) => s.id !== id)
  })),
}))

// ==================== SELECTORS ====================

export const selectPositions = (state: TradingStore) => state.positions
export const selectTrades = (state: TradingStore) => state.trades
export const selectSignals = (state: TradingStore) => state.signals

export const selectOpenPositions = (state: TradingStore) => 
  state.positions.filter(p => p.status === "OPEN")

export const selectClosedTrades = (state: TradingStore) => 
  state.trades.filter(t => t.status === "CLOSED")

export const selectActiveSignals = (state: TradingStore) => 
  state.signals.filter(s => s.status === "PENDING" || s.status === "ACTIVE")

// ==================== COMPUTED SELECTORS ====================

export const selectTotalPnL = (state: TradingStore) => {
  const closedTrades = state.trades.filter(t => t.status === "CLOSED")
  
  if (closedTrades.length === 0) {
    return { value: 0, percent: 0 }
  }
  
  const totalPnL = closedTrades.reduce((sum, t) => sum + t.pnl, 0)
  const totalInvested = closedTrades.reduce(
    (sum, t) => sum + (t.entryPrice || 0) * t.amount, 
    0
  )
  const percent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0
  
  return { value: totalPnL, percent }
}

export const selectWinRate = (state: TradingStore) => {
  const closedTrades = state.trades.filter(t => t.status === "CLOSED")
  
  if (closedTrades.length === 0) return 0
  
  const wins = closedTrades.filter(t => t.pnl > 0).length
  return (wins / closedTrades.length) * 100
}

export const selectPositionCount = (state: TradingStore) => 
  state.positions.filter(p => p.status === "OPEN").length

export const selectPositionBySymbol = (symbol: string) => (state: TradingStore) =>
  state.positions.find(p => p.symbol === symbol && p.status === "OPEN")

// ==================== EXPORTS ====================

export default useTradingStore
