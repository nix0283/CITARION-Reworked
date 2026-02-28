// src/lib/indicators/ml-adaptive-supertrend.ts

export interface AdaptiveSuperTrendConfig {
  atrLength: number;
  baseFactor: number;
  trainingPeriod: number;
  volatilityPercentiles: {
    high: number;   // 0.75
    medium: number; // 0.50
    low: number;    // 0.25
  };
}

export interface AdaptiveSuperTrendResult {
  superTrend: number;
  direction: -1 | 1;
  volatilityCluster: 'LOW' | 'MEDIUM' | 'HIGH';
  clusterCentroid: number;
  factor: number;
}

export class MLAdaptiveSuperTrend {
  private config: AdaptiveSuperTrendConfig;
  private atrValues: number[] = [];
  private centroids: { high: number; medium: number; low: number } = {
    high: 0,
    medium: 0,
    low: 0,
  };

  constructor(config?: Partial<AdaptiveSuperTrendConfig>) {
    this.config = {
      atrLength: config?.atrLength || 10,
      baseFactor: config?.baseFactor || 3,
      trainingPeriod: config?.trainingPeriod || 100,
      volatilityPercentiles: {
        high: config?.volatilityPercentiles?.high || 0.75,
        medium: config?.volatilityPercentiles?.medium || 0.50,
        low: config?.volatilityPercentiles?.low || 0.25,
      },
    };
  }

  /**
   * Calculate ATR
   */
  private calculateATR(candles: Candle[], period: number): number[] {
    const atr: number[] = [];
    for (let i = period; i < candles.length; i++) {
      let trueRange = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      const prevATR = atr.length > 0 ? atr[atr.length - 1] : trueRange;
      atr.push((prevATR * (period - 1) + trueRange) / period);
    }
    return atr;
  }

  /**
   * K-Means Clustering on ATR values
   */
  private kMeansClustering(atrValues: number[], k: number = 3): {
    centroids: number[];
    assignments: number[];
  } {
    // Initialize centroids from percentiles
    const sorted = [...atrValues].sort((a, b) => a - b);
    const centroids = [
      sorted[Math.floor(sorted.length * this.config.volatilityPercentiles.low)],
      sorted[Math.floor(sorted.length * this.config.volatilityPercentiles.medium)],
      sorted[Math.floor(sorted.length * this.config.volatilityPercentiles.high)],
    ];

    let assignments = new Array(atrValues.length).fill(0);
    let converged = false;
    let iterations = 0;
    const maxIterations = 50;

    while (!converged && iterations < maxIterations) {
      // Assign points to nearest centroid
      for (let i = 0; i < atrValues.length; i++) {
        let minDist = Infinity;
        let cluster = 0;
        for (let j = 0; j < k; j++) {
          const dist = Math.abs(atrValues[i] - centroids[j]);
          if (dist < minDist) {
            minDist = dist;
            cluster = j;
          }
        }
        assignments[i] = cluster;
      }

      // Update centroids
      const newCentroids = [0, 0, 0];
      const counts = [0, 0, 0];
      for (let i = 0; i < atrValues.length; i++) {
        const cluster = assignments[i];
        newCentroids[cluster] += atrValues[i];
        counts[cluster]++;
      }
      for (let j = 0; j < k; j++) {
        newCentroids[j] = counts[j] > 0 ? newCentroids[j] / counts[j] : centroids[j];
      }

      // Check convergence
      converged = centroids.every((c, i) => Math.abs(c - newCentroids[i]) < 0.0001);
      centroids.splice(0, centroids.length, ...newCentroids);
      iterations++;
    }

    return { centroids, assignments };
  }

  /**
   * Calculate SuperTrend with adaptive factor
   */
  calculate(candles: Candle[]): AdaptiveSuperTrendResult[] {
    const atr = this.calculateATR(candles, this.config.atrLength);
    const results: AdaptiveSuperTrendResult[] = [];

    // Need enough data for training period
    if (atr.length < this.config.trainingPeriod) {
      return results;
    }

    // Get training window
    const trainingATR = atr.slice(-this.config.trainingPeriod);
    const { centroids, assignments } = this.kMeansClustering(trainingATR);

    // Sort centroids: low, medium, high
    const sortedCentroids = [...centroids].sort((a, b) => a - b);
    this.centroids = {
      low: sortedCentroids[0],
      medium: sortedCentroids[1],
      high: sortedCentroids[2],
    };

    // Calculate SuperTrend for each bar
    let prevSuperTrend = 0;
    let prevDirection: -1 | 1 = 1;

    for (let i = 0; i < candles.length; i++) {
      const currentATR = atr[i] || 0;

      // Find cluster assignment for current ATR
      let cluster = 0;
      let minDist = Infinity;
      for (let j = 0; j < 3; j++) {
        const dist = Math.abs(currentATR - centroids[j]);
        if (dist < minDist) {
          minDist = dist;
          cluster = j;
        }
      }

      // Adaptive factor based on volatility cluster
      // Low vol = higher factor (wider bands), High vol = lower factor
      const factorMap = [2.0, 3.0, 4.0]; // Low, Medium, High
      const adaptiveFactor = factorMap[cluster];

      // Calculate SuperTrend
      const hl2 = (candles[i].high + candles[i].low) / 2;
      const upperBand = hl2 + adaptiveFactor * currentATR;
      const lowerBand = hl2 - adaptiveFactor * currentATR;

      let direction: -1 | 1 = prevDirection;
      let superTrend = prevSuperTrend;

      if (i === 0) {
        direction = 1;
        superTrend = lowerBand;
      } else {
        if (prevDirection === 1) {
          if (candles[i].close < lowerBand) {
            direction = -1;
            superTrend = upperBand;
          } else {
            superTrend = Math.max(lowerBand, prevSuperTrend);
          }
        } else {
          if (candles[i].close > upperBand) {
            direction = 1;
            superTrend = lowerBand;
          } else {
            superTrend = Math.min(upperBand, prevSuperTrend);
          }
        }
      }

      const volatilityCluster: 'LOW' | 'MEDIUM' | 'HIGH' =
        cluster === 0 ? 'LOW' : cluster === 1 ? 'MEDIUM' : 'HIGH';

      results.push({
        superTrend,
        direction,
        volatilityCluster,
        clusterCentroid: centroids[cluster],
        factor: adaptiveFactor,
      });

      prevSuperTrend = superTrend;
      prevDirection = direction;
    }

    return results;
  }

  /**
   * Get current volatility regime
   */
  getVolatilityRegime(): 'LOW' | 'MEDIUM' | 'HIGH' {
    const currentATR = this.atrValues[this.atrValues.length - 1];
    const { low, medium, high } = this.centroids;

    const distLow = Math.abs(currentATR - low);
    const distMedium = Math.abs(currentATR - medium);
    const distHigh = Math.abs(currentATR - high);

    const minDist = Math.min(distLow, distMedium, distHigh);
    if (minDist === distLow) return 'LOW';
    if (minDist === distMedium) return 'MEDIUM';
    return 'HIGH';
  }
}