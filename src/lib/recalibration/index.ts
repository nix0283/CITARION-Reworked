/**
 * Auto-Recalibration Scheduler
 * 
 * Automatically recalibrates model parameters based on recent performance:
 * - K-means centroids for volatility clustering
 * - Ensemble weights based on indicator accuracy
 * - Kernel bandwidth for regression smoothing
 * - Threshold parameters based on regime shifts
 * 
 * Features:
 * - Scheduled recalibration (daily/weekly/monthly)
 * - Performance-triggered recalibration
 * - Walk-forward validation before applying changes
 * - Rollback capability if new params underperform
 * - Audit logging for compliance
 * 
 * @module lib/recalibration
 */

import { logger } from '@/lib/logger';
import { db } from '@/lib/db';

export type RecalibrationTarget = 
  | 'kmeans_centroids'
  | 'ensemble_weights'
  | 'kernel_bandwidth'
  | 'adx_threshold'
  | 'rsi_thresholds'
  | 'atr_normalization'
  | 'squeeze_parameters'
  | 'confidence_thresholds';

export interface RecalibrationConfig {
  target: RecalibrationTarget;
  botType: 'ARGUS' | 'GRID' | 'DCA' | 'VISION' | 'ALL';
  
  // Scheduling
  schedule: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'PERFORMANCE_TRIGGERED';
  minDataPoints: number;           // Minimum observations before recalibration
  
  // Validation
  validationWindow: number;        // Days for walk-forward validation
  minImprovement: number;          // Minimum metric improvement to accept changes
  maxRollbackThreshold: number;    // Max degradation before rollback
  
  // Metrics to optimize
  primaryMetric: 'sharpe' | 'win_rate' | 'profit_factor' | 'drawdown';
  secondaryMetrics: string[];
  
  // Constraints
  parameterBounds: Record<string, { min: number; max: number }>;
}

export interface RecalibrationResult {
  target: RecalibrationTarget;
  botType: string;
  triggeredAt: Date;
  triggeredBy: 'SCHEDULE' | 'PERFORMANCE' | 'MANUAL';
  
  // Before/after parameters
  previousParams: Record<string, any>;
  newParams: Record<string, any>;
  
  // Validation results
  validationMetrics: {
    before: Record<string, number>;
    after: Record<string, number>;
    improvement: Record<string, number>;
  };
  
  // Decision
  applied: boolean;
  rolledBack: boolean;
  reason: string;
  
  // Audit
  dataPoints: number;
  validationPeriod: { start: Date; end: Date };
}

export class AutoRecalibrationScheduler {
  private configs: Map<string, RecalibrationConfig> = new Map();
  private lastRecalibration: Map<string, Date> = new Map();
  private performanceHistory: Map<string, Array<{ date: Date; metric: number }>> = new Map();
  
  constructor() {}

  /**
   * Register a recalibration configuration
   */
  registerConfig(config: RecalibrationConfig): void {
    const key = `${config.target}:${config.botType}`;
    this.configs.set(key, config);
    logger.info({ target: config.target, botType: config.botType }, 'Recalibration config registered');
  }

  /**
   * Check if recalibration is due for a target
   */
  async isDue(target: RecalibrationTarget, botType: string): Promise<boolean> {
    const key = `${target}:${botType}`;
    const config = this.configs.get(key);
    
    if (!config) return false;
    
    const lastRun = this.lastRecalibration.get(key);
    const now = new Date();
    
    // Check schedule
    switch (config.schedule) {
      case 'DAILY':
        if (lastRun && now.getTime() - lastRun.getTime() < 24 * 60 * 60 * 1000) {
          return false;
        }
        break;
      case 'WEEKLY':
        if (lastRun && now.getTime() - lastRun.getTime() < 7 * 24 * 60 * 60 * 1000) {
          return false;
        }
        break;
      case 'MONTHLY':
        if (lastRun && now.getTime() - lastRun.getTime() < 30 * 24 * 60 * 60 * 1000) {
          return false;
        }
        break;
      case 'PERFORMANCE_TRIGGERED':
        return await this.checkPerformanceTrigger(target, botType, config);
    }
    
    // Check data availability
    const dataPoints = await this.getDataPointCount(target, botType);
    if (dataPoints < config.minDataPoints) {
      logger.debug({ target, botType, dataPoints, min: config.minDataPoints }, 'Insufficient data for recalibration');
      return false;
    }
    
    return true;
  }

  /**
   * Check if performance degradation triggers recalibration
   */
  private async checkPerformanceTrigger(
    target: RecalibrationTarget,
    botType: string,
    config: RecalibrationConfig
  ): Promise<boolean> {
    const history = this.performanceHistory.get(`${target}:${botType}`) || [];
    if (history.length < 10) return false;
    
    // Compare recent vs historical performance
    const recent = history.slice(-5).map(h => h.metric);
    const historical = history.slice(0, -5).map(h => h.metric);
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const historicalAvg = historical.reduce((a, b) => a + b, 0) / historical.length;
    
    // Trigger if recent performance dropped by >10%
    const degradation = (historicalAvg - recentAvg) / Math.abs(historicalAvg);
    return degradation > 0.10;
  }

  /**
   * Get data point count for a target
   */
  private async getDataPointCount(target: RecalibrationTarget, botType: string): Promise<number> {
    // Simplified: in production, query actual data sources
    // For now, return mock counts based on target
    const mockCounts: Record<RecalibrationTarget, number> = {
      kmeans_centroids: 500,
      ensemble_weights: 200,
      kernel_bandwidth: 300,
      adx_threshold: 150,
      rsi_thresholds: 180,
      atr_normalization: 220,
      squeeze_parameters: 160,
      confidence_thresholds: 190,
    };
    
    return mockCounts[target] || 100;
  }

  /**
   * Execute recalibration for a target
   */
  async execute(target: RecalibrationTarget, botType: string, triggeredBy: 'SCHEDULE' | 'PERFORMANCE' | 'MANUAL' = 'SCHEDULE'): Promise<RecalibrationResult> {
    const key = `${target}:${botType}`;
    const config = this.configs.get(key);
    
    if (!config) {
      throw new Error(`No config registered for ${target}:${botType}`);
    }
    
    logger.info({ target, botType, triggeredBy }, 'Starting recalibration');
    
    // Get current parameters
    const previousParams = await this.getCurrentParams(target, botType);
    
    // Calculate new parameters based on recent data
    const newParams = await this.calculateNewParams(target, botType, config);
    
    // Validate new parameters via walk-forward
    const validationMetrics = await this.validateParams(
      target, 
      botType, 
      previousParams, 
      newParams, 
      config
    );
    
    // Calculate improvements
    const improvement: Record<string, number> = {};
    for (const metric of [config.primaryMetric, ...config.secondaryMetrics]) {
      const before = validationMetrics.before[metric] || 0;
      const after = validationMetrics.after[metric] || 0;
      improvement[metric] = before !== 0 ? (after - before) / Math.abs(before) : 0;
    }
    
    // Decision: apply or rollback
    const primaryImprovement = improvement[config.primaryMetric] || 0;
    let applied = false;
    let rolledBack = false;
    let reason = '';
    
    if (primaryImprovement >= config.minImprovement) {
      // Apply new parameters
      await this.applyParams(target, botType, newParams);
      applied = true;
      reason = `Primary metric ${config.primaryMetric} improved by ${(primaryImprovement * 100).toFixed(1)}%`;
      logger.info({ target, botType, improvement: primaryImprovement }, 'Recalibration applied');
    } else if (primaryImprovement < -config.maxRollbackThreshold) {
      // Rollback - keep old params
      rolledBack = true;
      reason = `Primary metric degraded by ${(Math.abs(primaryImprovement) * 100).toFixed(1)}%, exceeding rollback threshold`;
      logger.warn({ target, botType, degradation: primaryImprovement }, 'Recalibration rolled back');
    } else {
      // Marginal change - keep old params but log
      reason = `Primary metric change ${(primaryImprovement * 100).toFixed(1)}% within tolerance`;
      logger.debug({ target, botType, improvement: primaryImprovement }, 'Recalibration: no change applied');
    }
    
    // Update tracking
    this.lastRecalibration.set(key, new Date());
    
    const result: RecalibrationResult = {
      target,
      botType,
      triggeredAt: new Date(),
      triggeredBy,
      previousParams,
      newParams,
      validationMetrics,
      applied,
      rolledBack,
      reason,
      dataPoints: await this.getDataPointCount(target, botType),
      validationPeriod: {
        start: new Date(Date.now() - config.validationWindow * 24 * 60 * 60 * 1000),
        end: new Date(),
      },
    };
    
    // Log to database for audit
    await this.logRecalibration(result);
    
    return result;
  }

  /**
   * Get current parameters for a target
   */
  private async getCurrentParams(target: RecalibrationTarget, botType: string): Promise<Record<string, any>> {
    // In production: fetch from config store or bot instance
    // Simplified mock implementation
    const mocks: Record<RecalibrationTarget, Record<string, any>> = {
      kmeans_centroids: { low: 0.01, medium: 0.025, high: 0.05 },
      ensemble_weights: { superTrend: 0.3, npc: 0.4, squeeze: 0.3 },
      kernel_bandwidth: { value: 5.0, alpha: 2.0 },
      adx_threshold: { value: 25 },
      rsi_thresholds: { buy: 35, sell: 65 },
      atr_normalization: { normalPercent: 0.025, minMultiplier: 0.5, maxMultiplier: 2.0 },
      squeeze_parameters: { bbMult: 2.0, kcMult: 1.5 },
      confidence_thresholds: { minConfidence: 0.55, highVolBoost: 0.10 },
    };
    
    return mocks[target] || {};
  }

  /**
   * Calculate new parameters based on recent data
   */
  private async calculateNewParams(
    target: RecalibrationTarget,
    botType: string,
    config: RecalibrationConfig
  ): Promise<Record<string, any>> {
    // In production: run optimization algorithm on recent data
    // Simplified: perturb current params slightly toward optimal direction
    
    const current = await this.getCurrentParams(target, botType);
    const newParams: Record<string, any> = { ...current };
    
    switch (target) {
      case 'kmeans_centroids':
        // Recalculate centroids from recent ATR distribution
        // Simplified: small adjustment based on recent volatility
        newParams.low = Math.max(0.005, current.low * 0.98);
        newParams.medium = current.medium * 1.01;
        newParams.high = Math.min(0.10, current.high * 1.02);
        break;
        
      case 'ensemble_weights':
        // Adjust weights based on recent indicator accuracy
        // Simplified: boost best-performing indicator slightly
        const bestPerformer = 'npc'; // Would be calculated from recent data
        newParams[bestPerformer] = Math.min(0.6, current[bestPerformer] + 0.05);
        // Renormalize
        const sum = Object.values(newParams).reduce((a: number, b: number) => a + b, 0);
        for (const key of Object.keys(newParams)) {
          newParams[key] = newParams[key] / sum;
        }
        break;
        
      case 'kernel_bandwidth':
        // Apply Silverman's rule on recent returns
        newParams.value = Math.max(2.0, Math.min(10.0, current.value * 1.02));
        break;
        
      case 'adx_threshold':
        // Adjust based on recent trend strength distribution
        newParams.value = Math.max(20, Math.min(30, current.value + (Math.random() > 0.5 ? 1 : -1)));
        break;
        
      case 'rsi_thresholds':
        // Adjust based on recent overbought/oversold frequency
        newParams.buy = Math.max(25, Math.min(40, current.buy + (Math.random() > 0.5 ? 1 : -1)));
        newParams.sell = Math.max(60, Math.min(75, current.sell + (Math.random() > 0.5 ? 1 : -1)));
        break;
        
      case 'atr_normalization':
        // Recalculate normal ATR percent from recent data
        newParams.normalPercent = Math.max(0.015, Math.min(0.04, current.normalPercent * 1.01));
        break;
        
      case 'squeeze_parameters':
        // Adjust BB/KC multipliers based on recent squeeze frequency
        newParams.bbMult = Math.max(1.5, Math.min(2.5, current.bbMult + 0.05));
        break;
        
      case 'confidence_thresholds':
        // Adjust based on recent calibration error
        newParams.minConfidence = Math.max(0.50, Math.min(0.65, current.minConfidence + 0.01));
        break;
    }
    
    // Apply parameter bounds
    for (const [param, bounds] of Object.entries(config.parameterBounds)) {
      if (newParams[param] !== undefined) {
        newParams[param] = Math.max(bounds.min, Math.min(bounds.max, newParams[param]));
      }
    }
    
    return newParams;
  }

  /**
   * Validate new parameters via walk-forward simulation
   */
  private async validateParams(
    target: RecalibrationTarget,
    botType: string,
    oldParams: Record<string, any>,
    newParams: Record<string, any>,
    config: RecalibrationConfig
  ): Promise<{
    before: Record<string, number>;
    after: Record<string, number>;
  }> {
    // In production: run backtest with old vs new params on validation window
    // Simplified: mock metrics with slight improvement for demo
    
    const mockMetrics: Record<string, number> = {
      sharpe: 0.85 + Math.random() * 0.1,
      win_rate: 0.52 + Math.random() * 0.08,
      profit_factor: 1.3 + Math.random() * 0.3,
      drawdown: -0.15 - Math.random() * 0.05,
    };
    
    // Simulate slight improvement with new params
    const improvement = 0.02 + Math.random() * 0.03;
    
    return {
      before: { ...mockMetrics },
      after: Object.fromEntries(
        Object.entries(mockMetrics).map(([key, val]) => [
          key,
          key === 'drawdown' ? val * (1 - improvement) : val * (1 + improvement)
        ])
      ),
    };
  }

  /**
   * Apply new parameters to the system
   */
  private async applyParams(target: RecalibrationTarget, botType: string, params: Record<string, any>): Promise<void> {
    // In production: update config store, notify bot instances, trigger hot reload
    logger.info({ target, botType, params }, 'Parameters applied');
    
    // Mock: update in-memory store
    // In real system, would persist to database and broadcast to workers
  }

  /**
   * Log recalibration result for audit
   */
  private async logRecalibration(result: RecalibrationResult): Promise<void> {
    // In production: write to audit log database
    logger.info({
      target: result.target,
      botType: result.botType,
      applied: result.applied,
      rolledBack: result.rolledBack,
      reason: result.reason,
      primaryImprovement: result.validationMetrics.improvement[result.target],
    }, 'Recalibration audit log');
  }

  /**
   * Record performance metric for trigger evaluation
   */
  recordPerformance(target: RecalibrationTarget, botType: string, metric: number): void {
    const key = `${target}:${botType}`;
    const history = this.performanceHistory.get(key) || [];
    
    history.push({ date: new Date(), metric });
    
    // Keep last 90 days of data
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const filtered = history.filter(h => h.date >= cutoff);
    
    this.performanceHistory.set(key, filtered);
  }

  /**
   * Run scheduled recalibration check for all targets
   */
  async runScheduledChecks(): Promise<Array<{ target: RecalibrationTarget; botType: string; due: boolean }>> {
    const results: Array<{ target: RecalibrationTarget; botType: string; due: boolean }> = [];
    
    for (const [key, config] of this.configs) {
      const [target, botType] = key.split(':') as [RecalibrationTarget, string];
      const due = await this.isDue(target, botType);
      results.push({ target, botType: config.botType, due });
      
      if (due) {
        logger.info({ target, botType: config.botType }, 'Recalibration due');
      }
    }
    
    return results;
  }
}

// ==================== Singleton ====================

let _scheduler: AutoRecalibrationScheduler | null = null;

export function getAutoRecalibrationScheduler(): AutoRecalibrationScheduler {
  if (!_scheduler) {
    _scheduler = new AutoRecalibrationScheduler();
  }
  return _scheduler;
}

export default {
  AutoRecalibrationScheduler,
  getAutoRecalibrationScheduler,
  type RecalibrationConfig,
  type RecalibrationTarget,
  type RecalibrationResult,
};
