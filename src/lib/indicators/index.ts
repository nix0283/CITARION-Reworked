/**
 * Indicators Module Index
 * 
 * Экспорт всех технических индикаторов и ML-индикаторов
 * @module lib/indicators
 */

// Built-in индикаторы
export {
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateEMA,
  calculateSMA,
  calculateATR as calculateATRIndicator,
  calculateADX,
  type IndicatorResult,
  type IndicatorConfig,
} from './builtin';

// Calculator для индикаторов
export {
  IndicatorCalculator,
  type CalculationRequest,
  type CalculationResponse,
} from './calculator';

// ML-адаптивные индикаторы
export {
  MLAdaptiveSuperTrend,
  type MLAdaptiveSuperTrendConfig,
  type SuperTrendResult,
} from './ml-adaptive-supertrend';

export {
  NeuralProbabilityChannel,
  type NeuralProbabilityChannelConfig,
  type NPCResult,
  type ProbabilityChannel,
} from './neural-probability-channel';

export {
  SqueezeMomentum,
  type SqueezeResult,
  type MomentumState,
} from './squeeze-momentum';

// Advanced индикаторы
export {
  AdaptiveSuperTrend,
  type AdaptiveSuperTrendConfig,
} from './advanced/adaptive-supertrend';

export {
  KernelRegression,
  type KernelRegressionConfig,
} from './advanced/kernel-regression';

export {
  KMeansVolatility,
  type KMeansVolatilityConfig,
  type VolatilityCluster,
} from './advanced/kmeans-volatility';

export {
  WaveTrend,
  type WaveTrendConfig,
} from './advanced/wave-trend';

// Типы для Candle данных
export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

// Factory для получения индикатора по имени
export type IndicatorName = 
  | 'RSI' | 'MACD' | 'BB' | 'EMA' | 'SMA' | 'ATR' | 'ADX'
  | 'ML_ST' | 'NPC' | 'SQZ' | 'AST' | 'KR' | 'KMV' | 'WT';

export interface IndicatorInstance {
  calculate(candles: Candle[], config?: any): any[];
}

export function getIndicator(name: IndicatorName, config?: any): IndicatorInstance {
  switch (name) {
    case 'RSI':
    case 'MACD':
    case 'BB':
    case 'EMA':
    case 'SMA':
    case 'ATR':
    case 'ADX':
      return { calculate: (candles: Candle[]) => {
        // Делегируем к builtin индикаторам
        const { calculateRSI, calculateMACD, calculateBollingerBands, calculateEMA, calculateSMA, calculateATR, calculateADX } = require('./builtin');
        const calculators: Record<string, any> = { RSI: calculateRSI, MACD: calculateMACD, BB: calculateBollingerBands, EMA: calculateEMA, SMA: calculateSMA, ATR: calculateATR, ADX: calculateADX };
        return calculators[name](candles, config);
      }};
    case 'ML_ST':
      return new MLAdaptiveSuperTrend(config);
    case 'NPC':
      return new NeuralProbabilityChannel(config);
    case 'SQZ':
      return new SqueezeMomentum();
    case 'AST':
      return new AdaptiveSuperTrend(config);
    case 'KR':
      return new KernelRegression(config);
    case 'KMV':
      return new KMeansVolatility(config);
    case 'WT':
      return new WaveTrend(config);
    default:
      throw new Error(`Unknown indicator: ${name}`);
  }
}

// Advanced utility exports
export { 
  calculateATR as calculateATRUtility,
  calculateATRPositionSize,
  getVolatilityRegime as getATRVolatilityRegime,
  applyRegimeAdjustment,
  type ATRPositionConfig,
} from '../dca/atr-position-sizing';

export default {
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateEMA,
  calculateSMA,
  calculateATR,
  calculateADX,
  IndicatorCalculator,
  MLAdaptiveSuperTrend,
  NeuralProbabilityChannel,
  SqueezeMomentum,
  AdaptiveSuperTrend,
  KernelRegression,
  KMeansVolatility,
  WaveTrend,
  getIndicator,
  // Utilities
  calculateATRPositionSize,
  getVolatilityRegime,
};
