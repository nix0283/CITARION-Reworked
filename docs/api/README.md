# CITARION API Documentation

## 📚 Overview

This directory contains the OpenAPI 3.0 specification for the CITARION trading platform API.

### Quick Links
- [OpenAPI Spec (YAML)](./openapi.yaml)
- [Swagger UI](https://citarion.app/api/docs) *(when deployed)*
- [Postman Collection](./citarion-api.postman_collection.json) *(coming soon)*

---

## 🚀 Getting Started

### View Documentation Locally

1. Install Swagger UI:
```bash
npm install -g swagger-cli
```

2. Serve the spec:
```bash
npx swagger-ui-watcher ./docs/api/openapi.yaml
# Opens at http://localhost:8080
```

### Generate API Client

```bash
# TypeScript client
npx openapi-typescript ./docs/api/openapi.yaml -o ./src/types/api.ts

# Python client
openapi-generator generate -i ./docs/api/openapi.yaml -g python -o ./clients/python

# JavaScript/Node client
openapi-generator generate -i ./docs/api/openapi.yaml -g typescript-axios -o ./clients/js
```

---

## 🔑 Authentication

### API Key Authentication

Most endpoints require an API key:

```bash
curl -X POST https://api.citarion.app/api/trade/open \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{"symbol":"BTCUSDT","direction":"LONG","amount":100,"leverage":10}'
```

### TradingView Webhook Signature

Webhook endpoints use HMAC-SHA256 signatures:

```javascript
// Generate signature (Node.js)
const crypto = require('crypto');
const secret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
const payload = JSON.stringify({ symbol: 'BTCUSDT', action: 'buy' });
const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

// Send with header
fetch('https://api.citarion.app/api/webhook/tradingview', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-TradingView-Signature': signature,
  },
  body: payload,
});
```

---

## 📡 Rate Limiting

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| General API | 60 req | 1 minute |
| Trading endpoints | 10 req | 1 minute |
| Webhooks | 100 req | 1 minute |

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1708776000
Retry-After: 30
```

---

## 📦 Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-02-24T12:00:00.000Z",
  "requestId": "abc123-def456"
}
```

### Error Response
```json
{
  "error": "VALIDATION_ERROR",
  "code": "VALIDATION_ERROR",
  "message": "Leverage must be at most 125",
  "details": {
    "fieldErrors": {
      "leverage": ["Leverage must be at most 125"]
    }
  },
  "timestamp": "2026-02-24T12:00:00.000Z",
  "requestId": "abc123-def456"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMITED` | 429 | Too many requests |
| `CONFLICT` | 409 | Resource conflict |
| `INTERNAL_ERROR` | 500 | Server error |
| `DATABASE_ERROR` | 503 | Database unavailable |
| `EXCHANGE_ERROR` | 502 | Exchange API error |
| `TIMEOUT_ERROR` | 504 | Request timeout |
| `INSUFFICIENT_BALANCE` | 400 | Not enough funds |
| `INVALID_ORDER` | 400 | Order parameters invalid |
| `POSITION_NOT_FOUND` | 404 | Position doesn't exist |
| `SIGNAL_EXECUTION_FAILED` | 400 | Signal could not be executed |

---

## 🔄 Webhooks

### TradingView Alert Setup

1. Create alert in TradingView
2. Set webhook URL: `https://api.citarion.app/api/webhook/tradingview`
3. Message format:
```json
{
  "symbol": "{{ticker}}",
  "action": "{{strategy.order.action}}",
  "direction": "{{plot.color == 'green' ? 'LONG' : 'SHORT'}}",
  "price": "{{close}}",
  "stopLoss": {{strategy.order.stop_loss}},
  "takeProfit": {{strategy.order.take_profit}},
  "leverage": 10
}
```

### Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start the bot |
| `/help` | Show help message |
| `/balance` | Show account balance |
| `/positions` | List open positions |
| `/signals` | List active signals |
| `/status` | Show bot status |
| `/close all` | Close all positions |

Signal format: `#BTCUSDT LONG Entry: 67000 TP: 70000 SL: 65000`

---

## 🛠️ Development

### Update OpenAPI Spec

1. Edit `openapi.yaml`
2. Validate:
```bash
npx swagger-cli validate ./docs/api/openapi.yaml
```
3. Regenerate types:
```bash
bun run api:generate
```

### Add New Endpoint

1. Add path to `openapi.yaml`
2. Update Zod schema in `src/lib/validation/schemas.ts`
3. Implement handler with `withApiHandler` wrapper
4. Add tests in `__tests__/api-endpoints.test.ts`

---

## 📊 Monitoring

### Health Check
```bash
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "version": "1.4.0",
  "uptime": 3600,
  "checks": {
    "database": "ok",
    "memory": "ok"
  }
}
```

### Prometheus Metrics
```bash
GET /metrics
# Requires PROMETHEUS_ENABLED=true
```

---

## 📝 Changelog

### v1.4.0 (2026-02-24)
- ✅ Complete OpenAPI 3.0 specification
- ✅ Centralized error handling with error codes
- ✅ Rate limiting headers in responses
- ✅ Request ID tracking for debugging
- ✅ Zod validation schemas documented

### v1.3.0 (2026-02-24)
- ✅ Zod validation for all public endpoints
- ✅ Pino structured logging
- ✅ Security headers and CORS configuration

### v1.2.0 (2026-02-24)
- ✅ Health check endpoint
- ✅ Rate limiting middleware
- ✅ OHLCV caching layer

---

## 🆘 Support

- 📧 Email: support@citarion.app
- 💬 Telegram: @citarion_support
- 🐛 Issues: https://github.com/citarion/citarion/issues
- 📖 Docs: https://docs.citarion.app
