/**
 * Cross-Experiment Analysis for Interaction Detection
 * 
 * Analyzes multiple concurrent A/B tests to detect:
 * - Interaction effects between experiments
 * - Covariate imbalance across treatment groups
 * - Sample ratio mismatch (SRM) detection
 * - Multiple testing correction (Bonferroni, BH-FDR)
 * 
 * Based on:
 * - Kohavi et al. (2020). Trustworthy Online Controlled Experiments
 * - Deng et al. (2016). Sensible Estimation of Incrementality
 * 
 * @module lib/cross-experiment
 */

import { logger } from '@/lib/logger';
import type { ExperimentAnalysis, ExperimentMetric } from '@/lib/ab-testing';

export interface ExperimentContext {
  experimentId: string;
  userId: string;
  assignedGroup: 'control' | 'treatment';
  covariates: Record<string, any>;
  metrics: Record<ExperimentMetric, number>;
}

export interface InteractionAnalysis {
  experiments: string[];
  interactions: Array<{
    experiment1: string;
    experiment2: string;
    metric: ExperimentMetric;
    interactionEffect: number;
    pValue: number;
    significant: boolean;
    interpretation: string;
  }>;
  multipleTestingCorrection: {
    method: 'bonferroni' | 'benjamini-hochberg';
    adjustedPValues: Record<string, number>;
    significantAfterCorrection: string[];
  };
  recommendations: Array<{
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    action: string;
    rationale: string;
  }>;
}

export interface SRMCheck {
  experimentId: string;
  expectedRatio: number; // e.g., 0.5 for 50/50 split
  observedRatio: number;
  chiSquare: number;
  pValue: number;
  srmDetected: boolean;
  recommendation?: string;
}

export class CrossExperimentAnalyzer {
  private contexts: Map<string, ExperimentContext[]> = new Map(); // experimentId -> contexts
  
  constructor() {}

  /**
   * Add observation context for analysis
   */
  addContext(context: ExperimentContext): void {
    const experimentContexts = this.contexts.get(context.experimentId) || [];
    experimentContexts.push(context);
    this.contexts.set(context.experimentId, experimentContexts);
  }

  /**
   * Check for Sample Ratio Mismatch (SRM)
   * SRM indicates assignment bias or data quality issues
   */
  checkSRM(experimentId: string, expectedRatio: number = 0.5): SRMCheck {
    const contexts = this.contexts.get(experimentId) || [];
    if (contexts.length === 0) {
      return {
        experimentId,
        expectedRatio,
        observedRatio: 0,
        chiSquare: 0,
        pValue: 1,
        srmDetected: false,
      };
    }
    
    const treatmentCount = contexts.filter(c => c.assignedGroup === 'treatment').length;
    const totalCount = contexts.length;
    const observedRatio = totalCount > 0 ? treatmentCount / totalCount : 0;
    
    // Chi-square test for proportions
    const expectedTreatment = totalCount * expectedRatio;
    const expectedControl = totalCount * (1 - expectedRatio);
    
    const chiSquare = 
      Math.pow(treatmentCount - expectedTreatment, 2) / expectedTreatment +
      Math.pow((totalCount - treatmentCount) - expectedControl, 2) / expectedControl;
    
    // Approximate p-value using chi-square distribution with 1 df
    // Simplified: use normal approximation for large samples
    const pValue = totalCount > 30 
      ? 2 * (1 - this.normalCdf(Math.sqrt(chiSquare)))
      : 0.10;
    
    // SRM detected if p < 0.001 (conservative threshold)
    const srmDetected = pValue < 0.001;
    
    let recommendation: string | undefined;
    if (srmDetected) {
      recommendation = `SRM detected (p=${pValue.toFixed(4)}). Check: assignment logic, data pipeline, user eligibility criteria.`;
    }
    
    return {
      experimentId,
      expectedRatio,
      observedRatio,
      chiSquare,
      pValue,
      srmDetected,
      recommendation,
    };
  }

  /**
   * Analyze interaction effects between two experiments
   */
  analyzeInteraction(
    experiment1: string,
    experiment2: string,
    metric: ExperimentMetric
  ): {
    interactionEffect: number;
    pValue: number;
    significant: boolean;
    interpretation: string;
  } {
    const ctx1 = this.contexts.get(experiment1) || [];
    const ctx2 = this.contexts.get(experiment2) || [];
    
    // Find users in both experiments
    const userMap1 = new Map(ctx1.map(c => [c.userId, c]));
    const overlapping = ctx2.filter(c => userMap1.has(c.userId))
      .map(c => ({
        exp1: userMap1.get(c.userId)!,
        exp2: c,
      }));
    
    if (overlapping.length < 50) {
      return {
        interactionEffect: 0,
        pValue: 1,
        significant: false,
        interpretation: 'Insufficient overlapping users for interaction analysis',
      };
    }
    
    // Calculate cell means for 2x2 design
    const cells = {
      cc: overlapping.filter(o => o.exp1.assignedGroup === 'control' && o.exp2.assignedGroup === 'control'),
      ct: overlapping.filter(o => o.exp1.assignedGroup === 'control' && o.exp2.assignedGroup === 'treatment'),
      tc: overlapping.filter(o => o.exp1.assignedGroup === 'treatment' && o.exp2.assignedGroup === 'control'),
      tt: overlapping.filter(o => o.exp1.assignedGroup === 'treatment' && o.exp2.assignedGroup === 'treatment'),
    };
    
    const means = {
      cc: cells.cc.length > 0 ? cells.cc.reduce((s, o) => s + o.exp1.metrics[metric], 0) / cells.cc.length : 0,
      ct: cells.ct.length > 0 ? cells.ct.reduce((s, o) => s + o.exp2.metrics[metric], 0) / cells.ct.length : 0,
      tc: cells.tc.length > 0 ? cells.tc.reduce((s, o) => s + o.exp1.metrics[metric], 0) / cells.tc.length : 0,
      tt: cells.tt.length > 0 ? cells.tt.reduce((s, o) => s + o.exp2.metrics[metric], 0) / cells.tt.length : 0,
    };
    
    // Interaction effect: (tt - tc) - (ct - cc) = tt - tc - ct + cc
    const interactionEffect = means.tt - means.tc - means.ct + means.cc;
    
    // Simplified t-test for interaction (would use ANOVA in production)
    const allValues = overlapping.map(o => 
      o.exp1.assignedGroup === 'treatment' ? o.exp1.metrics[metric] : o.exp2.metrics[metric]
    );
    const std = Math.sqrt(allValues.reduce((s, v) => s + Math.pow(v - allValues.reduce((a,b)=>a+b,0)/allValues.length, 2), 0) / (allValues.length - 1));
    const se = std / Math.sqrt(overlapping.length);
    const tStat = se > 0 ? interactionEffect / se : 0;
    const pValue = overlapping.length > 30 ? 2 * (1 - this.normalCdf(Math.abs(tStat))) : 0.10;
    
    const significant = pValue < 0.05;
    
    let interpretation: string;
    if (!significant) {
      interpretation = 'No significant interaction detected. Effects appear additive.';
    } else if (interactionEffect > 0) {
      interpretation = 'Positive interaction: combined treatment effect exceeds sum of individual effects.';
    } else {
      interpretation = 'Negative interaction: combined treatment effect is less than sum of individual effects.';
    }
    
    return { interactionEffect, pValue, significant, interpretation };
  }

  /**
   * Apply multiple testing correction
   */
  applyMultipleTestingCorrection(
    pValues: Record<string, number>,
    method: 'bonferroni' | 'benjamini-hochberg' = 'benjamini-hochberg',
    alpha: number = 0.05
  ): {
    adjustedPValues: Record<string, number>;
    significantAfterCorrection: string[];
  } {
    const entries = Object.entries(pValues);
    const adjusted: Record<string, number> = {};
    
    if (method === 'bonferroni') {
      // Simple Bonferroni: multiply by number of tests
      const n = entries.length;
      for (const [key, p] of entries) {
        adjusted[key] = Math.min(1, p * n);
      }
    } else {
      // Benjamini-Hochberg FDR control
      // Sort p-values
      const sorted = entries.map(([key, p], i) => ({ key, p, rank: i + 1 }));
      sorted.sort((a, b) => a.p - b.p);
      
      const n = sorted.length;
      let minAdjusted = 1;
      
      // Process in reverse order
      for (let i = n - 1; i >= 0; i--) {
        const { key, p, rank } = sorted[i];
        const adj = Math.min(1, (p * n) / rank);
        minAdjusted = Math.min(minAdjusted, adj);
        adjusted[key] = minAdjusted;
      }
    }
    
    // Determine significance after correction
    const significantAfterCorrection = Object.entries(adjusted)
      .filter(([, adjP]) => adjP < alpha)
      .map(([key]) => key);
    
    return { adjustedPValues: adjusted, significantAfterCorrection };
  }

  /**
   * Run full cross-experiment analysis
   */
  async analyze(
    experimentIds: string[],
    metrics: ExperimentMetric[] = ['sharpe_ratio'],
    correctionMethod: 'bonferroni' | 'benjamini-hochberg' = 'benjamini-hochberg'
  ): Promise<InteractionAnalysis> {
    const interactions: InteractionAnalysis['interactions'] = [];
    const allPValues: Record<string, number> = {};
    
    // Check SRM for each experiment
    for (const expId of experimentIds) {
      const srm = this.checkSRM(expId);
      if (srm.srmDetected) {
        logger.warn({ experiment: expId, ...srm }, 'SRM detected');
      }
    }
    
    // Analyze pairwise interactions
    for (let i = 0; i < experimentIds.length; i++) {
      for (let j = i + 1; j < experimentIds.length; j++) {
        const exp1 = experimentIds[i];
        const exp2 = experimentIds[j];
        
        for (const metric of metrics) {
          const result = this.analyzeInteraction(exp1, exp2, metric);
          
          const key = `${exp1}:${exp2}:${metric}`;
          allPValues[key] = result.pValue;
          
          interactions.push({
            experiment1: exp1,
            experiment2: exp2,
            metric,
            interactionEffect: result.interactionEffect,
            pValue: result.pValue,
            significant: result.significant,
            interpretation: result.interpretation,
          });
        }
      }
    }
    
    // Apply multiple testing correction
    const correction = this.applyMultipleTestingCorrection(allPValues, correctionMethod);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(interactions, correction, experimentIds);
    
    return {
      experiments: experimentIds,
      interactions,
      multipleTestingCorrection: {
        method: correctionMethod,
        adjustedPValues: correction.adjustedPValues,
        significantAfterCorrection: correction.significantAfterCorrection,
      },
      recommendations,
    };
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    interactions: InteractionAnalysis['interactions'],
    correction: ReturnType<typeof this.applyMultipleTestingCorrection>,
    experimentIds: string[]
  ): InteractionAnalysis['recommendations'] {
    const recommendations: InteractionAnalysis['recommendations'] = [];
    
    // Check for significant interactions
    const significantInteractions = interactions.filter(i => i.significant);
    if (significantInteractions.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Review experiment design for interaction effects',
        rationale: `${significantInteractions.length} significant interaction(s) detected. Consider sequential testing or factorial design.`,
      });
    }
    
    // Check for negative interactions
    const negativeInteractions = interactions.filter(i => i.significant && i.interactionEffect < 0);
    if (negativeInteractions.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Investigate negative interaction effects',
        rationale: 'Negative interactions may indicate feature conflicts or user experience degradation.',
      });
    }
    
    // Check multiple testing results
    if (correction.significantAfterCorrection.length < Object.keys(correction.adjustedPValues).length * 0.1) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Consider reducing number of concurrent experiments',
        rationale: 'Low proportion of significant results after correction may indicate underpowered tests or too many comparisons.',
      });
    }
    
    // General recommendation
    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'LOW',
        action: 'Continue current experiment strategy',
        rationale: 'No significant issues detected. Monitor for emerging patterns.',
      });
    }
    
    return recommendations.sort((a, b) => {
      const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return order[a.priority] - order[b.priority];
    });
  }

  /**
   * Normal CDF approximation
   */
  private normalCdf(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - prob : prob;
  }

  /**
   * Clear stored contexts (for testing or memory management)
   */
  clear(experimentId?: string): void {
    if (experimentId) {
      this.contexts.delete(experimentId);
    } else {
      this.contexts.clear();
    }
  }
}

// ==================== Singleton ====================

let _analyzer: CrossExperimentAnalyzer | null = null;

export function getCrossExperimentAnalyzer(): CrossExperimentAnalyzer {
  if (!_analyzer) {
    _analyzer = new CrossExperimentAnalyzer();
  }
  return _analyzer;
}

export default {
  CrossExperimentAnalyzer,
  getCrossExperimentAnalyzer,
  type ExperimentContext,
  type InteractionAnalysis,
  type SRMCheck,
};
