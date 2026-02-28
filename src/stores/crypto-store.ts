/**
 * @deprecated Use domain stores from '@/stores' instead
 * 
 * This file is kept for backward compatibility during migration.
 * All functionality has been moved to domain-specific stores:
 * - useNavigationStore - UI navigation state
 * - useAccountStore - Account and balance management
 * - useMarketStore - Market prices and data
 * - useTradingStore - Positions, trades, signals
 * 
 * @example Migration:
 * ```typescript
 * // Before:
 * import { useCryptoStore } from '@/stores/crypto-store'
 * const { positions, marketPrices } = useCryptoStore()
 * 
 * // After:
 * import { useTradingStore, useMarketStore } from '@/stores'
 * const positions = useTradingStore(selectPositions)
 * const marketPrices = useMarketStore(selectMarketPrices)
 * ```
 */

// Re-export domain stores for backward compatibility
export {
  useNavigationStore,
  useAccountStore,
  useMarketStore,
  useTradingStore,
  useCombinedStore,
} from './index'

// Re-export types
export type {
  NavigationStore,
  AccountStore,
  MarketStore,
  TradingStore,
} from './index'

// Re-export selectors
export {
  selectActiveTab,
  selectSidebarOpen,
  selectAccount,
  selectTradingMode,
  selectVirtualBalance,
  selectTotalBalance,
  selectMarketPrices,
  selectSelectedSymbols,
  selectPrice,
  selectTopGainers,
  selectTopLosers,
  selectMostActive,
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
} from './index'

// Legacy type exports
export type { 
  TradingMode, 
  MarketPrice, 
  Position, 
  Trade, 
  Account, 
  VirtualBalance, 
  Signal, 
  ChatMessage 
} from "@/types"

// Legacy default export (deprecated)
const deprecated = {
  message: "useCryptoStore is deprecated. Use domain stores instead.",
  stores: {
    navigation: useNavigationStore,
    account: useAccountStore,
    market: useMarketStore,
    trading: useTradingStore,
  },
}

export default deprecated
