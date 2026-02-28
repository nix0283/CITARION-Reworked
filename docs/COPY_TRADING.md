# 👥 Copy Trading System (Phase 7)

**Version:** 1.6.0  
**Date:** 2025-01-22  
**Status:** ✅ Complete

---

## 📋 Overview

Complete copy trading system with automatic trade copying, profit sharing automation, and comprehensive master trader analytics.

### Key Features

- ✅ Auto copy engine
- ✅ Profit sharing automation
- ✅ Master trader analytics
- ✅ Risk management
- ✅ Real-time synchronization
- ✅ Performance tracking

---

## 🚀 Quick Start

### Become a Master Trader

```typescript
import { db } from '@/lib/db';

// Create master trader profile
const master = await db.masterTrader.create({
  data: {
    userId: 'user_123',
    name: 'CryptoKing',
    description: 'Professional trader with 5 years experience',
    profitSharePercent: 10,
    minFollowAmount: 100,
    maxFollowAmount: 10000,
    isActive: true,
  },
});
```

### Follow a Master

```typescript
// Start following
await db.copyFollower.create({
  data: {
    userId: 'user_456',
    masterId: 'master_123',
    copyRatio: 0.1,  // Copy 10% of master's trades
    maxFollowAmount: 5000,
    maxPositions: 5,
    active: true,
  },
});
```

### Auto Copy Trade

```typescript
import { getCopyEngine } from '@/lib/copy-trading/copy-engine';

const engine = getCopyEngine();

// When master opens trade
await engine.copyTrade(masterTradeId, 'OPEN');

// When master closes trade
await engine.copyTrade(masterTradeId, 'CLOSE');
```

---

## 📖 Copy Engine

### Configuration

```typescript
interface CopyConfig {
  maxFollowAmount: number;      // Max amount to copy
  minFollowAmount: number;      // Min amount to copy
  copyRatio: number;            // Ratio of master's trade
  maxPositions: number;         // Max concurrent positions
  allowedSymbols: string[];     // Allowed trading pairs
  stopLossPercent?: number;     // Auto stop loss
  takeProfitPercent?: number;   // Auto take profit
  enableTrailingStop: boolean;  // Enable trailing stop
}
```

### Copy Process

```typescript
// 1. Master opens trade
const masterTrade = await db.masterTrade.create({...});

// 2. Copy to followers
const engine = getCopyEngine();
const result = await engine.copyTrade(masterTrade.id, 'OPEN');

// 3. Track results
console.log(`Copied to ${result.copies.filter(c => c.success).length} followers`);

// 4. When master closes
await engine.copyTrade(masterTrade.id, 'CLOSE');
await engine.updateCopyTrade(masterTrade.id, masterPnl);
```

### Risk Management

| Check | Description |
|-------|-------------|
| Max Positions | Limit concurrent trades |
| Daily Copy Limit | Max copies per day |
| Symbol Filter | Only allowed symbols |
| Amount Limits | Min/max copy amounts |
| Active Status | Follower must be active |

---

## 📖 Profit Sharing

### Configuration

```typescript
interface ProfitShareConfig {
  defaultProfitSharePercent: number;  // Default: 10%
  minProfitSharePercent: number;      // Min: 5%
  maxProfitSharePercent: number;      // Max: 30%
  platformFeePercent: number;         // Platform fee: 5%
  minPayoutAmount: number;            // Min payout: $10
  payoutSchedule: 'DAILY' | 'WEEKLY' | 'MONTHLY';
}
```

### Distribution Flow

```typescript
import { getProfitSharingService } from '@/lib/copy-trading/profit-sharing';

const service = getProfitSharingService();

// Calculate profit share
const profitShare = await service.calculateProfitShare(
  masterId,
  periodStart,
  periodEnd
);

console.log(`Total Profit: $${profitShare.totalProfit}`);
console.log(`Master Share: $${profitShare.masterShare}`);
console.log(`Platform Fee: $${profitShare.platformFee}`);

// Distribute profits
const result = await service.distributeProfits();

// Process pending payouts
await service.processDistributions();
```

### Profit Split Example

```
Total Follower Profit: $1000
├── Platform Fee (5%): $50
├── Master Share (10%): $100
└── Followers Keep: $850
```

---

## 📖 Master Analytics

### Performance Metrics

```typescript
import { getMasterAnalyticsService } from '@/lib/copy-trading/master-analytics';

const analytics = getMasterAnalyticsService();

// Get comprehensive stats
const stats = await analytics.getMasterStats(masterId);

console.log(`Win Rate: ${(stats.winRate * 100).toFixed(1)}%`);
console.log(`Total PnL: $${stats.totalPnl.toFixed(2)}`);
console.log(`Profit Factor: ${stats.profitFactor.toFixed(2)}`);
console.log(`Sharpe Ratio: ${stats.sharpeRatio.toFixed(2)}`);
console.log(`Max Drawdown: $${stats.maxDrawdown.toFixed(2)}`);
console.log(`Active Followers: ${stats.activeFollowers}`);
console.log(`AUM: $${stats.totalAUM.toFixed(2)}`);
```

### Grade Scale

| Grade | Win Rate | Profit Factor | Sharpe |
|-------|----------|---------------|--------|
| A+ | ≥70% | ≥3.0 | ≥2.0 |
| A | ≥65% | ≥2.5 | ≥1.5 |
| A- | ≥60% | ≥2.0 | ≥1.0 |
| B+ | ≥55% | ≥1.8 | ≥0.8 |
| B | ≥50% | ≥1.5 | ≥0.5 |
| C | ≥45% | ≥1.2 | ≥0.3 |
| D | ≥40% | ≥1.0 | ≥0.1 |
| F | <40% | <1.0 | <0.1 |

### Risk Metrics

```typescript
const riskMetrics = await analytics.getRiskMetrics(masterId);

console.log(`Max Drawdown: $${riskMetrics.maxDrawdown.toFixed(2)}`);
console.log(`Max Drawdown Duration: ${riskMetrics.maxDrawdownDuration.toFixed(1)}h`);
console.log(`Volatility: ${(riskMetrics.volatility * 100).toFixed(2)}%`);
console.log(`Sharpe Ratio: ${riskMetrics.sharpeRatio.toFixed(2)}`);
console.log(`Sortino Ratio: ${riskMetrics.sortinoRatio.toFixed(2)}`);
console.log(`VaR 95%: ${(riskMetrics.var95 * 100).toFixed(2)}%`);
```

---

## 📊 Examples

### Example 1: Complete Copy Flow

```typescript
import {
  getCopyEngine,
  getProfitSharingService,
  getMasterAnalyticsService,
} from '@/lib/copy-trading';

// Master opens trade
const masterTrade = await db.masterTrade.create({
  data: {
    masterId: 'master_123',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entryPrice: 50000,
    quantity: 0.1,
    leverage: 10,
  },
});

// Copy to followers
const engine = getCopyEngine();
await engine.copyTrade(masterTrade.id, 'OPEN');

// Master closes trade with profit
await db.masterTrade.update({
  where: { id: masterTrade.id },
  data: {
    status: 'CLOSED',
    pnl: 500,  // $500 profit
    closedAt: new Date(),
  },
});

// Update copy trades
await engine.updateCopyTrade(masterTrade.id, 500);

// Distribute profits weekly
const profitService = getProfitSharingService();
await profitService.distributeProfits();
await profitService.processDistributions();

// Get updated analytics
const analytics = getMasterAnalyticsService();
const stats = await analytics.getMasterStats('master_123');
```

### Example 2: Follower Configuration

```typescript
// Conservative follower
await db.copyFollower.create({
  data: {
    userId: 'user_conservative',
    masterId: 'master_123',
    copyRatio: 0.05,        // 5% of master's size
    maxFollowAmount: 1000,  // Max $1000
    maxPositions: 2,        // Max 2 positions
    allowedSymbols: ['BTCUSDT', 'ETHUSDT'],
    stopLossPercent: 5,     // Auto 5% stop loss
    enableTrailingStop: true,
  },
});

// Aggressive follower
await db.copyFollower.create({
  data: {
    userId: 'user_aggressive',
    masterId: 'master_123',
    copyRatio: 0.2,         // 20% of master's size
    maxFollowAmount: 10000, // Max $10000
    maxPositions: 10,       // Max 10 positions
    allowedSymbols: [],     // All symbols
    stopLossPercent: 10,    // Auto 10% stop loss
    enableTrailingStop: true,
  },
});
```

### Example 3: Analytics Dashboard

```typescript
const analytics = getMasterAnalyticsService();

// Get all metrics
const [stats, performance, risk] = await Promise.all([
  analytics.getMasterStats(masterId),
  analytics.getPerformanceMetrics(masterId),
  analytics.getRiskMetrics(masterId),
]);

// Display dashboard
console.log('=== Master Trader Dashboard ===');
console.log(`Grade: ${calculateGrade(stats.winRate, stats.profitFactor, stats.sharpeRatio)}`);
console.log(`Win Rate: ${(stats.winRate * 100).toFixed(1)}%`);
console.log(`Total PnL: $${stats.totalPnl.toFixed(2)}`);
console.log(`Followers: ${stats.activeFollowers}`);
console.log(`AUM: $${stats.totalAUM.toFixed(2)}`);
console.log(`Profit Share Earned: $${stats.profitShareEarned.toFixed(2)}`);

// Performance by period
console.log('\n=== Performance ===');
console.log(`Daily: $${performance.daily.pnl.toFixed(2)} (${performance.daily.trades} trades)`);
console.log(`Weekly: $${performance.weekly.pnl.toFixed(2)} (${performance.weekly.trades} trades)`);
console.log(`Monthly: $${performance.monthly.pnl.toFixed(2)} (${performance.monthly.trades} trades)`);

// Risk metrics
console.log('\n=== Risk ===');
console.log(`Max Drawdown: $${risk.maxDrawdown.toFixed(2)}`);
console.log(`Sharpe Ratio: ${risk.sharpeRatio.toFixed(2)}`);
console.log(`Volatility: ${(risk.volatility * 100).toFixed(2)}%`);
```

---

## 📈 Performance

### Copy Latency

| Operation | Latency |
|-----------|---------|
| Copy to 1 follower | <100ms |
| Copy to 10 followers | <500ms |
| Copy to 100 followers | <2s |
| Profit distribution | <5s |

### Scalability

| Metric | Value |
|--------|-------|
| Max followers per master | 10,000 |
| Max copies per second | 100 |
| Max concurrent positions | 50 |

---

## 🛡️ Risk Management

### Follower Protection

| Feature | Description |
|---------|-------------|
| Max Positions | Limit concurrent trades |
| Daily Copy Limit | Max copies per day |
| Symbol Filter | Only trade allowed symbols |
| Amount Limits | Min/max copy amounts |
| Stop Loss | Auto stop loss option |
| Trailing Stop | Auto trailing stop option |

### Master Requirements

| Requirement | Value |
|-------------|-------|
| Min Win Rate | 50% |
| Min Trades | 20 |
| Min Profit Factor | 1.2 |
| Max Drawdown | <30% |
| Account Age | >30 days |

---

## 📊 Monitoring

### Copy Stats

```typescript
const engine = getCopyEngine();
const stats = engine.getStats();

console.log(`Total Copies: ${stats.totalCopies}`);
console.log(`Successful: ${stats.successfulCopies}`);
console.log(`Failed: ${stats.failedCopies}`);
console.log(`Active Followers: ${stats.activeFollowers}`);
```

### Profit Stats

```typescript
const profitService = getProfitSharingService();
const stats = await profitService.getProfitStats();

console.log(`Total Distributed: $${stats.totalDistributed}`);
console.log(`Platform Fees: $${stats.totalPlatformFees}`);
console.log(`Pending Payouts: ${stats.pendingPayouts}`);
console.log(`Completed Payouts: ${stats.completedPayouts}`);
```

---

## 📚 Related Documentation

- [Order Management](./ORDER_MANAGEMENT.md)
- [Signal Trading](./SIGNAL_TRADING.md)
- [Security Encryption](./SECURITY_ENCRYPTION.md)
- [Risk Management](./RISK_MANAGEMENT.md)

---

**Last Reviewed:** 2025-01-22  
**Next Review:** After each major update
