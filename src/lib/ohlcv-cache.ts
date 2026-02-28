/**
 * OHLCV Data Cache Utility
 * 
 * Implements in-memory caching with TTL for candlestick data
 * Reduces API calls to exchanges and prevents rate limiting
 * 
 * Features:
 * - TTL-based expiration
 * - LRU eviction when memory limit reached
 * - Support for multiple timeframes and symbols
 * - Optional persistence layer hook
 */

import { logger } from './logger';

// ==================== TYPES ====================

export interface CachedOhlcvData {
  symbol: string;
  exchange: string;
  timeframe: string;
  candles: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  cachedAt: number;
  expiresAt: number;
  source: 'cache' | 'api';
}

export interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of cache entries
  staleWhileRevalidate: boolean; // Serve stale data while fetching new
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: CacheConfig = {
  ttl: 60_000, // 1 minute default TTL
  maxSize: 1000, // Max 1000 cache entries
  staleWhileRevalidate: true,
};

// ==================== CACHE IMPLEMENTATION ====================

class OhlcvCache {
  private cache = new Map<string, CachedOhlcvData>();
  private accessOrder: string[] = []; // For LRU eviction
  private config: CacheConfig;
  private pendingFetches = new Map<string, Promise<CachedOhlcvData>>();

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate cache key from parameters
   */
  private makeKey(symbol: string, exchange: string, timeframe: string): string {
    return `${exchange}:${symbol}:${timeframe}`;
  }

  /**
   * Check if cache entry is valid
   */
  private isValid(entry: CachedOhlcvData): boolean {
    return entry.expiresAt > Date.now();
  }

  /**
   * Check if cache entry is stale but can be served
   */
  private isStale(entry: CachedOhlcvData): boolean {
    return !this.isValid(entry) && this.config.staleWhileRevalidate;
  }

  /**
   * Update access order for LRU tracking
   */
  private touch(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Evict oldest entries if cache is full
   */
  private evict(): void {
    while (this.cache.size >= this.config.maxSize && this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey) {
        this.cache.delete(oldestKey);
        logger.debug({ key: oldestKey }, 'Cache eviction');
      }
    }
  }

  /**
   * Get data from cache
   */
  get(
    symbol: string,
    exchange: string,
    timeframe: string
  ): CachedOhlcvData | null {
    const key = this.makeKey(symbol, exchange, timeframe);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    this.touch(key);

    // Return if valid or stale-but-acceptable
    if (this.isValid(entry) || this.isStale(entry)) {
      return { ...entry, source: this.isValid(entry) ? 'cache' : 'cache-stale' };
    }

    // Entry expired and not acceptable - remove it
    this.cache.delete(key);
    const index = this.accessOrder.indexOf(key);
    if (index > -1) this.accessOrder.splice(index, 1);
    
    return null;
  }

  /**
   * Set data in cache
   */
  set(
    symbol: string,
    exchange: string,
    timeframe: string,
    candles: CachedOhlcvData['candles'],
    customTtl?: number
  ): void {
    const key = this.makeKey(symbol, exchange, timeframe);
    const ttl = customTtl || this.config.ttl;
    
    // Evict if necessary before adding
    if (!this.cache.has(key)) {
      this.evict();
    }

    const entry: CachedOhlcvData = {
      symbol,
      exchange,
      timeframe,
      candles,
      cachedAt: Date.now(),
      expiresAt: Date.now() + ttl,
      source: 'api',
    };

    this.cache.set(key, entry);
    this.touch(key);
    
    logger.debug(
      { key, ttl, candleCount: candles.length },
      'Cache entry set'
    );
  }

  /**
   * Get or fetch data with deduplication of concurrent requests
   */
  async getOrFetch(
    symbol: string,
    exchange: string,
    timeframe: string,
    fetcher: () => Promise<CachedOhlcvData['candles']>
  ): Promise<CachedOhlcvData> {
    const key = this.makeKey(symbol, exchange, timeframe);
    
    // Check cache first
    const cached = this.get(symbol, exchange, timeframe);
    if (cached && this.isValid(cached)) {
      return cached;
    }

    // Check if there's already a pending fetch for this key
    const pending = this.pendingFetches.get(key);
    if (pending) {
      logger.debug({ key }, 'Using pending fetch');
      const result = await pending;
      return { ...result, source: 'cache' };
    }

    // Serve stale data while fetching if configured
    if (cached && this.isStale(cached) && this.config.staleWhileRevalidate) {
      // Start background refresh without awaiting
      this.pendingFetches.set(key, this.doFetch(key, fetcher));
      this.pendingFetches.get(key)?.finally(() => {
        this.pendingFetches.delete(key);
      });
      return { ...cached, source: 'cache-stale' };
    }

    // Fetch fresh data
    const fetchPromise = this.doFetch(key, fetcher);
    this.pendingFetches.set(key, fetchPromise);
    
    try {
      const result = await fetchPromise;
      return result;
    } finally {
      this.pendingFetches.delete(key);
    }
  }

  /**
   * Internal fetch and cache method
   */
  private async doFetch(
    key: string,
    fetcher: () => Promise<CachedOhlcvData['candles']>
  ): Promise<CachedOhlcvData> {
    const [exchange, symbol, timeframe] = key.split(':');
    
    try {
      const start = Date.now();
      const candles = await fetcher();
      const duration = Date.now() - start;
      
      this.set(symbol, exchange, timeframe, candles);
      
      logger.debug(
        { key, duration, candleCount: candles.length },
        'Cache fetch completed'
      );
      
      return {
        symbol,
        exchange,
        timeframe,
        candles,
        cachedAt: Date.now(),
        expiresAt: Date.now() + this.config.ttl,
        source: 'api',
      };
    } catch (error) {
      logger.error(error, `Cache fetch failed for ${key}`);
      throw error;
    }
  }

  /**
   * Clear cache entries matching pattern
   */
  clear(pattern?: { symbol?: string; exchange?: string; timeframe?: string }): void {
    if (!pattern) {
      this.cache.clear();
      this.accessOrder = [];
      logger.info('Cache cleared');
      return;
    }

    for (const [key, entry] of this.cache.entries()) {
      const matches =
        (!pattern.symbol || entry.symbol === pattern.symbol) &&
        (!pattern.exchange || entry.exchange === pattern.exchange) &&
        (!pattern.timeframe || entry.timeframe === pattern.timeframe);
      
      if (matches) {
        this.cache.delete(key);
        const index = this.accessOrder.indexOf(key);
        if (index > -1) this.accessOrder.splice(index, 1);
      }
    }
    
    logger.debug({ pattern }, 'Cache entries cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    pendingFetches: number;
    entries: Array<{
      key: string;
      valid: boolean;
      stale: boolean;
      expiresAt: number;
    }>;
  } {
    const entries = [];
    for (const [key, entry] of this.cache.entries()) {
      entries.push({
        key,
        valid: this.isValid(entry),
        stale: this.isStale(entry),
        expiresAt: entry.expiresAt,
      });
    }
    
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      pendingFetches: this.pendingFetches.size,
      entries,
    };
  }
}

// ==================== SINGLETON INSTANCE ====================

export const ohlcvCache = new OhlcvCache({
  ttl: parseInt(process.env.OHLCV_CACHE_TTL || '60000'),
  maxSize: parseInt(process.env.OHLCV_CACHE_MAX_SIZE || '1000'),
  staleWhileRevalidate: process.env.OHLCV_STALE_WHILE_REVALIDATE !== 'false',
});

export default OhlcvCache;
