// src/lib/indicators/neural-probability-channel.ts

export interface NPCConfig {
  lookbackWindow: number;
  bandwidth: number;
  alpha: number;
  innerMultiplier: number;
  outerMultiplier: number;
}

export interface NPCResult {
  baseline: number;
  upperInner: number;
  lowerInner: number;
  upperOuter: number;
  lowerOuter: number;
  volatility: number;
  trend: 'BULLISH' | 'BEARISH';
}

export class NeuralProbabilityChannel {
  private config: NPCConfig;

  constructor(config?: Partial<NPCConfig>) {
    this.config = {
      lookbackWindow: config?.lookbackWindow || 24,
      bandwidth: config?.bandwidth || 8.0,
      alpha: config?.alpha || 2.0,
      innerMultiplier: config?.innerMultiplier || 1.5,
      outerMultiplier: config?.outerMultiplier || 2.5,
    };
  }

  /**
   * Rational Quadratic Kernel Weight
   */
  private getWeight(index: number, currentIndex: number, h: number, alpha: number): number {
    const d = Math.pow(index - currentIndex, 2);
    return Math.pow(1 + d / (2 * alpha * Math.pow(h, 2)), -alpha);
  }

  /**
   * Calculate Kernel Regression Baseline
   */
  private calculateBaseline(candles: Candle[], currentIndex: number): number {
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < this.config.lookbackWindow; i++) {
      const candleIndex = currentIndex - i;
      if (candleIndex < 0) break;

      const weight = this.getWeight(i, 0, this.config.bandwidth, this.config.alpha);
      const hlc3 = (candles[candleIndex].high + candles[candleIndex].low + candles[candleIndex].close) / 3;

      numerator += hlc3 * weight;
      denominator += weight;
    }

    return denominator > 0 ? numerator / denominator : 0;
  }

  /**
   * Calculate Mean Deviation
   */
  private calculateMeanDeviation(candles: Candle[], currentIndex: number, baseline: number): number {
    let errorSum = 0;

    for (let i = 0; i < this.config.lookbackWindow; i++) {
      const candleIndex = currentIndex - i;
      if (candleIndex < 0) break;

      const hlc3 = (candles[candleIndex].high + candles[candleIndex].low + candles[candleIndex].close) / 3;
      errorSum += Math.abs(hlc3 - baseline);
    }

    return errorSum / this.config.lookbackWindow;
  }

  calculate(candles: Candle[]): NPCResult[] {
    const results: NPCResult[] = [];

    for (let i = this.config.lookbackWindow; i < candles.length; i++) {
      // Step 1: Kernel Regression Baseline
      const baseline = this.calculateBaseline(candles, i);

      // Step 2: Mean Deviation
      const meanDeviation = this.calculateMeanDeviation(candles, i, baseline);

      // Step 3: ATR for hybrid volatility
      const atr = this.calculateATR(candles, i, this.config.lookbackWindow);

      // Step 4: Hybrid Volatility
      const volatility = (meanDeviation + atr) / 2;

      // Step 5: Channel Bands
      const upperInner = baseline + volatility * this.config.innerMultiplier;
      const lowerInner = baseline - volatility * this.config.innerMultiplier;
      const upperOuter = baseline + volatility * this.config.outerMultiplier;
      const lowerOuter = baseline - volatility * this.config.outerMultiplier;

      // Step 6: Trend Direction
      const prevBaseline = results.length > 0 ? results[results.length - 1].baseline : baseline;
      const trend = baseline > prevBaseline ? 'BULLISH' : 'BEARISH';

      results.push({
        baseline,
        upperInner,
        lowerInner,
        upperOuter,
        lowerOuter,
        volatility,
        trend,
      });
    }

    return results;
  }

  private calculateATR(candles: Candle[], currentIndex: number, period: number): number {
    if (currentIndex < period) return 0;

    let trueRangeSum = 0;
    for (let i = 0; i < period; i++) {
      const idx = currentIndex - i;
      const tr = Math.max(
        candles[idx].high - candles[idx].low,
        Math.abs(candles[idx].high - candles[idx - 1]?.close || candles[idx].high),
        Math.abs(candles[idx].low - candles[idx - 1]?.close || candles[idx].low)
      );
      trueRangeSum += tr;
    }

    return trueRangeSum / period;
  }

  /**
   * Get mean reversion signal
   */
  getMeanReversionSignal(results: NPCResult[], candle: Candle): 'LONG' | 'SHORT' | 'NONE' {
    if (results.length === 0) return 'NONE';

    const current = results[results.length - 1];

    // Long: Price crosses above lower outer band
    if (candle.close > current.lowerOuter && candle.open <= current.lowerOuter) {
      return 'LONG';
    }

    // Short: Price crosses below upper outer band
    if (candle.close < current.upperOuter && candle.open >= current.upperOuter) {
      return 'SHORT';
    }

    return 'NONE';
  }
}