# 🧠 Advanced Analytics & Risk Management (Phases 11-13)

**Version:** 1.9.0  
**Date:** 2025-01-22  
**Status:** ✅ Complete

---

## 📋 Overview

Advanced analytics system with self-learning capabilities, sophisticated trailing stops, and comprehensive risk management.

### Key Features

- ✅ Trade analysis & self-learning
- ✅ Pattern recognition
- ✅ Multi-level trailing take profit
- ✅ Dynamic trailing stop
- ✅ Time-based trailing
- ✅ Portfolio risk management
- ✅ Position sizing
- ✅ Daily limits

---

## 🚀 Quick Start

### Initialize Trade Analyzer

```typescript
import { getTradeAnalyzer } from '@/lib/analytics/trade-analyzer';

const analyzer = getTradeAnalyzer();

// Build learning model from history
await analyzer.buildLearningModel();

// Analyze a closed trade
const analysis = await analyzer.analyzeTrade({
  id: 'trade_123',
  symbol: 'BTCUSDT',
  direction: 'LONG',
  entryPrice: 50000,
  exitPrice: 51000,
  pnl: 100,
  pnlPercent: 2,
  entryTime: new Date(),
  exitTime: new Date(),
});

// Get recommendations
const recommendations = analyzer.getRecommendations();
```

### Use Advanced Trailing

```typescript
import { getAdvancedTrailingManager, TRAILING_PRESETS } from '@/lib/analytics/advanced-trailing';

const trailingManager = getAdvancedTrailingManager();

// Initialize with preset
await trailingManager.initializePosition(
  positionId,
  'BTCUSDT',
  'LONG',
  50000,
  TRAILING_PRESETS.DAY_TRADING
);

// Update on price change
const result = await trailingManager.updatePosition(positionId, 50500);

if (result.stopUpdated) {
  console.log('Stop loss updated to:', result.newStopPrice);
}
```

### Enable Risk Engine

```typescript
import { getRiskEngine } from '@/lib/analytics/risk-engine';

const riskEngine = getRiskEngine({
  maxPortfolioRisk: 5,
  maxPositionSize: 10,
  maxDailyLoss: 5,
  stopLossRequired: true,
});

// Check before trade
const riskCheck = await riskEngine.checkTrade({
  symbol: 'BTCUSDT',
  direction: 'LONG',
  entryPrice: 50000,
  quantity: 0.1,
  stopLoss: 49000,
  takeProfit: 52000,
  leverage: 5,
});

if (!riskCheck.approved) {
  console.log('Trade rejected:', riskCheck.reason);
}
```

---

## 📖 Trade Analysis System

### Analysis Components

| Component | Description | Score Range |
|-----------|-------------|-------------|
| Entry Quality | How good was the entry | 0-1 |
| Exit Quality | How good was the exit | 0-1 |
| Timing Score | Entry/exit timing | 0-1 |
| Market Condition | Market state at entry | BULLISH/BEARISH/SIDEWAYS/VOLATILE |

### Emotional Factors Tracked

- ✅ Followed signal
- ✅ Deviated from plan
- ✅ Panic exit
- ✅ FOMO entry

### Lessons Generated

```typescript
// Example lessons
[
  'Entry timing could be improved - wait for better setup',
  'Exited too early - consider using trailing stop',
  'Panic exit detected - stick to the plan',
  'FOMO entry detected - wait for pullback',
  'Excellent trade - replicate this setup'
]
```

### Self-Learning Model

```typescript
interface LearningModel {
  patterns: TradePattern[];      // Profitable patterns
  avoidPatterns: TradePattern[]; // Patterns to avoid
  confidenceByCondition: Map<string, number>;
  bestTimeOfDay: string;
  bestDayOfWeek: string;
  bestSymbol: string;
  worstSymbol: string;
  recommendations: string[];
}
```

### Signal Filtering Integration

```typescript
// Check if signal should be executed
const shouldExecute = await analyzer.shouldExecuteSignal({
  symbol: 'BTCUSDT',
  direction: 'LONG',
});

if (!shouldExecute.shouldExecute) {
  console.log('Signal rejected:', shouldExecute.reason);
  console.log('Confidence:', shouldExecute.confidence);
}
```

---

## 📖 Advanced Trailing System

### Multi-Level Trailing Take Profit

```typescript
const trailingTakeProfit = {
  levels: [
    {
      percent: 30,              // Close 30% of position
      trigger: 2,               // Activate at 2% profit
      trailingType: 'ATR',      // Use ATR for trailing
      trailingDistance: 1.5,    // 1.5x ATR distance
      triggered: false,
      executed: false,
    },
    {
      percent: 30,
      trigger: 4,
      trailingType: 'PERCENT',
      trailingDistance: 2,
      triggered: false,
      executed: false,
    },
    {
      percent: 40,
      trigger: 6,
      trailingType: 'HIGH_LOW',
      trailingDistance: 3,
      triggered: false,
      executed: false,
    },
  ],
};
```

### Dynamic Trailing Stop

```typescript
const dynamicTrailingStop = {
  type: 'MODERATE',              // AGGRESSIVE | MODERATE | CONSERVATIVE
  breakevenTrigger: 1,           // Move to BE at 1% profit
  stepPercent: 0.5,              // Trail by 0.5% steps
  minDistance: 1,                // Min 1% distance
  maxDistance: 3,                // Max 3% distance
  volatilityAdjustment: true,    // Adjust by ATR
  activated: false,
  currentStopPrice: 0,
  highestPrice: 0,
};
```

### Preset Configurations

#### Scalping

```typescript
TRAILING_PRESETS.SCALPING = {
  stopLoss: {
    type: 'AGGRESSIVE',
    breakevenTrigger: 0.3,
    stepPercent: 0.3,
    minDistance: 0.3,
    maxDistance: 1,
  },
  takeProfit: {
    levels: [
      { percent: 50, trigger: 0.5, trailingDistance: 0.3 },
      { percent: 50, trigger: 1, trailingDistance: 0.5 },
    ],
  },
};
```

#### Day Trading

```typescript
TRAILING_PRESETS.DAY_TRADING = {
  stopLoss: {
    type: 'MODERATE',
    breakevenTrigger: 1,
    stepPercent: 0.5,
    minDistance: 1,
    maxDistance: 3,
  },
  takeProfit: {
    levels: [
      { percent: 30, trigger: 2, trailingDistance: 1.5 },
      { percent: 30, trigger: 4, trailingDistance: 2 },
      { percent: 40, trigger: 6, trailingDistance: 3 },
    ],
  },
};
```

#### Swing Trading

```typescript
TRAILING_PRESETS.SWING_TRADING = {
  stopLoss: {
    type: 'CONSERVATIVE',
    breakevenTrigger: 2,
    stepPercent: 1,
    minDistance: 2,
    maxDistance: 5,
  },
  takeProfit: {
    levels: [
      { percent: 25, trigger: 5, trailingDistance: 2 },
      { percent: 25, trigger: 10, trailingDistance: 3 },
      { percent: 50, trigger: 15, trailingDistance: 5 },
    ],
  },
};
```

---

## 📖 Risk Management Engine

### Portfolio Risk Limits

| Parameter | Default | Description |
|-----------|---------|-------------|
| maxPortfolioRisk | 5% | Max % of portfolio at risk |
| maxCorrelation | 0.7 | Max correlation between positions |
| maxSectorExposure | 30% | Max exposure per sector |

### Position Risk Limits

| Parameter | Default | Description |
|-----------|---------|-------------|
| maxPositionSize | 10% | Max % per position |
| maxLeverage | 10x | Max leverage allowed |
| stopLossRequired | true | Force stop loss |
| minRiskReward | 1.5 | Min R:R ratio |

### Daily Limits

| Parameter | Default | Description |
|-----------|---------|-------------|
| maxDailyLoss | 5% | Stop after X% loss |
| maxDailyTrades | 20 | Max trades per day |
| cooldownAfterLoss | 30 min | Cooldown after loss |

### Risk Check Response

```typescript
interface RiskCheck {
  approved: boolean;
  reason?: string;
  suggestedSize?: number;
  warnings: string[];
}

// Example response
{
  approved: false,
  reason: 'Position size too large: 15.2% (max: 10%)',
  suggestedSize: 0.065,
  warnings: ['Low R:R ratio: 1.2 (min: 1.5)']
}
```

### Position Sizing

```typescript
const sizing = await riskEngine.calculatePositionSize({
  portfolioValue: 10000,
  entryPrice: 50000,
  stopLoss: 49000,
  riskPercent: 1,
});

console.log(`Recommended size: ${sizing.recommendedSize}`);
console.log(`Risk amount: $${sizing.riskAmount}`);
```

---

## 📊 Examples

### Example 1: Complete Trade Flow with Analytics

```typescript
import { getTradeAnalyzer } from '@/lib/analytics/trade-analyzer';
import { getRiskEngine } from '@/lib/analytics/risk-engine';
import { getAdvancedTrailingManager, TRAILING_PRESETS } from '@/lib/analytics/advanced-trailing';

const analyzer = getTradeAnalyzer();
const riskEngine = getRiskEngine();
const trailingManager = getAdvancedTrailingManager();

// 1. Check risk before trade
const riskCheck = await riskEngine.checkTrade({
  symbol: 'BTCUSDT',
  direction: 'LONG',
  entryPrice: 50000,
  quantity: 0.1,
  stopLoss: 49000,
  takeProfit: 52000,
});

if (!riskCheck.approved) {
  console.log('Trade rejected:', riskCheck.reason);
  return;
}

// 2. Execute trade
const order = await placeOrder({...});

// 3. Initialize trailing
await trailingManager.initializePosition(
  order.id,
  'BTCUSDT',
  'LONG',
  50000,
  TRAILING_PRESETS.DAY_TRADING
);

// 4. Update trailing on price changes
setInterval(async () => {
  const price = await getCurrentPrice('BTCUSDT');
  const result = await trailingManager.updatePosition(order.id, price);
  
  if (result.stopUpdated) {
    console.log('Stop updated to:', result.newStopPrice);
  }
}, 5000);

// 5. Analyze after close
const analysis = await analyzer.analyzeTrade({
  id: order.id,
  symbol: 'BTCUSDT',
  direction: 'LONG',
  entryPrice: 50000,
  exitPrice: 51500,
  pnl: 150,
  pnlPercent: 3,
  entryTime: entryTime,
  exitTime: exitTime,
});

console.log('Lessons:', analysis.lessons);

// 6. Update risk engine
await riskEngine.updateAfterTrade(150);
```

### Example 2: Get Performance Metrics

```typescript
const analyzer = getTradeAnalyzer();

// Get overall performance
const metrics = await analyzer.getPerformanceMetrics();

console.log(`Win Rate: ${(metrics.winRate * 100).toFixed(1)}%`);
console.log(`Profit Factor: ${metrics.profitFactor.toFixed(2)}`);
console.log(`Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`);
console.log(`Max Drawdown: $${metrics.maxDrawdown.toFixed(2)}`);
console.log(`Best Symbol: ${metrics.bestSymbol}`);
console.log(`Worst Symbol: ${metrics.worstSymbol}`);

// Get symbol-specific metrics
const btcMetrics = await analyzer.getPerformanceMetrics('BTCUSDT');
```

### Example 3: Risk-Aware Trading

```typescript
const riskEngine = getRiskEngine({
  maxDailyLoss: 3,      // Stop after 3% daily loss
  maxPositionSize: 5,   // Max 5% per position
  stopLossRequired: true,
});

// Check before each trade
async function executeTradeIfSafe(tradeParams: any) {
  const riskCheck = await riskEngine.checkTrade(tradeParams);
  
  if (!riskCheck.approved) {
    console.log('Trade rejected:', riskCheck.reason);
    return false;
  }
  
  if (riskCheck.warnings.length > 0) {
    console.log('Warnings:', riskCheck.warnings);
  }
  
  // Adjust size if suggested
  const quantity = riskCheck.suggestedSize || tradeParams.quantity;
  
  // Execute trade
  await placeOrder({...tradeParams, quantity});
  
  return true;
}
```

---

## 📈 Performance Metrics

### Trade Analysis Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| Entry Quality | Entry timing score | >0.7 |
| Exit Quality | Exit timing score | >0.7 |
| Win Rate | % winning trades | >55% |
| Profit Factor | Gross profit / Gross loss | >1.5 |
| Sharpe Ratio | Risk-adjusted return | >1.0 |

### Risk Metrics

| Metric | Description | Limit |
|--------|-------------|-------|
| Portfolio Risk | Total % at risk | <5% |
| Position Size | Max % per position | <10% |
| Daily Loss | Max daily loss | <5% |
| Correlation | Position correlation | <0.7 |

---

## 🛡️ Best Practices

### Trade Analysis

1. **Analyze every trade** - Win or lose
2. **Review lessons** - Learn from mistakes
3. **Follow recommendations** - Trust the data
4. **Track patterns** - Replicate success

### Trailing Stops

1. **Use presets** - Start with recommended settings
2. **Adjust for volatility** - Higher vol = wider stops
3. **Scale out** - Take partial profits
4. **Move to breakeven** - Protect capital

### Risk Management

1. **Always use stop loss** - Never trade without
2. **Respect daily limits** - Stop when limit reached
3. **Size positions properly** - Don't over-leverage
4. **Monitor correlation** - Diversify positions

---

## 📚 Related Documentation

- [Order Management](./ORDER_MANAGEMENT.md)
- [Signal Trading](./SIGNAL_TRADING.md)
- [Copy Trading](./COPY_TRADING.md)
- [Monitoring & Alerting](./MONITORING_ALERTING.md)

---

**Last Reviewed:** 2025-01-22  
**Next Review:** After each major update
