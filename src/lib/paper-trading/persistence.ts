/**
 * Paper Trading Persistence Service
 * 
 * Saves and loads Paper Trading state from database
 * Prevents data loss on server restart
 * 
 * Features:
 * - Auto-save every 5 minutes
 * - Save on critical events (position open/close)
 * - Load state on startup
 * - Keep last 1000 equity curve points
 * - Keep last 100 trades
 */

import { db } from '@/lib/db';
import type { PaperAccount, PaperPosition, PaperTrade, PaperEquityPoint } from '@/lib/paper-trading/types';

// Auto-save interval (5 minutes)
const AUTO_SAVE_INTERVAL = 5 * 60 * 1000;

// Max equity curve points to keep
const MAX_EQUITY_POINTS = 1000;

// Max trade history to keep
const MAX_TRADES = 100;

/**
 * Convert PaperAccount to database format
 */
function toDbFormat(account: PaperAccount) {
  return {
    // Config
    name: account.name,
    initialBalance: account.initialBalance,
    maxLeverage: account.config.maxLeverage,
    maxOpenPositions: account.config.maxOpenPositions,
    maxRiskPerTrade: account.config.maxRiskPerTrade,
    feePercent: account.config.feePercent,
    maxDrawdown: account.config.maxDrawdown,
    
    // State
    balance: account.balance,
    equity: account.equity,
    status: account.status,
    
    // JSON data
    positions: JSON.stringify(account.positions),
    equityCurve: JSON.stringify(account.equityCurve.slice(-MAX_EQUITY_POINTS)),
    tradeHistory: JSON.stringify(account.tradeHistory.slice(-MAX_TRADES)),
    
    // Metrics
    totalPnl: account.totalPnl,
    totalPnlPercent: account.totalPnlPercent,
    realizedPnl: account.realizedPnl,
    unrealizedPnl: account.unrealizedPnl,
    maxDrawdown: account.maxDrawdown,
    currentDrawdown: account.currentDrawdown,
    maxEquity: account.maxEquity,
    
    // Timestamps
    startedAt: account.startedAt,
    stoppedAt: account.stoppedAt,
  };
}

/**
 * Convert database record to PaperAccount
 */
function fromDbFormat(dbRecord: any, accountId: string): PaperAccount {
  return {
    id: accountId,
    name: dbRecord.name,
    config: {
      id: accountId,
      name: dbRecord.name,
      initialBalance: dbRecord.initialBalance,
      maxLeverage: dbRecord.maxLeverage,
      maxOpenPositions: dbRecord.maxOpenPositions,
      maxRiskPerTrade: dbRecord.maxRiskPerTrade,
      feePercent: dbRecord.feePercent,
      maxDrawdown: dbRecord.maxDrawdown,
      autoTrading: false,
      strategyId: '',
      tacticsSets: [],
    },
    initialBalance: dbRecord.initialBalance,
    balance: dbRecord.balance,
    equity: dbRecord.equity,
    maxEquity: dbRecord.maxEquity,
    positions: JSON.parse(dbRecord.positions || '[]'),
    tradeHistory: JSON.parse(dbRecord.tradeHistory || '[]'),
    equityCurve: JSON.parse(dbRecord.equityCurve || '[]'),
    totalPnl: dbRecord.totalPnl,
    totalPnlPercent: dbRecord.totalPnlPercent,
    realizedPnl: dbRecord.realizedPnl,
    unrealizedPnl: dbRecord.unrealizedPnl,
    maxDrawdown: dbRecord.maxDrawdown,
    currentDrawdown: dbRecord.currentDrawdown,
    status: dbRecord.status,
    startedAt: dbRecord.startedAt,
    stoppedAt: dbRecord.stoppedAt,
    lastUpdate: new Date(),
    metrics: {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: dbRecord.totalPnl,
      totalPnlPercent: dbRecord.totalPnlPercent,
      avgPnl: 0,
      avgWin: 0,
      avgLoss: 0,
      maxWin: 0,
      maxLoss: 0,
      profitFactor: 0,
      riskRewardRatio: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      maxDrawdown: dbRecord.maxDrawdown,
      maxDrawdownPercent: dbRecord.maxDrawdown,
      avgDrawdown: 0,
      timeInDrawdown: 0,
      maxDrawdownDuration: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
      currentStreak: { type: 'NONE' as const, count: 0 },
      tradingDays: 0,
      avgTradeDuration: 0,
      avgWinDuration: 0,
      avgLossDuration: 0,
      avgDailyReturn: 0,
      avgWeeklyReturn: 0,
      avgMonthlyReturn: 0,
      annualizedReturn: 0,
      annualizedVolatility: 0,
      marketExposure: 0,
      avgPositionSize: 0,
      avgLeverage: 0,
      var95: 0,
      expectedShortfall95: 0,
    },
  };
}

/**
 * Paper Trading Persistence Service
 */
export class PaperTradingPersistenceService {
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();
  
  /**
   * Save account to database
   */
  async saveAccount(account: PaperAccount, userId: string): Promise<void> {
    try {
      await db.paperAccount.upsert({
        where: { id: account.id },
        update: toDbFormat(account),
        create: {
          id: account.id,
          userId,
          ...toDbFormat(account),
        },
      });
      
      console.log(`[Paper Persistence] Saved account ${account.id} (Balance: ${account.balance.toFixed(2)} USDT)`);
    } catch (error) {
      console.error('[Paper Persistence] Save error:', error);
    }
  }
  
  /**
   * Load account from database
   */
  async loadAccount(accountId: string, userId: string): Promise<PaperAccount | null> {
    try {
      const record = await db.paperAccount.findUnique({
        where: { id: accountId },
      });
      
      if (!record) {
        return null;
      }
      
      // Verify ownership
      if (record.userId !== userId) {
        return null;
      }
      
      const account = fromDbFormat(record, accountId);
      console.log(`[Paper Persistence] Loaded account ${account.id} (Balance: ${account.balance.toFixed(2)} USDT)`);
      
      return account;
    } catch (error) {
      console.error('[Paper Persistence] Load error:', error);
      return null;
    }
  }
  
  /**
   * Load all accounts for user
   */
  async loadAllAccounts(userId: string): Promise<PaperAccount[]> {
    try {
      const records = await db.paperAccount.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      
      return records.map(record => fromDbFormat(record, record.id));
    } catch (error) {
      console.error('[Paper Persistence] Load all error:', error);
      return [];
    }
  }
  
  /**
   * Delete account from database
   */
  async deleteAccount(accountId: string): Promise<void> {
    try {
      await db.paperAccount.delete({
        where: { id: accountId },
      });
      
      // Clear auto-save timer
      const timer = this.autoSaveTimers.get(accountId);
      if (timer) {
        clearInterval(timer);
        this.autoSaveTimers.delete(accountId);
      }
      
      console.log(`[Paper Persistence] Deleted account ${accountId}`);
    } catch (error) {
      console.error('[Paper Persistence] Delete error:', error);
    }
  }
  
  /**
   * Start auto-save for account
   */
  startAutoSave(account: PaperAccount, userId: string): void {
    // Clear existing timer
    this.stopAutoSave(account.id);
    
    // Set up new auto-save
    const timer = setInterval(async () => {
      await this.saveAccount(account, userId);
    }, AUTO_SAVE_INTERVAL);
    
    this.autoSaveTimers.set(account.id, timer);
    console.log(`[Paper Persistence] Auto-save started for ${account.id} (every ${AUTO_SAVE_INTERVAL/1000}s)`);
  }
  
  /**
   * Stop auto-save for account
   */
  stopAutoSave(accountId: string): void {
    const timer = this.autoSaveTimers.get(accountId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(accountId);
      console.log(`[Paper Persistence] Auto-save stopped for ${accountId}`);
    }
  }
  
  /**
   * Stop all auto-saves
   */
  stopAllAutoSaves(): void {
    for (const [accountId, timer] of this.autoSaveTimers.entries()) {
      clearInterval(timer);
    }
    this.autoSaveTimers.clear();
    console.log('[Paper Persistence] All auto-saves stopped');
  }
  
  /**
   * Save account immediately on event
   */
  async saveOnEvent(account: PaperAccount, userId: string, event: string): Promise<void> {
    // Only save on critical events
    const criticalEvents = ['POSITION_OPENED', 'POSITION_CLOSED', 'BALANCE_UPDATE'];
    
    if (criticalEvents.includes(event)) {
      await this.saveAccount(account, userId);
    }
  }
}

// Singleton instance
let persistenceInstance: PaperTradingPersistenceService | null = null;

/**
 * Get persistence service instance
 */
export function getPaperTradingPersistence(): PaperTradingPersistenceService {
  if (!persistenceInstance) {
    persistenceInstance = new PaperTradingPersistenceService();
    
    // Cleanup on process exit
    process.on('beforeExit', () => {
      persistenceInstance?.stopAllAutoSaves();
    });
    
    process.on('SIGINT', () => {
      persistenceInstance?.stopAllAutoSaves();
    });
    
    process.on('SIGTERM', () => {
      persistenceInstance?.stopAllAutoSaves();
    });
  }
  return persistenceInstance;
}
