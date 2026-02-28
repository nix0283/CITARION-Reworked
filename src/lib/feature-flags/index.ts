/**
 * Feature Flag System for Gradual Rollout
 * 
 * Supports:
 * - Percentage-based rollout
 * - Symbol/user-based targeting
 * - A/B testing with control groups
 * - Dynamic updates without restart
 * - Audit logging for compliance
 * 
 * @module lib/feature-flags
 */

import { logger } from '@/lib/logger';

export type FeatureName = 
  | 'argus_adx_filter'
  | 'argus_supertrend'
  | 'argus_squeeze'
  | 'grid_rsi_filter'
  | 'grid_npc_filter'
  | 'grid_squeeze_exit'
  | 'grid_bollinger_position'
  | 'dca_atr_sizing'
  | 'dca_macd_confirmation'
  | 'dca_ensemble_filter'
  | 'vision_kernel_regression'
  | 'vision_npc_baseline'
  | 'vision_supertrend_regime'
  | 'universal_ensemble_filter'
  | 'cross_bot_correlation'
  | 'ab_testing_framework'
  | 'auto_recalibration';

export interface FeatureConfig {
  enabled: boolean;              // Master switch
  rolloutPercentage: number;     // 0-100 for gradual rollout
  targetSymbols?: string[];      // Optional: only enable for specific symbols
  excludeSymbols?: string[];     // Optional: exclude specific symbols
  targetUsers?: string[];        // Optional: only enable for specific users
  minConfidence?: number;        // Optional: minimum confidence to activate
  abTestGroup?: 'control' | 'treatment'; // For A/B testing
  metadata?: Record<string, any>; // Additional config data
}

export interface FeatureEvaluation {
  feature: FeatureName;
  enabled: boolean;
  reason: string;
  config: FeatureConfig;
  evaluatedAt: Date;
}

export class FeatureFlagManager {
  private flags: Map<FeatureName, FeatureConfig> = new Map();
  private evaluationLog: FeatureEvaluation[] = [];
  private maxLogSize: number = 1000;

  constructor(initialFlags?: Partial<Record<FeatureName, Partial<FeatureConfig>>>) {
    // Initialize with defaults
    this.initializeDefaults();
    
    // Apply overrides
    if (initialFlags) {
      for (const [name, config] of Object.entries(initialFlags)) {
        this.updateFlag(name as FeatureName, config);
      }
    }
  }

  /**
   * Initialize with safe defaults (all disabled for gradual rollout)
   */
  private initializeDefaults(): void {
    const defaults: Record<FeatureName, FeatureConfig> = {
      // Argus enhancements (Phase 1)
      argus_adx_filter: { enabled: false, rolloutPercentage: 0 },
      argus_supertrend: { enabled: false, rolloutPercentage: 0 },
      argus_squeeze: { enabled: false, rolloutPercentage: 0 },
      
      // Grid filters (Phase 2)
      grid_rsi_filter: { enabled: false, rolloutPercentage: 0 },
      grid_npc_filter: { enabled: false, rolloutPercentage: 0 },
      grid_squeeze_exit: { enabled: false, rolloutPercentage: 0 },
      grid_bollinger_position: { enabled: false, rolloutPercentage: 0 },
      
      // DCA enhancements (Phase 3)
      dca_atr_sizing: { enabled: false, rolloutPercentage: 0 },
      dca_macd_confirmation: { enabled: false, rolloutPercentage: 0 },
      dca_ensemble_filter: { enabled: false, rolloutPercentage: 0 },
      
      // Vision refinements (Phase 4)
      vision_kernel_regression: { enabled: false, rolloutPercentage: 0 },
      vision_npc_baseline: { enabled: false, rolloutPercentage: 0 },
      vision_supertrend_regime: { enabled: false, rolloutPercentage: 0 },
      
      // Universal ensemble (Phase 5)
      universal_ensemble_filter: { enabled: false, rolloutPercentage: 0 },
      
      // v2.7.0 features
      cross_bot_correlation: { enabled: false, rolloutPercentage: 0 },
      ab_testing_framework: { enabled: false, rolloutPercentage: 0 },
      auto_recalibration: { enabled: false, rolloutPercentage: 0 },
    };

    for (const [name, config] of Object.entries(defaults)) {
      this.flags.set(name as FeatureName, config);
    }
  }

  /**
   * Evaluate if a feature is enabled for a given context
   */
  evaluate(
    feature: FeatureName,
    context: {
      symbol?: string;
      userId?: string;
      confidence?: number;
      randomSeed?: number; // For deterministic testing
    } = {}
  ): FeatureEvaluation {
    const config = this.flags.get(feature);
    const timestamp = new Date();
    
    // Default: disabled if not configured
    if (!config) {
      const result: FeatureEvaluation = {
        feature,
        enabled: false,
        reason: 'Feature not configured',
        config: { enabled: false, rolloutPercentage: 0 },
        evaluatedAt: timestamp,
      };
      this.logEvaluation(result);
      return result;
    }

    // Master switch check
    if (!config.enabled) {
      const result: FeatureEvaluation = {
        feature,
        enabled: false,
        reason: 'Master switch disabled',
        config,
        evaluatedAt: timestamp,
      };
      this.logEvaluation(result);
      return result;
    }

    // Symbol targeting
    if (context.symbol) {
      if (config.excludeSymbols?.includes(context.symbol)) {
        const result: FeatureEvaluation = {
          feature,
          enabled: false,
          reason: `Symbol ${context.symbol} excluded`,
          config,
          evaluatedAt: timestamp,
        };
        this.logEvaluation(result);
        return result;
      }
      if (config.targetSymbols?.length && !config.targetSymbols.includes(context.symbol)) {
        const result: FeatureEvaluation = {
          feature,
          enabled: false,
          reason: `Symbol ${context.symbol} not in target list`,
          config,
          evaluatedAt: timestamp,
        };
        this.logEvaluation(result);
        return result;
      }
    }

    // User targeting
    if (context.userId && config.targetUsers?.length && !config.targetUsers.includes(context.userId)) {
      const result: FeatureEvaluation = {
        feature,
        enabled: false,
        reason: `User ${context.userId} not in target list`,
        config,
        evaluatedAt: timestamp,
      };
      this.logEvaluation(result);
      return result;
    }

    // Confidence threshold
    if (context.confidence !== undefined && config.minConfidence !== undefined) {
      if (context.confidence < config.minConfidence) {
        const result: FeatureEvaluation = {
          feature,
          enabled: false,
          reason: `Confidence ${context.confidence.toFixed(2)} < threshold ${config.minConfidence}`,
          config,
          evaluatedAt: timestamp,
        };
        this.logEvaluation(result);
        return result;
      }
    }

    // Rollout percentage (deterministic based on symbol+feature hash)
    if (config.rolloutPercentage < 100) {
      const hash = this.hashString(`${feature}:${context.symbol || 'default'}`);
      const bucket = hash % 100;
      
      if (bucket >= config.rolloutPercentage) {
        const result: FeatureEvaluation = {
          feature,
          enabled: false,
          reason: `Rollout ${config.rolloutPercentage}%: bucket ${bucket} not selected`,
          config,
          evaluatedAt: timestamp,
        };
        this.logEvaluation(result);
        return result;
      }
    }

    // A/B test group assignment
    if (config.abTestGroup === 'control') {
      const result: FeatureEvaluation = {
        feature,
        enabled: false,
        reason: 'A/B test control group',
        config,
        evaluatedAt: timestamp,
      };
      this.logEvaluation(result);
      return result;
    }

    // All checks passed
    const result: FeatureEvaluation = {
      feature,
      enabled: true,
      reason: 'All checks passed',
      config,
      evaluatedAt: timestamp,
    };
    this.logEvaluation(result);
    return result;
  }

  /**
   * Update feature configuration
   */
  updateFlag(feature: FeatureName, updates: Partial<FeatureConfig>): void {
    const existing = this.flags.get(feature) || { enabled: false, rolloutPercentage: 0 };
    this.flags.set(feature, { ...existing, ...updates });
    
    logger.info({ feature, updates }, 'Feature flag updated');
  }

  /**
   * Enable feature with gradual rollout
   */
  enableWithRollout(feature: FeatureName, percentage: number, options?: Partial<FeatureConfig>): void {
    this.updateFlag(feature, {
      enabled: true,
      rolloutPercentage: Math.max(0, Math.min(100, percentage)),
      ...options,
    });
  }

  /**
   * Disable feature
   */
  disable(feature: FeatureName): void {
    this.updateFlag(feature, { enabled: false });
  }

  /**
   * Get current configuration for a feature
   */
  getConfig(feature: FeatureName): FeatureConfig | undefined {
    return this.flags.get(feature);
  }

  /**
   * Get all enabled features for a context
   */
  getEnabledFeatures(context: { symbol?: string; userId?: string }): FeatureName[] {
    const enabled: FeatureName[] = [];
    
    for (const feature of this.flags.keys()) {
      if (this.evaluate(feature, context).enabled) {
        enabled.push(feature);
      }
    }
    
    return enabled;
  }

  /**
   * Get evaluation log for audit/compliance
   */
  getEvaluationLog(feature?: FeatureName, since?: Date): FeatureEvaluation[] {
    return this.evaluationLog.filter(entry => {
      if (feature && entry.feature !== feature) return false;
      if (since && entry.evaluatedAt < since) return false;
      return true;
    });
  }

  /**
   * Clear evaluation log
   */
  clearLog(): void {
    this.evaluationLog = [];
  }

  /**
   * Export configuration for backup/migration
   */
  exportConfig(): Record<FeatureName, FeatureConfig> {
    const result: Record<FeatureName, FeatureConfig> = {} as any;
    for (const [name, config] of this.flags) {
      result[name] = { ...config };
    }
    return result;
  }

  /**
   * Import configuration from backup
   */
  importConfig(configs: Partial<Record<FeatureName, Partial<FeatureConfig>>>): void {
    for (const [name, updates] of Object.entries(configs)) {
      if (this.flags.has(name as FeatureName)) {
        this.updateFlag(name as FeatureName, updates);
      }
    }
  }

  // ==================== Private Helpers ====================

  private logEvaluation(entry: FeatureEvaluation): void {
    this.evaluationLog.push(entry);
    
    // Trim log if too large
    if (this.evaluationLog.length > this.maxLogSize) {
      this.evaluationLog = this.evaluationLog.slice(-this.maxLogSize);
    }
    
    // Log high-value evaluations
    if (entry.enabled || entry.feature.includes('ab_test')) {
      logger.debug({
        feature: entry.feature,
        enabled: entry.enabled,
        reason: entry.reason,
        rollout: entry.config.rolloutPercentage,
      }, 'Feature flag evaluated');
    }
  }

  private hashString(str: string): number {
    // Simple deterministic hash for rollout bucketing
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

// ==================== Singleton ====================

let _flagManager: FeatureFlagManager | null = null;

export function getFeatureFlagManager(
  initialFlags?: Partial<Record<FeatureName, Partial<FeatureConfig>>>
): FeatureFlagManager {
  if (!_flagManager) {
    _flagManager = new FeatureFlagManager(initialFlags);
  }
  return _flagManager;
}

// ==================== Convenience Functions ====================

export function isEnabled(
  feature: FeatureName,
  context?: { symbol?: string; userId?: string; confidence?: number }
): boolean {
  return getFeatureFlagManager().evaluate(feature, context).enabled;
}

export function enableFeature(
  feature: FeatureName,
  rolloutPercentage: number,
  options?: Partial<FeatureConfig>
): void {
  getFeatureFlagManager().enableWithRollout(feature, rolloutPercentage, options);
}

export function disableFeature(feature: FeatureName): void {
  getFeatureFlagManager().disable(feature);
}

export default {
  FeatureFlagManager,
  getFeatureFlagManager,
  isEnabled,
  enableFeature,
  disableFeature,
  type FeatureName,
  type FeatureConfig,
  type FeatureEvaluation,
};
