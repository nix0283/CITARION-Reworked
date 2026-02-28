/**
 * Market Data Store
 * 
 * Handles real-time market prices and OHLCV data
 * 
 * @module stores/domains/market
 */

import { create } from "zustand"
import type { MarketPrice } from "@/types"

// ==================== INITIAL STATE ====================

const DEMO_PRICES: Record<string, MarketPrice> = {
  BTCUSDT: { symbol: "BTCUSDT", price: 67432.50, change24h: 2.45, high24h: 68100, low24h: 65800, volume24h: 28500000000 },
  ETHUSDT: { symbol: "ETHUSDT", price: 3521.80, change24h: -0.82, high24h: 3600, low24h: 3450, volume24h: 15200000000 },
  BNBUSDT: { symbol: "BNBUSDT", price: 598.45, change24h: 1.23, high24h: 610, low24h: 585, volume24h: 1850000000 },
  SOLUSDT: { symbol: "SOLUSDT", price: 172.30, change24h: 4.56, high24h: 178, low24h: 162, volume24h: 3200000000 },
  XRPUSDT: { symbol: "XRPUSDT", price: 0.5234, change24h: -1.15, high24h: 0.54, low24h: 0.51, volume24h: 1250000000 },
  DOGEUSDT: { symbol: "DOGEUSDT", price: 0.1542, change24h: 3.28, high24h: 0.16, low24h: 0.148, volume24h: 890000000 },
  ADAUSDT: { symbol: "ADAUSDT", price: 0.4521, change24h: -0.45, high24h: 0.47, low24h: 0.44, volume24h: 450000000 },
  AVAXUSDT: { symbol: "AVAXUSDT", price: 35.82, change24h: 1.89, high24h: 37, low24h: 34.5, volume24h: 380000000 },
}

// ==================== STATE ====================

interface MarketState {
  marketPrices: Record<string, MarketPrice>
  selectedSymbols: string[]
}

// ==================== ACTIONS ====================

interface MarketActions {
  setMarketPrices: (prices: Record<string, MarketPrice>) => void
  updateMarketPrice: (symbol: string, price: MarketPrice) => void
  updateMarketPrices: (updates: Record<string, Partial<MarketPrice>>) => void
  setSelectedSymbols: (symbols: string[]) => void
  addSelectedSymbol: (symbol: string) => void
  removeSelectedSymbol: (symbol: string) => void
  getPrice: (symbol: string) => MarketPrice | undefined
}

// ==================== STORE ====================

export type MarketStore = MarketState & MarketActions

export const useMarketStore = create<MarketStore>()((set, get) => ({
  // State
  marketPrices: DEMO_PRICES,
  selectedSymbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"],
  
  // Actions
  setMarketPrices: (prices) => set({ marketPrices: prices }),
  
  updateMarketPrice: (symbol, price) => set((state) => ({
    marketPrices: { ...state.marketPrices, [symbol]: price }
  })),
  
  updateMarketPrices: (updates) => set((state) => {
    const newPrices = { ...state.marketPrices }
    for (const [symbol, update] of Object.entries(updates)) {
      if (newPrices[symbol]) {
        newPrices[symbol] = { ...newPrices[symbol], ...update }
      }
    }
    return { marketPrices: newPrices }
  }),
  
  setSelectedSymbols: (symbols) => set({ selectedSymbols: symbols }),
  
  addSelectedSymbol: (symbol) => set((state) => ({
    selectedSymbols: state.selectedSymbols.includes(symbol)
      ? state.selectedSymbols
      : [...state.selectedSymbols, symbol]
  })),
  
  removeSelectedSymbol: (symbol) => set((state) => ({
    selectedSymbols: state.selectedSymbols.filter(s => s !== symbol)
  })),
  
  getPrice: (symbol) => get().marketPrices[symbol],
}))

// ==================== SELECTORS ====================

export const selectMarketPrices = (state: MarketStore) => state.marketPrices
export const selectSelectedSymbols = (state: MarketStore) => state.selectedSymbols
export const selectPrice = (symbol: string) => (state: MarketStore) => state.marketPrices[symbol]

// ==================== COMPUTED SELECTORS ====================

export const selectTopGainers = (state: MarketStore, limit = 5) => {
  return Object.values(state.marketPrices)
    .filter(p => p.change24h !== undefined)
    .sort((a, b) => (b.change24h || 0) - (a.change24h || 0))
    .slice(0, limit)
}

export const selectTopLosers = (state: MarketStore, limit = 5) => {
  return Object.values(state.marketPrices)
    .filter(p => p.change24h !== undefined)
    .sort((a, b) => (a.change24h || 0) - (b.change24h || 0))
    .slice(0, limit)
}

export const selectMostActive = (state: MarketStore, limit = 5) => {
  return Object.values(state.marketPrices)
    .filter(p => p.volume24h !== undefined)
    .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
    .slice(0, limit)
}

// ==================== EXPORTS ====================

export default useMarketStore
