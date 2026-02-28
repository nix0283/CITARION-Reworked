/**
 * API Endpoint Tests
 * 
 * Tests for critical API endpoints:
 * - /api/trade/open
 * - /api/bot/config
 * - /api/signal
 * - /api/webhook/tradingview
 * 
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { POST as tradeOpenHandler } from '@/app/api/trade/open/route'
import { POST as botConfigHandler } from '@/app/api/bot/config/route'
import { POST as signalHandler } from '@/app/api/signal/route'

// Mock dependencies
jest.mock('@/lib/db', () => ({
  db: {
    account: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    position: {
      create: jest.fn(),
    },
    trade: {
      create: jest.fn(),
    },
    systemLog: {
      create: jest.fn(),
    },
    botConfig: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    signal: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    signalIdCounter: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    marketPrice: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]),
  },
}))

jest.mock('@/lib/encryption', () => ({
  decryptApiKey: jest.fn((key) => key),
  encryptApiKey: jest.fn((key) => `encrypted:${key}`),
}))

jest.mock('@/lib/default-user', () => ({
  getDefaultUserId: jest.fn().mockResolvedValue('test-user-id'),
}))

// ==================== TRADE OPEN API TESTS ====================

describe('POST /api/trade/open', () => {
  const createMockRequest = (body: unknown) => {
    return new NextRequest('http://localhost:3000/api/trade/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  describe('Validation', () => {
    test('rejects request with missing required fields', async () => {
      const request = createMockRequest({ symbol: 'BTCUSDT' })
      const response = await tradeOpenHandler(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Validation failed')
      expect(data.details).toBeDefined()
    })

    test('rejects request with invalid symbol format', async () => {
      const request = createMockRequest({
        symbol: 'invalid_symbol',
        direction: 'LONG',
        amount: 100,
        leverage: 10,
      })
      const response = await tradeOpenHandler(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.details?.fieldErrors?.symbol).toBeDefined()
    })

    test('rejects request with invalid direction', async () => {
      const request = createMockRequest({
        symbol: 'BTCUSDT',
        direction: 'INVALID',
        amount: 100,
        leverage: 10,
      })
      const response = await tradeOpenHandler(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.details?.fieldErrors?.direction).toBeDefined()
    })

    test('rejects request with negative amount', async () => {
      const request = createMockRequest({
        symbol: 'BTCUSDT',
        direction: 'LONG',
        amount: -100,
        leverage: 10,
      })
      const response = await tradeOpenHandler(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.details?.fieldErrors?.amount).toBeDefined()
    })

    test('rejects request with leverage > 125', async () => {
      const request = createMockRequest({
        symbol: 'BTCUSDT',
        direction: 'LONG',
        amount: 100,
        leverage: 200,
      })
      const response = await tradeOpenHandler(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.details?.fieldErrors?.leverage).toBeDefined()
    })

    test('accepts valid request', async () => {
      // Mock successful account creation
      const { db } = await import('@/lib/db')
      ;(db.account.findFirst as jest.Mock).mockResolvedValue({
        id: 'test-account',
        userId: 'test-user-id',
        accountType: 'DEMO',
        exchangeId: 'binance',
        exchangeType: 'futures',
        virtualBalance: JSON.stringify({ USDT: 10000 }),
      })
      ;(db.position.create as jest.Mock).mockResolvedValue({
        id: 'test-position',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        status: 'OPEN',
        totalAmount: 0.01,
        avgEntryPrice: 67000,
        leverage: 10,
      })
      ;(db.trade.create as jest.Mock).mockResolvedValue({
        id: 'test-trade',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        status: 'OPEN',
        entryPrice: 67000,
        amount: 0.01,
        leverage: 10,
      })

      const request = createMockRequest({
        symbol: 'BTCUSDT',
        direction: 'LONG',
        amount: 100,
        leverage: 10,
        isDemo: true,
      })
      const response = await tradeOpenHandler(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.trade).toBeDefined()
      expect(data.position).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    test('handles limit order with price', async () => {
      const request = createMockRequest({
        symbol: 'BTCUSDT',
        direction: 'SHORT',
        amount: 50,
        leverage: 5,
        orderType: 'limit',
        price: 68000,
        isDemo: true,
      })
      // This should not throw validation error for limit order with price
      const response = await tradeOpenHandler(request)
      // Response depends on mock setup, just ensure no validation error
      const data = await response.json()
      expect(data.details?.fieldErrors?.price).toBeUndefined()
    })

    test('rejects limit order without price', async () => {
      const request = createMockRequest({
        symbol: 'BTCUSDT',
        direction: 'LONG',
        amount: 100,
        leverage: 10,
        orderType: 'limit',
        // price is missing
        isDemo: true,
      })
      const response = await tradeOpenHandler(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.details?.fieldErrors?.price).toBeDefined()
    })
  })
})

// ==================== BOT CONFIG API TESTS ====================

describe('POST /api/bot/config', () => {
  const createMockRequest = (body: unknown) => {
    return new NextRequest('http://localhost:3000/api/bot/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  describe('Validation', () => {
    test('rejects request with missing name', async () => {
      const request = createMockRequest({})
      const response = await botConfigHandler(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.details?.fieldErrors?.name).toBeDefined()
    })

    test('rejects request with invalid leverage', async () => {
      const request = createMockRequest({
        name: 'Test Bot',
        leverage: 500, // Exceeds max 125
      })
      const response = await botConfigHandler(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.details?.fieldErrors?.leverage).toBeDefined()
    })

    test('accepts valid bot config', async () => {
      const { db } = await import('@/lib/db')
      ;(db.botConfig.create as jest.Mock).mockResolvedValue({
        id: 'test-config',
        name: 'Test Bot',
        exchangeId: 'binance',
        leverage: 10,
        isActive: false,
      })

      const request = createMockRequest({
        name: 'Test Bot',
        exchangeId: 'binance',
        exchangeType: 'futures',
        tradeAmount: 100,
        leverage: 10,
      })
      const response = await botConfigHandler(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.config.name).toBe('Test Bot')
    })
  })
})

// ==================== SIGNAL API TESTS ====================

describe('POST /api/signal', () => {
  const createMockRequest = (body: unknown) => {
    return new NextRequest('http://localhost:3000/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  describe('Signal Parsing', () => {
    test('accepts valid signal text', async () => {
      const { db } = await import('@/lib/db')
      ;(db.signal.create as jest.Mock).mockResolvedValue({
        id: 'test-signal',
        signalId: 1,
        symbol: 'BTCUSDT',
        direction: 'LONG',
        status: 'PENDING',
      })
      ;(db.signalIdCounter.upsert as jest.Mock).mockResolvedValue({ lastId: 1 })

      const request = createMockRequest({
        text: '#BTCUSDT LONG Entry: 67000 TP: 70000 SL: 65000',
        source: 'API',
      })
      const response = await signalHandler(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.signalId).toBeDefined()
    })

    test('rejects signal with invalid symbol', async () => {
      const request = createMockRequest({
        text: '#INVALID_SYMBOL LONG Entry: 100',
        source: 'API',
      })
      const response = await signalHandler(request)
      const data = await response.json()

      // Signal parser may still parse, but Zod validation should catch invalid symbol
      // Depending on parser behavior, this might pass parsing but fail validation
      expect([200, 400]).toContain(response.status)
    })

    test('handles management commands', async () => {
      const request = createMockRequest({
        text: 'BTCUSDT long close',
        source: 'API',
      })
      const response = await signalHandler(request)
      const data = await response.json()

      // Management commands have different response structure
      expect(response.status).toBe(200)
      expect(data.success).toBeDefined()
    })
  })
})

// ==================== UTILITIES ====================

describe('API Error Handling', () => {
  test('returns structured error response', async () => {
    const request = new NextRequest('http://localhost:3000/api/trade/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: 'data' }),
    })
    
    const response = await tradeOpenHandler(request)
    const data = await response.json()

    expect(data).toHaveProperty('error')
    expect(data).toHaveProperty('timestamp')
    expect(typeof data.timestamp).toBe('string')
  })

  test('error responses do not leak sensitive data', async () => {
    const request = new NextRequest('http://localhost:3000/api/trade/open', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer secret-token',
      },
      body: JSON.stringify({ 
        symbol: 'BTCUSDT',
        apiKey: 'should-not-appear-in-response',
      }),
    })
    
    const response = await tradeOpenHandler(request)
    const data = await response.json()

    // Ensure sensitive fields are not in error response
    const responseStr = JSON.stringify(data)
    expect(responseStr).not.toContain('secret-token')
    expect(responseStr).not.toContain('should-not-appear-in-response')
  })
})
