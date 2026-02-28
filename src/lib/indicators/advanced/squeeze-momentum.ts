/**
 * Squeeze Momentum Indicator (BB + KC Squeeze)
 * 
 * Academic Foundation:
 * - Bollinger Bands inside/outside Keltner Channel
 * - Volatility compression/expansion cycles
 * - Based on Bollinger (2002) "Bollinger on Bollinger Bands"
 * 
 * Production Use:
 * - Detects consolidation before breakouts
 * - Momentum histogram for directional bias
 * - Works well with breakout/pump detection strategies
 * 
 * @module lib/indicators/advanced/squeeze-momentum
 */

export interface SqueezeMomentumResult {
  squeezeOn: boolean;
  squeezeOff: boolean;
  noSqueeze: boolean;
  momentum: number;
  momentumColor: 'LIME' | 'GREEN' | 'RED' | 'MAROON';
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface SqueezeConfig {
  bbLength: number;
  bbMult: number;
  kcLength: number;
  kcMult: number;
  useTrueRange: boolean;
  momentumLength: number;
}

const DEFAULT_CONFIG: SqueezeConfig = {
  bbLength: 20,
  bbMult: 2.0,
  kcLength: 20,
  kcMult: 1.5,
  useTrueRange: true,
  momentumLength: 20,
};

/**
 * Calculate Simple Moving Average
 */
function sma(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] || 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate Standard Deviation
 */
function stdev(values: number[], period: number): number {
  if (values.length < period) return 0;
  const slice = values.slice(-period);
  const avg = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / period;
  return Math.sqrt(variance);
}

/**
 * Calculate True Range
 */
function trueRange(high: number, low: number, prevClose: number): number {
  return Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose)
  );
}

/**
 * Calculate Squeeze Momentum
 */
export function calculateSqueezeMomentum(
  highs: number[],
  lows: number[],
  closes: number[],
  config: Partial<SqueezeConfig> = {}
): SqueezeMomentumResult[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const results: SqueezeMomentumResult[] = [];

  for (let i = 0; i < closes.length; i++) {
    // Calculate Bollinger Bands
    const bbBasis = sma(closes.slice(0, i + 1), cfg.bbLength);
    const bbDev = cfg.bbMult * stdev(closes.slice(0, i + 1), cfg.bbLength);
    const upperBB = bbBasis + bbDev;
    const lowerBB = bbBasis - bbDev;

    // Calculate Keltner Channel
    const kcMa = sma(closes.slice(0, i + 1), cfg.kcLength);

    // Calculate range (True Range or High-Low)
    const ranges: number[] = [];
    for (let j = Math.max(0, i - cfg.kcLength + 1); j <= i; j++) {
      if (cfg.useTrueRange && j > 0) {
        ranges.push(trueRange(highs[j], lows[j], closes[j - 1]));
      } else {
        ranges.push(highs[j] - lows[j]);
      }
    }
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;

    const upperKC = kcMa + cfg.kcMult * avgRange;
    const lowerKC = kcMa - cfg.kcMult * avgRange;

    // Squeeze detection
    const squeezeOn = lowerBB > lowerKC && upperBB < upperKC;
    const squeezeOff = lowerBB < lowerKC && upperBB > upperKC;
    const noSqueeze = !squeezeOn && !squeezeOff;

    // Calculate momentum
    const highestHigh = Math.max(...highs.slice(Math.max(0, i - cfg.momentumLength + 1), i + 1));
    const lowestLow = Math.min(...lows.slice(Math.max(0, i - cfg.momentumLength + 1), i + 1));
    const kcMiddle = (upperKC + lowerKC) / 2;

    const momentum = closes[i] - ((highestHigh + lowestLow) / 2 + kcMiddle) / 2;

    // Momentum color
    let momentumColor: 'LIME' | 'GREEN' | 'RED' | 'MAROON' = 'GREEN';
    const prevMomentum = results[i - 1]?.momentum || 0;

    if (momentum > 0) {
      momentumColor = momentum > prevMomentum ? 'LIME' : 'GREEN';
    } else {
      momentumColor = momentum < prevMomentum ? 'RED' : 'MAROON';
    }

    // Signal
    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (momentum > 0 && prevMomentum <= 0) {
      signal = 'BULLISH';
    } else if (momentum < 0 && prevMomentum >= 0) {
      signal = 'BEARISH';
    }

    results.push({
      squeezeOn,
      squeezeOff,
      noSqueeze,
      momentum,
      momentumColor,
      signal,
    });
  }

  return results;
}

/**
 * Get squeeze breakout signal
 */
export function getSqueezeBreakoutSignal(
  current: SqueezeMomentumResult,
  previous: SqueezeMomentumResult | null
): 'BREAKOUT_BULLISH' | 'BREAKOUT_BEARISH' | 'SQUEEZE' | 'NONE' {
  if (!previous) return 'NONE';

  // Squeeze release with bullish momentum
  if (previous.squeezeOn && current.squeezeOff && current.momentum > 0) {
    return 'BREAKOUT_BULLISH';
  }

  // Squeeze release with bearish momentum
  if (previous.squeezeOn && current.squeezeOff && current.momentum < 0) {
    return 'BREAKOUT_BEARISH';
  }

  // Still in squeeze
  if (current.squeezeOn) {
    return 'SQUEEZE';
  }

  return 'NONE';
}
