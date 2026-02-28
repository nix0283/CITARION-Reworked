/**
 * WaveTrend Oscillator
 * 
 * Academic Foundation:
 * - Channelized momentum oscillator
 * - EMA of normalized price deviations
 * - Similar to RSI/Stochastic with better smoothing
 * 
 * Production Use:
 * - Mean-reversion signals (overbought/oversold)
 * - Divergence detection
 * - Entry timing for DCA strategies
 * 
 * @module lib/indicators/advanced/wave-trend
 */

export interface WaveTrendResult {
  wt1: number;
  wt2: number;
  divergence: number;
  signal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  crossover: 'BULLISH' | 'BEARISH' | 'NONE';
}

export interface WaveTrendConfig {
  channelLength: number;
  averageLength: number;
  overBoughtLevel1: number;
  overBoughtLevel2: number;
  overSoldLevel1: number;
  overSoldLevel2: number;
}

const DEFAULT_CONFIG: WaveTrendConfig = {
  channelLength: 10,
  averageLength: 21,
  overBoughtLevel1: 60,
  overBoughtLevel2: 53,
  overSoldLevel1: -60,
  overSoldLevel2: -53,
};

/**
 * Calculate EMA
 */
function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const multiplier = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = (values[i] - result) * multiplier + result;
  }
  return result;
}

/**
 * Calculate WaveTrend
 */
export function calculateWaveTrend(
  highs: number[],
  lows: number[],
  closes: number[],
  config: Partial<WaveTrendConfig> = {}
): WaveTrendResult[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const results: WaveTrendResult[] = [];

  for (let i = 0; i < closes.length; i++) {
    // Calculate typical price (HLC3)
    const ap = (highs[i] + lows[i] + closes[i]) / 3;

    // Calculate ESA (first EMA)
    const apSlice = closes.slice(0, i + 1).map((_, idx) =>
      idx <= i ? (highs[idx] + lows[idx] + closes[idx]) / 3 : 0
    );
    const esa = ema(apSlice, cfg.channelLength);

    // Calculate D (EMA of absolute deviation)
    const deviations = apSlice.map((price, idx) => Math.abs(price - ema(apSlice.slice(0, idx + 1), cfg.channelLength)));
    const d = ema(deviations, cfg.channelLength);

    // Calculate CI (Channel Index)
    const ci = d !== 0 ? (ap - esa) / (0.015 * d) : 0;

    // Calculate TCI (True Channel Index - second EMA)
    const ciSlice = results.map((r, idx) => idx <= i ? ci : 0);
    ciSlice.push(ci);
    const tci = ema(ciSlice, cfg.averageLength);

    // WT1 and WT2
    const wt1 = tci;
    const wt2Slice = results.map(r => r.wt1);
    wt2Slice.push(wt1);
    const wt2 = ema(wt2Slice, 4);

    // Divergence
    const divergence = wt1 - wt2;

    // Signal
    let signal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' = 'NEUTRAL';
    if (wt1 > cfg.overBoughtLevel1) {
      signal = 'OVERBOUGHT';
    } else if (wt1 < cfg.overSoldLevel1) {
      signal = 'OVERSOLD';
    }

    // Crossover
    const prevResult = results[i - 1];
    let crossover: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';

    if (prevResult) {
      if (wt1 > wt2 && prevResult.wt1 <= prevResult.wt2) {
        crossover = 'BULLISH';
      } else if (wt1 < wt2 && prevResult.wt1 >= prevResult.wt2) {
        crossover = 'BEARISH';
      }
    }

    results.push({
      wt1,
      wt2,
      divergence,
      signal,
      crossover,
    });
  }

  return results;
}

/**
 * Get WaveTrend entry signal
 */
export function getWaveTrendEntrySignal(
  current: WaveTrendResult,
  previous: WaveTrendResult | null
): 'BUY' | 'SELL' | 'WAIT' {
  if (!previous) return 'WAIT';

  // Buy: Oversold + Bullish crossover
  if (current.signal === 'OVERSOLD' && current.crossover === 'BULLISH') {
    return 'BUY';
  }

  // Sell: Overbought + Bearish crossover
  if (current.signal === 'OVERBOUGHT' && current.crossover === 'BEARISH') {
    return 'SELL';
  }

  return 'WAIT';
}

/**
 * Detect divergence
 */
export function detectDivergence(
  prices: number[],
  waveTrend: WaveTrendResult[],
  lookback: number = 5
): 'BULLISH_DIV' | 'BEARISH_DIV' | 'NONE' {
  if (prices.length < lookback || waveTrend.length < lookback) return 'NONE';

  const recentPrices = prices.slice(-lookback);
  const recentWT = waveTrend.slice(-lookback).map(w => w.wt1);

  // Price trend
  const priceTrend = recentPrices[recentPrices.length - 1] - recentPrices[0];

  // WT trend
  const wtTrend = recentWT[recentWT.length - 1] - recentWT[0];

  // Bullish divergence: Price down, WT up
  if (priceTrend < 0 && wtTrend > 0) {
    return 'BULLISH_DIV';
  }

  // Bearish divergence: Price up, WT down
  if (priceTrend > 0 && wtTrend < 0) {
    return 'BEARISH_DIV';
  }

  return 'NONE';
}
