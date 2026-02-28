/**
 * Security Module - API Key Encryption
 * 
 * Implements AES-256-GCM encryption for sensitive data storage
 * Used for encrypting exchange API keys, secrets, and passphrases
 * 
 * @security CRITICAL - Handle with care
 * @see https://nodejs.org/api/crypto.html
 */

import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';

// ==================== CONSTANTS ====================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits
const SCRYPT_N = 16384; // CPU/memory cost parameter
const SCRYPT_R = 8; // Block size
const SCRYPT_P = 1; // Parallelization parameter

// ==================== TYPES ====================

export interface EncryptedData {
  iv: string;
  salt: string;
  authTag: string;
  encryptedData: string;
}

export interface EncryptionResult {
  success: boolean;
  encrypted?: string;
  error?: string;
}

export interface DecryptionResult {
  success: boolean;
  decrypted?: string;
  error?: string;
}

// ==================== KEY DERIVATION ====================

/**
 * Derive encryption key from password using scrypt
 * This ensures the key is properly sized and adds computational cost to brute-force attacks
 */
export async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Get encryption key from environment variable
 * Falls back to deriving from password if key not set
 */
export async function getEncryptionKey(): Promise<Buffer> {
  const keyFromEnv = process.env.ENCRYPTION_KEY;
  
  if (keyFromEnv) {
    // Key is already provided (32 bytes hex encoded)
    return Buffer.from(keyFromEnv, 'hex');
  }
  
  // Derive from password (fallback for development)
  const password = process.env.ENCRYPTION_PASSWORD || 'default-dev-password-change-in-production';
  const salt = randomBytes(SALT_LENGTH);
  return deriveKey(password, salt);
}

// ==================== ENCRYPTION ====================

/**
 * Encrypt sensitive data using AES-256-GCM
 * 
 * @param data - The plaintext data to encrypt
 * @returns Base64 encoded encrypted string with metadata
 * 
 * Format: iv:salt:authTag:encryptedData (all hex encoded, colon separated)
 */
export async function encrypt(data: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const salt = randomBytes(SALT_LENGTH);
    
    // Derive key from salt if using password-based encryption
    const actualKey = process.env.ENCRYPTION_KEY 
      ? key 
      : await deriveKey(process.env.ENCRYPTION_PASSWORD || 'default', salt);
    
    const cipher = createCipheriv(ALGORITHM, actualKey, iv);
    cipher.setAutoPadding(true);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Combine all parts into single string
    const result = `${iv.toString('hex')}:${salt.toString('hex')}:${authTag}:${encrypted}`;
    
    return Buffer.from(result).toString('base64');
  } catch (error) {
    console.error('[Encryption] Encrypt failed:', error);
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt data encrypted with encrypt()
 * 
 * @param encryptedData - Base64 encoded encrypted string
 * @returns Decrypted plaintext
 */
export async function decrypt(encryptedData: string): Promise<string> {
  try {
    // Decode from base64
    const decoded = Buffer.from(encryptedData, 'base64').toString('utf8');
    const parts = decoded.split(':');
    
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [ivHex, saltHex, authTagHex, encrypted] = parts;
    
    const iv = Buffer.from(ivHex, 'hex');
    const salt = Buffer.from(saltHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    // Derive key from salt if using password-based encryption
    const key = await getEncryptionKey();
    const actualKey = process.env.ENCRYPTION_KEY 
      ? key 
      : await deriveKey(process.env.ENCRYPTION_PASSWORD || 'default', salt);
    
    const decipher = createDecipheriv(ALGORITHM, actualKey, iv);
    decipher.setAutoPadding(true);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('[Encryption] Decrypt failed:', error);
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Encrypt object by converting to JSON
 */
export async function encryptObject<T extends object>(data: T): Promise<string> {
  return encrypt(JSON.stringify(data));
}

/**
 * Decrypt and parse JSON object
 */
export async function decryptObject<T extends object>(encryptedData: string): Promise<T> {
  const decrypted = await decrypt(encryptedData);
  return JSON.parse(decrypted) as T;
}

/**
 * Check if string appears to be encrypted (base64 with correct format)
 */
export function isEncrypted(data: string): boolean {
  try {
    const decoded = Buffer.from(data, 'base64').toString('utf8');
    const parts = decoded.split(':');
    return parts.length === 4 && 
           parts[0].length === IV_LENGTH * 2 && // IV is 16 bytes = 32 hex chars
           parts[1].length === SALT_LENGTH * 2 && // Salt is 32 bytes = 64 hex chars
           parts[2].length === AUTH_TAG_LENGTH * 2; // Auth tag is 16 bytes = 32 hex chars
  } catch {
    return false;
  }
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (data.length <= visibleChars * 2) {
    return '*'.repeat(data.length);
  }
  return data.slice(0, visibleChars) + '*'.repeat(data.length - visibleChars * 2) + data.slice(-visibleChars);
}

/**
 * Generate secure random string for API keys, tokens, etc.
 */
export function generateSecureRandom(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Hash data using SHA-256 (for non-reversible hashing)
 */
export function hash(data: string): string {
  const { createHash } = require('crypto');
  return createHash('sha256').update(data).digest('hex');
}

// ==================== MIGRATION HELPERS ====================

/**
 * Batch encrypt multiple API keys
 * Used for migrating existing unencrypted keys
 */
export async function batchEncrypt(keys: Array<{ id: string; apiKey: string; apiSecret: string; apiPassphrase?: string }>): Promise<Array<{ id: string; encrypted: EncryptedData }>> {
  const results: Array<{ id: string; encrypted: EncryptedData }> = [];
  
  for (const key of keys) {
    const encryptedApiKey = await encrypt(key.apiKey);
    const encryptedApiSecret = await encrypt(key.apiSecret);
    const encryptedApiPassphrase = key.apiPassphrase ? await encrypt(key.apiPassphrase) : undefined;
    
    results.push({
      id: key.id,
      encrypted: {
        iv: encryptedApiKey.split(':')[0],
        salt: encryptedApiKey.split(':')[1],
        authTag: encryptedApiKey.split(':')[2],
        encryptedData: encryptedApiKey,
      },
    });
  }
  
  return results;
}

// ==================== VALIDATION ====================

/**
 * Validate encryption key is properly configured
 */
export async function validateEncryptionSetup(): Promise<{ valid: boolean; error?: string }> {
  try {
    const testData = 'test-encryption-validation';
    const encrypted = await encrypt(testData);
    const decrypted = await decrypt(encrypted);
    
    if (decrypted !== testData) {
      return { valid: false, error: 'Decrypted data does not match original' };
    }
    
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Unknown validation error' 
    };
  }
}

// ==================== EXPORTS ====================

export default {
  encrypt,
  decrypt,
  encryptObject,
  decryptObject,
  isEncrypted,
  maskSensitiveData,
  generateSecureRandom,
  hash,
  validateEncryptionSetup,
};
