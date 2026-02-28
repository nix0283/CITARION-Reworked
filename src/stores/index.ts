/**
 * Store Index
 * 
 * Re-exports all domain stores for convenient import
 * 
 * @module stores
 * 
 * @example
 * ```typescript
 * import { useAccountStore, useMarketStore, useTradingStore } from '@/stores'
 * 
 * // Or import individually
 * import useAccountStore from '@/stores/domains/account-store'
 * ```
 */

// ==================== DOMAIN STORES ====================

export { default as useNavigationStore, selectActiveTab, selectSidebarOpen } from './domains/navigation-store'
export type { NavigationStore } from './domains/navigation-store'

export { 
  default as useAccountStore, 
  selectAccount, 
  selectTradingMode, 
  selectVirtualBalance,
  selectTotalBalance,
} from './domains/account-store'
export type { AccountStore } from './domains/account-store'

export { 
  default as useMarketStore,
  selectMarketPrices,
  selectSelectedSymbols,
  selectPrice,
  selectTopGainers,
  selectTopLosers,
  selectMostActive,
} from './domains/market-store'
export type { MarketStore } from './domains/market-store'

export {
  default as useTradingStore,
  selectPositions,
  selectTrades,
  selectSignals,
  selectOpenPositions,
  selectClosedTrades,
  selectActiveSignals,
  selectTotalPnL,
  selectWinRate,
  selectPositionCount,
  selectPositionBySymbol,
} from './domains/trading-store'
export type { TradingStore } from './domains/trading-store'

// ==================== LEGACY COMPATIBILITY ====================

/**
 * @deprecated Use individual domain stores instead
 * 
 * This is kept for backward compatibility during migration.
 * Will be removed in v2.0.
 */
export const useCryptoStore = {
  navigation: useNavigationStore,
  account: useAccountStore,
  market: useMarketStore,
  trading: useTradingStore,
}

// ==================== STORE COMPOSER ====================

/**
 * Helper to subscribe to multiple stores efficiently
 * 
 * @example
 * ```typescript
 * const { balance, activeTab } = useCombinedStore((s) => ({
 *   balance: selectTotalBalance(s.account, s.market.marketPrices),
 *   activeTab: selectActiveTab(s.navigation),
 * }))
 * ```
 */
export function useCombinedStore<T>(
  selector: (stores: {
    navigation: NavigationStore
    account: AccountStore
    market: MarketStore
    trading: TradingStore
  }) => T
): T {
  const nav = useNavigationStore(selector)
  const acc = useAccountStore(selector)
  const mkt = useMarketStore(selector)
  const trd = useTradingStore(selector)
  
  // This is a simplified version - in production, use shallow comparison
  return selector({
    navigation: useNavigationStore.getState(),
    account: useAccountStore.getState(),
    market: useMarketStore.getState(),
    trading: useTradingStore.getState(),
  })
}
