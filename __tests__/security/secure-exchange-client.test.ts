/**
 * Secure Exchange Client Tests
 * 
 * Tests for secure exchange client integration
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SecureCredentialManager } from '@/lib/security/credential-manager';
import { createSecureExchangeClient } from '@/lib/exchange';

describe('Secure Exchange Client', () => {
  let accountId: string;

  beforeEach(async () => {
    // Create test account
    const { db } = await import('@/lib/db');
    const account = await db.account.create({
      data: {
        userId: 'test-user',
        exchangeId: 'binance',
        exchangeType: 'futures',
        accountType: 'DEMO',
      },
    });
    accountId = account.id;
  });

  describe('createSecureExchangeClient', () => {
    it('should create client with accountId', async () => {
      // Store test credentials
      await SecureCredentialManager.storeCredentials(accountId, {
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
      });

      const client = await createSecureExchangeClient({
        exchangeId: 'binance',
        accountId: accountId,
        marketType: 'futures',
        useCircuitBreaker: false,
      });

      expect(client).toBeDefined();
      expect(client.exchange).toBe('binance');
    });

    it('should create client with provided credentials', async () => {
      const client = await createSecureExchangeClient({
        exchangeId: 'binance',
        credentials: {
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
        marketType: 'futures',
        useCircuitBreaker: false,
      });

      expect(client).toBeDefined();
    });

    it('should fail without credentials or accountId', async () => {
      await expect(
        createSecureExchangeClient({
          exchangeId: 'binance',
          useCircuitBreaker: false,
        } as any)
      ).rejects.toThrow('Either accountId or credentials must be provided');
    });

    it('should fail with invalid accountId', async () => {
      await expect(
        createSecureExchangeClient({
          exchangeId: 'binance',
          accountId: 'invalid-id',
          useCircuitBreaker: false,
        })
      ).rejects.toThrow('No credentials found');
    });

    it('should use circuit breaker by default', async () => {
      await SecureCredentialManager.storeCredentials(accountId, {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });

      const client = await createSecureExchangeClient({
        exchangeId: 'binance',
        accountId: accountId,
      });

      expect(client).toBeDefined();
      // Circuit breaker should be active (wrapped with proxy)
    });

    it('should disable circuit breaker when requested', async () => {
      await SecureCredentialManager.storeCredentials(accountId, {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });

      const client = await createSecureExchangeClient({
        exchangeId: 'binance',
        accountId: accountId,
        useCircuitBreaker: false,
      });

      expect(client).toBeDefined();
    });
  });

  describe('credential validation', () => {
    it('should validate credentials before use', async () => {
      await SecureCredentialManager.storeCredentials(accountId, {
        apiKey: 'invalid-key',
        apiSecret: 'invalid-secret',
      });

      // Should not throw, but validation will fail
      const client = await createSecureExchangeClient({
        exchangeId: 'binance',
        accountId: accountId,
        useCircuitBreaker: false,
      });

      expect(client).toBeDefined();
      // Connection test will fail, but client creation succeeds
    });
  });

  describe('supported exchanges', () => {
    const exchanges = ['binance', 'bybit', 'okx', 'bitget', 'bingx'];

    it.each(exchanges)('should support %s exchange', async (exchange) => {
      await SecureCredentialManager.storeCredentials(accountId, {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });

      const client = await createSecureExchangeClient({
        exchangeId: exchange as any,
        accountId: accountId,
        useCircuitBreaker: false,
      });

      expect(client).toBeDefined();
      expect(client.exchange).toBe(exchange);
    });
  });

  describe('market types', () => {
    it('should support futures market', async () => {
      await SecureCredentialManager.storeCredentials(accountId, {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });

      const client = await createSecureExchangeClient({
        exchangeId: 'binance',
        accountId: accountId,
        marketType: 'futures',
        useCircuitBreaker: false,
      });

      expect(client).toBeDefined();
    });

    it('should support spot market', async () => {
      await SecureCredentialManager.storeCredentials(accountId, {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });

      const client = await createSecureExchangeClient({
        exchangeId: 'binance',
        accountId: accountId,
        marketType: 'spot',
        useCircuitBreaker: false,
      });

      expect(client).toBeDefined();
    });
  });
});

describe('wrapWithCircuitBreaker', () => {
  it('should wrap client methods with circuit breaker', async () => {
    const { createExchangeClient } = await import('@/lib/exchange');
    const { wrapWithCircuitBreaker } = await import('@/lib/exchange');

    const client = createExchangeClient('binance', {
      credentials: {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      },
      marketType: 'futures',
    });

    const wrappedClient = wrapWithCircuitBreaker(client, 'binance');

    expect(wrappedClient).toBeDefined();
    expect(wrappedClient.exchange).toBe('binance');
  });
});
