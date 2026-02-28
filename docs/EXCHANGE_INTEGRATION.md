# 🔌 Exchange Integration Guide

**Version:** 1.3.0  
**Last Updated:** 2025-01-22  
**Status:** ✅ Production Ready

---

## 📋 Overview

This guide covers the secure integration of exchange clients with the CITARION platform, including encryption, circuit breakers, and credential management.

### Security Enhancements

| Feature | Description | Status |
|---------|-------------|--------|
| Credential Encryption | AES-256-GCM encryption for API keys | ✅ Active |
| Secure Storage | Credentials encrypted at rest in database | ✅ Active |
| Circuit Breaker | Fault tolerance for exchange API calls | ✅ Active |
| Rate Limiting | Protection against API rate limits | ✅ Active |
| Audit Logging | All credential operations logged | ✅ Active |

---

## 🚀 Quick Start

### Using Secure Exchange Client

```typescript
import { createSecureExchangeClient } from '@/lib/exchange';

// Create client with automatic credential retrieval
const client = await createSecureExchangeClient({
  exchangeId: 'binance',
  accountId: 'acc_123',  // Credentials retrieved from database
  marketType: 'futures',
  useCircuitBreaker: true,
});

// Use client normally - circuit breaker wraps all calls
const balance = await client.getAccountInfo();
const positions = await client.getPositions();
```

### Manual Credential Management

```typescript
import { SecureCredentialManager } from '@/lib/security/credential-manager';
import { createSecureExchangeClient } from '@/lib/exchange';

// Store credentials (encrypted automatically)
await SecureCredentialManager.storeCredentials(accountId, {
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
});

// Create client with accountId
const client = await createSecureExchangeClient({
  exchangeId: 'binance',
  accountId: accountId,
});
```

---

## 🔐 Credential Management

### Storing Credentials

```typescript
import { SecureCredentialManager } from '@/lib/security/credential-manager';

// Store with encryption
const result = await SecureCredentialManager.storeCredentials(accountId, {
  apiKey: 'binance-api-key',
  apiSecret: 'binance-api-secret',
  apiPassphrase: 'optional-passphrase',  // For OKX, KuCoin
});

if (!result.success) {
  console.error('Failed to store credentials:', result.error);
}
```

### Retrieving Credentials

```typescript
// Get decrypted credentials
const credentials = await SecureCredentialManager.getCredentials(accountId);

if (!credentials) {
  throw new Error('Credentials not found');
}

// Use with exchange client
const client = new BinanceClient(credentials, 'futures', false);
```

### Validating Credentials

```typescript
// Test connection to exchange
const validation = await SecureCredentialManager.validateCredentials(accountId);

if (!validation.valid) {
  console.error('Invalid credentials:', validation.error);
} else {
  console.log(`Valid credentials for ${validation.exchange} (${validation.accountType})`);
}
```

### Deleting Credentials

```typescript
await SecureCredentialManager.deleteCredentials(accountId);
```

---

## ⚡ Circuit Breaker Integration

### Automatic Wrapping

When using `createSecureExchangeClient`, circuit breaker is automatically applied:

```typescript
const client = await createSecureExchangeClient({
  exchangeId: 'binance',
  accountId: 'acc_123',
  useCircuitBreaker: true,  // Default: true
});

// All API calls are protected
try {
  const balance = await client.getAccountInfo();
} catch (error) {
  if (error.message.includes('Circuit breaker')) {
    console.log('Circuit is OPEN - exchange API unavailable');
  }
}
```

### Manual Circuit Breaker

```typescript
import { getExchangeCircuitBreaker } from '@/lib/security/circuit-breaker';

const breaker = getExchangeCircuitBreaker('binance');

const result = await breaker.execute(async () => {
  return await binanceClient.getBalance();
});

if (!result.success) {
  console.log('Circuit breaker prevented call:', result.circuitState);
  console.log('Error:', result.error);
}
```

### Circuit Breaker Configuration

```typescript
import { getCircuitBreaker } from '@/lib/security/circuit-breaker';

const breaker = getCircuitBreaker('binance-custom', {
  failureThreshold: 5,       // Open after 5 failures
  successThreshold: 3,       // Close after 3 successes in half-open
  resetTimeout: 60_000,      // Try again after 1 minute
  monitoringWindow: 60_000,  // Count failures in 1 minute window
});
```

### Circuit Breaker States

| State | Behavior | When |
|-------|----------|------|
| **CLOSED** | Normal operation | System healthy |
| **OPEN** | Requests fail immediately | Too many failures |
| **HALF_OPEN** | Limited test requests | Testing recovery |

---

## 📊 Supported Exchanges

### Active Exchanges

| Exchange | Spot | Futures | Testnet | Demo | Passphrase |
|----------|------|---------|---------|------|------------|
| Binance | ✅ | ✅ | ✅ | ❌ | ❌ |
| Bybit | ✅ | ✅ | ✅ | ❌ | ❌ |
| OKX | ✅ | ✅ | ❌ | ❌ | ✅ |
| Bitget | ✅ | ✅ | ❌ | ✅ | ✅ |
| BingX | ✅ | ✅ | ❌ | ✅ | ❌ |

### Disabled Exchanges (Available on Request)

- KuCoin
- Coinbase
- Huobi
- HyperLiquid
- BitMEX
- BloFin
- Aster
- Gate.io

---

## 🔧 Usage Examples

### Binance Futures

```typescript
import { createSecureExchangeClient } from '@/lib/exchange';

const client = await createSecureExchangeClient({
  exchangeId: 'binance',
  accountId: 'acc_binance_1',
  marketType: 'futures',
});

// Get account info
const account = await client.getAccountInfo();
console.log('Balance:', account.totalEquity);

// Get positions
const positions = await client.getPositions();
console.log('Open positions:', positions.length);

// Create order
const order = await client.createOrder({
  symbol: 'BTCUSDT',
  side: 'buy',
  type: 'limit',
  quantity: 0.001,
  price: 50000,
  timeInForce: 'GTC',
});

// Close position
const closeResult = await client.closePosition({
  symbol: 'BTCUSDT',
});
```

### Bybit with Circuit Breaker

```typescript
import { createSecureExchangeClient } from '@/lib/exchange';
import { getExchangeCircuitBreaker } from '@/lib/security/circuit-breaker';

const client = await createSecureExchangeClient({
  exchangeId: 'bybit',
  accountId: 'acc_bybit_1',
  marketType: 'futures',
  useCircuitBreaker: true,
});

// Monitor circuit breaker state
const breaker = getExchangeCircuitBreaker('bybit');
setInterval(() => {
  const stats = breaker.getStats();
  console.log('Circuit state:', stats.state);
  console.log('Failures:', stats.failureCount);
}, 60000);
```

### OKX with Passphrase

```typescript
import { SecureCredentialManager } from '@/lib/security/credential-manager';

// Store credentials with passphrase
await SecureCredentialManager.storeCredentials(accountId, {
  apiKey: 'okx-api-key',
  apiSecret: 'okx-api-secret',
  apiPassphrase: 'okx-passphrase',  // Required for OKX
});

// Create client
const client = await createSecureExchangeClient({
  exchangeId: 'okx',
  accountId: accountId,
  marketType: 'futures',
});
```

---

## 🛡️ Security Best Practices

### 1. Never Hardcode Credentials

```typescript
// ❌ BAD - Hardcoded credentials
const client = new BinanceClient({
  apiKey: 'hardcoded-key',
  apiSecret: 'hardcoded-secret',
});

// ✅ GOOD - Use SecureCredentialManager
const client = await createSecureExchangeClient({
  exchangeId: 'binance',
  accountId: 'acc_123',
});
```

### 2. Validate Before Trading

```typescript
// Validate credentials before first use
const validation = await SecureCredentialManager.validateCredentials(accountId);
if (!validation.valid) {
  throw new Error('Invalid exchange credentials');
}

// Check circuit breaker state
const breaker = getExchangeCircuitBreaker('binance');
if (breaker.isOpen()) {
  throw new Error('Exchange API temporarily unavailable');
}
```

### 3. Handle Errors Gracefully

```typescript
try {
  const order = await client.createOrder(params);
} catch (error) {
  if (error.message.includes('Circuit breaker')) {
    // Exchange API unavailable - use fallback
    logger.warn('Exchange API down, using fallback');
  } else if (error.message.includes('rate limit')) {
    // Rate limited - wait and retry
    await sleep(60000);
  } else {
    // Other errors - log and notify
    logger.error('Order failed', error);
  }
}
```

### 4. Monitor Circuit Breaker

```typescript
// Set up monitoring
const breaker = getExchangeCircuitBreaker('binance');

setInterval(() => {
  const stats = breaker.getStats();
  
  if (stats.state === 'OPEN') {
    sendAlert('Binance circuit breaker is OPEN');
  }
  
  if (stats.failureCount > 3) {
    logger.warn('High failure rate on Binance', stats);
  }
}, 60000);
```

### 5. Rotate API Keys

```typescript
// Rotate API keys periodically
async function rotateApiKeys(accountId: string, newCredentials: ApiCredentials) {
  // Store new credentials
  await SecureCredentialManager.storeCredentials(accountId, newCredentials);
  
  // Validate new credentials
  const validation = await SecureCredentialManager.validateCredentials(accountId);
  if (!validation.valid) {
    throw new Error('New credentials invalid');
  }
  
  // Log rotation
  logger.info({ accountId }, 'API keys rotated');
}
```

---

## 📈 Monitoring

### Circuit Breaker Metrics

```typescript
import { getCircuitBreakerRegistry } from '@/lib/security/circuit-breaker';

const registry = getCircuitBreakerRegistry();
const stats = registry.getAllStats();

// Example stats output
{
  'exchange:binance': {
    state: 'CLOSED',
    failureCount: 2,
    successCount: 150,
    totalRequests: 152,
    avgResponseTime: 245.5,
  },
  'exchange:bybit': {
    state: 'HALF_OPEN',
    failureCount: 5,
    successCount: 1,
    totalRequests: 200,
    avgResponseTime: 512.3,
  },
}
```

### Credential Access Logging

All credential operations are automatically logged:

```json
{
  "level": "info",
  "module": "SecureCredentialManager",
  "action": "credentials_retrieved",
  "accountId": "acc_123",
  "exchangeId": "binance",
  "apiKey": "binance****abcd",
  "timestamp": "2025-01-22T10:30:00Z"
}
```

---

## 🧪 Testing

### Unit Tests

```typescript
// __tests__/exchange/secure-client.test.ts
import { createSecureExchangeClient } from '@/lib/exchange';
import { SecureCredentialManager } from '@/lib/security/credential-manager';

describe('Secure Exchange Client', () => {
  let accountId: string;
  
  beforeEach(async () => {
    // Create test account with credentials
    const account = await db.account.create({
      data: {
        userId: 'test-user',
        exchangeId: 'binance',
        exchangeType: 'futures',
      },
    });
    accountId = account.id;
    
    // Store test credentials
    await SecureCredentialManager.storeCredentials(accountId, {
      apiKey: process.env.TEST_BINANCE_API_KEY!,
      apiSecret: process.env.TEST_BINANCE_API_SECRET!,
    });
  });
  
  it('should create client with secure credentials', async () => {
    const client = await createSecureExchangeClient({
      exchangeId: 'binance',
      accountId: accountId,
    });
    
    expect(client).toBeDefined();
    expect(client.exchange).toBe('binance');
  });
  
  it('should wrap with circuit breaker', async () => {
    const client = await createSecureExchangeClient({
      exchangeId: 'binance',
      accountId: accountId,
      useCircuitBreaker: true,
    });
    
    // Circuit breaker should be active
    const result = await client.testConnection();
    expect(result.success).toBe(true);
  });
  
  it('should fail with invalid credentials', async () => {
    await SecureCredentialManager.storeCredentials(accountId, {
      apiKey: 'invalid-key',
      apiSecret: 'invalid-secret',
    });
    
    const client = await createSecureExchangeClient({
      exchangeId: 'binance',
      accountId: accountId,
    });
    
    const result = await client.testConnection();
    expect(result.success).toBe(false);
  });
});
```

---

## 🔍 Troubleshooting

### Error: "No credentials found for account"

**Solution:**
```typescript
// Store credentials first
await SecureCredentialManager.storeCredentials(accountId, {
  apiKey: 'your-key',
  apiSecret: 'your-secret',
});
```

### Error: "Circuit breaker is OPEN"

**Solution:**
1. Wait for reset timeout (default: 60 seconds)
2. Check exchange status
3. Manually reset if needed:
```typescript
const breaker = getExchangeCircuitBreaker('binance');
breaker.reset();
```

### Error: "Credential validation failed"

**Solution:**
1. Verify API keys are correct
2. Check API key permissions on exchange
3. Ensure IP whitelist includes your server
4. Test with exchange's own interface

### Error: "Passphrase required"

**Solution:**
```typescript
// Include passphrase for OKX, KuCoin
await SecureCredentialManager.storeCredentials(accountId, {
  apiKey: 'okx-key',
  apiSecret: 'okx-secret',
  apiPassphrase: 'okx-passphrase',  // Required
});
```

---

## 📚 API Reference

### createSecureExchangeClient

```typescript
async function createSecureExchangeClient(options: {
  exchangeId: ExchangeId;
  accountId?: string;
  credentials?: ApiCredentials;
  marketType?: MarketType;
  testnet?: boolean;
  tradingMode?: TradingMode;
  useCircuitBreaker?: boolean;
}): Promise<BaseExchangeClient>
```

### SecureCredentialManager

| Method | Description |
|--------|-------------|
| `storeCredentials` | Store encrypted credentials |
| `getCredentials` | Retrieve decrypted credentials |
| `validateCredentials` | Test connection to exchange |
| `deleteCredentials` | Remove credentials |
| `maskCredentials` | Mask for logging |

### Circuit Breaker

| Method | Description |
|--------|-------------|
| `execute` | Run function with protection |
| `getStats` | Get statistics |
| `reset` | Reset to closed state |
| `isOpen` | Check if open |
| `getState` | Get current state |

---

## 📚 Related Documentation

- [Security Encryption](./SECURITY_ENCRYPTION.md)
- [Rate Limiting](./RATE_LIMITING.md)
- [Circuit Breaker](./CIRCUIT_BREAKER.md)
- [Migration Guide](./MIGRATION_GUIDE.md)

---

**Last Reviewed:** 2025-01-22  
**Next Review:** 2025-04-22
