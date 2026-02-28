# Trading System Architecture

## Overview

**Backtesting** и **Paper Trading** - два дополняющих друг друга компонента для разработки и тестирования торговых стратегий.

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   STRATEGY      │ ───▶ │   BACKTESTING   │ ───▶ │ PAPER TRADING   │
│   Framework     │      │     Engine      │      │     Engine      │
│                 │      │                 │      │                 │
│ • Indicators    │      │ • Historical    │      │ • Real-time     │
│ • Signals       │      │ • Fast          │      │ • Live prices   │
│ • Tactics       │      │ • Metrics       │      │ • Metrics       │
└─────────────────┘      └─────────────────┘      └─────────────────┘
         │                       │                       │
         └───────────────────────┴───────────────────────┘
                                 │
                         ┌───────┴───────┐
                         │   HYPEROPT    │
                         │    Engine     │
                         │               │
                         │ • Backtesting │
                         │ • Paper       │
                         │ • Progressive │
                         └───────────────┘
```

## Workflow

### 1. Strategy Development
```typescript
// 1. Создаём стратегию
const strategy = new RSIStrategy();
strategy.initialize({ rsiPeriod: 14, overbought: 70 });

// 2. Определяем тактики
const tactics: TacticsSet = {
  id: "conservative-1",
  name: "Conservative",
  entry: { type: "LIMIT", positionSize: "PERCENT", positionSizeValue: 2 },
  takeProfit: { type: "FIXED_TP", tpPercent: 3 },
  stopLoss: { type: "PERCENT", slPercent: 1.5 },
};
```

### 2. Backtesting (Historical Data)
```typescript
import { BacktestEngine, createDefaultBacktestConfig } from '@/lib/backtesting';

// Тестируем на исторических данных
const backtestConfig = createDefaultBacktestConfig(
  'rsi-reversal',
  'BTCUSDT',
  '1h',
  tactics
);

const engine = new BacktestEngine(backtestConfig);
const result = await engine.run(candles);

// Анализируем метрики
console.log('Win Rate:', result.metrics.winRate);
console.log('Sharpe Ratio:', result.metrics.sharpeRatio);
console.log('Max Drawdown:', result.metrics.maxDrawdownPercent);
```

### 3. Paper Trading (Real-time)
```typescript
import { getPaperTradingEngine } from '@/lib/paper-trading';

// Запускаем виртуальную торговлю
const paperEngine = getPaperTradingEngine();

const account = paperEngine.createAccount({
  id: 'paper-1',
  name: 'Test Account',
  initialBalance: 10000,
  strategyId: 'rsi-reversal',
  tacticsSets: [tactics],
  autoTrading: true,
});

paperEngine.start(account.id);

// Обновляем цены в реальном времени
paperEngine.updatePrices({ 'BTCUSDT': 45000 });

// Проверяем метрики
console.log('Equity:', account.equity);
console.log('Trades:', account.metrics.totalTrades);
```

### 4. Hyperopt (Optimization)

#### Backtesting Only
```typescript
import { createDefaultHyperoptConfig } from '@/lib/hyperopt';

const config = createDefaultHyperoptConfig(
  'rsi-reversal',
  'BTCUSDT',
  [
    { name: 'rsiPeriod', space: 'quniform', min: 7, max: 30, q: 1 },
    { name: 'positionSize', space: 'uniform', min: 1, max: 5 },
  ]
);

const result = await hyperopt.run(config, candles);
```

#### Paper Trading Only
```typescript
import { createPaperTradingHyperoptConfig } from '@/lib/hyperopt';

const config = createPaperTradingHyperoptConfig(
  'rsi-reversal',
  'BTCUSDT',
  parameters,
  1440  // 24 hours
);

// Оптимизация в реальном времени
```

#### Progressive (Backtesting → Paper Trading)
```typescript
import { createProgressiveHyperoptConfig } from '@/lib/hyperopt';

const config = createProgressiveHyperoptConfig(
  'rsi-reversal',
  'BTCUSDT',
  parameters
);

// 1. Сначала оптимизация на Backtesting (100 итераций)
// 2. Топ 20% лучших переходят в Paper Trading
// 3. Дополнительная оптимизация в Paper Trading
```

## Tactics System

### Entry Tactics
| Type | Description | Parameters |
|------|-------------|------------|
| MARKET | Рыночный ордер | - |
| LIMIT | Лимитный ордер | entryPrices |
| LIMIT_ZONE | В зоне цен | entryZone { min, max } |
| BREAKOUT | Пробой уровня | breakoutLevel, breakoutDirection |
| DCA | Усреднение | dcaCount, dcaStep, dcaSizeMultiplier |

### Exit Tactics
| Type | Description | Parameters |
|------|-------------|------------|
| FIXED_TP | Фиксированный TP | tpPrice, tpPercent |
| MULTI_TP | Множественные TP | targets [{ price, closePercent }] |
| TRAILING_STOP | Скользящий стоп | trailingConfig { type, percentValue, activationProfit } |
| BREAKEVEN | Выход в безубыток | breakevenTrigger |
| TIME_BASED | Выход по времени | maxHoldingTime |

### Stop Loss Types
| Type | Description | Parameters |
|------|-------------|------------|
| FIXED | Фиксированная цена | slPrice |
| PERCENT | Процент от входа | slPercent |
| ATR_BASED | На основе ATR | atrMultiplier, atrPeriod |
| SUPPORT_BASED | На уровнях поддержки | useSupportLevel, levelOffset |

## Metrics Comparison

### Backtesting Metrics
```typescript
interface BacktestMetrics {
  // Basic
  totalTrades: number;
  winRate: number;
  
  // PnL
  totalPnl: number;
  totalPnlPercent: number;
  profitFactor: number;
  
  // Risk-adjusted
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  
  // Drawdown
  maxDrawdown: number;
  maxDrawdownPercent: number;
  
  // Duration
  avgTradeDuration: number;
}
```

### Paper Trading Metrics
```typescript
interface PaperTradingMetrics {
  // Same as BacktestMetrics plus:
  
  // Real-time tracking
  tradingDays: number;
  avgDailyReturn: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  
  // Exposure
  marketExposure: number;
  avgLeverage: number;
}
```

## Integration Points

### Signal → Tactics → Position
```
1. Strategy generates SIGNAL (LONG/SHORT)
2. Tactics determines ENTRY method
3. Tactics sets SL/TP levels
4. Position is opened
5. Trailing stop is activated (if configured)
6. Partial closes on TP hits
7. Position is closed (SL/TP/Signal/Manual)
```

### Events System (Paper Trading)
```typescript
// Подписка на события
paperEngine.subscribe((event) => {
  switch (event.type) {
    case 'POSITION_OPENED':
      console.log('Position opened:', event.data.position);
      break;
    case 'POSITION_CLOSED':
      console.log('Position closed:', event.data.trade);
      break;
    case 'MAX_DRAWDOWN_REACHED':
      console.log('Max drawdown reached!');
      break;
  }
});
```

## Best Practices

### 1. Always Test on Backtesting First
```typescript
// ✅ Good
const backtestResult = await backtest.run(candles);
if (backtestResult.metrics.sharpeRatio > 1) {
  paperEngine.start(account.id);
}

// ❌ Bad
paperEngine.start(account.id); // No backtesting
```

### 2. Use Progressive Optimization
```typescript
// ✅ Good - progressive
const config = createProgressiveHyperoptConfig(...);

// ❌ Bad - paper trading only (too slow)
const config = createPaperTradingHyperoptConfig(...);
```

### 3. Monitor Paper Trading
```typescript
// Set max drawdown limit
paperEngine.subscribe((event) => {
  if (event.type === 'MAX_DRAWDOWN_REACHED') {
    paperEngine.stop(accountId);
    notifyUser('Paper trading stopped due to max drawdown');
  }
});
```

## File Structure

```
src/lib/
├── strategy/
│   ├── types.ts           # Candle, Signal, IStrategy
│   ├── indicators.ts      # Technical indicators
│   ├── builtin.ts         # Built-in strategies
│   ├── manager.ts         # Strategy management
│   └── tactics/
│       ├── types.ts       # TacticsSet, Entry/Exit/SL tactics
│       └── executor.ts    # Tactics execution
│
├── backtesting/
│   ├── types.ts           # BacktestConfig, Position, Trade, Metrics
│   └── engine.ts          # Historical testing
│
├── paper-trading/
│   ├── types.ts           # PaperAccount, Position, Metrics, EquityCurve
│   └── engine.ts          # Real-time simulation
│
└── hyperopt/
    ├── types.ts           # HyperoptConfig, Trial, Result
    └── engine.ts          # Parameter optimization
```
