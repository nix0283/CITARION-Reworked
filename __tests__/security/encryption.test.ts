/**
 * Encryption Module Tests
 * 
 * Tests for AES-256-GCM encryption/decryption functionality
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  encrypt,
  decrypt,
  encryptObject,
  decryptObject,
  isEncrypted,
  maskSensitiveData,
  generateSecureRandom,
  hash,
  validateEncryptionSetup,
} from '@/lib/security/encryption';

describe('Encryption Module', () => {
  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt string data', async () => {
      const original = 'test-sensitive-data';
      const encrypted = await encrypt(original);
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe(original);
    });

    it('should produce different encrypted output for same input', async () => {
      const original = 'test-data';
      const encrypted1 = await encrypt(original);
      const encrypted2 = await encrypt(original);
      
      // Should be different due to random IV and salt
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle empty strings', async () => {
      const original = '';
      const encrypted = await encrypt(original);
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe('');
    });

    it('should handle unicode characters', async () => {
      const original = 'Тест 🔐 测试 🚀';
      const encrypted = await encrypt(original);
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe(original);
    });

    it('should handle long strings', async () => {
      const original = 'a'.repeat(10000);
      const encrypted = await encrypt(original);
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe(original);
    });

    it('should fail to decrypt with wrong data', async () => {
      const encrypted = await encrypt('original');
      
      // Corrupt the encrypted data
      const corrupted = encrypted.slice(0, -5) + 'xxxxx';
      
      await expect(decrypt(corrupted)).rejects.toThrow();
    });
  });

  describe('encryptObject/decryptObject', () => {
    it('should encrypt and decrypt objects', async () => {
      const original = {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        nested: {
          value: 123,
        },
      };
      
      const encrypted = await encryptObject(original);
      const decrypted = await decryptObject<typeof original>(encrypted);
      
      expect(decrypted).toEqual(original);
    });

    it('should handle arrays', async () => {
      const original = [1, 2, 3, 'test', { key: 'value' }];
      const encrypted = await encryptObject(original);
      const decrypted = await decryptObject<typeof original>(encrypted);
      
      expect(decrypted).toEqual(original);
    });
  });

  describe('isEncrypted', () => {
    it('should identify encrypted data', async () => {
      const encrypted = await encrypt('test');
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should identify plaintext data', () => {
      expect(isEncrypted('plaintext')).toBe(false);
      expect(isEncrypted('')).toBe(false);
    });

    it('should identify malformed data', () => {
      expect(isEncrypted('not:base64:encoded')).toBe(false);
      expect(isEncrypted('invalid')).toBe(false);
    });
  });

  describe('maskSensitiveData', () => {
    it('should mask sensitive data', () => {
      const masked = maskSensitiveData('my-api-key-12345', 4);
      expect(masked).toBe('my-a***********345');
    });

    it('should handle short strings', () => {
      const masked = maskSensitiveData('abc', 2);
      expect(masked).toBe('***');
    });

    it('should handle empty strings', () => {
      const masked = maskSensitiveData('', 4);
      expect(masked).toBe('');
    });

    it('should use default visible chars', () => {
      const masked = maskSensitiveData('super-secret-key');
      expect(masked).toContain('*');
    });
  });

  describe('generateSecureRandom', () => {
    it('should generate random hex string', () => {
      const random1 = generateSecureRandom(32);
      const random2 = generateSecureRandom(32);
      
      expect(random1).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(random2).toHaveLength(64);
      expect(random1).not.toBe(random2);
    });

    it('should generate different lengths', () => {
      expect(generateSecureRandom(16)).toHaveLength(32);
      expect(generateSecureRandom(64)).toHaveLength(128);
    });

    it('should only contain hex characters', () => {
      const random = generateSecureRandom(32);
      expect(random).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('hash', () => {
    it('should hash data consistently', () => {
      const hash1 = hash('test-data');
      const hash2 = hash('test-data');
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 = 64 hex chars
    });

    it('should produce different hashes for different data', () => {
      const hash1 = hash('data1');
      const hash2 = hash('data2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty strings', () => {
      const hash1 = hash('');
      expect(hash1).toHaveLength(64);
    });
  });

  describe('validateEncryptionSetup', () => {
    it('should validate encryption setup', async () => {
      const result = await validateEncryptionSetup();
      
      expect(result.valid).toBe(true);
    });
  });
});
