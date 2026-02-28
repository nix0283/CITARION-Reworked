# 🔐 Security Module - API Key Encryption

**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Last Updated:** 2025-01-22

---

## 📋 Overview

The Security Module provides enterprise-grade encryption for sensitive data storage, specifically designed for protecting exchange API credentials at rest.

### Key Features

- ✅ **AES-256-GCM Encryption** - Industry standard symmetric encryption
- ✅ **Key Derivation** - scrypt-based key derivation for password-based encryption
- ✅ **Audit Logging** - All credential operations are logged
- ✅ **Migration Tools** - Migrate existing unencrypted keys
- ✅ **Validation** - Built-in encryption setup validation

---

## 🔧 Installation

### 1. Environment Variables

Add to `.env`:

```bash
# Option 1: Direct encryption key (RECOMMENDED for production)
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=your_32_byte_hex_key_here

# Option 2: Password-based (for development)
ENCRYPTION_PASSWORD=your_secure_password_here

# IMPORTANT: Never commit these to version control!
```

### 2. Generate Encryption Key

```bash
# Using OpenSSL
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using PowerShell (Windows)
-join ((48..57) + (65..70) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

---

## 📖 Usage

### Encrypt API Credentials

```typescript
import { SecureCredentialManager } from '@/lib/security/credential-manager';

// Store credentials (automatically encrypted)
const result = await SecureCredentialManager.storeCredentials(accountId, {
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  apiPassphrase: 'your-passphrase', // Optional, for OKX/KuCoin
});

if (!result.success) {
  console.error('Failed to store credentials:', result.error);
}
```

### Retrieve Decrypted Credentials

```typescript
import { SecureCredentialManager } from '@/lib/security/credential-manager';

// Get credentials (automatically decrypted)
const credentials = await SecureCredentialManager.getCredentials(accountId);

if (!credentials) {
  throw new Error('Credentials not found');
}

// Use with exchange client
const client = new BinanceClient(credentials, 'futures', false);
```

### Validate Credentials

```typescript
import { SecureCredentialManager } from '@/lib/security/credential-manager';

// Test connection to exchange
const validation = await SecureCredentialManager.validateCredentials(accountId);

if (!validation.valid) {
  console.error('Invalid credentials:', validation.error);
} else {
  console.log(`Valid credentials for ${validation.exchange} (${validation.accountType})`);
}
```

### Delete Credentials

```typescript
import { SecureCredentialManager } from '@/lib/security/credential-manager';

await SecureCredentialManager.deleteCredentials(accountId);
```

---

## 🔄 Migration from Unencrypted Keys

If you have existing unencrypted API keys in your database, run the migration:

```typescript
import { SecureCredentialManager } from '@/lib/security/credential-manager';

async function migrate() {
  const result = await SecureCredentialManager.migrateToEncryption();
  console.log(`Migrated: ${result.migrated}, Errors: ${result.errors}`);
}

migrate();
```

### Migration Script

Create `scripts/migrate-encryption.ts`:

```typescript
#!/usr/bin/env ts-node

import { SecureCredentialManager } from '@/lib/security/credential-manager';
import { logger } from '@/lib/logger';

async function main() {
  logger.info('Starting encryption migration...');
  
  // Validate setup first
  const setup = await SecureCredentialManager.validateSetup();
  if (!setup.valid) {
    logger.error('Encryption setup validation failed:', setup.error);
    process.exit(1);
  }
  
  logger.info('Encryption setup validated');
  
  // Run migration
  const result = await SecureCredentialManager.migrateToEncryption();
  
  logger.info(`Migration completed: ${result.migrated} migrated, ${result.errors} errors`);
  
  if (result.errors > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
```

Run with:
```bash
npx ts-node scripts/migrate-encryption.ts
```

---

## 🔒 Security Best Practices

### 1. Key Management

- ✅ Store `ENCRYPTION_KEY` in environment variables or secrets manager
- ✅ Never commit encryption keys to version control
- ✅ Rotate encryption keys periodically (requires re-encryption of all data)
- ✅ Use different keys for production and development

### 2. Access Control

- ✅ Implement role-based access to credential operations
- ✅ Log all credential access attempts
- ✅ Rate limit credential retrieval endpoints
- ✅ Require re-authentication for sensitive operations

### 3. Audit Trail

All credential operations are logged with:
- Timestamp
- User ID (if authenticated)
- Account ID
- Operation type (store/retrieve/delete)
- IP address (for API requests)

Example log entry:
```json
{
  "level": "info",
  "module": "SecureCredentialManager",
  "action": "credentials_stored",
  "accountId": "acc_123",
  "timestamp": "2025-01-22T10:30:00Z"
}
```

---

## 🧪 Testing

### Unit Tests

```typescript
// __tests__/security/encryption.test.ts
import { encrypt, decrypt, validateEncryptionSetup } from '@/lib/security/encryption';

describe('Encryption', () => {
  it('should encrypt and decrypt data', async () => {
    const original = 'test-data';
    const encrypted = await encrypt(original);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(original);
  });
  
  it('should validate encryption setup', async () => {
    const result = await validateEncryptionSetup();
    expect(result.valid).toBe(true);
  });
  
  it('should produce different encrypted output for same input', async () => {
    const original = 'test-data';
    const encrypted1 = await encrypt(original);
    const encrypted2 = await encrypt(original);
    expect(encrypted1).not.toBe(encrypted2); // Due to random IV and salt
  });
});
```

### Integration Tests

```typescript
// __tests__/security/credential-manager.test.ts
import { SecureCredentialManager } from '@/lib/security/credential-manager';
import { db } from '@/lib/db';

describe('Credential Manager', () => {
  let accountId: string;
  
  beforeEach(async () => {
    // Create test account
    const account = await db.account.create({
      data: {
        userId: 'test-user',
        exchangeId: 'binance',
        exchangeType: 'futures',
      },
    });
    accountId = account.id;
  });
  
  it('should store and retrieve encrypted credentials', async () => {
    const credentials = {
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
    };
    
    // Store
    const storeResult = await SecureCredentialManager.storeCredentials(accountId, credentials);
    expect(storeResult.success).toBe(true);
    
    // Retrieve
    const retrieved = await SecureCredentialManager.getCredentials(accountId);
    expect(retrieved?.apiKey).toBe(credentials.apiKey);
    expect(retrieved?.apiSecret).toBe(credentials.apiSecret);
  });
  
  it('should validate credentials', async () => {
    // Store test credentials
    await SecureCredentialManager.storeCredentials(accountId, {
      apiKey: process.env.TEST_BINANCE_API_KEY!,
      apiSecret: process.env.TEST_BINANCE_API_SECRET!,
    });
    
    // Validate
    const validation = await SecureCredentialManager.validateCredentials(accountId);
    expect(validation.valid).toBe(true);
    expect(validation.exchange).toBe('binance');
  });
});
```

---

## 📊 Encryption Details

### Algorithm: AES-256-GCM

| Parameter | Value | Description |
|-----------|-------|-------------|
| Algorithm | AES-256-GCM | Authenticated encryption |
| Key Length | 256 bits | Maximum security |
| IV Length | 128 bits | Random per encryption |
| Salt Length | 256 bits | Random per encryption |
| Auth Tag | 128 bits | Integrity verification |

### Key Derivation: scrypt

| Parameter | Value | Description |
|-----------|-------|-------------|
| N (CPU/Memory cost) | 16384 | 2^14 iterations |
| r (Block size) | 8 | Block size parameter |
| p (Parallelization) | 1 | Parallel threads |
| Output Length | 256 bits | Derived key size |

### Encrypted Data Format

```
Base64(IV_hex:SALT_hex:AUTH_TAG_hex:ENCRYPTED_hex)
```

Example:
```
YWI6Y2Q6ZWY6MTIzNDU2Nzg5MGFiY2RlZg==
```

Decoded:
```
ab:cd:ef:1234567890abcdef
│  │  │  └─ Encrypted data (hex)
│  │  └──── Auth tag (hex)
│  └─────── Salt (hex)
└────────── IV (hex)
```

---

## 🚨 Security Warnings

### ⚠️ DO NOT

- ❌ Commit `.env` files with encryption keys
- ❌ Log decrypted credentials
- ❌ Share encryption keys via insecure channels
- ❌ Use weak passwords for `ENCRYPTION_PASSWORD`
- ❌ Store encryption keys in client-side code

### ✅ DO

- ✅ Use secrets manager (AWS Secrets Manager, Azure Key Vault, etc.)
- ✅ Rotate encryption keys annually
- ✅ Monitor for unauthorized access attempts
- ✅ Implement rate limiting on credential endpoints
- ✅ Use HTTPS for all API communications

---

## 🔍 Troubleshooting

### Error: "Decryption failed"

**Causes:**
1. Wrong encryption key configured
2. Data corrupted in database
3. Encryption key changed after data was encrypted

**Solutions:**
```bash
# 1. Verify encryption key is set
echo $ENCRYPTION_KEY

# 2. Validate encryption setup
node -e "require('./src/lib/security/encryption').validateEncryptionSetup().then(console.log)"

# 3. Check database for corrupted data
npx prisma studio
# Look for accounts with malformed apiKey/apiSecret
```

### Error: "Invalid encrypted data format"

**Cause:** Data was not encrypted with current format

**Solution:** Run migration
```bash
npx ts-node scripts/migrate-encryption.ts
```

### Error: "scrypt: Memory limit exceeded"

**Cause:** System doesn't have enough memory for key derivation

**Solution:** Reduce scrypt parameters in `encryption.ts`:
```typescript
const SCRYPT_N = 4096; // Reduce from 16384
const SCRYPT_R = 4;    // Reduce from 8
```

---

## 📝 API Reference

### SecureCredentialManager

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `encryptCredentials` | `credentials: ApiCredentials` | `Promise<EncryptedCredentials>` | Encrypt credentials |
| `decryptCredentials` | `encryptedCreds: EncryptedCredentials` | `Promise<ApiCredentials>` | Decrypt credentials |
| `storeCredentials` | `accountId: string, credentials: ApiCredentials` | `Promise<{success, error}>` | Store encrypted |
| `getCredentials` | `accountId: string` | `Promise<ApiCredentials \| null>` | Retrieve decrypted |
| `deleteCredentials` | `accountId: string` | `Promise<{success, error}>` | Delete credentials |
| `validateCredentials` | `accountId: string` | `Promise<CredentialValidationResult>` | Test connection |
| `migrateToEncryption` | none | `Promise<{migrated, errors}>` | Migrate legacy keys |
| `validateSetup` | none | `Promise<{valid, error}>` | Validate encryption |
| `maskCredentials` | `credentials: ApiCredentials` | `MaskedCredentials` | For logging |

---

## 📚 Related Documentation

- [Exchange Integration](./EXCHANGE_INTEGRATION.md)
- [API Security](./API_SECURITY.md)
- [Audit Logging](./AUDIT_LOGGING.md)
- [Deployment Guide](./DEPLOYMENT.md)

---

## 📄 License

MIT License - See LICENSE file for details

---

**Last Reviewed:** 2025-01-22  
**Next Review:** 2025-04-22 (Quarterly security review)
