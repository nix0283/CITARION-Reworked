/**
 * Account Store
 * 
 * Handles account state: trading mode, balance, exchange settings
 * 
 * @module stores/domains/account
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { TradingMode, Account, VirtualBalance } from "@/types"

// ==================== INITIAL STATE ====================

const INITIAL_VIRTUAL_BALANCE: VirtualBalance = {
  USDT: 10000,
  BTC: 0,
  ETH: 0,
  BNB: 0,
  SOL: 0,
}

const DEFAULT_ACCOUNT: Account = {
  id: "demo-account",
  accountType: "DEMO",
  exchangeId: "binance",
  exchangeType: "futures",
  exchangeName: "Binance",
  virtualBalance: INITIAL_VIRTUAL_BALANCE,
  isActive: true,
  isTestnet: false,
}

// ==================== STATE ====================

interface AccountState {
  account: Account
}

// ==================== ACTIONS ====================

interface AccountActions {
  setTradingMode: (mode: TradingMode) => void
  updateVirtualBalance: (balance: Partial<VirtualBalance>) => void
  resetDemoBalance: () => void
  setAccount: (account: Partial<Account>) => void
}

// ==================== STORE ====================

export type AccountStore = AccountState & AccountActions

export const useAccountStore = create<AccountStore>()(
  persist(
    (set) => ({
      // State
      account: DEFAULT_ACCOUNT,
      
      // Actions
      setTradingMode: (mode) => set((state) => ({
        account: { ...state.account, accountType: mode }
      })),
      
      updateVirtualBalance: (balance) => set((state) => ({
        account: {
          ...state.account,
          virtualBalance: { ...state.account.virtualBalance, ...balance } as VirtualBalance
        }
      })),
      
      resetDemoBalance: () => set(() => ({
        account: {
          ...DEFAULT_ACCOUNT,
          virtualBalance: INITIAL_VIRTUAL_BALANCE,
        }
      })),
      
      setAccount: (updates) => set((state) => ({
        account: { ...state.account, ...updates }
      })),
    }),
    {
      name: "citarion-account",
      partialize: (state) => ({
        account: state.account,
      }),
    }
  )
)

// ==================== SELECTORS ====================

export const selectAccount = (state: AccountStore) => state.account
export const selectTradingMode = (state: AccountStore) => state.account.accountType
export const selectVirtualBalance = (state: AccountStore) => state.account.virtualBalance

// ==================== COMPUTED SELECTORS ====================

export const selectTotalBalance = (state: AccountStore, marketPrices?: Record<string, { price: number }>) => {
  const balance = state.account.virtualBalance
  if (!balance) return 0
  
  let total = balance.USDT || 0
  
  if (marketPrices) {
    if (balance.BTC && marketPrices.BTCUSDT) total += balance.BTC * marketPrices.BTCUSDT.price
    if (balance.ETH && marketPrices.ETHUSDT) total += balance.ETH * marketPrices.ETHUSDT.price
    if (balance.BNB && marketPrices.BNBUSDT) total += balance.BNB * marketPrices.BNBUSDT.price
    if (balance.SOL && marketPrices.SOLUSDT) total += balance.SOL * marketPrices.SOLUSDT.price
  }
  
  return total
}

// ==================== EXPORTS ====================

export default useAccountStore
