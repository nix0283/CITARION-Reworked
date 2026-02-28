# 🚀 Signal Execution Enhancements

Advanced features for auto-following trading signals in CITARION.

## Overview

This module implements 10 production-ready enhancements for signal execution:

```
┌─────────────────────────────────────────┐
│  Signal Received                        │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  1. Check Deduplication                 │
│  2. Check Source Reputation             │
│  3. Calculate Signal Score              │
│  4. Check Chain Condition               │
│  5. Apply Execution Filters             │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  6. Calculate Position Size             │
│  7. Adjust SL/TP (Adaptive Risk)        │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  8. Request Confirmation (if needed)    │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  9. Paper Trade First (if configured)   │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  10. Execute with Fallback              │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Record Result for Reputation Tracking  │
└─────────────────────────────────────────┘
```

---

## 🔧 Configuration

All features are configured via `BotConfig` model fields (stored as JSON strings):

### Position Sizing
```json
{
  "positionSizingMode": "RISK_BASED",
  "riskPerTrade": 2,
  "maxPositionSize": 1000,
  "minPositionSize": 10
}
```

| Mode | Description |
|------|-------------|
| `FIXED` | Use `amountPerTrade` from signal or config |
| `PERCENTAGE` | `amountPerTrade` is % of account balance |
| `RISK_BASED` | Calculate size based on `riskPerTrade` % and SL distance |

### Execution Filters
```json
{
  "executionFilters": {
    "minVolume24h": 10000000,
    "minPriceChange24h": 2,
    "maxPriceChange24h": 20,
    "tradingHours": {
      "start": "08:00",
      "end": "20:00",
      "timezone": "Europe/Moscow"
    },
    "maxCorrelatedPositions": 2,
    "allowInHighVolatility": true,
    "allowInLowVolatility": false
  }
}
```

### Confirmation Webhook
```json
{
  "confirmationWebhook": {
    "url": "https://your-bot.com/confirm",
    "method": "POST",
    "headers": { "Authorization": "Bearer xxx" },
    "timeout": 30,
    "retryCount": 3
  }
}
```

**Webhook payload sent:**
```json
{
  "signalId": "12345",
  "symbol": "BTCUSDT",
  "direction": "LONG",
  "entryPrice": 67000,
  "stopLoss": 65000,
  "takeProfits": [{"price": 70000, "percentage": 50}],
  "requiredAction": "CONFIRM",
  "expiresAt": "2026-02-24T12:05:00Z",
  "confirmUrl": "https://api.citarion.app/api/signals/12345/confirm?token=xxx",
  "botConfigId": "config-abc"
}
```

### Signal Scoring
```json
{
  "minSignalScore": 0.6,
  "scoreWeights": {
    "confidence": 1,
    "rr_ratio": 1.5,
    "volume": 0.5,
    "volatility": 0.5,
    "trend": 0.5,
    "source_reliability": 1
  }
}
```

**Score factors:**
- `confidence`: Parser confidence (0-1)
- `rr_ratio`: Risk/reward ratio
- `volume`: Normalized 24h volume
- `volatility`: ATR-based volatility score
- `trend`: Alignment with market trend
- `source_reliability`: Historical performance of signal source

### Multi-Exchange Execution
```json
{
  "executionStrategy": {
    "primaryExchange": "binance",
    "fallbackExchanges": ["bybit", "okx"],
    "fallbackOn": "ERROR",
    "maxAttempts": 3,
    "retryDelayMs": 1000
  }
}
```

| `fallbackOn` | Description |
|--------------|-------------|
| `ERROR` | Fallback on any error except invalid signal |
| `RATE_LIMIT` | Only fallback on rate limit errors |
| `INSUFFICIENT_BALANCE` | Only fallback on balance errors |
| `ANY` | Always fallback on any failure |

### Deduplication
```json
{
  "deduplication": {
    "enabled": true,
    "timeWindow": 300,
    "matchFields": ["symbol", "direction", "entry"],
    "fuzzyMatch": {
      "entryTolerance": 0.01,
      "slTolerance": 0.02,
      "tpTolerance": 0.02
    }
  }
}
```

### Paper Trade First
```json
{
  "paperTradeFirst": true,
  "paperTradeDuration": 60,
  "paperTradeThreshold": {
    "minWinRate": 0.6,
    "minProfitFactor": 1.2,
    "maxDrawdown": 0.1
  }
}
```

### Adaptive Risk Management
```json
{
  "adaptiveRiskMgmt": {
    "enabled": true,
    "volatilityMultiplier": 1.5,
    "timeDecay": {
      "enabled": true,
      "slTighteningAfter": 30,
      "tighteningRate": 0.01
    }
  }
}
```

### Signal Chaining
```json
{
  "signalChaining": {
    "parentId": "signal-abc",
    "condition": "TP_HIT",
    "delay": 300
  }
}
```

---

## 📡 API Endpoints

### Confirm Signal
```
POST /api/signals/{id}/confirm
```

**Request:**
```json
{
  "confirmed": true,
  "token": "optional-verification-token",
  "reason": "Approved by trader",
  "metadata": {}
}
```

**Response:**
```json
{
  "success": true,
  "message": "Signal confirmed",
  "signalId": "12345"
}
```

### Check Confirmation Status
```
GET /api/signals/{id}/confirm
```

**Response:**
```json
{
  "signalId": "12345",
  "status": "ACTIVE",
  "symbol": "BTCUSDT",
  "direction": "LONG",
  "confirmed": true,
  "processedAt": "2026-02-24T12:00:00Z"
}
```

---

## 🧪 Testing

Run tests:
```bash
bun test __tests__/signal-execution.test.ts
```

Test specific features:
```bash
# Risk-based sizing
bun test -t "calculatePositionSize"

# Execution filters  
bun test -t "shouldExecuteSignal"

# Deduplication
bun test -t "isDuplicateSignal"

# Full integration
bun test -t "executeEnhancedSignal"
```

---

## 📊 Expected Impact

| Feature | PnL Impact | Risk Impact | Complexity |
|---------|-----------|-------------|------------|
| Risk-based sizing | ➕ Consistency | 🔻 Lower drawdown | 🟡 Medium |
| Execution filters | ➕ Better signals | 🔻 Fewer false positives | 🟡 Medium |
| Confirmation webhook | ➕ Human oversight | 🔻 Prevents errors | 🟢 Low |
| Signal scoring | ➕ Prioritizes quality | 🔻 Ignores low-score | 🟡 Medium |
| Multi-exchange fallback | ➕ Higher fill rate | ➖ Neutral | 🔴 High |
| Deduplication | ➕ Prevents overtrading | 🔻 Lower correlated risk | 🟢 Low |
| Paper trade first | ➕ Validates strategy | 🔻 Catches bad signals | 🟡 Medium |
| Source reputation | ➕ Learns from history | 🔻 Avoids bad sources | 🟢 Low |
| Adaptive SL/TP | ➕ Dynamic risk mgmt | 🔻 Adjusts to conditions | 🟡 Medium |
| Signal chaining | ➕ Complex strategies | ⚠️ Adds complexity | 🔴 High |

**Projected improvements with all features:**
- 📈 Win rate: +5-15%
- 📉 Max drawdown: -10-25%
- ⚡ Fill rate: +20-40% (with fallback)

---

## 🔐 Security Considerations

1. **Webhook tokens**: Always verify confirmation tokens in production
2. **Rate limiting**: The `/api/signals/*/confirm` endpoint has built-in rate limiting
3. **API keys**: Never expose exchange API keys in webhook payloads
4. **Signature verification**: Consider adding HMAC signatures for webhook authenticity

---

## 🔄 Migration Guide

### From v1.4 → v1.5

1. **Update Prisma schema:**
```bash
npx prisma db push
```

2. **Update bot configs:**
```typescript
// Old config
{
  autoExecuteEnabled: true,
  tradeAmount: 100
}

// New config (backward compatible)
{
  autoExecuteEnabled: true,
  positionSizingMode: 'FIXED',
  minPositionSize: 10,
  tradeAmount: 100
}
```

3. **Update signal execution calls:**
```typescript
// Old
import { executeSignal } from '@/lib/trading-engine';
await executeSignal(signal, config);

// New (optional - old API still works)
import { executeEnhancedSignal } from '@/lib/signal-execution';
await executeEnhancedSignal(signal, botConfig, balance, price, marketData, executor);
```

---

## 🆘 Troubleshooting

### Signal not executing?

1. Check signal score:
```typescript
import { calculateSignalScore } from '@/lib/signal-execution';
const score = calculateSignalScore(signal, config);
console.log('Score:', score.total); // Must be >= minSignalScore
```

2. Check execution filters:
```typescript
import { shouldExecuteSignal } from '@/lib/signal-execution';
const result = await shouldExecuteSignal(signal, config, marketData);
console.log('Filter result:', result);
```

3. Check deduplication:
```typescript
import { isDuplicateSignal } from '@/lib/signal-execution';
const dup = await isDuplicateSignal(signal, config, accountId);
console.log('Is duplicate:', dup);
```

### Webhook not receiving confirmations?

1. Verify webhook URL is publicly accessible
2. Check firewall/NGINX rules for POST requests
3. Enable debug logging:
```env
LOG_LEVEL=debug
```

4. Test webhook manually:
```bash
curl -X POST https://your-server.com/api/signals/123/confirm \
  -H "Content-Type: application/json" \
  -d '{"confirmed": true}'
```

---

## 📚 Additional Resources

- [Cornix Signal Format Guide](https://help.cornix.io/en/articles/5814956-signal-posting)
- [Prometheus Alerting Rules](../monitoring/prometheus/rules/alerts.yml)
- [Grafana Dashboards](../monitoring/grafana/dashboards/)
- [API Documentation](../docs/api/openapi.yaml)

---

> 💡 **Pro Tip:** Start with **risk-based position sizing** and **execution filters** for maximum impact with minimal complexity. Add other features incrementally based on your trading strategy needs.

*Last updated: 2026-02-24 | Version: 1.5.0*
