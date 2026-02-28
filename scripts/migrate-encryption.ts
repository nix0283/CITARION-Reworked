#!/usr/bin/env ts-node
/**
 * Migration Script - Encrypt Existing API Keys
 * 
 * This script migrates all unencrypted API keys in the database
 * to the new encrypted format using AES-256-GCM.
 * 
 * IMPORTANT: 
 * - Backup your database before running!
 * - Ensure ENCRYPTION_KEY is set in .env
 * - Run during maintenance window
 * - All app instances should be stopped during migration
 * 
 * Usage:
 *   npx ts-node scripts/migrate-encryption.ts
 * 
 * With rollback:
 *   npx ts-node scripts/migrate-encryption.ts --rollback
 */

import { db } from '../src/lib/db';
import { encrypt, decrypt, isEncrypted, validateEncryptionSetup } from '../src/lib/security/encryption';
import { SecureCredentialManager } from '../src/lib/security/credential-manager';
import { logger } from '../src/lib/logger';

// ==================== CONFIGURATION ====================

const CONFIG = {
  batchSize: 10,              // Process accounts in batches
  delayBetweenBatches: 100,   // ms delay between batches
  dryRun: process.argv.includes('--dry-run'),
  rollback: process.argv.includes('--rollback'),
  verbose: process.argv.includes('--verbose'),
};

// ==================== TYPES ====================

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
  rolledBack: number;
}

interface AccountCredential {
  id: string;
  apiKey: string | null;
  apiSecret: string | null;
  apiPassphrase: string | null;
  apiUid: string | null;
  exchangeId: string;
  exchangeName: string;
}

// ==================== MIGRATION FUNCTIONS ====================

/**
 * Validate environment and setup
 */
async function validateSetup(): Promise<boolean> {
  logger.info('Validating encryption setup...');
  
  // Check ENCRYPTION_KEY
  if (!process.env.ENCRYPTION_KEY && !process.env.ENCRYPTION_PASSWORD) {
    logger.error('❌ ENCRYPTION_KEY or ENCRYPTION_PASSWORD not set in environment');
    return false;
  }
  
  // Validate encryption works
  const validation = await validateEncryptionSetup();
  if (!validation.valid) {
    logger.error(`❌ Encryption validation failed: ${validation.error}`);
    return false;
  }
  
  logger.info('✅ Encryption setup validated');
  return true;
}

/**
 * Get all accounts with credentials
 */
async function getAccountsWithCredentials(): Promise<AccountCredential[]> {
  logger.info('Fetching accounts with credentials...');
  
  const accounts = await db.account.findMany({
    where: {
      apiKey: { not: null },
      apiSecret: { not: null },
    },
    select: {
      id: true,
      apiKey: true,
      apiSecret: true,
      apiPassphrase: true,
      apiUid: true,
      exchangeId: true,
      exchangeName: true,
    },
  });
  
  logger.info(`Found ${accounts.length} accounts with credentials`);
  return accounts;
}

/**
 * Check if credentials are already encrypted
 */
function areCredentialsEncrypted(account: AccountCredential): boolean {
  if (!account.apiKey) return false;
  return isEncrypted(account.apiKey);
}

/**
 * Encrypt credentials for a single account
 */
async function encryptAccountCredentials(
  account: AccountCredential
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!account.apiKey || !account.apiSecret) {
      return { success: false, error: 'Missing API key or secret' };
    }
    
    // Encrypt each field
    const encryptedApiKey = await encrypt(account.apiKey);
    const encryptedApiSecret = await encrypt(account.apiSecret);
    const encryptedApiPassphrase = account.apiPassphrase 
      ? await encrypt(account.apiPassphrase) 
      : null;
    const encryptedApiUid = account.apiUid 
      ? await encrypt(account.apiUid) 
      : null;
    
    // Update database
    await db.account.update({
      where: { id: account.id },
      data: {
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        apiPassphrase: encryptedApiPassphrase,
        apiUid: encryptedApiUid,
        updatedAt: new Date(),
      },
    });
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Decrypt credentials for a single account (rollback)
 */
async function decryptAccountCredentials(
  account: AccountCredential
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!account.apiKey || !account.apiSecret) {
      return { success: false, error: 'Missing API key or secret' };
    }
    
    // Decrypt each field
    const decryptedApiKey = await decrypt(account.apiKey);
    const decryptedApiSecret = await decrypt(account.apiSecret);
    const decryptedApiPassphrase = account.apiPassphrase 
      ? await decrypt(account.apiPassphrase) 
      : null;
    const decryptedApiUid = account.apiUid 
      ? await decrypt(account.apiUid) 
      : null;
    
    // Update database
    await db.account.update({
      where: { id: account.id },
      data: {
        apiKey: decryptedApiKey,
        apiSecret: decryptedApiSecret,
        apiPassphrase: decryptedApiPassphrase,
        apiUid: decryptedApiUid,
        updatedAt: new Date(),
      },
    });
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Run migration
 */
async function runMigration(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    rolledBack: 0,
  };
  
  const accounts = await getAccountsWithCredentials();
  stats.total = accounts.length;
  
  if (accounts.length === 0) {
    logger.info('No accounts to migrate');
    return stats;
  }
  
  // Process in batches
  for (let i = 0; i < accounts.length; i += CONFIG.batchSize) {
    const batch = accounts.slice(i, i + CONFIG.batchSize);
    logger.info(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(accounts.length / CONFIG.batchSize)}`);
    
    for (const account of batch) {
      const isEncrypted = areCredentialsEncrypted(account);
      
      if (CONFIG.rollback) {
        // Rollback mode - decrypt
        if (isEncrypted) {
          if (CONFIG.dryRun) {
            logger.info(`[DRY RUN] Would decrypt: ${account.exchangeName} (${account.id})`);
            stats.rolledBack++;
          } else {
            const result = await decryptAccountCredentials(account);
            if (result.success) {
              logger.info(`✅ Decrypted: ${account.exchangeName} (${account.id})`);
              stats.rolledBack++;
            } else {
              logger.error(`❌ Failed to decrypt ${account.exchangeName} (${account.id}): ${result.error}`);
              stats.errors++;
            }
          }
        } else {
          if (CONFIG.verbose) {
            logger.info(`⊘ Skipped (not encrypted): ${account.exchangeName} (${account.id})`);
          }
          stats.skipped++;
        }
      } else {
        // Normal mode - encrypt
        if (isEncrypted) {
          if (CONFIG.verbose) {
            logger.info(`⊘ Skipped (already encrypted): ${account.exchangeName} (${account.id})`);
          }
          stats.skipped++;
        } else {
          if (CONFIG.dryRun) {
            logger.info(`[DRY RUN] Would encrypt: ${account.exchangeName} (${account.id})`);
            stats.migrated++;
          } else {
            const result = await encryptAccountCredentials(account);
            if (result.success) {
              logger.info(`✅ Encrypted: ${account.exchangeName} (${account.id})`);
              stats.migrated++;
            } else {
              logger.error(`❌ Failed to encrypt ${account.exchangeName} (${account.id}): ${result.error}`);
              stats.errors++;
            }
          }
        }
      }
    }
    
    // Delay between batches
    if (i + CONFIG.batchSize < accounts.length) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenBatches));
    }
  }
  
  return stats;
}

/**
 * Verify migration
 */
async function verifyMigration(): Promise<{ valid: boolean; encryptedCount: number; totalCount: number }> {
  logger.info('Verifying migration...');
  
  const accounts = await db.account.findMany({
    where: {
      apiKey: { not: null },
      apiSecret: { not: null },
    },
    select: {
      id: true,
      apiKey: true,
      exchangeName: true,
    },
  });
  
  const encryptedCount = accounts.filter(acc => isEncrypted(acc.apiKey)).length;
  const totalCount = accounts.length;
  
  const valid = encryptedCount === totalCount || totalCount === 0;
  
  logger.info(`Verification: ${encryptedCount}/${totalCount} accounts encrypted`);
  
  if (!valid) {
    const unencrypted = accounts.filter(acc => !isEncrypted(acc.apiKey));
    if (unencrypted.length > 0) {
      logger.warn('Unencrypted accounts:');
      unencrypted.forEach(acc => {
        logger.warn(`  - ${acc.exchangeName} (${acc.id})`);
      });
    }
  }
  
  return { valid, encryptedCount, totalCount };
}

/**
 * Print migration summary
 */
function printSummary(stats: MigrationStats, verification: { valid: boolean; encryptedCount: number; totalCount: number }) {
  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total accounts with credentials: ${stats.total}`);
  console.log(`Successfully ${CONFIG.rollback ? 'decrypted' : 'encrypted'}: ${stats.migrated}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);
  if (CONFIG.rollback) {
    console.log(`Rolled back: ${stats.rolledBack}`);
  }
  console.log('-'.repeat(60));
  console.log(`Verification: ${verification.encryptedCount}/${verification.totalCount} encrypted`);
  console.log(`Status: ${verification.valid ? '✅ SUCCESS' : '⚠️ PARTIAL'}`);
  console.log('='.repeat(60) + '\n');
}

// ==================== MAIN ====================

async function main(): Promise<number> {
  console.log('\n' + '🔐'.repeat(30));
  console.log('CITARION - API Key Encryption Migration');
  console.log('🔐'.repeat(30) + '\n');
  
  // Validate setup
  const setupValid = await validateSetup();
  if (!setupValid) {
    logger.error('Setup validation failed. Aborting migration.');
    return 1;
  }
  
  // Show mode
  if (CONFIG.dryRun) {
    logger.info('🔍 DRY RUN MODE - No changes will be made');
  }
  if (CONFIG.rollback) {
    logger.warn('⚠️  ROLLBACK MODE - Decrypting all keys');
  }
  
  // Confirm
  if (!CONFIG.dryRun && !process.argv.includes('--yes')) {
    console.log('\n⚠️  WARNING: This will modify database credentials!');
    console.log('Make sure you have a backup before proceeding.\n');
    
    const answer = await new Promise<string>(resolve => {
      process.stdout.write('Continue? (yes/no): ');
      process.stdin.once('data', data => resolve(data.toString().trim().toLowerCase()));
    });
    
    if (answer !== 'yes') {
      logger.info('Migration cancelled by user');
      return 0;
    }
  }
  
  try {
    // Run migration
    const stats = await runMigration();
    
    // Verify
    const verification = await verifyMigration();
    
    // Print summary
    printSummary(stats, verification);
    
    // Exit code
    if (stats.errors > 0 || !verification.valid) {
      logger.warn('Migration completed with errors');
      return 1;
    }
    
    logger.info('Migration completed successfully');
    return 0;
    
  } catch (error) {
    logger.error(error, 'Migration failed with error');
    return 1;
  } finally {
    // Close database connection
    await db.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main()
    .then(code => process.exit(code))
    .catch(error => {
      logger.error(error, 'Unhandled error');
      process.exit(1);
    });
}

// Export for testing
export { main, runMigration, verifyMigration };
