# 🧬 Genetic Strategy Optimizer (Phase 14)

**Version:** 1.10.0  
**Date:** 2025-01-22  
**Status:** ✅ Complete

---

## 📋 Overview

Genetic algorithm-based strategy optimizer that automatically finds optimal trading parameters through evolutionary computation.

### Key Features

- ✅ Population-based evolution
- ✅ Crossover and mutation
- ✅ Multiple fitness functions (Sharpe, Profit, Sortino)
- ✅ Backtesting integration
- ✅ Overfitting prevention
- ✅ Auto-deploy best strategies
- ✅ Validation on out-of-sample data

---

## 🚀 Quick Start

### Run Optimization

```typescript
import { getGeneticOptimizer } from '@/lib/optimization/genetic-optimizer';

const optimizer = getGeneticOptimizer({
  populationSize: 50,
  generations: 100,
  mutationRate: 0.1,
  crossoverRate: 0.7,
  fitnessFunction: 'SHARPE',
  backtestDays: 90,
  overfittingPrevention: true,
});

const result = await optimizer.optimize('BTCUSDT');

console.log('Best Sharpe:', result.bestMetrics.sharpeRatio);
console.log('Win Rate:', (result.bestMetrics.winRate * 100).toFixed(1) + '%');
console.log('Overfitting Score:', result.overfittingScore);
```

### Deploy Optimized Strategy

```typescript
// Via API
const response = await fetch('/api/optimization/deploy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    optimizationId: 'opt_123',
    symbol: 'BTCUSDT',
  }),
});

const result = await response.json();
```

---

## 📖 Genetic Algorithm

### How It Works

```
1. Initialize Population (50 random strategies)
   ↓
2. Evaluate Fitness (backtest each strategy)
   ↓
3. Selection (tournament selection)
   ↓
4. Crossover (combine best strategies)
   ↓
5. Mutation (random changes)
   ↓
6. New Generation
   ↓
7. Repeat for 100 generations
   ↓
8. Deploy best strategy
```

### Genome Structure

```typescript
interface StrategyGenome {
  // Entry parameters
  rsiPeriod: number;        // 7-21
  rsiOversold: number;      // 20-40
  rsiOverbought: number;    // 60-80
  emaFast: number;          // 5-20
  emaSlow: number;          // 20-50
  macdFast: number;         // 8-15
  macdSlow: number;         // 20-30
  macdSignal: number;       // 5-12
  
  // Exit parameters
  stopLossPercent: number;  // 0.5-3.5%
  takeProfitPercent: number;// 2-8%
  trailingStopEnabled: boolean;
  trailingStopPercent: number;
  
  // Risk parameters
  positionSizePercent: number; // 2-10%
  maxPositions: number;     // 1-5
  leverage: number;         // 1-10
  
  // Filters
  minVolume: number;
  timeFilterEnabled: boolean;
  bestHourStart: number;
  bestHourEnd: number;
}
```

---

## 📊 Configuration

### GeneticConfig

```typescript
interface GeneticConfig {
  populationSize: number;    // Default: 50
  generations: number;       // Default: 100
  mutationRate: number;      // Default: 0.1 (10%)
  crossoverRate: number;     // Default: 0.7 (70%)
  elitismCount: number;      // Default: 5
  fitnessFunction: 'PROFIT' | 'SHARPE' | 'SORTINO' | 'CUSTOM';
  backtestDays: number;      // Default: 90
  validationSplit: number;   // Default: 0.3 (30%)
  overfittingPrevention: boolean;
}
```

### Fitness Functions

| Function | Description | Best For |
|----------|-------------|----------|
| PROFIT | Total return | Aggressive growth |
| SHARPE | Risk-adjusted return | Balanced approach |
| SORTINO | Downside risk-adjusted | Conservative |
| CUSTOM | Combined score | All-around |

### Preset Configurations

#### Conservative

```typescript
{
  populationSize: 30,
  generations: 50,
  mutationRate: 0.05,
  fitnessFunction: 'SORTINO',
  backtestDays: 180,
  overfittingPrevention: true,
}
```

#### Balanced

```typescript
{
  populationSize: 50,
  generations: 100,
  mutationRate: 0.1,
  fitnessFunction: 'SHARPE',
  backtestDays: 90,
  overfittingPrevention: true,
}
```

#### Aggressive

```typescript
{
  populationSize: 100,
  generations: 200,
  mutationRate: 0.15,
  fitnessFunction: 'PROFIT',
  backtestDays: 60,
  overfittingPrevention: false,
}
```

---

## 📈 Optimization Results

### Output Structure

```typescript
interface OptimizationResult {
  bestGenome: StrategyGenome;
  bestMetrics: OptimizationMetrics;
  validationMetrics: OptimizationMetrics;
  generationHistory: Array<{
    generation: number;
    bestFitness: number;
    avgFitness: number;
    worstFitness: number;
  }>;
  overfittingScore: number;  // 0-1 (lower is better)
  completedAt: Date;
}
```

### Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| Total Trades | Number of trades | >50 |
| Win Rate | % winning trades | >55% |
| Profit Factor | Gross profit / Gross loss | >1.5 |
| Sharpe Ratio | Risk-adjusted return | >1.0 |
| Sortino Ratio | Downside risk-adjusted | >1.5 |
| Max Drawdown | Largest peak-to-trough | <20% |
| Total Return | Overall return | >20% |
| Overfitting Score | Training vs validation | <0.3 |

### Example Result

```json
{
  "bestGenome": {
    "rsiPeriod": 14,
    "rsiOversold": 30,
    "rsiOverbought": 70,
    "emaFast": 12,
    "emaSlow": 26,
    "stopLossPercent": 2.0,
    "takeProfitPercent": 4.0,
    "trailingStopEnabled": true,
    "positionSizePercent": 5.0,
    "leverage": 5
  },
  "bestMetrics": {
    "totalTrades": 127,
    "winRate": 0.62,
    "profitFactor": 2.1,
    "sharpeRatio": 1.8,
    "sortinoRatio": 2.3,
    "maxDrawdown": 0.15,
    "totalReturn": 0.45
  },
  "validationMetrics": {
    "winRate": 0.58,
    "sharpeRatio": 1.5,
    "totalReturn": 0.35
  },
  "overfittingScore": 0.15
}
```

---

## 🛡️ Overfitting Prevention

### Validation Split

- 70% training data
- 30% validation data
- Compare metrics between sets

### Overfitting Score

```typescript
overfittingScore = 
  |sharpe_train - sharpe_val| * 0.5 +
  |winRate_train - winRate_val| * 0.3 +
  |drawdown_train - drawdown_val| * 0.2
```

| Score | Interpretation | Action |
|-------|---------------|--------|
| <0.1 | Excellent | Deploy immediately |
| 0.1-0.2 | Good | Deploy with monitoring |
| 0.2-0.3 | Acceptable | Deploy cautiously |
| >0.3 | Poor | Do not deploy |

### Prevention Techniques

1. **Validation split** - Test on unseen data
2. **Limited generations** - Prevent over-optimization
3. **Mutation rate** - Maintain diversity
4. **Fitness function** - Use risk-adjusted metrics
5. **Minimum trades** - Require statistical significance

---

## 📊 API Endpoints

### POST /api/optimization/run

Start optimization.

**Request:**
```json
{
  "symbol": "BTCUSDT",
  "config": {
    "populationSize": 50,
    "generations": 100,
    "fitnessFunction": "SHARPE"
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "bestMetrics": {
      "sharpeRatio": 1.8,
      "winRate": 0.62,
      "totalReturn": 0.45
    },
    "overfittingScore": 0.15,
    "generations": 87
  }
}
```

### GET /api/optimization/results

Get historical optimization results.

**Request:**
```
GET /api/optimization/results?symbol=BTCUSDT
```

### POST /api/optimization/deploy

Deploy optimized strategy.

**Request:**
```json
{
  "optimizationId": "opt_123",
  "symbol": "BTCUSDT"
}
```

### GET /api/optimization/status

Get current optimization status.

**Response:**
```json
{
  "success": true,
  "status": {
    "isRunning": false,
    "generation": 0,
    "populationSize": 0
  }
}
```

---

## 📊 Examples

### Example 1: Basic Optimization

```typescript
import { getGeneticOptimizer } from '@/lib/optimization/genetic-optimizer';

const optimizer = getGeneticOptimizer();
const result = await optimizer.optimize('BTCUSDT');

console.log(`Optimized ${'BTCUSDT'}`);
console.log(`Sharpe: ${result.bestMetrics.sharpeRatio.toFixed(2)}`);
console.log(`Win Rate: ${(result.bestMetrics.winRate * 100).toFixed(1)}%`);
console.log(`Return: ${(result.bestMetrics.totalReturn * 100).toFixed(1)}%`);
```

### Example 2: Custom Configuration

```typescript
const optimizer = getGeneticOptimizer({
  populationSize: 100,
  generations: 200,
  mutationRate: 0.15,
  fitnessFunction: 'SORTINO',
  backtestDays: 180,
  validationSplit: 0.4,
});

const result = await optimizer.optimize('ETHUSDT');

// Check overfitting
if (result.overfittingScore > 0.3) {
  console.warn('High overfitting - do not deploy');
} else {
  console.log('Strategy ready for deployment');
}
```

### Example 3: Compare Multiple Symbols

```typescript
const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const results = [];

for (const symbol of symbols) {
  const optimizer = getGeneticOptimizer();
  const result = await optimizer.optimize(symbol);
  
  results.push({
    symbol,
    sharpe: result.bestMetrics.sharpeRatio,
    winRate: result.bestMetrics.winRate,
    overfitting: result.overfittingScore,
  });
}

// Find best symbol
const best = results.reduce((a, b) => 
  a.sharpe > b.sharpe ? a : b
);

console.log(`Best symbol: ${best.symbol}`);
console.log(`Sharpe: ${best.sharpe.toFixed(2)}`);
```

### Example 4: Deploy Best Strategy

```typescript
// Get latest optimization
const response = await fetch('/api/optimization/results?symbol=BTCUSDT');
const data = await response.json();

if (data.results.length > 0) {
  const latest = data.results[0];
  
  // Check overfitting
  if (latest.overfittingScore < 0.3) {
    // Deploy
    await fetch('/api/optimization/deploy', {
      method: 'POST',
      body: JSON.stringify({
        optimizationId: latest.id,
        symbol: 'BTCUSDT',
      }),
    });
    
    console.log('Strategy deployed!');
  } else {
    console.log('Overfitting too high - skipping deployment');
  }
}
```

---

## 📈 Performance

### Optimization Time

| Population | Generations | Time (BTCUSDT) |
|------------|-------------|----------------|
| 30 | 50 | ~2 minutes |
| 50 | 100 | ~5 minutes |
| 100 | 200 | ~15 minutes |

### Memory Usage

- Population: ~50 individuals
- Per individual: ~1KB
- Total: ~50KB + backtest data

---

## 🛡️ Best Practices

### Optimization

1. **Use SHARPE or SORTINO** - Better than pure profit
2. **Enable overfitting prevention** - Always validate
3. **Minimum 50 trades** - Statistical significance
4. **90+ days backtest** - Various market conditions
5. **Check overfitting score** - Must be <0.3

### Deployment

1. **Start small** - Test with small position size
2. **Monitor closely** - Watch for degradation
3. **Set stop losses** - Protect capital
4. **Re-optimize monthly** - Adapt to changing markets

### Monitoring

1. **Track live performance** - Compare to backtest
2. **Alert on drawdown** - Set maximum drawdown alert
3. **Review weekly** - Check if still profitable
4. **Re-optimize if needed** - When performance degrades

---

## 📚 Related Documentation

- [Advanced Analytics](./ADVANCED_ANALYTICS.md)
- [Signal Trading](./SIGNAL_TRADING.md)
- [Order Management](./ORDER_MANAGEMENT.md)
- [Monitoring & Alerting](./MONITORING_ALERTING.md)

---

**Last Reviewed:** 2025-01-22  
**Next Review:** After each major update
