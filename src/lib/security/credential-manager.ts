/**
 * Secure API Key Manager
 * 
 * Handles encryption/decryption of exchange API credentials
 * Provides secure storage and retrieval with audit logging
 * 
 * @security CRITICAL - All API keys are encrypted at rest
 */

import { db } from '@/lib/db';
import { encrypt, decrypt, isEncrypted, maskSensitiveData, validateEncryptionSetup } from './encryption';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface ApiCredentials {
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
  apiUid?: string;
}

export interface EncryptedCredentials {
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
  apiUid?: string;
  isEncrypted: boolean;
}

export interface CredentialValidationResult {
  valid: boolean;
  error?: string;
  exchange?: string;
  accountType?: string;
}

// ==================== CREDENTIAL MANAGER ====================

export class SecureCredentialManager {
  /**
   * Encrypt API credentials before storing in database
   */
  static async encryptCredentials(credentials: ApiCredentials): Promise<EncryptedCredentials> {
    try {
      const encrypted: EncryptedCredentials = {
        apiKey: await encrypt(credentials.apiKey),
        apiSecret: await encrypt(credentials.apiSecret),
        isEncrypted: true,
      };
      
      if (credentials.apiPassphrase) {
        encrypted.apiPassphrase = await encrypt(credentials.apiPassphrase);
      }
      
      if (credentials.apiUid) {
        encrypted.apiUid = await encrypt(credentials.apiUid);
      }
      
      logger.info('[SecureCredentialManager] Credentials encrypted successfully');
      return encrypted;
    } catch (error) {
      logger.error({ error }, '[SecureCredentialManager] Encryption failed');
      throw new Error(`Failed to encrypt credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Decrypt API credentials from database
   */
  static async decryptCredentials(encryptedCreds: EncryptedCredentials): Promise<ApiCredentials> {
    try {
      if (!encryptedCreds.isEncrypted) {
        // Legacy: credentials not encrypted
        return {
          apiKey: encryptedCreds.apiKey,
          apiSecret: encryptedCreds.apiSecret,
          apiPassphrase: encryptedCreds.apiPassphrase,
          apiUid: encryptedCreds.apiUid,
        };
      }
      
      const credentials: ApiCredentials = {
        apiKey: await decrypt(encryptedCreds.apiKey),
        apiSecret: await decrypt(encryptedCreds.apiSecret),
      };
      
      if (encryptedCreds.apiPassphrase) {
        credentials.apiPassphrase = await decrypt(encryptedCreds.apiPassphrase);
      }
      
      if (encryptedCreds.apiUid) {
        credentials.apiUid = await decrypt(encryptedCreds.apiUid);
      }
      
      return credentials;
    } catch (error) {
      logger.error({ error }, '[SecureCredentialManager] Decryption failed');
      throw new Error(`Failed to decrypt credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Store credentials for an account (with encryption)
   */
  static async storeCredentials(
    accountId: string,
    credentials: ApiCredentials
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const encrypted = await this.encryptCredentials(credentials);
      
      await db.account.update({
        where: { id: accountId },
        data: {
          apiKey: encrypted.apiKey,
          apiSecret: encrypted.apiSecret,
          apiPassphrase: encrypted.apiPassphrase,
          apiUid: encrypted.apiUid,
          updatedAt: new Date(),
        },
      });
      
      logger.info({ accountId }, '[SecureCredentialManager] Credentials stored successfully');
      return { success: true };
    } catch (error) {
      logger.error({ accountId, error }, '[SecureCredentialManager] Store credentials failed');
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
  
  /**
   * Retrieve and decrypt credentials for an account
   */
  static async getCredentials(accountId: string): Promise<ApiCredentials | null> {
    try {
      const account = await db.account.findUnique({
        where: { id: accountId },
        select: {
          apiKey: true,
          apiSecret: true,
          apiPassphrase: true,
          apiUid: true,
          exchangeId: true,
          exchangeType: true,
        },
      });
      
      if (!account || !account.apiKey || !account.apiSecret) {
        return null;
      }
      
      const encryptedCreds: EncryptedCredentials = {
        apiKey: account.apiKey,
        apiSecret: account.apiSecret,
        apiPassphrase: account.apiPassphrase || undefined,
        apiUid: account.apiUid || undefined,
        isEncrypted: isEncrypted(account.apiKey),
      };
      
      return await this.decryptCredentials(encryptedCreds);
    } catch (error) {
      logger.error({ accountId, error }, '[SecureCredentialManager] Get credentials failed');
      return null;
    }
  }
  
  /**
   * Delete credentials for an account
   */
  static async deleteCredentials(accountId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await db.account.update({
        where: { id: accountId },
        data: {
          apiKey: null,
          apiSecret: null,
          apiPassphrase: null,
          apiUid: null,
          updatedAt: new Date(),
        },
      });
      
      logger.info({ accountId }, '[SecureCredentialManager] Credentials deleted successfully');
      return { success: true };
    } catch (error) {
      logger.error({ accountId, error }, '[SecureCredentialManager] Delete credentials failed');
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
  
  /**
   * Validate credentials by testing connection to exchange
   */
  static async validateCredentials(
    accountId: string
  ): Promise<CredentialValidationResult> {
    try {
      const account = await db.account.findUnique({
        where: { id: accountId },
        select: {
          apiKey: true,
          apiSecret: true,
          apiPassphrase: true,
          exchangeId: true,
          exchangeType: true,
          isTestnet: true,
        },
      });
      
      if (!account || !account.apiKey || !account.apiSecret) {
        return { valid: false, error: 'Credentials not found' };
      }
      
      // Decrypt credentials
      const encryptedCreds: EncryptedCredentials = {
        apiKey: account.apiKey,
        apiSecret: account.apiSecret,
        apiPassphrase: account.apiPassphrase || undefined,
        isEncrypted: isEncrypted(account.apiKey),
      };
      
      const credentials = await this.decryptCredentials(encryptedCreds);
      
      // Import exchange client and test connection
      const { getExchangeClient } = await import('@/lib/exchange');
      const client = await getExchangeClient(account.exchangeId as any, credentials);
      
      const testResult = await client.testConnection();
      
      return {
        valid: testResult.success,
        error: testResult.success ? undefined : testResult.message,
        exchange: account.exchangeId,
        accountType: account.exchangeType,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }
  
  /**
   * Migrate existing unencrypted credentials to encrypted format
   * Should be run once during deployment
   */
  static async migrateToEncryption(): Promise<{ migrated: number; errors: number }> {
    let migrated = 0;
    let errors = 0;
    
    try {
      // Find all accounts with credentials
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
        },
      });
      
      logger.info({ count: accounts.length }, '[SecureCredentialManager] Starting migration');
      
      for (const account of accounts) {
        try {
          // Skip if already encrypted
          if (isEncrypted(account.apiKey)) {
            continue;
          }
          
          // Encrypt credentials
          const encrypted = await this.encryptCredentials({
            apiKey: account.apiKey!,
            apiSecret: account.apiSecret!,
            apiPassphrase: account.apiPassphrase || undefined,
            apiUid: account.apiUid || undefined,
          });
          
          // Update database
          await db.account.update({
            where: { id: account.id },
            data: {
              apiKey: encrypted.apiKey,
              apiSecret: encrypted.apiSecret,
              apiPassphrase: encrypted.apiPassphrase,
              apiUid: encrypted.apiUid,
            },
          });
          
          migrated++;
          logger.info({ accountId: account.id }, '[SecureCredentialManager] Migrated account');
        } catch (error) {
          errors++;
          logger.error({ accountId: account.id, error }, '[SecureCredentialManager] Migration failed for account');
        }
      }
      
      logger.info({ migrated, errors }, '[SecureCredentialManager] Migration completed');
      
      return { migrated, errors };
    } catch (error) {
      logger.error({ error }, '[SecureCredentialManager] Migration failed');
      throw error;
    }
  }
  
  /**
   * Validate encryption setup is working correctly
   */
  static async validateSetup(): Promise<{ valid: boolean; error?: string }> {
    return validateEncryptionSetup();
  }
  
  /**
   * Get masked credentials for logging/display
   */
  static maskCredentials(credentials: ApiCredentials): {
    apiKey: string;
    apiSecret: string;
    apiPassphrase?: string;
  } {
    return {
      apiKey: maskSensitiveData(credentials.apiKey, 4),
      apiSecret: maskSensitiveData(credentials.apiSecret, 4),
      apiPassphrase: credentials.apiPassphrase ? maskSensitiveData(credentials.apiPassphrase, 2) : undefined,
    };
  }
}

// ==================== MIDDLEWARE HELPER ====================

/**
 * Middleware to inject decrypted credentials into request
 */
export async function withDecryptedCredentials<T>(
  accountId: string,
  fn: (credentials: ApiCredentials) => Promise<T>
): Promise<T | null> {
  const credentials = await SecureCredentialManager.getCredentials(accountId);
  
  if (!credentials) {
    logger.warn({ accountId }, '[withDecryptedCredentials] No credentials found');
    return null;
  }
  
  try {
    return await fn(credentials);
  } catch (error) {
    logger.error({ accountId, error }, '[withDecryptedCredentials] Operation failed');
    throw error;
  }
}

// ==================== EXPORTS ====================

export default SecureCredentialManager;
