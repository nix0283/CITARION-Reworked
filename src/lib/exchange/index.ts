/**
 * Exchange Client Factory (Enhanced with Security)
 * 
 * Creates exchange clients based on exchange ID and configuration
 * Supports LIVE, TESTNET, and DEMO trading modes
 * 
 * SECURITY ENHANCEMENTS:
 * - SecureCredentialManager for API key encryption
 * - CircuitBreaker for fault tolerance
 * - Automatic credential validation
 * - Audit logging
 * 
 * ACTIVE EXCHANGES: Binance, Bybit, OKX, Bitget, BingX
 * DISABLED: KuCoin, Coinbase, Huobi, HyperLiquid, BitMEX, BloFin, Aster, Gate.io
 */

import { 
  ApiCredentials, 
  MarketType, 
  ExchangeId,
  AllExchangeId,
  TradingMode,
  EXCHANGE_CONFIGS,
} from "./types";
import { BaseExchangeClient } from "./base-client";
import { SecureCredentialManager } from "@/lib/security/credential-manager";
import { getExchangeCircuitBreaker } from "@/lib/security/circuit-breaker";
import { logger } from "@/lib/logger";

// ============================================================
// ACTIVE EXCHANGE CLIENTS
// ============================================================
import { BinanceClient } from "./binance-client";
import { BybitClient } from "./bybit-client";
import { OKXClient } from "./okx-client";
import { BitgetClient } from "./bitget-client";
import { BingxClient } from "./bingx-client";

// ============================================================
// DISABLED EXCHANGE CLIENTS (uncomment to enable)
// ============================================================
// import { KucoinClient } from "./kucoin-client";
// import { HuobiClient } from "./huobi-client";
// import { HyperliquidClient } from "./hyperliquid-client";
// import { BitmexClient } from "./bitmex-client";
// import { BlofinClient } from "./blofin-client";
// import { CoinbaseClient } from "./coinbase-client";
// import { AsterClient } from "./aster-client";

export interface ExchangeClientOptions {
  credentials: ApiCredentials;
  marketType?: MarketType;
  testnet?: boolean;
  tradingMode?: TradingMode;
}

export interface SecureExchangeClientOptions {
  exchangeId: ExchangeId;
  accountId?: string;
  credentials?: ApiCredentials;
  marketType?: MarketType;
  testnet?: boolean;
  tradingMode?: TradingMode;
  useCircuitBreaker?: boolean;
}

/**
 * Create an exchange client with security enhancements
 * 
 * @param options - Client options including accountId for credential retrieval
 * @returns Exchange client wrapped with security features
 */
export async function createSecureExchangeClient(
  options: SecureExchangeClientOptions
): Promise<BaseExchangeClient> {
  const {
    exchangeId,
    accountId,
    credentials: providedCredentials,
    marketType = "futures",
    testnet = false,
    tradingMode,
    useCircuitBreaker = true,
  } = options;
  
  let credentials: ApiCredentials;
  
  // Get credentials from SecureCredentialManager if accountId provided
  if (accountId) {
    const storedCredentials = await SecureCredentialManager.getCredentials(accountId);
    
    if (!storedCredentials) {
      throw new Error(`No credentials found for account ${accountId}`);
    }
    
    credentials = storedCredentials;
    logger.debug(
      { accountId, exchangeId, ...SecureCredentialManager.maskCredentials(storedCredentials) },
      'Credentials retrieved securely'
    );
  } else if (providedCredentials) {
    credentials = providedCredentials;
  } else {
    throw new Error('Either accountId or credentials must be provided');
  }
  
  // Validate credentials if not testnet
  if (!testnet && tradingMode !== 'TESTNET') {
    const validation = await SecureCredentialManager.validateCredentials(accountId!);
    if (!validation.valid) {
      logger.warn(
        { accountId, exchangeId, error: validation.error },
        'Credential validation failed'
      );
      // Don't throw - allow connection attempt for better error message from exchange
    }
  }
  
  // Create base client
  const client = createExchangeClient(exchangeId, {
    credentials,
    marketType,
    testnet,
    tradingMode,
  });
  
  // Wrap with circuit breaker if enabled
  if (useCircuitBreaker) {
    return wrapWithCircuitBreaker(client, exchangeId);
  }
  
  return client;
}

/**
 * Wrap exchange client with circuit breaker for fault tolerance
 */
function wrapWithCircuitBreaker(
  client: BaseExchangeClient,
  exchangeId: string
): BaseExchangeClient {
  const breaker = getExchangeCircuitBreaker(exchangeId);
  
  // Create proxy that wraps methods with circuit breaker
  return new Proxy(client, {
    get(target, prop: keyof BaseExchangeClient) {
      const originalMethod = target[prop];
      
      // Only wrap async methods that interact with exchange
      const methodsToWrap = [
        'getAccountInfo',
        'getBalance',
        'getPositions',
        'getPosition',
        'createOrder',
        'cancelOrder',
        'closePosition',
        'setLeverage',
        'getTicker',
        'getOrderbook',
        'getFundingRate',
        'testConnection',
      ];
      
      if (typeof originalMethod === 'function' && methodsToWrap.includes(prop as string)) {
        return async (...args: any[]) => {
          const result = await breaker.execute(async () => {
            return await (originalMethod as any).apply(target, args);
          });
          
          if (!result.success) {
            logger.warn(
              {
                exchange: exchangeId,
                method: prop,
                error: result.error?.message,
                circuitState: result.circuitState,
              },
              'Exchange API call failed'
            );
            throw result.error;
          }
          
          return result.data;
        };
      }
      
      return originalMethod;
    },
  });
}

/**
 * Create an exchange client for the specified exchange
 * Supports both active and disabled exchanges (for internal use)
 * 
 * @deprecated Use createSecureExchangeClient for new code
 */
export function createExchangeClient(
  exchangeId: AllExchangeId,
  options: ExchangeClientOptions
): BaseExchangeClient {
  const { credentials, marketType = "futures", testnet = false, tradingMode } = options;
  
  // Check if exchange is active
  const isActiveExchange = (id: string): id is ExchangeId => {
    return id in EXCHANGE_CONFIGS;
  };

  // Get config for active exchanges, or use defaults for disabled
  const config = isActiveExchange(exchangeId) ? EXCHANGE_CONFIGS[exchangeId] : null;
  
  // Determine actual trading mode
  let actualMode: TradingMode;
  if (tradingMode) {
    actualMode = tradingMode;
  } else if (testnet) {
    actualMode = "TESTNET";
  } else {
    actualMode = "LIVE";
  }
  
  // Validate trading mode is supported (only for active exchanges)
  if (config) {
    if (actualMode === "TESTNET" && !config.hasTestnet) {
      console.warn(`[Exchange] ${exchangeId} does not support testnet, using production`);
      actualMode = "LIVE";
    }
    
    if (actualMode === "DEMO" && !config.hasDemo) {
      console.warn(`[Exchange] ${exchangeId} does not support demo mode, using production`);
      actualMode = "LIVE";
    }
    
    // Check if market type is supported
    if (!config.markets.includes(marketType)) {
      throw new Error(`${exchangeId} does not support ${marketType} trading. Supported: ${config.markets.join(", ")}`);
    }
    
    // Check if passphrase is required
    if (config.requiresPassphrase && !credentials.passphrase) {
      throw new Error(`${exchangeId} requires a passphrase`);
    }
  }

  // Create appropriate client
  const useTestnet = actualMode === "TESTNET";
  
  // ============================================================
  // ACTIVE EXCHANGES
  // ============================================================
  switch (exchangeId) {
    case "binance":
      return new BinanceClient(credentials, marketType, useTestnet, actualMode);
    
    case "bybit":
      return new BybitClient(credentials, marketType, useTestnet, actualMode);
    
    case "okx":
      return new OKXClient(credentials, marketType, false, actualMode);
    
    case "bitget":
      return new BitgetClient(credentials, marketType, false, actualMode === "DEMO");
    
    case "bingx":
      return new BingxClient(credentials, marketType, false, actualMode === "DEMO");
    
    // ============================================================
    // DISABLED EXCHANGES (uncomment to enable)
    // ============================================================
    /*
    case "kucoin":
      return new KucoinClient(credentials, marketType, useTestnet, actualMode);
    
    case "huobi":
      return new HuobiClient(credentials, marketType, useTestnet, actualMode);
    
    case "hyperliquid":
      return new HyperliquidClient(credentials, marketType, useTestnet, actualMode);
    
    case "bitmex":
      return new BitmexClient(credentials, marketType, useTestnet, actualMode);
    
    case "blofin":
      return new BlofinClient(credentials, marketType, false, actualMode);
    
    case "coinbase":
      return new CoinbaseClient(credentials, marketType, useTestnet, actualMode);
    
    case "aster":
      return new AsterClient(credentials, marketType, useTestnet, actualMode);
    */
    
    default:
      throw new Error(`Unsupported exchange: ${exchangeId}`);
  }
}

/**
 * Get list of supported exchanges (active only)
 */
export function getSupportedExchanges(): ExchangeId[] {
  return Object.keys(EXCHANGE_CONFIGS) as ExchangeId[];
}

/**
 * Get exchange configuration
 */
export function getExchangeConfig(exchangeId: ExchangeId) {
  return EXCHANGE_CONFIGS[exchangeId];
}

/**
 * Get exchange client (wrapper for createExchangeClient)
 * Accepts a single options object for convenience
 * 
 * @deprecated Use createSecureExchangeClient for new code
 */
export function getExchangeClient(options: ExchangeClientOptions & { exchangeId: ExchangeId }): BaseExchangeClient {
  const { exchangeId, ...clientOptions } = options;
  return createExchangeClient(exchangeId, clientOptions);
}

/**
 * Check if exchange supports a specific market type
 */
export function supportsMarketType(exchangeId: ExchangeId, marketType: MarketType): boolean {
  return EXCHANGE_CONFIGS[exchangeId].markets.includes(marketType);
}

/**
 * Check if exchange has testnet
 */
export function hasTestnet(exchangeId: ExchangeId): boolean {
  return EXCHANGE_CONFIGS[exchangeId].hasTestnet;
}

/**
 * Check if exchange has demo mode
 */
export function hasDemoMode(exchangeId: ExchangeId): boolean {
  return EXCHANGE_CONFIGS[exchangeId].hasDemo;
}

/**
 * Get all exchanges that support a specific trading mode
 */
export function getExchangesByMode(mode: TradingMode): ExchangeId[] {
  return Object.entries(EXCHANGE_CONFIGS)
    .filter(([_, config]) => {
      if (mode === "TESTNET") return config.hasTestnet;
      if (mode === "DEMO") return config.hasDemo;
      return true; // All support LIVE
    })
    .map(([id]) => id as ExchangeId);
}

/**
 * Get trading mode info for exchange
 */
export function getTradingModeInfo(exchangeId: ExchangeId): {
  hasLive: boolean;
  hasTestnet: boolean;
  hasDemo: boolean;
  testnetConfig?: typeof EXCHANGE_CONFIGS[ExchangeId]["testnetConfig"];
  demoConfig?: typeof EXCHANGE_CONFIGS[ExchangeId]["demoConfig"];
} {
  const config = EXCHANGE_CONFIGS[exchangeId];
  return {
    hasLive: true,
    hasTestnet: config.hasTestnet,
    hasDemo: config.hasDemo,
    testnetConfig: config.testnetConfig,
    demoConfig: config.demoConfig,
  };
}

// Re-export types and configs
export * from "./types";
export { BaseExchangeClient } from "./base-client";

// ============================================================
// ACTIVE EXCHANGE CLIENT EXPORTS
// ============================================================
export { BinanceClient } from "./binance-client";
export { BybitClient } from "./bybit-client";
export { OKXClient } from "./okx-client";
export { BitgetClient } from "./bitget-client";
export { BingxClient } from "./bingx-client";

// ============================================================
// DISABLED EXCHANGE CLIENT EXPORTS (uncomment to enable)
// ============================================================
// export { KucoinClient } from "./kucoin-client";
// export { HuobiClient } from "./huobi-client";
// export { HyperliquidClient } from "./hyperliquid-client";
// export { BitmexClient } from "./bitmex-client";
// export { BlofinClient } from "./blofin-client";
// export { CoinbaseClient } from "./coinbase-client";
// export { AsterClient } from "./aster-client";

// Re-export API monitor
export * from "./api-monitor";

// Export security-enhanced functions
export { createSecureExchangeClient, wrapWithCircuitBreaker };
