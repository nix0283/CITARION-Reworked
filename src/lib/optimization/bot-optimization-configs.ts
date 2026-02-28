/**
 * Bot Optimization Configurations
 * 
 * Конфигурации оптимизации для каждого типа бота
 * 
 * @module lib/optimization/bot-optimization-configs
 */

// ==================== TYPES ====================

export type BotType = 'GRID' | 'DCA' | 'BB' | 'ARGUS' | 'VISION';

export type OptimizationMethod = 'PSO' | 'GA' | 'HYBRID';

export type MLFilterMethod = 'RANDOM_FOREST' | 'XGBOOST' | 'LOGISTIC' | 'LAWRENCE';

export type RegimeDetectionMethod = 'KMEANS' | 'RULES' | 'GMM';

export interface BotOptimizationConfig {
  botType: BotType;

  // Параметры для оптимизации
  parameters: {
    name: string;
    min: number;
    max: number;
    step?: number;
    type: 'continuous' | 'discrete';
  }[];

  // Метод оптимизации
  optimizationMethod: OptimizationMethod;

  // ML фильтр
  mlFilter: {
    enabled: boolean;
    method: MLFilterMethod;
    minConfidence: number;
  };

  // Определение режима рынка
  regimeDetection: {
    enabled: boolean;
    method: RegimeDetectionMethod;
  };

  // Fitness функция
  fitnessWeights: {
    profit: number;
    drawdown: number;
    sharpe: number;
    winRate: number;
  };

  // Learning config
  learning: {
    enabled: boolean;
    minHistorySize: number;
    lookbackDays: number;
    retrainInterval: number; // hours
  };
}

// ==================== DEFAULT CONFIGS BY BOT TYPE ====================

export const BOT_OPTIMIZATION_CONFIGS: Record<BotType, BotOptimizationConfig> = {
  GRID: {
    botType: 'GRID',
    parameters: [
      { name: 'gridCount', min: 5, max: 50, step: 1, type: 'discrete' },
      { name: 'upperPricePercent', min: 0.01, max: 0.2, type: 'continuous' },
      { name: 'lowerPricePercent', min: 0.01, max: 0.2, type: 'continuous' },
      { name: 'takeProfitPercent', min: 0.005, max: 0.05, type: 'continuous' },
      { name: 'stopLossPercent', min: 0.02, max: 0.1, type: 'continuous' },
    ],
    optimizationMethod: 'PSO', // Быстрая оптимизация непрерывных параметров
    mlFilter: {
      enabled: true,
      method: 'LAWRENCE',
      minConfidence: 0.6,
    },
    regimeDetection: {
      enabled: true,
      method: 'KMEANS',
    },
    fitnessWeights: {
      profit: 0.3,
      drawdown: 0.3,
      sharpe: 0.2,
      winRate: 0.2,
    },
    learning: {
      enabled: true,
      minHistorySize: 50,
      lookbackDays: 90,
      retrainInterval: 168, // Weekly
    },
  },

  DCA: {
    botType: 'DCA',
    parameters: [
      { name: 'dcaLevels', min: 2, max: 10, step: 1, type: 'discrete' },
      { name: 'dcaPercent', min: 0.02, max: 0.1, type: 'continuous' },
      { name: 'dcaMultiplier', min: 1.1, max: 3.0, type: 'continuous' },
      { name: 'takeProfitPercent', min: 0.05, max: 0.2, type: 'continuous' },
      { name: 'stopLossPercent', min: 0.05, max: 0.3, type: 'continuous' },
    ],
    optimizationMethod: 'GA', // Глобальный поиск для сложной стратегии
    mlFilter: {
      enabled: true,
      method: 'LAWRENCE',
      minConfidence: 0.65,
    },
    regimeDetection: {
      enabled: true,
      method: 'RULES',
    },
    fitnessWeights: {
      profit: 0.35,
      drawdown: 0.25,
      sharpe: 0.2,
      winRate: 0.2,
    },
    learning: {
      enabled: true,
      minHistorySize: 40,
      lookbackDays: 180,
      retrainInterval: 168,
    },
  },

  BB: {
    botType: 'BB',
    parameters: [
      { name: 'bbPeriod', min: 10, max: 50, step: 1, type: 'discrete' },
      { name: 'bbDeviation', min: 1.0, max: 3.0, type: 'continuous' },
      { name: 'stochK', min: 5, max: 21, step: 1, type: 'discrete' },
      { name: 'stochD', min: 3, max: 10, step: 1, type: 'discrete' },
      { name: 'stopLossPercent', min: 0.02, max: 0.1, type: 'continuous' },
      { name: 'takeProfitPercent', min: 0.04, max: 0.2, type: 'continuous' },
    ],
    optimizationMethod: 'HYBRID', // GA + PSO для индикаторов
    mlFilter: {
      enabled: true,
      method: 'LAWRENCE',
      minConfidence: 0.6,
    },
    regimeDetection: {
      enabled: true,
      method: 'KMEANS',
    },
    fitnessWeights: {
      profit: 0.3,
      drawdown: 0.25,
      sharpe: 0.25,
      winRate: 0.2,
    },
    learning: {
      enabled: true,
      minHistorySize: 30,
      lookbackDays: 60,
      retrainInterval: 168,
    },
  },

  ARGUS: {
    botType: 'ARGUS',
    parameters: [
      { name: 'pumpThreshold5m', min: 0.03, max: 0.1, type: 'continuous' },
      { name: 'pumpThreshold15m', min: 0.05, max: 0.2, type: 'continuous' },
      { name: 'leverage', min: 5, max: 20, step: 1, type: 'discrete' },
      { name: 'positionSize', min: 20, max: 100, step: 10, type: 'discrete' },
      { name: 'stopLoss5', min: 0.03, max: 0.1, type: 'continuous' },
      { name: 'takeProfit5', min: 0.05, max: 0.2, type: 'continuous' },
    ],
    optimizationMethod: 'PSO', // Быстрая оптимизация для high-frequency
    mlFilter: {
      enabled: true,
      method: 'LAWRENCE',
      minConfidence: 0.7,
    },
    regimeDetection: {
      enabled: true,
      method: 'RULES',
    },
    fitnessWeights: {
      profit: 0.4,
      drawdown: 0.2,
      sharpe: 0.2,
      winRate: 0.2,
    },
    learning: {
      enabled: true,
      minHistorySize: 100,
      lookbackDays: 30,
      retrainInterval: 24, // Daily
    },
  },

  VISION: {
    botType: 'VISION',
    parameters: [
      { name: 'confidenceThreshold', min: 0.5, max: 0.9, type: 'continuous' },
      { name: 'lookbackDays', min: 14, max: 90, step: 1, type: 'discrete' },
      { name: 'volatilityLow', min: 0.005, max: 0.02, type: 'continuous' },
      { name: 'volatilityHigh', min: 0.03, max: 0.1, type: 'continuous' },
      { name: 'stopLossPercent', min: 0.03, max: 0.1, type: 'continuous' },
      { name: 'takeProfitPercent', min: 0.06, max: 0.2, type: 'continuous' },
    ],
    optimizationMethod: 'GA', // Глобальный поиск для ML модели
    mlFilter: {
      enabled: true,
      method: 'LAWRENCE',
      minConfidence: 0.75,
    },
    regimeDetection: {
      enabled: true,
      method: 'KMEANS',
    },
    fitnessWeights: {
      profit: 0.3,
      drawdown: 0.3,
      sharpe: 0.25,
      winRate: 0.15,
    },
    learning: {
      enabled: true,
      minHistorySize: 50,
      lookbackDays: 120,
      retrainInterval: 168,
    },
  },
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Get config for bot type
 */
export function getBotOptimizationConfig(botType: BotType): BotOptimizationConfig {
  return BOT_OPTIMIZATION_CONFIGS[botType];
}

/**
 * Get optimization method for bot type
 */
export function getOptimizationMethod(botType: BotType): OptimizationMethod {
  return BOT_OPTIMIZATION_CONFIGS[botType].optimizationMethod;
}

/**
 * Get ML filter config for bot type
 */
export function getMLFilterConfig(botType: BotType): BotOptimizationConfig['mlFilter'] {
  return BOT_OPTIMIZATION_CONFIGS[botType].mlFilter;
}

/**
 * Get regime detection config for bot type
 */
export function getRegimeDetectionConfig(botType: BotType): BotOptimizationConfig['regimeDetection'] {
  return BOT_OPTIMIZATION_CONFIGS[botType].regimeDetection;
}

/**
 * Get fitness weights for bot type
 */
export function getFitnessWeights(botType: BotType): BotOptimizationConfig['fitnessWeights'] {
  return BOT_OPTIMIZATION_CONFIGS[botType].fitnessWeights;
}

// ==================== EXPORTS ====================

export default {
  BOT_OPTIMIZATION_CONFIGS,
  getBotOptimizationConfig,
  getOptimizationMethod,
  getMLFilterConfig,
  getRegimeDetectionConfig,
  getFitnessWeights,
};
