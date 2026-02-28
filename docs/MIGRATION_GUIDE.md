# 🔄 Migration Guide - API Key Encryption

**Version:** 1.0.0  
**Last Updated:** 2025-01-22  
**Status:** ✅ Production Ready

---

## ⚠️ IMPORTANT WARNING

This migration will **modify sensitive credentials** in your database. 

**BEFORE RUNNING:**
- ✅ Create a full database backup
- ✅ Stop all application instances
- ✅ Test on development/staging first
- ✅ Ensure ENCRYPTION_KEY is properly configured
- ✅ Schedule during maintenance window

---

## 📋 Overview

This migration encrypts all existing unencrypted API keys in your database using AES-256-GCM encryption.

### What Gets Encrypted

| Field | Description |
|-------|-------------|
| `apiKey` | Exchange API key |
| `apiSecret` | Exchange API secret |
| `apiPassphrase` | Exchange API passphrase (OKX, KuCoin) |
| `apiUid` | Exchange API UID (some exchanges) |

### Migration Impact

| Item | Impact |
|------|--------|
| Downtime | 5-10 minutes for most databases |
| Data Loss | None (reversible) |
| Performance | Temporary during migration |
| Rollback | Available via `--rollback` flag |

---

## 🔧 Prerequisites

### 1. Set Encryption Key

Generate and set your encryption key:

```bash
# Generate 32-byte hex key
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to `.env`:
```bash
ENCRYPTION_KEY=your_32_byte_hex_key_here
```

### 2. Backup Database

```bash
# SQLite (default)
cp prisma/dev.db prisma/dev.db.backup

# PostgreSQL
pg_dump -U username citarion > backup.sql

# MySQL
mysqldump -u username -p citarion > backup.sql
```

### 3. Stop Application

```bash
# Stop all running instances
# Ctrl+C if running in terminal
# Or stop your process manager (PM2, systemd, etc.)
```

---

## 🚀 Migration Steps

### Step 1: Dry Run (Recommended)

First, run a dry run to see what will be changed:

```bash
cd C:\Users\CITARION
npx ts-node scripts/migrate-encryption.ts --dry-run --verbose
```

**Expected Output:**
```
🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐
CITARION - API Key Encryption Migration
🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐

Validating encryption setup...
✅ Encryption setup validated
🔍 DRY RUN MODE - No changes will be made
Fetching accounts with credentials...
Found 5 accounts with credentials
Processing batch 1/1
[DRY RUN] Would encrypt: Binance (acc_123)
[DRY RUN] Would encrypt: Bybit (acc_456)
...

============================================================
MIGRATION SUMMARY
============================================================
Total accounts with credentials: 5
Successfully encrypted: 5
Skipped: 0
Errors: 0
------------------------------------------------------------
Verification: 5/5 encrypted
Status: ✅ SUCCESS
============================================================
```

### Step 2: Run Migration

If dry run looks good, run the actual migration:

```bash
npx ts-node scripts/migrate-encryption.ts --yes
```

Or with verbose output:
```bash
npx ts-node scripts/migrate-encryption.ts --yes --verbose
```

**Expected Output:**
```
🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐
CITARION - API Key Encryption Migration
🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐

Validating encryption setup...
✅ Encryption setup validated
Fetching accounts with credentials...
Found 5 accounts with credentials
Processing batch 1/1
✅ Encrypted: Binance (acc_123)
✅ Encrypted: Bybit (acc_456)
...

============================================================
MIGRATION SUMMARY
============================================================
Total accounts with credentials: 5
Successfully encrypted: 5
Skipped: 0
Errors: 0
------------------------------------------------------------
Verification: 5/5 encrypted
Status: ✅ SUCCESS
============================================================

Migration completed successfully
```

### Step 3: Verify Migration

Check that all credentials are encrypted:

```bash
npx ts-node scripts/migrate-encryption.ts --dry-run --verbose
```

All accounts should show as "Skipped (already encrypted)".

### Step 4: Restart Application

```bash
npm run dev
# or
npm start
```

### Step 5: Test Functionality

Test that your exchange connections still work:

1. Go to Settings → Exchanges
2. Click "Test Connection" for each exchange
3. Verify all connections succeed
4. Try placing a test trade (paper trading)

---

## 🔙 Rollback

If you need to rollback (decrypt all keys):

```bash
npx ts-node scripts/migrate-encryption.ts --rollback --yes
```

**⚠️ WARNING:** This will store API keys in plaintext again. Only use for emergencies.

---

## 📊 Command Line Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would be changed without making changes |
| `--rollback` | Decrypt all keys (reverse migration) |
| `--verbose` | Show detailed output for each account |
| `--yes` | Skip confirmation prompt |
| `--help` | Show help message |

### Examples

```bash
# Dry run with verbose output
npx ts-node scripts/migrate-encryption.ts --dry-run --verbose

# Run migration (will prompt for confirmation)
npx ts-node scripts/migrate-encryption.ts

# Run migration without prompt
npx ts-node scripts/migrate-encryption.ts --yes

# Rollback migration
npx ts-node scripts/migrate-encryption.ts --rollback --yes
```

---

## 🐛 Troubleshooting

### Error: "ENCRYPTION_KEY not set"

**Solution:**
```bash
# Set the environment variable
export ENCRYPTION_KEY=your_32_byte_hex_key

# Or add to .env file
echo "ENCRYPTION_KEY=your_32_byte_hex_key" >> .env
```

### Error: "Encryption validation failed"

**Causes:**
1. Invalid ENCRYPTION_KEY format
2. Key is not 32 bytes (64 hex characters)

**Solution:**
```bash
# Generate new key
openssl rand -hex 32

# Verify length (should be 64 characters)
echo -n "your_key" | wc -c
```

### Error: "Database locked" (SQLite)

**Solution:**
```bash
# Make sure no other process is using the database
# Stop the application first
Ctrl+C

# Then run migration
npx ts-node scripts/migrate-encryption.ts --yes
```

### Migration Partially Failed

**Solution:**
1. Check error messages in logs
2. Fix any issues (e.g., corrupt data)
3. Run migration again - it will skip already encrypted accounts
4. If needed, rollback and start fresh

```bash
# Rollback
npx ts-node scripts/migrate-encryption.ts --rollback --yes

# Fix issues
# ...

# Run migration again
npx ts-node scripts/migrate-encryption.ts --yes
```

---

## 📈 Post-Migration Checklist

- [ ] All accounts show as encrypted in verification
- [ ] Application starts without errors
- [ ] Exchange connections test successfully
- [ ] Paper trading works
- [ ] Real trading works (test with small amount)
- [ ] Logs show no decryption errors
- [ ] Backup created and stored securely

---

## 🔍 Verification Queries

### Check Encryption Status (SQLite)

```sql
-- Count encrypted vs unencrypted
SELECT 
  CASE 
    WHEN apiKey LIKE '%:%' THEN 'encrypted'
    ELSE 'plaintext'
  END as status,
  COUNT(*) as count
FROM Account
WHERE apiKey IS NOT NULL
GROUP BY status;
```

### Check Specific Account

```sql
-- Check if specific account is encrypted
SELECT 
  id,
  exchangeName,
  CASE 
    WHEN apiKey LIKE '%:%' THEN 'encrypted'
    ELSE 'plaintext'
  END as encryptionStatus
FROM Account
WHERE id = 'your_account_id';
```

---

## 📝 Migration Log

Keep a record of your migration:

```
Migration Date: 2025-01-22
Performed By: [Your Name]
Database Backup: prisma/dev.db.backup.2025-01-22
Accounts Migrated: 5
Errors: 0
Verification: PASSED
Rollback Tested: YES/N/A
```

---

## 🎯 Best Practices

### 1. Test on Staging First

Always test the migration on a staging/development environment before production.

### 2. Schedule Maintenance Window

Notify users of planned maintenance:
```
Scheduled Maintenance: 2025-01-22 02:00-02:30 UTC
Impact: Trading will be unavailable
Reason: Security upgrade
```

### 3. Monitor During Migration

Watch logs during migration:
```bash
# Tail logs
tail -f logs/app.log

# Or use pm2
pm2 logs
```

### 4. Have Rollback Plan

Keep backup accessible and test rollback procedure on staging.

### 5. Document Everything

Record:
- Migration date and time
- Person who performed migration
- Number of accounts migrated
- Any errors encountered
- Verification results

---

## 📚 Related Documentation

- [Security Encryption](./SECURITY_ENCRYPTION.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Backup & Recovery](./BACKUP_RECOVERY.md)
- [Worklog](./WORKLOG.md)

---

## 🆘 Support

If you encounter issues:

1. Check logs for error messages
2. Review troubleshooting section
3. Verify environment configuration
4. Test on development environment
5. Contact support if needed

---

**Last Reviewed:** 2025-01-22  
**Next Review:** After each major version update
