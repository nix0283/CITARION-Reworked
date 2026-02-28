/**
 * Multi-Region Support for Feature Flag Evaluation
 * 
 * Enables low-latency feature flag evaluation across geographic regions:
 * - Region-aware routing based on user location
 * - Local caching with TTL for reduced API calls
 * - Fallback to global endpoint if regional fails
 * - Consistent assignment across regions via deterministic hashing
 * 
 * Configuration via environment variables:
 * - REGION: Current deployment region (us-east-1, eu-west-1, ap-southeast-1, etc.)
 * - FEATURE_FLAG_REGIONS: Comma-separated list of available regions
 * - FEATURE_FLAG_GLOBAL_ENDPOINT: Fallback endpoint for cross-region consistency
 * 
 * @module lib/multi-region
 */

import { logger } from '@/lib/logger';

export type Region = 'us-east-1' | 'us-west-2' | 'eu-west-1' | 'eu-central-1' | 'ap-southeast-1' | 'ap-northeast-1';

export interface RegionConfig {
  endpoint: string;
  timeout: number;           // Request timeout in ms
  cacheTTL: number;          // Local cache TTL in ms
  fallbackToGlobal: boolean; // Use global endpoint if regional fails
}

export interface MultiRegionConfig {
  currentRegion: Region;
  availableRegions: Record<Region, RegionConfig>;
  globalEndpoint?: string;
  
  // User location detection
  detectRegionFromHeaders?: (headers: Record<string, string>) => Region | null;
  
  // Consistency settings
  consistentAssignment: boolean; // Use same hash for assignment across regions
  assignmentSalt?: string;       // Optional salt for hash consistency
}

export interface EvaluationContext {
  userId?: string;
  symbol?: string;
  confidence?: number;
  headers?: Record<string, string>; // For region detection
}

export class MultiRegionFlagEvaluator {
  private config: MultiRegionConfig;
  private localCache: Map<string, { value: boolean; expiry: number }> = new Map();
  private regionLatency: Map<Region, number> = new Map();
  
  constructor(config: MultiRegionConfig) {
    this.config = config;
    
    // Initialize latency tracking
    for (const region of Object.keys(config.availableRegions) as Region[]) {
      this.regionLatency.set(region, 0);
    }
  }

  /**
   * Evaluate feature flag with region-aware routing
   */
  async evaluate(
    feature: string,
    context: EvaluationContext = {}
  ): Promise<{ enabled: boolean; region: Region; latency: number; cached: boolean }> {
    const startTime = Date.now();
    
    // Detect user region from headers or use current region
    const userRegion = this.detectUserRegion(context.headers) || this.config.currentRegion;
    
    // Generate cache key
    const cacheKey = this.generateCacheKey(feature, context, userRegion);
    
    // Check local cache first
    const cached = this.localCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
      return {
        enabled: cached.value,
        region: userRegion,
        latency: 0,
        cached: true,
      };
    }
    
    // Try regional endpoint first
    const regionalConfig = this.config.availableRegions[userRegion];
    let result: { enabled: boolean; latency: number } | null = null;
    let lastError: Error | null = null;
    
    if (regionalConfig) {
      try {
        result = await this.evaluateRegional(feature, context, userRegion, regionalConfig);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        logger.warn({ feature, region: userRegion, error: lastError.message }, 'Regional evaluation failed');
      }
    }
    
    // Fallback to global endpoint if regional failed and configured
    if (!result && this.config.fallbackToGlobal && this.config.globalEndpoint) {
      try {
        result = await this.evaluateGlobal(feature, context);
        logger.info({ feature, fallbackRegion: userRegion }, 'Used global fallback');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
      }
    }
    
    // If all failed, return safe default (disabled)
    if (!result) {
      logger.error({ feature, context, error: lastError?.message }, 'All evaluation attempts failed');
      return {
        enabled: false, // Safe default
        region: this.config.currentRegion,
        latency: Date.now() - startTime,
        cached: false,
      };
    }
    
    // Cache result
    const ttl = regionalConfig?.cacheTTL || 30000; // Default 30s
    this.localCache.set(cacheKey, {
      value: result.enabled,
      expiry: Date.now() + ttl,
    });
    
    // Update latency tracking (exponential moving average)
    const currentLatency = Date.now() - startTime;
    const prevLatency = this.regionLatency.get(userRegion) || 0;
    this.regionLatency.set(userRegion, prevLatency * 0.9 + currentLatency * 0.1);
    
    return {
      enabled: result.enabled,
      region: userRegion,
      latency: currentLatency,
      cached: false,
    };
  }

  /**
   * Evaluate flag against regional endpoint
   */
  private async evaluateRegional(
    feature: string,
    context: EvaluationContext,
    region: Region,
    config: RegionConfig
  ): Promise<{ enabled: boolean; latency: number }> {
    const startTime = Date.now();
    
    // Build request payload
    const payload = {
      feature,
      context: {
        userId: context.userId,
        symbol: context.symbol,
        confidence: context.confidence,
        region,
      },
      // Include assignment salt for consistency if configured
      ...(this.config.consistentAssignment && this.config.assignmentSalt && {
        assignmentSalt: this.config.assignmentSalt,
      }),
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);
    
    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return {
        enabled: data.enabled,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Evaluate flag against global endpoint
   */
  private async evaluateGlobal(
    feature: string,
    context: EvaluationContext
  ): Promise<{ enabled: boolean; latency: number }> {
    if (!this.config.globalEndpoint) {
      throw new Error('Global endpoint not configured');
    }
    
    const startTime = Date.now();
    
    const payload = {
      feature,
      context: {
        userId: context.userId,
        symbol: context.symbol,
        confidence: context.confidence,
        requestedRegion: this.config.currentRegion,
      },
      ...(this.config.consistentAssignment && this.config.assignmentSalt && {
        assignmentSalt: this.config.assignmentSalt,
      }),
    };
    
    const response = await fetch(this.config.globalEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      enabled: data.enabled,
      latency: Date.now() - startTime,
    };
  }

  /**
   * Detect user region from request headers
   */
  private detectUserRegion(headers?: Record<string, string>): Region | null {
    // Use custom detector if provided
    if (this.config.detectRegionFromHeaders && headers) {
      const detected = this.config.detectRegionFromHeaders(headers);
      if (detected && this.config.availableRegions[detected]) {
        return detected;
      }
    }
    
    // Fallback: check CloudFront/CDN headers
    if (headers) {
      const cloudfront = headers['cloudfront-viewer-country']?.toLowerCase();
      if (cloudfront === 'us') return 'us-east-1';
      if (cloudfront === 'gb' || cloudfront === 'de' || cloudfront === 'fr') return 'eu-west-1';
      if (cloudfront === 'jp' || cloudfront === 'kr') return 'ap-northeast-1';
      if (cloudfront === 'sg' || cloudfront === 'au') return 'ap-southeast-1';
    }
    
    // Default to current region
    return null;
  }

  /**
   * Generate cache key for local caching
   */
  private generateCacheKey(
    feature: string,
    context: EvaluationContext,
    region: Region
  ): string {
    const parts = [
      feature,
      context.userId || '',
      context.symbol || '',
      context.confidence?.toFixed(2) || '',
      region,
    ].filter(Boolean);
    
    return parts.join(':');
  }

  /**
   * Get average latency for a region
   */
  getRegionLatency(region: Region): number {
    return this.regionLatency.get(region) || 0;
  }

  /**
   * Get all region latencies for monitoring
   */
  getAllLatencies(): Record<Region, number> {
    const result: Record<Region, number> = {} as any;
    for (const [region, latency] of this.regionLatency) {
      result[region] = latency;
    }
    return result;
  }

  /**
   * Clear local cache (for testing or config changes)
   */
  clearCache(feature?: string): void {
    if (feature) {
      for (const key of this.localCache.keys()) {
        if (key.startsWith(`${feature}:`)) {
          this.localCache.delete(key);
        }
      }
    } else {
      this.localCache.clear();
    }
  }
}

// ==================== Factory Function ====================

export function createMultiRegionEvaluator(
  config: Partial<MultiRegionConfig>
): MultiRegionFlagEvaluator {
  const defaultConfig: MultiRegionConfig = {
    currentRegion: (process.env.REGION as Region) || 'us-east-1',
    availableRegions: {
      'us-east-1': {
        endpoint: process.env.FEATURE_FLAG_US_EAST_1 || 'https://flags-us-east.example.com/evaluate',
        timeout: 2000,
        cacheTTL: 30000,
        fallbackToGlobal: true,
      },
      'eu-west-1': {
        endpoint: process.env.FEATURE_FLAG_EU_WEST_1 || 'https://flags-eu-west.example.com/evaluate',
        timeout: 2000,
        cacheTTL: 30000,
        fallbackToGlobal: true,
      },
      'ap-southeast-1': {
        endpoint: process.env.FEATURE_FLAG_AP_SOUTHEAST_1 || 'https://flags-ap.example.com/evaluate',
        timeout: 3000,
        cacheTTL: 30000,
        fallbackToGlobal: true,
      },
    } as Record<Region, RegionConfig>,
    globalEndpoint: process.env.FEATURE_FLAG_GLOBAL_ENDPOINT,
    consistentAssignment: true,
    assignmentSalt: process.env.ASSIGNMENT_SALT,
  };

  return new MultiRegionFlagEvaluator({ ...defaultConfig, ...config });
}

// ==================== Singleton (for backward compatibility) ====================

let _evaluator: MultiRegionFlagEvaluator | null = null;

export function getMultiRegionEvaluator(
  config?: Partial<MultiRegionConfig>
): MultiRegionFlagEvaluator {
  if (!_evaluator) {
    _evaluator = createMultiRegionEvaluator(config || {});
  }
  return _evaluator;
}

// ==================== Convenience Function ====================

export async function evaluateFeatureFlag(
  feature: string,
  context: EvaluationContext = {}
): Promise<{ enabled: boolean; region: Region; latency: number; cached: boolean }> {
  return getMultiRegionEvaluator().evaluate(feature, context);
}

export default {
  MultiRegionFlagEvaluator,
  createMultiRegionEvaluator,
  getMultiRegionEvaluator,
  evaluateFeatureFlag,
  type MultiRegionConfig,
  type RegionConfig,
  type EvaluationContext,
  type Region,
};
