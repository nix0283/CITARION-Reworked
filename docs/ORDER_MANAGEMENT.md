# 📊 Order Management System (Phase 5)

**Version:** 1.4.0  
**Date:** 2025-01-22  
**Status:** ✅ Complete

---

## 📋 Overview

Professional order management system with advanced trading features including ATR-based trailing stops, position scaling, and smart order routing.

### Key Features

- ✅ Smart order routing
- ✅ Order lifecycle management
- ✅ ATR-based trailing stop
- ✅ Position scaling (DCA-style)
- ✅ Risk management
- ✅ Real-time monitoring

---

## 🚀 Quick Start

### Place Order

```typescript
import { getOrderManager } from '@/lib/order-management/order-manager';

const orderManager = getOrderManager(accountId);

const result = await orderManager.placeOrder({
  accountId: 'acc_123',
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'MARKET',
  quantity: 0.001,
  leverage: 10,
});

console.log(result);
// { success: true, orderId: '...', filledQuantity: 0.001, ... }
```

### Set Trailing Stop

```typescript
import { getTrailingStopMonitor } from '@/lib/order-management/trailing-stop-monitor';

const monitor = getTrailingStopMonitor();

// Start monitoring
monitor.start(5000); // Check every 5 seconds

// Set trailing stop for position
await orderManager.setTrailingStop('BTCUSDT', positionId, {
  type: 'ATR',
  atrPeriod: 14,
  atrMultiplier: 2,
  activationPercent: 1,
  minDistance: 50,
  maxDistance: 500,
});
```

---

## 📖 Order Manager API

### OrderManager Class

#### placeOrder(params)

Place order with risk management.

```typescript
interface OrderParams {
  accountId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  reduceOnly?: boolean;
  leverage?: number;
}

interface OrderResult {
  success: boolean;
  orderId?: string;
  clientOrderId?: string;
  filledQuantity?: number;
  averagePrice?: number;
  status?: string;
  error?: string;
  exchange?: string;
}
```

**Example:**

```typescript
// Market order
await orderManager.placeOrder({
  accountId: 'acc_123',
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'MARKET',
  quantity: 0.001,
});

// Limit order
await orderManager.placeOrder({
  accountId: 'acc_123',
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'LIMIT',
  quantity: 0.001,
  price: 50000,
  timeInForce: 'GTC',
});

// Stop order
await orderManager.placeOrder({
  accountId: 'acc_123',
  symbol: 'BTCUSDT',
  side: 'SELL',
  type: 'STOP_MARKET',
  quantity: 0.001,
  stopPrice: 48000,
  reduceOnly: true,
});
```

#### cancelOrder(orderId, symbol)

Cancel existing order.

```typescript
const result = await orderManager.cancelOrder('order-123', 'BTCUSDT');
```

#### setTrailingStop(symbol, positionId, config)

Set trailing stop for position.

```typescript
interface TrailingStopConfig {
  type: 'PERCENT' | 'ATR' | 'Chandelier';
  atrPeriod: number;
  atrMultiplier: number;
  activationPercent: number;
  minDistance: number;
  maxDistance: number;
}

await orderManager.setTrailingStop('BTCUSDT', positionId, {
  type: 'ATR',
  atrPeriod: 14,
  atrMultiplier: 2,
  activationPercent: 1,
  minDistance: 50,
  maxDistance: 500,
});
```

#### scalePosition(params, scales)

Scale into position (DCA-style).

```typescript
interface PositionScale {
  level: number;
  percent: number;
  price?: number;
  triggered: boolean;
}

const result = await orderManager.scalePosition(
  {
    accountId: 'acc_123',
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'LIMIT',
    quantity: 0.003, // Total quantity
  },
  [
    { level: 1, percent: 50, price: 50000, triggered: false },
    { level: 2, percent: 30, price: 49000, triggered: false },
    { level: 3, percent: 20, price: 48000, triggered: false },
  ]
);
```

#### getStats()

Get order manager statistics.

```typescript
interface OrderManagerStats {
  totalOrders: number;
  successfulOrders: number;
  failedOrders: number;
  totalVolume: number;
  avgFillTime: number;
}

const stats = orderManager.getStats();
```

---

## 📈 Trailing Stop Monitor

### TrailingStopMonitor Class

#### start(checkIntervalMs)

Start monitoring positions.

```typescript
const monitor = getTrailingStopMonitor();
monitor.start(5000); // Check every 5 seconds
```

#### stop()

Stop monitoring.

```typescript
monitor.stop();
```

#### addPosition(positionId)

Add position to monitoring.

```typescript
await monitor.addPosition(positionId);
```

#### removePosition(positionId)

Remove position from monitoring.

```typescript
monitor.removePosition(positionId);
```

#### getStats()

Get monitor statistics.

```typescript
interface MonitorStats {
  positionsMonitored: number;
  stopsUpdated: number;
  stopsTriggered: number;
  avgUpdateTime: number;
}

const stats = monitor.getStats();
```

---

## 🎯 Trailing Stop Types

### 1. PERCENT

Fixed percentage trailing stop.

```typescript
{
  type: 'PERCENT',
  activationPercent: 1,  // Activate after 1% profit
  minDistance: 50,       // Minimum $50 distance
  maxDistance: 500,      // Maximum $500 distance
}
```

**Behavior:**
- LONG: Stop = Current Price - Distance
- SHORT: Stop = Current Price + Distance

### 2. ATR (Average True Range)

Volatility-based trailing stop.

```typescript
{
  type: 'ATR',
  atrPeriod: 14,         // 14-period ATR
  atrMultiplier: 2,      // 2x ATR distance
  activationPercent: 1,  // Activate after 1% profit
  minDistance: 50,
  maxDistance: 500,
}
```

**Behavior:**
- Distance = ATR × Multiplier
- Adapts to market volatility
- Wider stops in volatile markets

### 3. Chandelier

Chandelier Exit style trailing stop.

```typescript
{
  type: 'Chandelier',
  atrPeriod: 22,
  atrMultiplier: 3,
  activationPercent: 1,
  minDistance: 50,
  maxDistance: 500,
}
```

**Behavior:**
- Based on highest high (LONG) or lowest low (SHORT)
- Distance = ATR × Multiplier
- Popular for trend following

---

## 📊 Examples

### Example 1: Basic Order with Trailing Stop

```typescript
import { getOrderManager, getTrailingStopMonitor } from '@/lib/order-management';

// Place order
const orderManager = getOrderManager(accountId);
const orderResult = await orderManager.placeOrder({
  accountId: 'acc_123',
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'MARKET',
  quantity: 0.001,
});

// Set trailing stop
await orderManager.setTrailingStop('BTCUSDT', positionId, {
  type: 'ATR',
  atrPeriod: 14,
  atrMultiplier: 2,
  activationPercent: 1,
  minDistance: 50,
  maxDistance: 500,
});

// Start monitor
const monitor = getTrailingStopMonitor();
monitor.start(5000);
```

### Example 2: Scale Into Position

```typescript
// Scale into BTC position at multiple levels
const result = await orderManager.scalePosition(
  {
    accountId: 'acc_123',
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'LIMIT',
    quantity: 0.003,
  },
  [
    { level: 1, percent: 50, price: 50000, triggered: false },
    { level: 2, percent: 30, price: 49000, triggered: false },
    { level: 3, percent: 20, price: 48000, triggered: false },
  ]
);

console.log(`Filled: ${result.orders.filter(o => o.success).length}/3`);
```

### Example 3: Monitor Multiple Positions

```typescript
const monitor = getTrailingStopMonitor();

// Add multiple positions
await monitor.addPosition(positionId1);
await monitor.addPosition(positionId2);
await monitor.addPosition(positionId3);

// Start monitoring
monitor.start(5000);

// Check stats
setInterval(() => {
  const stats = monitor.getStats();
  console.log(`Monitoring ${stats.positionsMonitored} positions`);
  console.log(`Stops updated: ${stats.stopsUpdated}`);
  console.log(`Stops triggered: ${stats.stopsTriggered}`);
}, 60000);
```

---

## 🔧 Configuration

### ATR Period

| Period | Use Case |
|--------|----------|
| 7-10 | Short-term trading |
| 14 | Standard (recommended) |
| 22 | Swing trading |
| 50+ | Long-term trends |

### ATR Multiplier

| Multiplier | Stop Distance | Use Case |
|------------|---------------|----------|
| 1.0-1.5 | Tight | Scalping |
| 2.0-2.5 | Medium | Day trading |
| 3.0+ | Wide | Swing trading |

### Activation Percent

| Percent | Activation | Use Case |
|---------|------------|----------|
| 0.5% | Quick | Scalping |
| 1-2% | Standard | Day trading |
| 3-5% | Slow | Swing trading |

---

## 📈 Performance

### Expected Latency

| Operation | Latency |
|-----------|---------|
| Place Order | 100-500ms |
| Cancel Order | 50-200ms |
| Update Trailing Stop | 10-50ms |
| ATR Calculation | 5-20ms |

### Resource Usage

| Metric | Value |
|--------|-------|
| Memory per Position | ~10KB |
| CPU per Update | <1% |
| Network per Order | 1 request |

---

## 🛡️ Risk Management

### Position Limits

```typescript
// Maximum position size
const maxPositionSize = accountBalance * 0.1; // 10% of balance

// Maximum leverage
const maxLeverage = 10;

// Maximum daily orders
const maxDailyOrders = 100;
```

### Order Validation

- ✅ Quantity must be positive
- ✅ Price required for limit orders
- ✅ Stop price required for stop orders
- ✅ Account balance check
- ✅ Leverage limits

---

## 📊 Monitoring

### Health Check

```typescript
// Check monitor status
const stats = monitor.getStats();

if (stats.positionsMonitored === 0) {
  console.warn('No positions being monitored!');
}

if (stats.avgUpdateTime > 1000) {
  console.warn('Slow update times detected');
}
```

### Logging

```typescript
// Order placed
logger.info({ orderId, symbol, side, quantity }, 'Order placed');

// Trailing stop updated
logger.info({ positionId, oldStop, newStop }, 'Trailing stop updated');

// Stop loss triggered
logger.warn({ positionId, stopPrice }, 'Stop loss triggered');
```

---

## 📚 Related Documentation

- [Security Encryption](./SECURITY_ENCRYPTION.md)
- [Exchange Integration](./EXCHANGE_INTEGRATION.md)
- [Risk Management](./RISK_MANAGEMENT.md)
- [Trading Bots](./TRADING_BOTS.md)

---

**Last Reviewed:** 2025-01-22  
**Next Review:** After each major update
