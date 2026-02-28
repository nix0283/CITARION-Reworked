/**
 * Neural Probability Channel (Kernel Regression)
 * 
 * Academic Foundation:
 * - Nadaraya-Watson Kernel Regression
 * - Rational Quadratic Kernel
 * - Non-parametric smoothing
 * - Backed by: Watson (1964), Nadaraya (1964)
 * 
 * Production Use:
 * - Trend baseline (better than EMA/SMA)
 * - Channel trading signals
 * - Mean reversion at outer bands
 * 
 * @module lib/indicators/advanced/kernel-regression
 */

export interface KernelRegressionResult {
  baseline: number;
  upperInner: number;
  lowerInner: number;
  upperOuter: number;
  lowerOuter: number;
  trend: 'UP' | 'DOWN';
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
}

export interface KernelConfig {
  lookbackWindow: number;
  bandwidth: number;
  alpha: number;
  innerMultiplier: number;
  outerMultiplier: number;
}

const DEFAULT_CONFIG: KernelConfig = {
  lookbackWindow: 24,
  bandwidth: 8.0,
  alpha: 2.0,
  innerMultiplier: 1.5,
  outerMultiplier: 2.5,
};

/**
 * Rational Quadratic Kernel Weight
 */
function getKernelWeight(
  index: number,
  currentIndex: number,
  bandwidth: number,
  alpha: number
): number {
  const d = Math.pow(index - currentIndex, 2);
  return Math.pow(1 + d / (2 * alpha * Math.pow(bandwidth, 2)), -alpha);
}

/**
 * Calculate ATR
 */
function calculateATR(highs: number[], lows: number[], closes: number[], period: number): number {
  if (highs.length < period + 1) return 0;

  const trueRanges: number[] = [];
  for (let i = 1; i <= period && i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }

  return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
}

/**
 * Calculate Kernel Regression Channel
 */
export function calculateKernelRegression(
  highs: number[],
  lows: number[],
  closes: number[],
  config: Partial<KernelConfig> = {}
): KernelRegressionResult[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const results: KernelRegressionResult[] = [];

  for (let i = 0; i < closes.length; i++) {
    // Calculate kernel regression baseline (Nadaraya-Watson estimator)
    let numerator = 0;
    let denominator = 0;

    const startIndex = Math.max(0, i - cfg.lookbackWindow + 1);
    for (let j = startIndex; j <= i; j++) {
      const weight = getKernelWeight(j, i, cfg.bandwidth, cfg.alpha);
      numerator += closes[j] * weight;
      denominator += weight;
    }

    const baseline = denominator > 0 ? numerator / denominator : closes[i];

    // Calculate mean deviation
    let errorSum = 0;
    for (let j = startIndex; j <= i; j++) {
      errorSum += Math.abs(closes[j] - baseline);
    }
    const meanDeviation = errorSum / (i - startIndex + 1);

    // Calculate ATR
    const atr = calculateATR(
      highs.slice(startIndex, i + 1),
      lows.slice(startIndex, i + 1),
      closes.slice(startIndex, i + 1),
      Math.min(cfg.lookbackWindow, i + 1)
    );

    // Hybrid volatility
    const volatility = (meanDeviation + atr) / 2;

    // Channel boundaries
    const upperInner = baseline + volatility * cfg.innerMultiplier;
    const lowerInner = baseline - volatility * cfg.innerMultiplier;
    const upperOuter = baseline + volatility * cfg.outerMultiplier;
    const lowerOuter = baseline - volatility * cfg.outerMultiplier;

    // Trend
    const prevResult = results[i - 1];
    const trend: 'UP' | 'DOWN' = baseline > (prevResult?.baseline || baseline) ? 'UP' : 'DOWN';

    // Signal (mean reversion at outer bands)
    let signal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';

    if (closes[i] > prevResult?.lowerOuter && closes[i - 1] <= prevResult?.lowerOuter) {
      signal = 'BUY'; // Price crossed above lower outer band
    } else if (closes[i] < prevResult?.upperOuter && closes[i - 1] >= prevResult?.upperOuter) {
      signal = 'SELL'; // Price crossed below upper outer band
    }

    results.push({
      baseline,
      upperInner,
      lowerInner,
      upperOuter,
      lowerOuter,
      trend,
      signal,
    });
  }

  return results;
}

/**
 * Get channel signal
 */
export function getChannelSignal(
  current: KernelRegressionResult,
  previous: KernelRegressionResult | null,
  close: number
): 'BUY' | 'SELL' | 'NEUTRAL' {
  if (!previous) return 'NEUTRAL';

  // Mean reversion buy (price at lower outer band)
  if (close <= current.lowerOuter && previous.close > previous.lowerOuter) {
    return 'BUY';
  }

  // Mean reversion sell (price at upper outer band)
  if (close >= current.upperOuter && previous.close < previous.upperOuter) {
    return 'SELL';
  }

  // Trend continuation (price crosses baseline)
  if (close > current.baseline && previous.close <= previous.baseline) {
    return 'BUY';
  }
  if (close < current.baseline && previous.close >= previous.baseline) {
    return 'SELL';
  }

  return 'NEUTRAL';
}
