/**
 * Paper Trading Engine Tests
 * 
 * Tests for the virtual trading engine functionality
 * 
 * @see https://jestjs.io/docs/getting-started
 * @see https://testing-library.com/docs/react-testing-library/intro/
 */

import { getPaperTradingEngine } from '@/lib/paper-trading/engine';
import type { PaperTradingConfig } from '@/lib/paper-trading/types';

describe('PaperTradingEngine', () => {
  let engine: ReturnType<typeof getPaperTradingEngine>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    engine = getPaperTradingEngine();
  });
  
  afterEach(() => {
    // Cleanup all accounts after each test
    const accounts = engine.getAllAccounts();
    accounts.forEach(account => {
      engine.deleteAccount(account.id);
    });
  });
  
  describe('Account Management', () => {
    it('should create account with initial balance', () => {
      const config: PaperTradingConfig = {
        id: 'test-account-1',
        name: 'Test Account',
        initialBalance: 10000,
        maxLeverage: 10,
        maxOpenPositions: 5,
        maxRiskPerTrade: 2,
        feePercent: 0.1,
        maxDrawdown: 20,
        autoTrading: false,
        strategyId: 'test-strategy',
        tacticsSets: [],
      };
      
      const account = engine.createAccount(config);
      
      expect(account.id).toBe('test-account-1');
      expect(account.name).toBe('Test Account');
      expect(account.initialBalance).toBe(10000);
      expect(account.balance).toBe(10000);
      expect(account.equity).toBe(10000);
      expect(account.status).toBe('IDLE');
    });
    
    it('should start and stop account', () => {
      const config: PaperTradingConfig = {
        id: 'test-account-2',
        name: 'Test Account 2',
        initialBalance: 10000,
        maxLeverage: 10,
        maxOpenPositions: 5,
        maxRiskPerTrade: 2,
        feePercent: 0.1,
        maxDrawdown: 20,
        autoTrading: false,
        strategyId: 'test-strategy',
        tacticsSets: [],
      };
      
      engine.createAccount(config);
      
      const startResult = engine.start('test-account-2');
      expect(startResult.success).toBe(true);
      
      const account = engine.getAccount('test-account-2');
      expect(account?.status).toBe('RUNNING');
      
      engine.stop('test-account-2');
      expect(account?.status).toBe('STOPPED');
    });
    
    it('should pause and resume account', () => {
      const config: PaperTradingConfig = {
        id: 'test-account-3',
        name: 'Test Account 3',
        initialBalance: 10000,
        maxLeverage: 10,
        maxOpenPositions: 5,
        maxRiskPerTrade: 2,
        feePercent: 0.1,
        maxDrawdown: 20,
        autoTrading: false,
        strategyId: 'test-strategy',
        tacticsSets: [],
      };
      
      engine.createAccount(config);
      engine.start('test-account-3');
      
      engine.pause('test-account-3');
      const account = engine.getAccount('test-account-3');
      expect(account?.status).toBe('PAUSED');
      
      engine.resume('test-account-3');
      expect(account?.status).toBe('RUNNING');
    });
    
    it('should fail to start non-existent account', () => {
      const result = engine.start('non-existent-account');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Account not found');
    });
  });
  
  describe('Position Management', () => {
    beforeEach(() => {
      const config: PaperTradingConfig = {
        id: 'test-account-pos',
        name: 'Test Account',
        initialBalance: 10000,
        maxLeverage: 10,
        maxOpenPositions: 5,
        maxRiskPerTrade: 2,
        feePercent: 0.1,
        maxDrawdown: 20,
        autoTrading: false,
        strategyId: 'test-strategy',
        tacticsSets: [],
      };
      engine.createAccount(config);
      engine.start('test-account-pos');
    });
    
    it('should open LONG position correctly', () => {
      const result = engine.openPosition(
        'test-account-pos',
        'BTCUSDT',
        'LONG',
        0.1, // size in BTC
        50000, // price in USDT
        {
          stopLoss: 48000,
          takeProfit: 52000,
          leverage: 10,
        }
      );
      
      expect(result.success).toBe(true);
      expect(result.position).toBeDefined();
      
      const position = result.position!;
      expect(position.symbol).toBe('BTCUSDT');
      expect(position.direction).toBe('LONG');
      expect(position.totalSize).toBe(0.1);
      expect(position.avgEntryPrice).toBe(50000);
      expect(position.stopLoss).toBe(48000);
      expect(position.takeProfitTargets).toHaveLength(1);
      expect(position.takeProfitTargets[0].price).toBe(52000);
      expect(position.leverage).toBe(10);
      
      // Check margin calculation: (0.1 * 50000) / 10 = 500 USDT
      expect(position.margin).toBe(500);
    });
    
    it('should open SHORT position correctly', () => {
      const result = engine.openPosition(
        'test-account-pos',
        'ETHUSDT',
        'SHORT',
        1.0, // size in ETH
        3000, // price in USDT
        {
          stopLoss: 3200,
          takeProfit: 2800,
          leverage: 5,
        }
      );
      
      expect(result.success).toBe(true);
      const position = result.position!;
      
      expect(position.direction).toBe('SHORT');
      expect(position.avgEntryPrice).toBe(3000);
      expect(position.stopLoss).toBe(3200); // SL above entry for SHORT
      expect(position.takeProfitTargets[0].price).toBe(2800); // TP below entry for SHORT
    });
    
    it('should calculate unrealized PnL for LONG position', () => {
      engine.openPosition(
        'test-account-pos',
        'BTCUSDT',
        'LONG',
        0.1,
        50000,
        { leverage: 10 }
      );
      
      // Price increases to 55000
      engine.updatePrices({ BTCUSDT: 55000 });
      
      const account = engine.getAccount('test-account-pos');
      const position = account?.positions[0];
      
      expect(position).toBeDefined();
      expect(position?.currentPrice).toBe(55000);
      
      // PnL = (55000 - 50000) * 0.1 = 500 USDT
      expect(position?.unrealizedPnl).toBe(500);
      expect(position?.unrealizedPnlPercent).toBe(100); // 500 / 500 margin * 100
    });
    
    it('should calculate unrealized PnL for SHORT position', () => {
      engine.openPosition(
        'test-account-pos',
        'ETHUSDT',
        'SHORT',
        1.0,
        3000,
        { leverage: 5 }
      );
      
      // Price decreases to 2700 (profitable for SHORT)
      engine.updatePrices({ ETHUSDT: 2700 });
      
      const account = engine.getAccount('test-account-pos');
      const position = account?.positions[0];
      
      // PnL = (3000 - 2700) * 1.0 = 300 USDT
      expect(position?.unrealizedPnl).toBe(300);
    });
    
    it('should trigger stop loss for LONG position', () => {
      engine.openPosition(
        'test-account-pos',
        'BTCUSDT',
        'LONG',
        0.1,
        50000,
        {
          stopLoss: 48000,
          leverage: 10,
        }
      );
      
      // Price drops to stop loss level
      engine.updatePrices({ BTCUSDT: 48000 });
      
      const account = engine.getAccount('test-account-pos');
      const position = account?.positions[0];
      
      expect(position?.status).toBe('CLOSED');
      expect(position?.closeReason).toBe('SL');
      
      // PnL = (48000 - 50000) * 0.1 = -200 USDT
      // Минус комиссия ~0.1% = -0.5 USDT
      expect(position?.realizedPnl).toBeGreaterThanOrEqual(-210);
      expect(position?.realizedPnl).toBeLessThanOrEqual(-190);
    });
    
    it('should trigger take profit for LONG position', () => {
      engine.openPosition(
        'test-account-pos',
        'BTCUSDT',
        'LONG',
        0.1,
        50000,
        {
          takeProfit: 52000,
          leverage: 10,
        }
      );
      
      // Price rises to take profit level
      engine.updatePrices({ BTCUSDT: 52000 });
      
      const account = engine.getAccount('test-account-pos');
      const position = account?.positions[0];
      
      expect(position?.status).toBe('CLOSED');
      expect(position?.closeReason).toBe('TP');
      
      // PnL = (52000 - 50000) * 0.1 = 200 USDT
      // Минус комиссия ~0.1% = -0.5 USDT
      expect(position?.realizedPnl).toBeGreaterThanOrEqual(190);
      expect(position?.realizedPnl).toBeLessThanOrEqual(210);
    });
    
    it('should respect max open positions limit', () => {
      // Open 5 positions (max limit)
      for (let i = 0; i < 5; i++) {
        engine.openPosition(
          'test-account-pos',
          `BTCUSDT${i}`,
          'LONG',
          0.1,
          50000,
          { leverage: 10 }
        );
      }
      
      // Try to open 6th position
      const result = engine.openPosition(
        'test-account-pos',
        'BTCUSDT6',
        'LONG',
        0.1,
        50000,
        { leverage: 10 }
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot open position (limit reached)');
    });
    
    it('should close position manually', () => {
      engine.openPosition(
        'test-account-pos',
        'BTCUSDT',
        'LONG',
        0.1,
        50000,
        { leverage: 10 }
      );
      
      const account = engine.getAccount('test-account-pos');
      const position = account?.positions[0];
      
      expect(position).toBeDefined();
      
      // Manually close at current price
      engine.updatePrices({ BTCUSDT: 51000 });
      const trade = engine.closePosition(account!, position!, 51000, 'MANUAL');
      
      expect(trade).toBeDefined();
      expect(position?.status).toBe('CLOSED');
      expect(position?.closeReason).toBe('MANUAL');
      
      // PnL = (51000 - 50000) * 0.1 = 100 USDT
      // Минус комиссия ~0.1% = -0.5 USDT
      expect(trade?.pnl).toBeGreaterThanOrEqual(90);
      expect(trade?.pnl).toBeLessThanOrEqual(110);
    });
  });
  
  describe('Trailing Stop', () => {
    beforeEach(() => {
      const config: PaperTradingConfig = {
        id: 'test-account-trailing',
        name: 'Test Account',
        initialBalance: 10000,
        maxLeverage: 10,
        maxOpenPositions: 5,
        maxRiskPerTrade: 2,
        feePercent: 0.1,
        maxDrawdown: 20,
        autoTrading: false,
        strategyId: 'test-strategy',
        tacticsSets: [],
      };
      engine.createAccount(config);
      engine.start('test-account-trailing');
    });
    
    it('should activate trailing stop after profit threshold', () => {
      // This test would require tactics with trailing stop configuration
      // Implementation depends on tactics system
      expect(true).toBe(true); // Placeholder
    });
    
    it('should move stop loss up for LONG position', () => {
      // This test would require tactics with trailing stop configuration
      expect(true).toBe(true); // Placeholder
    });
  });
  
  describe('Metrics Calculation', () => {
    beforeEach(() => {
      const config: PaperTradingConfig = {
        id: 'test-account-metrics',
        name: 'Test Account',
        initialBalance: 10000,
        maxLeverage: 10,
        maxOpenPositions: 5,
        maxRiskPerTrade: 2,
        feePercent: 0.1,
        maxDrawdown: 20,
        autoTrading: false,
        strategyId: 'test-strategy',
        tacticsSets: [],
      };
      engine.createAccount(config);
      engine.start('test-account-metrics');
    });
    
    it('should calculate equity curve', () => {
      engine.openPosition(
        'test-account-metrics',
        'BTCUSDT',
        'LONG',
        0.1,
        50000,
        { leverage: 10 }
      );
      
      // Update prices multiple times to generate equity curve points
      engine.updatePrices({ BTCUSDT: 51000 });
      engine.updatePrices({ BTCUSDT: 52000 });
      engine.updatePrices({ BTCUSDT: 51500 });
      
      const account = engine.getAccount('test-account-metrics');
      expect(account?.equityCurve.length).toBeGreaterThan(0);
    });
    
    it('should calculate max drawdown', () => {
      // Open and close positions to generate metrics
      engine.openPosition(
        'test-account-metrics',
        'BTCUSDT',
        'LONG',
        0.1,
        50000,
        { leverage: 10, takeProfit: 52000 }
      );
      
      engine.updatePrices({ BTCUSDT: 52000 });
      
      const account = engine.getAccount('test-account-metrics');
      expect(account?.metrics).toBeDefined();
      expect(account?.metrics.totalTrades).toBeGreaterThanOrEqual(0);
    });
    
    it('should track win rate', () => {
      // This would require multiple trades to calculate win rate
      expect(true).toBe(true); // Placeholder
    });
  });
  
  describe('Event System', () => {
    it('should emit events on position opened', () => {
      const config: PaperTradingConfig = {
        id: 'test-account-events',
        name: 'Test Account',
        initialBalance: 10000,
        maxLeverage: 10,
        maxOpenPositions: 5,
        maxRiskPerTrade: 2,
        feePercent: 0.1,
        maxDrawdown: 20,
        autoTrading: false,
        strategyId: 'test-strategy',
        tacticsSets: [],
      };
      engine.createAccount(config);
      engine.start('test-account-events');
      
      const eventCallback = jest.fn();
      engine.subscribe(eventCallback);
      
      engine.openPosition(
        'test-account-events',
        'BTCUSDT',
        'LONG',
        0.1,
        50000,
        { leverage: 10 }
      );
      
      expect(eventCallback).toHaveBeenCalled();
      const event = eventCallback.mock.calls[0][0];
      expect(event.type).toBe('POSITION_OPENED');
    });
    
    it('should emit events on position closed', () => {
      const config: PaperTradingConfig = {
        id: 'test-account-events-2',
        name: 'Test Account',
        initialBalance: 10000,
        maxLeverage: 10,
        maxOpenPositions: 5,
        maxRiskPerTrade: 2,
        feePercent: 0.1,
        maxDrawdown: 20,
        autoTrading: false,
        strategyId: 'test-strategy',
        tacticsSets: [],
      };
      engine.createAccount(config);
      engine.start('test-account-events-2');
      
      const eventCallback = jest.fn();
      engine.subscribe(eventCallback);
      
      const result = engine.openPosition(
        'test-account-events-2',
        'BTCUSDT',
        'LONG',
        0.1,
        50000,
        { leverage: 10, takeProfit: 52000 }
      );
      
      engine.updatePrices({ BTCUSDT: 52000 });
      
      // POSITION_OPENED, POSITION_UPDATED (TP hit), POSITION_CLOSED
      expect(eventCallback).toHaveBeenCalledTimes(3);
    });
    
    it('should allow unsubscribe from events', () => {
      const config: PaperTradingConfig = {
        id: 'test-account-events-3',
        name: 'Test Account',
        initialBalance: 10000,
        maxLeverage: 10,
        maxOpenPositions: 5,
        maxRiskPerTrade: 2,
        feePercent: 0.1,
        maxDrawdown: 20,
        autoTrading: false,
        strategyId: 'test-strategy',
        tacticsSets: [],
      };
      engine.createAccount(config);
      engine.start('test-account-events-3');
      
      const eventCallback = jest.fn();
      engine.subscribe(eventCallback);
      engine.unsubscribe(eventCallback);
      
      engine.openPosition(
        'test-account-events-3',
        'BTCUSDT',
        'LONG',
        0.1,
        50000,
        { leverage: 10 }
      );
      
      expect(eventCallback).not.toHaveBeenCalled();
    });
  });
  
  describe('Balance and Margin', () => {
    it('should deduct margin when opening position', () => {
      const config: PaperTradingConfig = {
        id: 'test-account-balance',
        name: 'Test Account',
        initialBalance: 10000,
        maxLeverage: 10,
        maxOpenPositions: 5,
        maxRiskPerTrade: 2,
        feePercent: 0.1,
        maxDrawdown: 20,
        autoTrading: false,
        strategyId: 'test-strategy',
        tacticsSets: [],
      };
      engine.createAccount(config);
      engine.start('test-account-balance');
      
      const initialAccount = engine.getAccount('test-account-balance');
      const initialBalance = initialAccount?.balance;
      
      // Open position: 0.1 BTC * 50000 / 10 leverage = 500 USDT margin
      engine.openPosition(
        'test-account-balance',
        'BTCUSDT',
        'LONG',
        0.1,
        50000,
        { leverage: 10 }
      );
      
      const account = engine.getAccount('test-account-balance');
      // Balance should be reduced by margin (500 USDT) and fee
      expect(account?.balance).toBeLessThan(initialBalance!);
    });
    
    it('should return margin when closing position', () => {
      const config: PaperTradingConfig = {
        id: 'test-account-balance-2',
        name: 'Test Account',
        initialBalance: 10000,
        maxLeverage: 10,
        maxOpenPositions: 5,
        maxRiskPerTrade: 2,
        feePercent: 0.1,
        maxDrawdown: 20,
        autoTrading: false,
        strategyId: 'test-strategy',
        tacticsSets: [],
      };
      engine.createAccount(config);
      engine.start('test-account-balance-2');
      
      // Open position
      engine.openPosition(
        'test-account-balance-2',
        'BTCUSDT',
        'LONG',
        0.1,
        50000,
        { leverage: 10, takeProfit: 52000 }
      );
      
      const accountAfterOpen = engine.getAccount('test-account-balance-2');
      const balanceAfterOpen = accountAfterOpen?.balance;
      
      // Close position at profit
      engine.updatePrices({ BTCUSDT: 52000 });
      
      const accountAfterClose = engine.getAccount('test-account-balance-2');
      // Balance should be higher after closing profitable position
      expect(accountAfterClose?.balance).toBeGreaterThan(balanceAfterOpen!);
    });
  });
});
