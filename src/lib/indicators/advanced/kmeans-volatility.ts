/**
 * K-Means Volatility Clustering for Adaptive SuperTrend
 * 
 * Academic Foundation:
 * - K-Means clustering on ATR volatility
 * - Regime detection (High/Medium/Low volatility)
 * - Based on Ang & Bekaert (2002) regime-switching models
 * 
 * Production Use:
 * - Adaptive SuperTrend factor based on volatility regime
 * - Reduces false signals in choppy markets
 * - Computationally efficient (3 clusters, 100 iterations max)
 * 
 * @module lib/indicators/advanced/kmeans-volatility
 */

export interface KMeansVolatilityResult {
  cluster: 0 | 1 | 2; // 0=High, 1=Medium, 2=Low
  centroid: number;
  volatility: number;
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

export interface KMeansConfig {
  trainingPeriod: number;
  initialGuesses: {
    high: number;
    medium: number;
    low: number;
  };
  maxIterations: number;
  convergenceThreshold: number;
}

const DEFAULT_CONFIG: KMeansConfig = {
  trainingPeriod: 100,
  initialGuesses: {
    high: 0.75,
    medium: 0.5,
    low: 0.25,
  },
  maxIterations: 100,
  convergenceThreshold: 0.001,
};

/**
 * Calculate K-Means volatility clustering
 */
export function calculateKMeansVolatility(
  atrValues: number[],
  config: Partial<KMeansConfig> = {}
): KMeansVolatilityResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (atrValues.length < cfg.trainingPeriod) {
    return {
      cluster: 1,
      centroid: cfg.initialGuesses.medium,
      volatility: atrValues[atrValues.length - 1] || 0,
      centroids: { high: 0, medium: 0, low: 0 },
      clusterSizes: { high: 0, medium: 0, low: 0 },
    };
  }

  // Get training data
  const trainingData = atrValues.slice(-cfg.trainingPeriod);
  const minVol = Math.min(...trainingData);
  const maxVol = Math.max(...trainingData);
  const range = maxVol - minVol;

  // Initialize centroids from percentile guesses
  let centroidHigh = minVol + range * cfg.initialGuesses.high;
  let centroidMedium = minVol + range * cfg.initialGuesses.medium;
  let centroidLow = minVol + range * cfg.initialGuesses.low;

  // K-Means iterations
  for (let iter = 0; iter < cfg.maxIterations; iter++) {
    const clusterHigh: number[] = [];
    const clusterMedium: number[] = [];
    const clusterLow: number[] = [];

    // Assign points to nearest centroid
    for (const vol of trainingData) {
      const distHigh = Math.abs(vol - centroidHigh);
      const distMedium = Math.abs(vol - centroidMedium);
      const distLow = Math.abs(vol - centroidLow);

      if (distHigh < distMedium && distHigh < distLow) {
        clusterHigh.push(vol);
      } else if (distMedium < distHigh && distMedium < distLow) {
        clusterMedium.push(vol);
      } else {
        clusterLow.push(vol);
      }
    }

    // Calculate new centroids
    const newCentroidHigh = clusterHigh.length > 0
      ? clusterHigh.reduce((a, b) => a + b, 0) / clusterHigh.length
      : centroidHigh;
    const newCentroidMedium = clusterMedium.length > 0
      ? clusterMedium.reduce((a, b) => a + b, 0) / clusterMedium.length
      : centroidMedium;
    const newCentroidLow = clusterLow.length > 0
      ? clusterLow.reduce((a, b) => a + b, 0) / clusterLow.length
      : centroidLow;

    // Check convergence
    const converged =
      Math.abs(newCentroidHigh - centroidHigh) < cfg.convergenceThreshold &&
      Math.abs(newCentroidMedium - centroidMedium) < cfg.convergenceThreshold &&
      Math.abs(newCentroidLow - centroidLow) < cfg.convergenceThreshold;

    centroidHigh = newCentroidHigh;
    centroidMedium = newCentroidMedium;
    centroidLow = newCentroidLow;

    if (converged) break;
  }

  // Current volatility
  const currentVolatility = atrValues[atrValues.length - 1] || 0;

  // Assign current volatility to cluster
  const distHigh = Math.abs(currentVolatility - centroidHigh);
  const distMedium = Math.abs(currentVolatility - centroidMedium);
  const distLow = Math.abs(currentVolatility - centroidLow);

  let cluster: 0 | 1 | 2 = 1;
  let centroid = centroidMedium;

  if (distHigh < distMedium && distHigh < distLow) {
    cluster = 0;
    centroid = centroidHigh;
  } else if (distLow < distHigh && distLow < distMedium) {
    cluster = 2;
    centroid = centroidLow;
  }

  return {
    cluster,
    centroid,
    volatility: currentVolatility,
    centroids: {
      high: centroidHigh,
      medium: centroidMedium,
      low: centroidLow,
    },
    clusterSizes: {
      high: 0,
      medium: 0,
      low: 0,
    },
  };
}

/**
 * Calculate Adaptive SuperTrend
 */
export interface SuperTrendResult {
  superTrend: number;
  direction: 1 | -1;
  trend: 'UP' | 'DOWN';
}

export function calculateAdaptiveSuperTrend(
  highs: number[],
  lows: number[],
  closes: number[],
  atrValues: number[],
  baseFactor: number = 3.0
): SuperTrendResult[] {
  const results: SuperTrendResult[] = [];

  for (let i = 0; i < closes.length; i++) {
    // Get volatility cluster
    const atrSlice = atrValues.slice(0, i + 1);
    const kmeans = calculateKMeansVolatility(atrSlice);

    // Adjust factor based on volatility regime
    // High vol = higher factor (wider bands, fewer signals)
    // Low vol = lower factor (tighter bands, more signals)
    const factorAdjustment = kmeans.cluster === 0 ? 1.5 : kmeans.cluster === 2 ? 0.7 : 1.0;
    const adjustedFactor = baseFactor * factorAdjustment;

    const atr = atrValues[i] || 0;
    const hl2 = (highs[i] + lows[i]) / 2;

    const upperBand = hl2 + adjustedFactor * atr;
    const lowerBand = hl2 - adjustedFactor * atr;

    // Get previous values
    const prevResult = results[i - 1];

    let direction: 1 | -1 = 1;
    let superTrend = lowerBand;

    if (prevResult) {
      if (prevResult.direction === -1) {
        // Previous was downtrend
        if (closes[i] > upperBand) {
          direction = 1;
          superTrend = lowerBand;
        } else {
          direction = -1;
          superTrend = Math.max(upperBand, prevResult.superTrend);
        }
      } else {
        // Previous was uptrend
        if (closes[i] < lowerBand) {
          direction = -1;
          superTrend = upperBand;
        } else {
          direction = 1;
          superTrend = Math.min(lowerBand, prevResult.superTrend);
        }
      }
    }

    results.push({
      superTrend,
      direction,
      trend: direction === 1 ? 'UP' : 'DOWN',
    });
  }

  return results;
}

/**
 * Get SuperTrend signal
 */
export function getSuperTrendSignal(
  current: SuperTrendResult,
  previous: SuperTrendResult | null
): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (!previous) return 'NEUTRAL';

  if (current.direction === 1 && previous.direction === -1) {
    return 'BULLISH';
  }
  if (current.direction === -1 && previous.direction === 1) {
    return 'BEARISH';
  }
  return 'NEUTRAL';
}
