/**
 * Encryption utilities for API keys and secrets
 * 
 * Uses AES-256-GCM for encryption
 * Keys are encrypted before storing in the database
 */

import crypto from "crypto";

// ==================== CONFIGURATION ====================

// Get encryption key from environment variable
// In production, this should be a securely generated 32-byte key
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY;

// Validate encryption key in production
if (process.env.NODE_ENV === 'production' && !ENCRYPTION_KEY) {
  throw new Error('API_KEY_ENCRYPTION_KEY environment variable is required in production');
}

// Fallback for development only - never use in production
const DEV_ENCRYPTION_KEY = "default-dev-key-please-change-in-production!!";
const effectiveKey = ENCRYPTION_KEY || DEV_ENCRYPTION_KEY;
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // Initialization vector length
const AUTH_TAG_LENGTH = 16; // GCM authentication tag length
const SALT_LENGTH = 32;

// Derive a proper key from the encryption key string
function deriveKey(secret: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(secret, salt, 100000, 32, "sha512");
}

// Use effective key (validated or dev fallback)
const keySource = effectiveKey;

// ==================== ENCRYPTION ====================

/**
 * Encrypt an API key or secret
 * 
 * @param plaintext - The plain text to encrypt (API key or secret)
 * @returns Encrypted string in format: salt:iv:authTag:ciphertext (all base64)
 */
export function encryptApiKey(plaintext: string): string {
  if (!plaintext) {
    throw new Error("Cannot encrypt empty string");
  }
  
  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Derive key from secret
  const key = deriveKey(keySource, salt);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  
  // Encrypt
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  
  // Get authentication tag
  const authTag = cipher.getAuthTag();
  
  // Return as base64 encoded components
  return [
    salt.toString("base64"),
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypt an API key or secret
 * 
 * @param encryptedData - The encrypted string from encryptApiKey
 * @returns Decrypted plain text
 */
export function decryptApiKey(encryptedData: string): string {
  if (!encryptedData) {
    throw new Error("Cannot decrypt empty string");
  }
  
  try {
    // Parse components
    const [saltB64, ivB64, authTagB64, encryptedB64] = encryptedData.split(":");
    
    if (!saltB64 || !ivB64 || !authTagB64 || !encryptedB64) {
      throw new Error("Invalid encrypted data format");
    }
    
    // Decode from base64
    const salt = Buffer.from(saltB64, "base64");
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const encrypted = Buffer.from(encryptedB64, "base64");
    
    // Derive key from secret
    const key = deriveKey(keySource, salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    
    // Set authentication tag
    decipher.setAuthTag(authTag);
    
    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt data. Key may be corrupted or encryption key changed.");
  }
}

// ==================== VALIDATION ====================

/**
 * Validate that API keys have correct permissions
 * - Required: Read, Trade
 * - Forbidden: Withdraw
 */
export interface ApiKeyValidation {
  isValid: boolean;
  hasRead: boolean;
  hasTrade: boolean;
  hasWithdraw: boolean;
  error?: string;
}

/**
 * Mask an API key for display (show first 4 and last 4 characters)
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 12) {
    return "****";
  }
  
  const start = apiKey.slice(0, 4);
  const end = apiKey.slice(-4);
  const middle = "*".repeat(Math.min(apiKey.length - 8, 20));
  
  return `${start}${middle}${end}`;
}

/**
 * Validate API key format
 */
export function validateApiKeyFormat(key: string, exchange: string): boolean {
  if (!key || key.length < 10) {
    return false;
  }
  
  // Exchange-specific validation
  switch (exchange.toLowerCase()) {
    case "binance":
      // Binance API keys are 64 characters
      return key.length === 64 && /^[a-zA-Z0-9]+$/.test(key);
    
    case "bybit":
      // Bybit API keys vary in length
      return key.length >= 20 && /^[a-zA-Z0-9]+$/.test(key);
    
    case "okx":
      // OKX API keys have specific format
      return key.length >= 20 && /^[a-zA-Z0-9-]+$/.test(key);
    
    default:
      return key.length >= 10;
  }
}

// ==================== SECURE STORAGE ====================

/**
 * Securely store API credentials for an account
 */
export async function storeApiCredentials(params: {
  accountId: string;
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
  apiUid?: string;
}): Promise<void> {
  const { accountId, apiKey, apiSecret, apiPassphrase, apiUid } = params;
  
  // This would be implemented with database update
  // For now, return the encrypted values
  const encryptedKey = encryptApiKey(apiKey);
  const encryptedSecret = encryptApiKey(apiSecret);
  const encryptedPassphrase = apiPassphrase ? encryptApiKey(apiPassphrase) : null;
  const encryptedUid = apiUid ? encryptApiKey(apiUid) : null;
  
  console.log(`[Security] API credentials encrypted for account ${accountId}`);
  console.log(`[Security] API Key (masked): ${maskApiKey(apiKey)}`);
}

/**
 * Retrieve and decrypt API credentials
 */
export async function retrieveApiCredentials(account: {
  apiKey: string | null;
  apiSecret: string | null;
  apiPassphrase?: string | null;
  apiUid?: string | null;
}): Promise<{
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
  apiUid?: string;
} | null> {
  if (!account.apiKey || !account.apiSecret) {
    return null;
  }
  
  try {
    return {
      apiKey: decryptApiKey(account.apiKey),
      apiSecret: decryptApiKey(account.apiSecret),
      apiPassphrase: account.apiPassphrase ? decryptApiKey(account.apiPassphrase) : undefined,
      apiUid: account.apiUid ? decryptApiKey(account.apiUid) : undefined,
    };
  } catch (error) {
    console.error("[Security] Failed to decrypt API credentials:", error);
    return null;
  }
}

// ==================== EXPORTS ====================

export {
  ALGORITHM,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  SALT_LENGTH,
};
