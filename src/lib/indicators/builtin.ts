/**
 * Built-in Indicators Library
 * 
 * Pre-configured indicators for CITARION platform
 */

export interface BuiltInIndicator {
  id: string;
  name: string;
  category: string;
  description: string;
  pineCode: string;
  inputSchema: Array<{
    name: string;
    type: 'int' | 'float' | 'string' | 'bool';
    default: number | string | boolean;
    min?: number;
    max?: number;
    options?: string[];
  }>;
  outputConfig: Array<{
    name: string;
    type: 'line' | 'histogram' | 'area';
    color: string;
  }>;
  overlay: boolean;
  author: string;
}

export const BUILTIN_INDICATORS: BuiltInIndicator[] = [
  // ==================== MOVING AVERAGES ====================
  {
    id: 'sma',
    name: 'Simple Moving Average',
    category: 'moving_average',
    description: 'Simple Moving Average - среднее арифметическое цен за указанный период',
    pineCode: `//@version=5
indicator("SMA", overlay=true)
length = input.int(20, "Length", minval=1)
src = close
out = ta.sma(src, length)
plot(out, color=color.blue, title="SMA")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'sma', type: 'line', color: '#2962FF' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'ema',
    name: 'Exponential Moving Average',
    category: 'moving_average',
    description: 'EMA быстрее реагирует на последние цены, чем SMA',
    pineCode: `//@version=5
indicator("EMA", overlay=true)
length = input.int(20, "Length", minval=1)
src = close
out = ta.ema(src, length)
plot(out, color=color.green, title="EMA")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'ema', type: 'line', color: '#00C853' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'ema_cross',
    name: 'EMA Cross',
    category: 'moving_average',
    description: 'Две EMA для определения тренда и точек входа/выхода',
    pineCode: `//@version=5
indicator("EMA Cross", overlay=true)
fastLength = input.int(9, "Fast Length", minval=1)
slowLength = input.int(21, "Slow Length", minval=1)
fastEMA = ta.ema(close, fastLength)
slowEMA = ta.ema(close, slowLength)
plot(fastEMA, color=color.green, title="Fast EMA")
plot(slowEMA, color=color.red, title="Slow EMA")`,
    inputSchema: [
      { name: 'fastLength', type: 'int', default: 9, min: 1, max: 200 },
      { name: 'slowLength', type: 'int', default: 21, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'fast', type: 'line', color: '#00C853' },
      { name: 'slow', type: 'line', color: '#F6465D' },
    ],
    overlay: true,
    author: 'CITARION',
  },

  // ==================== OSCILLATORS ====================
  {
    id: 'rsi',
    name: 'Relative Strength Index',
    category: 'oscillator',
    description: 'RSI измеряет скорость и изменение ценовых движений. Значения 0-100',
    pineCode: `//@version=5
indicator("RSI", overlay=false)
length = input.int(14, "Length", minval=1)
src = close
rsi = ta.rsi(src, length)
plot(rsi, color=color.purple, title="RSI")
hline(70, "Overbought", color=color.red)
hline(30, "Oversold", color=color.green)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'rsi', type: 'line', color: '#D500F9' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'macd',
    name: 'MACD',
    category: 'oscillator',
    description: 'Moving Average Convergence Divergence - трендовый индикатор',
    pineCode: `//@version=5
indicator("MACD", overlay=false)
fastLength = input.int(12, "Fast Length")
slowLength = input.int(26, "Slow Length")
signalLength = input.int(9, "Signal Length")
fastMA = ta.ema(close, fastLength)
slowMA = ta.ema(close, slowLength)
macd = fastMA - slowMA
signal = ta.ema(macd, signalLength)
hist = macd - signal
plot(macd, "MACD", color=color.blue)
plot(signal, "Signal", color=color.orange)
plot(hist, "Histogram", style=plot.style_histogram, color=color.green)`,
    inputSchema: [
      { name: 'fastLength', type: 'int', default: 12, min: 1, max: 100 },
      { name: 'slowLength', type: 'int', default: 26, min: 1, max: 200 },
      { name: 'signalLength', type: 'int', default: 9, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'macd', type: 'line', color: '#2962FF' },
      { name: 'signal', type: 'line', color: '#FF6D00' },
      { name: 'histogram', type: 'histogram', color: '#26a69a' },
    ],
    overlay: false,
    author: 'CITARION',
  },

  // ==================== VOLATILITY ====================
  {
    id: 'bb',
    name: 'Bollinger Bands',
    category: 'volatility',
    description: 'Bollinger Bands показывают волатильность и потенциальные развороты',
    pineCode: `//@version=5
indicator("Bollinger Bands", overlay=true)
length = input.int(20, "Length", minval=1)
mult = input.float(2.0, "Multiplier", minval=0.1, step=0.1)
src = close
basis = ta.sma(src, length)
dev = mult * ta.stdev(src, length)
upper = basis + dev
lower = basis - dev
plot(basis, "Basis", color=color.orange)
p1 = plot(upper, "Upper", color=color.blue)
p2 = plot(lower, "Lower", color=color.blue)
fill(p1, p2, color=color.blue, transp=90)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 200 },
      { name: 'mult', type: 'float', default: 2.0, min: 0.1, max: 5.0 },
    ],
    outputConfig: [
      { name: 'upper', type: 'line', color: '#2962FF' },
      { name: 'middle', type: 'line', color: '#FF6D00' },
      { name: 'lower', type: 'line', color: '#2962FF' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'atr',
    name: 'Average True Range',
    category: 'volatility',
    description: 'ATR измеряет волатильность рынка',
    pineCode: `//@version=5
indicator("ATR", overlay=false)
length = input.int(14, "Length", minval=1)
atr = ta.atr(length)
plot(atr, "ATR", color=color.orange)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'atr', type: 'line', color: '#FF6D00' },
    ],
    overlay: false,
    author: 'CITARION',
  },

  // ==================== VOLUME ====================
  {
    id: 'vol_sma',
    name: 'Volume SMA',
    category: 'volume',
    description: 'SMA объёма показывает средний объём торгов',
    pineCode: `//@version=5
indicator("Volume SMA", overlay=false)
length = input.int(20, "Length", minval=1)
vol = volume
volSMA = ta.sma(vol, length)
plot(vol, "Volume", style=plot.style_columns, color=color.new(color.blue, 50))
plot(volSMA, "Volume SMA", color=color.orange)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 200 },
    ],
    outputConfig: [
      { name: 'volume', type: 'histogram', color: '#2962FF' },
      { name: 'volSMA', type: 'line', color: '#FF6D00' },
    ],
    overlay: false,
    author: 'CITARION',
  },
];

/**
 * Get all built-in indicators
 */
export function getBuiltinIndicators(): BuiltInIndicator[] {
  return BUILTIN_INDICATORS;
}

/**
 * Get built-in indicator by ID
 */
export function getBuiltinIndicator(id: string): BuiltInIndicator | undefined {
  return BUILTIN_INDICATORS.find(ind => ind.id === id);
}

/**
 * Get indicators by category
 */
export function getIndicatorsByCategory(category: string): BuiltInIndicator[] {
  return BUILTIN_INDICATORS.filter(ind => ind.category === category);
}

/**
 * Get all categories
 */
export function getIndicatorCategories(): string[] {
  return [...new Set(BUILTIN_INDICATORS.map(ind => ind.category))];
}
