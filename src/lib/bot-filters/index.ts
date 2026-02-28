/**
 * Bot Filters Module Index
 * 
 * Экспорт всех фильтров сигналов для торговых ботов
 * @module lib/bot-filters
 */

export {
  BBSignalFilter,
  getBBSignalFilter,
  type BBSignal,
  type BBFilterResult,
} from './bb-signal-filter';

export {
  DCAEntryFilter,
  getDCAEntryFilter,
  type DCASignal,
  type DCAFilterResult,
} from './dca-entry-filter';

export {
  EnhancedSignalFilter,
  createEnhancedSignalFilter,
  type EnsembleConfig,
  type EnsembleSignal,
  type SignalRecord,
} from './enhanced-signal-filter';

export {
  VISIONSignalFilter,
  getVISIONSignalFilter,
  type VISIONSignal,
  type VISIONFilterResult,
  type VISIONFilterConfig,
} from './vision-signal-filter';

// Factory для получения фильтра по типу бота
export type BotType = 'BB' | 'DCA' | 'VISION' | 'GRID' | 'ARGUS';

export interface SignalFilter {
  evaluate(signal: any): Promise<{ approved: boolean; probability: number; confidence: number; reasons: string[] }>;
  initialize?(): Promise<void>;
  getStats?(): Promise<any>;
}

export async function getBotFilter(botType: BotType, symbol: string, config?: any): Promise<SignalFilter> {
  switch (botType) {
    case 'BB':
      const { getBBSignalFilter } = await import('./bb-signal-filter');
      return getBBSignalFilter(symbol, config?.minProbability);
    case 'DCA':
      const { getDCAEntryFilter } = await import('./dca-entry-filter');
      return getDCAEntryFilter(symbol);
    case 'VISION':
      const { getVISIONSignalFilter } = await import('./vision-signal-filter');
      return getVISIONSignalFilter(symbol, config);
    case 'GRID':
    case 'ARGUS':
      // Для GRID и ARGUS используем EnhancedSignalFilter по умолчанию
      const { createEnhancedSignalFilter } = await import('./enhanced-signal-filter');
      return createEnhancedSignalFilter(config);
    default:
      throw new Error(`Unknown bot type: ${botType}`);
  }
}

// Enhanced filter factory for advanced use cases
export function createEnsembleFilter(config?: Partial<EnsembleConfig>): EnhancedSignalFilter {
  return createEnhancedSignalFilter(config);
}

export default {
  BBSignalFilter,
  DCAEntryFilter,
  EnhancedSignalFilter,
  VISIONSignalFilter,
  getBBSignalFilter,
  getDCAEntryFilter,
  getVISIONSignalFilter,
  getBotFilter,
};
