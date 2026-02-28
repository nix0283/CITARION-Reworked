// src/lib/indicators/squeeze-momentum.ts

export interface SqueezeMomentumConfig {
  bbLength: number;
  bbMult: number;
  kcLength: number;
  kcMult: number;
  useTrueRange: boolean;
  momentumLength: number;
}

export interface SqueezeMomentumResult {
  squeezeOn: boolean;
  squeezeOff: boolean;
  noSqueeze: boolean;
  momentum: number;
  momentumColor: 'LIME' | 'GREEN' | 'RED' | 'MAROON';
}

export class SqueezeMomentum {
  private config: SqueezeMomentumConfig;

  constructor(config?: Partial<SqueezeMomentumConfig>) {
    this.config = {
      bbLength: config?.bbLength || 20,
      bbMult: config?.bbMult || 2.0,
      kcLength: config?.kcLength || 20,
      kcMult: config?.kcMult || 1.5,
      useTrueRange: config?.useTrueRange ?? true,
      momentumLength: config?.momentumLength || 20,
    };
  }

  calculate(candles: Candle[]): SqueezeMomentumResult[] {
    const results: SqueezeMomentumResult[] = [];

    for (let i = this.config.bbLength; i < candles.length; i++) {
      const slice = candles.slice(i - this.config.bbLength, i + 1);

      // Calculate BB
      const basis = slice.reduce((sum, c) => sum + c.close, 0) / slice.length;
      const variance = slice.reduce((sum, c) => sum + Math.pow(c.close - basis, 2), 0) / slice.length;
      const stdDev = Math.sqrt(variance);
      const upperBB = basis + this.config.bbMult * stdDev;
      const lowerBB = basis - this.config.bbMult * stdDev;

      // Calculate KC
      const range = slice.map((c, j) =>
        j === 0
          ? c.high - c.low
          : Math.max(c.high - c.low, Math.abs(c.high - slice[j - 1].close), Math.abs(c.low - slice[j - 1].close))
      );
      const avgRange = range.reduce((sum, r) => sum + r, 0) / range.length;
      const upperKC = basis + this.config.kcMult * avgRange;
      const lowerKC = basis - this.config.kcMult * avgRange;

      // Squeeze Detection
      const squeezeOn = lowerBB > lowerKC && upperBB < upperKC;
      const squeezeOff = lowerBB < lowerKC && upperBB > upperKC;
      const noSqueeze = !squeezeOn && !squeezeOff;

      // Momentum Calculation
      const highestHigh = Math.max(...slice.map(c => c.high));
      const lowestLow = Math.min(...slice.map(c => c.low));
      const avgHL = (highestHigh + lowestLow) / 2;
      const sma = slice.reduce((sum, c) => sum + c.close, 0) / slice.length;
      const momentum = candles[i].close - (avgHL + sma) / 2;

      // Momentum Color
      const prevMomentum = results.length > 0 ? results[results.length - 1].momentum : 0;
      let momentumColor: 'LIME' | 'GREEN' | 'RED' | 'MAROON' = 'GREEN';
      if (momentum > 0) {
        momentumColor = momentum > prevMomentum ? 'LIME' : 'GREEN';
      } else {
        momentumColor = momentum < prevMomentum ? 'RED' : 'MAROON';
      }

      results.push({
        squeezeOn,
        squeezeOff,
        noSqueeze,
        momentum,
        momentumColor,
      });
    }

    return results;
  }

  /**
   * Get squeeze breakout signal
   */
  getBreakoutSignal(results: SqueezeMomentumResult[]): 'LONG' | 'SHORT' | 'NONE' {
    if (results.length < 2) return 'NONE';

    const current = results[results.length - 1];
    const prev = results[results.length - 2];

    // Squeeze release with positive momentum
    if (prev.squeezeOn && current.squeezeOff && current.momentum > 0) {
      return 'LONG';
    }

    // Squeeze release with negative momentum
    if (prev.squeezeOn && current.squeezeOff && current.momentum < 0) {
      return 'SHORT';
    }

    return 'NONE';
  }
}