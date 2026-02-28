/**
 * Parameter Versioning with Git-like History
 * 
 * Tracks changes to model parameters with:
 * - Immutable version snapshots
 * - Diff comparison between versions
 * - Branching for experimental configs
 * - Rollback to any previous version
 * - Audit trail with author/metadata
 * 
 * Inspired by Git: commits, branches, tags, diffs
 * 
 * @module lib/versioning
 */

import { logger } from '@/lib/logger';
import { createHash } from 'crypto';

export type ParamType = 'number' | 'string' | 'boolean' | 'object' | 'array';

export interface ParamDefinition {
  name: string;
  type: ParamType;
  description: string;
  bounds?: { min: number; max: number }; // For numeric params
  defaultValue: any;
}

export interface ParamVersion {
  id: string;              // SHA-256 hash of params + metadata
  parent?: string;         // Parent version ID (for history chain)
  branch: string;          // Branch name (main, experiment-xyz, etc.)
  params: Record<string, any>;
  metadata: {
    author: string;
    message: string;
    timestamp: Date;
    tags?: string[];
    experimentId?: string;
    validationMetrics?: Record<string, number>;
  };
}

export interface VersionDiff {
  added: Array<{ param: string; value: any }>;
  removed: Array<{ param: string; previousValue: any }>;
  modified: Array<{
    param: string;
    previousValue: any;
    newValue: any;
    changePct?: number; // For numeric params
  }>;
  unchanged: string[];
}

export interface VersioningConfig {
  maxHistoryLength: number;    // Keep last N versions per branch (default: 100)
  requireValidation: boolean;  // Require validation metrics before tagging
  autoTagOnImprovement: boolean; // Auto-tag versions that improve metrics
}

export class ParameterVersioning {
  private config: VersioningConfig;
  private versions: Map<string, ParamVersion> = new Map(); // id -> version
  private branchHeads: Map<string, string> = new Map();    // branch -> latest version id
  private paramDefinitions: Map<string, ParamDefinition> = new Map();
  
  constructor(config: Partial<VersioningConfig> = {}) {
    this.config = {
      maxHistoryLength: 100,
      requireValidation: true,
      autoTagOnImprovement: true,
      ...config,
    };
  }

  /**
   * Register a parameter definition for validation
   */
  registerParam(def: ParamDefinition): void {
    this.paramDefinitions.set(def.name, def);
  }

  /**
   * Create a new version (commit)
   */
  commit(
    params: Record<string, any>,
    metadata: {
      author: string;
      message: string;
      branch?: string;
      tags?: string[];
      experimentId?: string;
      validationMetrics?: Record<string, number>;
    }
  ): ParamVersion {
    const branch = metadata.branch || 'main';
    const parent = this.branchHeads.get(branch);
    
    // Validate params against definitions
    this.validateParams(params);
    
    // Generate version ID (SHA-256 of params + metadata)
    const id = this.generateVersionId(params, metadata, parent);
    
    const version: ParamVersion = {
      id,
      parent,
      branch,
      params: { ...params }, // Immutable copy
      metadata: {
        ...metadata,
        timestamp: new Date(),
      },
    };
    
    // Store version
    this.versions.set(id, version);
    this.branchHeads.set(branch, id);
    
    // Trim history if needed
    this.trimBranchHistory(branch);
    
    // Auto-tag if improvement detected
    if (this.config.autoTagOnImprovement && metadata.validationMetrics) {
      this.checkAutoTag(version, metadata.validationMetrics);
    }
    
    logger.info({ id, branch, author: metadata.author }, 'Parameter version committed');
    
    return version;
  }

  /**
   * Validate params against registered definitions
   */
  private validateParams(params: Record<string, any>): void {
    for (const [name, value] of Object.entries(params)) {
      const def = this.paramDefinitions.get(name);
      if (!def) {
        logger.warn({ param: name }, 'Unknown parameter - not validated');
        continue;
      }
      
      // Type check
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== def.type) {
        throw new Error(`Parameter ${name}: expected ${def.type}, got ${actualType}`);
      }
      
      // Bounds check for numeric params
      if (def.type === 'number' && def.bounds && typeof value === 'number') {
        if (value < def.bounds.min || value > def.bounds.max) {
          throw new Error(
            `Parameter ${name}: value ${value} outside bounds [${def.bounds.min}, ${def.bounds.max}]`
          );
        }
      }
    }
  }

  /**
   * Generate deterministic version ID
   */
  private generateVersionId(
    params: Record<string, any>,
    metadata: any,
    parent?: string
  ): string {
    const content = JSON.stringify({
      params: this.sortObject(params),
      parent,
      branch: metadata.branch,
      author: metadata.author,
      message: metadata.message,
      timestamp: new Date().toISOString(),
    });
    
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Sort object keys for consistent hashing
   */
  private sortObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.sortObject(item));
    
    const sorted: Record<string, any> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = this.sortObject(obj[key]);
    }
    return sorted;
  }

  /**
   * Get version by ID
   */
  getVersion(id: string): ParamVersion | undefined {
    return this.versions.get(id);
  }

  /**
   * Get latest version on a branch
   */
  getHead(branch: string = 'main'): ParamVersion | undefined {
    const headId = this.branchHeads.get(branch);
    return headId ? this.versions.get(headId) : undefined;
  }

  /**
   * List versions on a branch
   */
  listVersions(branch: string = 'main', limit: number = 20): ParamVersion[] {
    const versions: ParamVersion[] = [];
    let currentId = this.branchHeads.get(branch);
    
    while (currentId && versions.length < limit) {
      const version = this.versions.get(currentId);
      if (!version) break;
      
      versions.push(version);
      currentId = version.parent;
    }
    
    return versions;
  }

  /**
   * Compare two versions and generate diff
   */
  diff(versionId1: string, versionId2: string): VersionDiff | null {
    const v1 = this.versions.get(versionId1);
    const v2 = this.versions.get(versionId2);
    
    if (!v1 || !v2) return null;
    
    const diff: VersionDiff = {
      added: [],
      removed: [],
      modified: [],
      unchanged: [],
    };
    
    const allKeys = new Set([...Object.keys(v1.params), ...Object.keys(v2.params)]);
    
    for (const key of allKeys) {
      const inV1 = key in v1.params;
      const inV2 = key in v2.params;
      
      if (inV2 && !inV1) {
        diff.added.push({ param: key, value: v2.params[key] });
      } else if (inV1 && !inV2) {
        diff.removed.push({ param: key, previousValue: v1.params[key] });
      } else if (v1.params[key] !== v2.params[key]) {
        const prev = v1.params[key];
        const curr = v2.params[key];
        
        const entry: VersionDiff['modified'][0] = {
          param: key,
          previousValue: prev,
          newValue: curr,
        };
        
        // Calculate change percentage for numeric params
        if (typeof prev === 'number' && typeof curr === 'number' && prev !== 0) {
          entry.changePct = ((curr - prev) / Math.abs(prev)) * 100;
        }
        
        diff.modified.push(entry);
      } else {
        diff.unchanged.push(key);
      }
    }
    
    return diff;
  }

  /**
   * Checkout a specific version (get params)
   */
  checkout(versionId: string): Record<string, any> | null {
    const version = this.versions.get(versionId);
    return version ? { ...version.params } : null;
  }

  /**
   * Create a new branch from a version
   */
  createBranch(branchName: string, fromVersionId?: string): boolean {
    const fromId = fromVersionId || this.branchHeads.get('main');
    if (!fromId) return false;
    
    if (this.branchHeads.has(branchName)) {
      logger.warn({ branch: branchName }, 'Branch already exists');
      return false;
    }
    
    this.branchHeads.set(branchName, fromId);
    logger.info({ branch: branchName, from: fromId }, 'Branch created');
    return true;
  }

  /**
   * Merge a branch into main (simple: use branch head params)
   */
  mergeBranch(branch: string, metadata: { author: string; message: string }): ParamVersion | null {
    const branchHead = this.branchHeads.get(branch);
    if (!branchHead) return null;
    
    const branchVersion = this.versions.get(branchHead);
    if (!branchVersion) return null;
    
    // Create merge commit on main
    return this.commit(branchVersion.params, {
      ...metadata,
      branch: 'main',
      tags: [`merged-from-${branch}`],
    });
  }

  /**
   * Add/remove tags from a version
   */
  tag(versionId: string, tags: string[], remove: boolean = false): boolean {
    const version = this.versions.get(versionId);
    if (!version) return false;
    
    if (remove) {
      version.metadata.tags = version.metadata.tags?.filter(t => !tags.includes(t));
    } else {
      version.metadata.tags = [...(version.metadata.tags || []), ...tags];
    }
    
    return true;
  }

  /**
   * Find versions by tag
   */
  findByTag(tag: string): ParamVersion[] {
    return Array.from(this.versions.values()).filter(
      v => v.metadata.tags?.includes(tag)
    );
  }

  /**
   * Rollback to a previous version
   */
  rollback(versionId: string, metadata: { author: string; reason: string }): ParamVersion | null {
    const target = this.versions.get(versionId);
    if (!target) return null;
    
    return this.commit(target.params, {
      ...metadata,
      branch: target.branch,
      tags: ['rollback'],
    });
  }

  /**
   * Export version history for backup/audit
   */
  exportHistory(branch?: string): Record<string, any> {
    const versions = branch 
      ? this.listVersions(branch, Infinity)
      : Array.from(this.versions.values());
    
    return {
      exportedAt: new Date().toISOString(),
      branch: branch || 'all',
      versions: versions.map(v => ({
        ...v,
        metadata: {
          ...v.metadata,
          timestamp: v.metadata.timestamp.toISOString(),
        },
      })),
    };
  }

  // ==================== Private Helpers ====================

  private trimBranchHistory(branch: string): void {
    const versions = this.listVersions(branch, Infinity);
    
    if (versions.length > this.config.maxHistoryLength) {
      const toRemove = versions.slice(this.config.maxHistoryLength);
      for (const v of toRemove) {
        this.versions.delete(v.id);
      }
      logger.debug({ branch, removed: toRemove.length }, 'Trimmed branch history');
    }
  }

  private checkAutoTag(version: ParamVersion, metrics: Record<string, number>): void {
    const head = this.getHead(version.branch);
    if (!head || !head.metadata.validationMetrics) return;
    
    // Check if primary metric improved
    const primaryMetric = 'sharpe'; // Configurable
    const prevValue = head.metadata.validationMetrics[primaryMetric];
    const currValue = metrics[primaryMetric];
    
    if (prevValue && currValue && currValue > prevValue * 1.02) { // 2% improvement
      this.tag(version.id, [`improvement-${primaryMetric}`]);
      logger.info({ version: version.id, metric: primaryMetric }, 'Auto-tagged for improvement');
    }
  }
}

// ==================== Singleton ====================

let _versioning: ParameterVersioning | null = null;

export function getParameterVersioning(config?: Partial<VersioningConfig>): ParameterVersioning {
  if (!_versioning) {
    _versioning = new ParameterVersioning(config);
  }
  return _versioning;
}

export default {
  ParameterVersioning,
  getParameterVersioning,
  type VersioningConfig,
  type ParamDefinition,
  type ParamVersion,
  type VersionDiff,
};
