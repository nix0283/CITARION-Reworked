/**
 * Machine Learning Adaptive SuperTrend
 * 
 * Адаптивный SuperTrend с K-Means кластеризацией волатильности.
 * Основан на индикаторе AlgoAlpha: https://www.tradingview.com/script/
 * 
 * Академическая база:
 * - MacQueen (1967) - K-Means clustering
 * - Chou (1988) - ATR volatility persistence
 * - Hansen & Lunde (2005) - Adaptive volatility models
 * 
 * @module lib/indicators/advanced/adaptive-supertrend
 */

export interface AdaptiveSuperTrendConfig {
  atrLength: number;           // ATR период (default: 10)
  supertrendFactor: number;    // SuperTrend фактор (default: 3)
  trainingPeriod: number;      // Период обучения K-Means (default: 100)
  highVolPercentile: number;   // Начальный guess для high vol (default: 0.75)
  midVolPercentile: number;    // Начальный guess для mid vol (default: 0.5)
  lowVolPercentile: number;    // Начальный guess для low vol (default: 0.25)
  maxIterations: number;       // Максимум итераций K-Means (default: 50)
}

export interface AdaptiveSuperTrendResult {
  supertrend: number;
  direction: number;           // 1 = bullish, -1 = bearish
  volatilityCluster: number;   // 0 = high, 1 = medium, 2 = low
  assignedCentroid: number;    // Текущий ATR centroid
  centroids: {
    high: number;
    medium: number;
    low: number;
  };
  clusterSizes: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

/**
 * Calculate True Range
 */
function calculateTrueRange(candles: Candle[], index: number): number {
  if (index < 1) return candles[0].high - candles[0].low;
  
  const high = candles[index].high;
  const low = candles[index].low;
  const prevClose = candles[index - 1].close;
  
  return Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose)
  );
}

/**
 * Calculate ATR
 */
function calculateATR(candles: Candle[], period: number): number[] {
  const atr: number[] = [];
  const trueRanges: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    const tr = calculateTrueRange(candles, i);
    trueRanges.push(tr);
    
    if (i < period) {
      atr.push(NaN);
    } else if (i === period) {
      const sum = trueRanges.slice(0, period + 1).reduce((a, b) => a + b, 0);
      atr.push(sum / (period + 1));
    } else {
      atr.push((atr[i - 1] * (period - 1) + tr) / period);
    }
  }
  
  return atr;
}

/**
 * K-Means Clustering для волатильности (3 кластера)
 */
function kMeansVolatility(
  volatilityData: number[],
  maxIterations: number = 50
): {
  centroids: [number, number, number];
  assignments: number[];
  sizes: [number, number, number];
} {
  if (volatilityData.length < 3) {
    return {
      centroids: [0, 0, 0],
      assignments: [],
      sizes: [0, 0, 0],
    };
  }
  
  // Инициализация центроидов (percentile-based)
  const sorted = [...volatilityData].sort((a, b) => a - b);
  const highIdx = Math.floor(sorted.length * 0.75);
  const midIdx = Math.floor(sorted.length * 0.5);
  const lowIdx = Math.floor(sorted.length * 0.25);
  
  let centroids: [number, number, number] = [
    sorted[highIdx],
    sorted[midIdx],
    sorted[lowIdx],
  ];
  
  let assignments: number[] = [];
  let iterations = 0;
  
  while (iterations < maxIterations) {
    const newAssignments: number[] = [];
    const clusters: number[][] = [[], [], []];
    
    // Assignment step
    for (const vol of volatilityData) {
      const distances = [
        Math.abs(vol - centroids[0]),
        Math.abs(vol - centroids[1]),
        Math.abs(vol - centroids[2]),
      ];
      const cluster = distances.indexOf(Math.min(...distances));
      newAssignments.push(cluster);
      clusters[cluster].push(vol);
    }
    
    // Update step
    const newCentroids: [number, number, number] = [
      clusters[0].length > 0 ? clusters[0].reduce((a, b) => a + b, 0) / clusters[0].length : centroids[0],
      clusters[1].length > 0 ? clusters[1].reduce((a, b) => a + b, 0) / clusters[1].length : centroids[1],
      clusters[2].length > 0 ? clusters[2].reduce((a, b) => a + b, 0) / clusters[2].length : centroids[2],
    ];
    
    // Check convergence
    const converged =
      Math.abs(newCentroids[0] - centroids[0]) < 0.0001 &&
      Math.abs(newCentroids[1] - centroids[1]) < 0.0001 &&
      Math.abs(newCentroids[2] - centroids[2]) < 0.0001;
    
    centroids = newCentroids;
    assignments = newAssignments;
    
    if (converged) break;
    iterations++;
  }
  
  const sizes: [number, number, number] = [
    assignments.filter(a => a === 0).length,
    assignments.filter(a => a === 1).length,
    assignments.filter(a => a === 2).length,
  ];
  
  return { centroids, assignments, sizes };
}

/**
 * Calculate SuperTrend
 */
function calculateSuperTrend(
  candles: Candle[],
  atr: number[],
  factor: number
): { supertrend: number[]; direction: number[] } {
  const supertrend: number[] = [];
  const direction: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (isNaN(atr[i])) {
      supertrend.push(NaN);
      direction.push(1);
      continue;
    }
    
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const upperBand = hl2 + factor * atr[i];
    const lowerBand = hl2 - factor * atr[i];
    
    let dir = direction[i - 1] || 1;
    let st = supertrend[i - 1] || lowerBand;
    
    if (i > 0) {
      const prevST = supertrend[i - 1];
      const prevDir = direction[i - 1];
      
      if (prevDir === 1) {
        if (candles[i].close < prevST) {
          dir = -1;
          st = upperBand;
        } else {
          st = Math.max(lowerBand, prevST);
        }
      } else {
        if (candles[i].close > prevST) {
          dir = 1;
          st = lowerBand;
        } else {
          st = Math.min(upperBand, prevST);
        }
      }
    } else {
      st = lowerBand;
      dir = 1;
    }
    
    supertrend.push(st);
    direction.push(dir);
  }
  
  return { supertrend, direction };
}

/**
 * Adaptive SuperTrend с K-Means волатильности
 */
export function calculateAdaptiveSuperTrend(
  candles: Candle[],
  config: AdaptiveSuperTrendConfig = {}
): AdaptiveSuperTrendResult[] {
  const {
    atrLength = 10,
    supertrendFactor = 3,
    trainingPeriod = 100,
    maxIterations = 50,
  } = config;
  
  const results: AdaptiveSuperTrendResult[] = [];
  const atr = calculateATR(candles, atrLength);
  
  for (let i = 0; i < candles.length; i++) {
    if (i < trainingPeriod) {
      results.push({
        supertrend: NaN,
        direction: 1,
        volatilityCluster: -1,
        assignedCentroid: NaN,
        centroids: { high: 0, medium: 0, low: 0 },
        clusterSizes: { high: 0, medium: 0, low: 0 },
      });
      continue;
    }
    
    // Get volatility training data
    const volData = atr.slice(i - trainingPeriod, i).filter(v => !isNaN(v));
    
    if (volData.length < trainingPeriod * 0.8) {
      results.push({
        supertrend: NaN,
        direction: 1,
        volatilityCluster: -1,
        assignedCentroid: NaN,
        centroids: { high: 0, medium: 0, low: 0 },
        clusterSizes: { high: 0, medium: 0, low: 0 },
      });
      continue;
    }
    
    // K-Means clustering
    const { centroids, assignments, sizes } = kMeansVolatility(volData, maxIterations);
    
    // Assign current volatility to cluster
    const currentVol = atr[i];
    const distances = [
      Math.abs(currentVol - centroids[0]),
      Math.abs(currentVol - centroids[1]),
      Math.abs(currentVol - centroids[2]),
    ];
    const cluster = distances.indexOf(Math.min(...distances));
    const assignedCentroid = centroids[cluster];
    
    // Calculate SuperTrend with adaptive factor
    const adaptiveFactor = supertrendFactor * (assignedCentroid / (currentVol || assignedCentroid));
    const { supertrend, direction } = calculateSuperTrend(candles, atr, adaptiveFactor);
    
    results.push({
      supertrend: supertrend[i],
      direction: direction[i],
      volatilityCluster: cluster, // 0 = high, 1 = medium, 2 = low
      assignedCentroid,
      centroids: {
        high: centroids[0],
        medium: centroids[1],
        low: centroids[2],
      },
      clusterSizes: {
        high: sizes[0],
        medium: sizes[1],
        low: sizes[2],
      },
    });
  }
  
  return results;
}

/**
 * Generate trading signals from Adaptive SuperTrend
 */
export function generateAdaptiveSuperTrendSignals(
  results: AdaptiveSuperTrendResult[]
): Array<{
  index: number;
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  volatilityRegime: 'HIGH' | 'MEDIUM' | 'LOW';
}> {
  const signals: Array<{
    index: number;
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    volatilityRegime: 'HIGH' | 'MEDIUM' | 'LOW';
  }> = [];
  
  for (let i = 1; i < results.length; i++) {
    const prev = results[i - 1];
    const curr = results[i];
    
    if (isNaN(prev.supertrend) || isNaN(curr.supertrend)) {
      signals.push({
        index: i,
        signal: 'HOLD',
        confidence: 0,
        volatilityRegime: 'MEDIUM',
      });
      continue;
    }
    
    const prevDir = prev.direction;
    const currDir = curr.direction;
    
    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    
    // Trend reversal signals
    if (prevDir === -1 && currDir === 1) {
      signal = 'BUY';
      confidence = 0.8;
    } else if (prevDir === 1 && currDir === -1) {
      signal = 'SELL';
      confidence = 0.8;
    }
    
    // Volatility regime adjustment
    const volRegime = curr.volatilityCluster === 0 ? 'HIGH' : curr.volatilityCluster === 1 ? 'MEDIUM' : 'LOW';
    
    // Higher confidence in low volatility (more stable trends)
    if (volRegime === 'LOW' && signal !== 'HOLD') {
      confidence = Math.min(1.0, confidence + 0.15);
    } else if (volRegime === 'HIGH' && signal !== 'HOLD') {
      confidence = Math.max(0.5, confidence - 0.15);
    }
    
    signals.push({
      index: i,
      signal,
      confidence,
      volatilityRegime: volRegime,
    });
  }
  
  return signals;
}

export default {
  calculateAdaptiveSuperTrend,
  generateAdaptiveSuperTrendSignals,
  calculateATR,
  kMeansVolatility,
};
