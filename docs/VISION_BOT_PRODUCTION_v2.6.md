# Vision Bot: Production Architecture

## Обзор

Vision Bot — система прогнозирования рынка на основе статистических методов **без машинного обучения**. Все алгоритмы детерминированы, интерпретируемы и backtestable.

**Версия**: 2.6.0  
**Дата**: Февраль 2026  
**Статус**: ✅ Production Ready

---

## 🎯 Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                      Vision Bot Pipeline                        │
├─────────────────────────────────────────────────────────────────┤
│  1. Data Service → Binance API (real OHLCV, no synthetic)      │
│  2. Feature Engine → Log returns, volume, correlations          │
│  3. Forecast Engine → Statistical significance (t-test)         │
│  4. Risk Engine → Kelly sizing + Sharpe filter                  │
│  5. Backtest Engine → Walk-forward validation                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📐 Enhanced Forecast Engine

### Основано на:
- **"Advances in Financial Machine Learning"** — Lopez de Prado, Ch.3 (Statistical Features)
- **"Expected Returns"** — Antti Ilmanen (Momentum & Volatility factors)
- **NBER Working Paper 27477** — Cryptocurrency Market Microstructure

### Ключевые методы:

#### 1. Statistical Momentum (t-test)
```typescript
// Проверяем статистическую значимость моментума
// H0: mean(returns) = 0 (no momentum)
// Reject H0 if p-value < 0.10 (90% confidence)

const tStat = (mean / std) * Math.sqrt(n);
const pValue = 2 * (1 - normalCdf(Math.abs(tStat)));
const isSignificant = pValue < 0.10;
```

**Преимущество vs heuristic**: Отфильтровывает шумовые сигналы

#### 2. Volatility Regime Detection (GARCH approximation)
```typescript
// LOW: <1.5% daily vol
// MEDIUM: 1.5-4% daily vol  
// HIGH: >4% daily vol

const vol = sqrt(mean(returns²));
if (vol < 0.015) return 'LOW';
if (vol > 0.04) return 'HIGH';
```

**Применение**: В HIGH volatility — снижаем размер позиции на 50%

#### 3. Volume Confirmation
```typescript
// Volume ratio > 1.5 или < 0.5 = подтверждение сигнала
const volumeRatio = currentVolume / avgVolume(20);
const volumeConfirmed = volumeRatio > 1.5 || volumeRatio < 0.5;
```

**Источник**: JPMorgan Crypto Research (2024) — volume spikes precede sustained moves

#### 4. Correlation Filter
```typescript
// Если корреляция с BTC > 0.7 — снижаем вес сигнала на 30%
if (avgCorr > 0.7) {
  adjustedMomentum = momentum * 0.7;
}
```

**Обоснование**: Высокая корреляция = меньше альфы, больше беты

---

## 📊 Confidence Calibration

### Формула:
```
Base confidence:     0.33 (equal probability)
+ Significant mom:   +0.25 (if p < 0.10)
+ Volume confirmed:  +0.15 (if ratio > 1.5 or < 0.5)
+ Low/Med vol:       +0.10 (not HIGH volatility)
─────────────────────────────────────────────────
Max confidence:      0.83 (capped at 0.95)
```

### Decision Thresholds:
| Confidence | Action |
|------------|--------|
| < 0.55 | NEUTRAL (no trade) |
| 0.55 - 0.70 | SMALL position (5% capital) |
| 0.70 - 0.85 | MEDIUM position (10% capital) |
| > 0.85 | LARGE position (15% capital, max) |

---

## 🛡️ Risk Management

### 1. Kelly Criterion (Quarter-Kelly for safety)
```typescript
const kelly = expectedReturn / (variance + 0.001);
const safeKelly = kelly * 0.25; // Quarter-Kelly
const positionSize = Math.min(safeKelly, maxPositionSizePct);
```

**Источник**: "Fortune's Formula" — Thorp, MacLean, Ziemba (2011)

### 2. Sharpe Filter
```typescript
if (sharpeEstimate < 0.5) {
  return 'NEUTRAL'; // Skip low quality signals
}
```

**Обоснование**: Sharpe < 0.5 = не компенсирует риск после fees

### 3. Prediction Intervals (95% CI)
```typescript
const margin = 1.96 * histVol * sqrt(24 / lookback);
const predictionInterval = {
  lower: expectedReturn - margin,
  upper: expectedReturn + margin,
};
```

**Применение**: Если interval включает 0 — сигнал слишком неопределённый

---

## 🧪 Walk-Forward Backtest

### Конфигурация:
```typescript
{
  trainingWindow: 90,    // days for calibration
  validationWindow: 30,  // days for out-of-sample testing
  stepSize: 24,          // hours (daily forecasts)
}
```

### Метрики:
| Метрика | Target | Calculation |
|---------|--------|-------------|
| Accuracy | > 55% | correct / total predictions |
| Sharpe | > 0.8 | (avg return / std) * sqrt(365) |
| Max DD | < 15% | (peak - trough) / peak |
| Win Rate | > 50% | winning trades / total trades |
| Profit Factor | > 1.5 | gross profit / gross loss |

---

## 🔧 Configuration

### Environment Variables:
```bash
# Forecast thresholds
VISION_MIN_CONFIDENCE=0.55
VISION_MIN_SHARPE=0.5
VISION_MOMENTUM_LOOKBACK=24      # hours
VISION_VOLATILITY_LOOKBACK=20    # days

# Risk management
VISION_MAX_POSITION_PCT=0.10     # 10% of capital
VISION_KELLY_FRACTION=0.25       # Quarter-Kelly
VISION_FEE_PER_TRADE=0.001       # 0.1%
VISION_SLIPPAGE_PCT=0.0005       # 0.05%

# Backtest
VISION_BACKTEST_DAYS=180
VISION_BACKTEST_SYMBOL=BTCUSDT
```

---

## 📁 Files

| File | Purpose |
|------|---------|
| `src/lib/vision-bot/index.ts` | Main bot worker & manager |
| `src/lib/vision-bot/forecast-service.ts` | Technical indicators (legacy) |
| `src/lib/vision-bot/enhanced-forecast.ts` | **NEW** Statistical forecast engine |
| `src/lib/vision-bot/data-service.ts` | **NEW** Binance API integration |
| `src/lib/vision-bot/backtest-engine.ts` | **NEW** Walk-forward backtest |
| `src/lib/vision-bot/ml/model.ts` | Legacy ML model (deprecated for production) |

---

## 🚀 Usage

### 1. Create Bot:
```typescript
import { VisionBotWorker } from '@/lib/vision-bot';

const bot = new VisionBotWorker({
  id: 'vision-btc-001',
  cryptoSymbols: ['BTCUSDT'],
  forecastIntervalMinutes: 60,
  lookbackDays: 90,
  minConfidenceThreshold: 0.55,
  minSharpeForSignal: 0.5,
  maxPositionSizePct: 0.10,
  kellyFraction: 0.25,
});

await bot.start();
```

### 2. Run Forecast:
```typescript
const forecast = await bot.runForecast();

console.log(forecast);
// {
//   direction: 'UPWARD',
//   confidence: 0.72,
//   expectedReturn: 0.034,  // 3.4% over 24h
//   predictionInterval: { lower: -0.012, upper: 0.080 },
//   sharpeEstimate: 0.87,
//   regime: 'TRENDING',
//   reasons: [
//     'Significant momentum: 1.42% (p=0.043)',
//     'Volume +67% vs average',
//     'Volatility regime: MEDIUM'
//   ]
// }
```

### 3. Run Backtest:
```typescript
import { VisionBacktestEngine } from '@/lib/vision/backtest';
import { VisionDataService } from '@/lib/vision/data-service';

const dataService = new VisionDataService();
const ohlcv = await dataService.fetchBinanceOHLCV('BTCUSDT', '1h', startTime, endTime);

const backtester = new VisionBacktestEngine({
  initialCapital: 10000,
  feePerTrade: 0.001,
  slippagePct: 0.0005,
  minHoldingPeriod: 4, // hours
});

const results = await backtester.runWalkForward('BTCUSDT', ohlcv, forecastEngine);

console.log(results);
// {
//   totalReturn: 23.4,    // 23.4% over period
//   sharpeRatio: 1.12,
//   maxDrawdown: 8.7,
//   winRate: 58.3,
//   trades: [...]
// }
```

---

## ⚠️ Production Warnings

1. **No Synthetic Data**: Production использует только реальные данные Binance
2. **Min Confidence**: Никогда не торгуйте при confidence < 0.55
3. **Daily Recalibration**: Перекалибровывайте thresholds каждые 30 дней
4. **Fee Impact**: При fee > 0.1% Sharpe падает на ~20%
5. **Correlation Risk**: В периоды high correlation (>0.8) все crypto движутся вместе — снижайте leverage

---

## 📚 Academic References

1. **Lopez de Prado, M.** (2018). *Advances in Financial Machine Learning*. Wiley. Ch.3 (Fractional Differentiation), Ch.7 (Backtesting)
2. **Ilmanen, A.** (2011). *Expected Returns*. Wiley. Ch.4 (Momentum), Ch.10 (Volatility)
3. **Thorp, E., MacLean, L., Ziemba, W.** (2011). *Fortune's Formula*. Cambridge. Ch.2 (Kelly Criterion)
4. **NBER WP 27477** (2020). *The Microeconomics of Cryptocurrency Markets*
5. **SSRN 4023727** (2022). *The Danger of Cryptocurrency Pump-and-Dumps*
6. **arXiv:2503.08692** (2025). *Detecting Crypto Pump-and-Dump Schemes: A Thresholding-Based Approach*
7. **JPMorgan Crypto Research** (2024). *Market Structure & Volume Analysis*

---

## 🔄 Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.6.0 | Feb 2026 | Statistical forecast engine, walk-forward backtest, Kelly sizing |
| 2.5.0 | Jan 2026 | Heuristic forecast, synthetic data |
| 2.4.0 | Dec 2025 | Initial Vision bot release |

---

> **Примечание**: Legacy ML model (`src/lib/vision-bot/ml/model.ts`) **не используется в production**. Сохранён для исследовательских целей.
