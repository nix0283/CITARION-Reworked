/**
 * Jest Setup File
 * 
 * Configures testing utilities and matchers
 */

import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfills for Node.js environment
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder as any;
}

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock environment variables
process.env.DATABASE_URL = 'file:./test.db';
process.env.NEXTAUTH_SECRET = 'test-secret-key-for-testing-only';
process.env.NEXTAUTH_URL = 'http://localhost:3000';
process.env.TRADINGVIEW_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

// Global test utilities
global.testUtils = {
  // Wait for async operations
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Create mock response
  createMockResponse: (data: any, status = 200) => ({
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    ok: status >= 200 && status < 300,
  }),
  
  // Create mock request
  createMockRequest: (body: any, headers: Record<string, string> = {}) => ({
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: {
      get: (key: string) => headers[key] || null,
    },
  }),
};

// Custom matchers
expect.extend({
  toBeValidDate(received: any) {
    const isDate = received instanceof Date && !isNaN(received.getTime());
    return {
      pass: isDate,
      message: () => `expected ${received} to be a valid date`,
    };
  },
  
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
    };
  },
  
  toBeApproximately(received: number, expected: number, precision: number = 0.01) {
    const pass = Math.abs(received - expected) < precision;
    return {
      pass,
      message: () => `expected ${received} to be approximately ${expected} (±${precision})`,
    };
  },
});

// Declare global types
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidDate(): R;
      toBeWithinRange(floor: number, ceiling: number): R;
      toBeApproximately(expected: number, precision?: number): R;
    }
  }
  
  interface Window {
    testUtils: {
      waitFor: (ms: number) => Promise<void>;
      createMockResponse: (data: any, status?: number) => any;
      createMockRequest: (body: any, headers?: Record<string, string>) => any;
    };
  }
}

// Add to global object
(global as any).testUtils = {
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  createMockResponse: (data: any, status = 200) => ({
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    ok: status >= 200 && status < 300,
  }),
  createMockRequest: (body: any, headers: Record<string, string> = {}) => ({
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: {
      get: (key: string) => headers[key] || null,
    },
  }),
};

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
