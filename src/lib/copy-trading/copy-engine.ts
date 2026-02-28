/**
 * Copy Trading Engine
 * 
 * Automatic copy trading system:
 * - Master-Follower relationship
 * - Automatic trade copying
 * - Risk management per follower
 * - Position sizing
 * - Real-time synchronization
 * 
 * @module lib/copy-trading/copy-engine
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getOrderManager } from '@/lib/order-management/order-manager';
import { SecureCredentialManager } from '@/lib/security/credential-manager';

// ==================== TYPES ====================

export interface CopyTrade {
  id: string;
  masterTradeId: string;
  followerId: string;
  masterId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  masterEntryPrice: number;
  followerEntryPrice: number;
  masterQuantity: number;
  followerQuantity: number;
  copyRatio: number;
  leverage: number;
  status: 'OPEN' | 'CLOSED' | 'FAILED';
  masterPnl?: number;
  followerPnl?: number;
  profitShare?: number;
  createdAt: Date;
  closedAt?: Date;
}

export interface CopyConfig {
  maxFollowAmount: number;
  minFollowAmount: number;
  copyRatio: number;
  maxPositions: number;
  allowedSymbols: string[];
  stopLossPercent?: number;
  takeProfitPercent?: number;
  enableTrailingStop: boolean;
}

export interface CopyResult {
  success: boolean;
  followerTradeId?: string;
  error?: string;
  quantity?: number;
  entryPrice?: number;
}

export interface CopyEngineStats {
  totalCopies: number;
  successfulCopies: number;
  failedCopies: number;
  totalVolume: number;
  avgCopyTime: number;
  activeFollowers: number;
}

// ==================== COPY ENGINE CLASS ====================

export class CopyEngine {
  private stats: CopyEngineStats;
  private activeCopies: Map<string, CopyTrade>;
  private processingLock: Map<string, boolean>;

  constructor() {
    this.stats = {
      totalCopies: 0,
      successfulCopies: 0,
      failedCopies: 0,
      totalVolume: 0,
      avgCopyTime: 0,
      activeFollowers: 0,
    };
    this.activeCopies = new Map();
    this.processingLock = new Map();
  }

  /**
   * Copy master trade to followers
   */
  async copyTrade(
    masterTradeId: string,
    action: 'OPEN' | 'CLOSE' | 'UPDATE'
  ): Promise<{ success: boolean; copies: CopyResult[] }> {
    const startTime = Date.now();
    this.stats.totalCopies++;

    try {
      // Get master trade
      const masterTrade = await db.masterTrade.findUnique({
        where: { id: masterTradeId },
        include: {
          master: {
            include: {
              followers: {
                where: { isActive: true },
                include: {
                  user: true,
                },
              },
            },
          },
        },
      });

      if (!masterTrade) {
        this.stats.failedCopies++;
        return { success: false, copies: [] };
      }

      const copies: CopyResult[] = [];

      // Copy to each follower
      for (const follower of masterTrade.master.followers) {
        const result = await this.copyToFollower(
          masterTrade,
          follower,
          action
        );
        copies.push(result);

        if (result.success) {
          this.stats.successfulCopies++;
        } else {
          this.stats.failedCopies++;
        }
      }

      // Update stats
      const copyTime = Date.now() - startTime;
      this.stats.avgCopyTime = (this.stats.avgCopyTime * (this.stats.successfulCopies - 1) + copyTime) / Math.max(1, this.stats.successfulCopies);
      this.stats.activeFollowers = masterTrade.master.followers.length;

      logger.info({
        masterTradeId,
        action,
        copies: copies.length,
        success: copies.filter(c => c.success).length,
        copyTime,
      }, 'Trade copied to followers');

      return {
        success: copies.some(c => c.success),
        copies,
      };
    } catch (error) {
      this.stats.failedCopies++;
      logger.error({ error, masterTradeId }, 'Copy trade failed');
      return { success: false, copies: [] };
    }
  }

  /**
   * Copy trade to single follower
   */
  private async copyToFollower(
    masterTrade: any,
    follower: any,
    action: 'OPEN' | 'CLOSE' | 'UPDATE'
  ): Promise<CopyResult> {
    const lockKey = `${follower.id}-${masterTrade.id}`;

    // Check if already processing
    if (this.processingLock.get(lockKey)) {
      return { success: false, error: 'Already processing' };
    }

    this.processingLock.set(lockKey, true);

    try {
      // Get follower config
      const config: CopyConfig = {
        maxFollowAmount: follower.maxFollowAmount || 10000,
        minFollowAmount: follower.minFollowAmount || 10,
        copyRatio: follower.copyRatio || 0.1,
        maxPositions: follower.maxPositions || 5,
        allowedSymbols: follower.allowedSymbols || [],
        stopLossPercent: follower.stopLossPercent,
        takeProfitPercent: follower.takeProfitPercent,
        enableTrailingStop: follower.enableTrailingStop || false,
      };

      // Check if follower can copy
      const canCopy = await this.canCopy(follower, masterTrade, config);
      if (!canCopy.valid) {
        return { success: false, error: canCopy.reason };
      }

      // Calculate follower position size
      const followerQuantity = this.calculateFollowerQuantity(
        masterTrade,
        follower,
        config
      );

      if (followerQuantity <= 0) {
        return { success: false, error: 'Invalid quantity' };
      }

      // Get follower's exchange account
      const account = await db.account.findFirst({
        where: {
          userId: follower.userId,
          exchangeId: masterTrade.exchange,
          isActive: true,
        },
      });

      if (!account) {
        return { success: false, error: 'No active account' };
      }

      // Get credentials
      const credentials = await SecureCredentialManager.getCredentials(account.id);
      if (!credentials) {
        return { success: false, error: 'No credentials' };
      }

      // Execute copy
      let result: CopyResult;

      if (action === 'OPEN') {
        result = await this.openCopyPosition(
          account.id,
          masterTrade,
          followerQuantity,
          config
        );
      } else if (action === 'CLOSE') {
        result = await this.closeCopyPosition(
          account.id,
          masterTrade,
          followerQuantity
        );
      } else {
        result = { success: false, error: 'UPDATE not implemented' };
      }

      // Save copy trade record
      if (result.success && result.followerTradeId) {
        await this.saveCopyTrade({
          masterTradeId: masterTrade.id,
          followerId: follower.id,
          masterId: masterTrade.masterId,
          symbol: masterTrade.symbol,
          direction: masterTrade.direction,
          masterEntryPrice: masterTrade.entryPrice,
          followerEntryPrice: result.entryPrice || masterTrade.entryPrice,
          masterQuantity: masterTrade.quantity,
          followerQuantity,
          copyRatio: config.copyRatio,
          leverage: account.leverage || 10,
          status: 'OPEN',
          createdAt: new Date(),
        });

        this.activeCopies.set(result.followerTradeId!, {
          id: result.followerTradeId!,
          masterTradeId: masterTrade.id,
          followerId: follower.id,
          masterId: masterTrade.masterId,
          symbol: masterTrade.symbol,
          direction: masterTrade.direction,
          masterEntryPrice: masterTrade.entryPrice,
          followerEntryPrice: result.entryPrice || masterTrade.entryPrice,
          masterQuantity: masterTrade.quantity,
          followerQuantity,
          copyRatio: config.copyRatio,
          leverage: account.leverage || 10,
          status: 'OPEN',
          createdAt: new Date(),
        });

        this.stats.totalVolume += followerQuantity * (result.entryPrice || masterTrade.entryPrice);
      }

      return result;
    } catch (error) {
      logger.error({ error, followerId: follower.id, masterTradeId: masterTrade.id }, 'Copy to follower failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      this.processingLock.delete(lockKey);
    }
  }

  /**
   * Check if follower can copy trade
   */
  private async canCopy(
    follower: any,
    masterTrade: any,
    config: CopyConfig
  ): Promise<{ valid: boolean; reason?: string }> {
    // Check if follower is active
    if (!follower.isActive) {
      return { valid: false, reason: 'Follower not active' };
    }

    // Check symbol allowance
    if (config.allowedSymbols.length > 0 && 
        !config.allowedSymbols.includes(masterTrade.symbol)) {
      return { valid: false, reason: 'Symbol not allowed' };
    }

    // Check max positions
    const openPositions = await db.copiedTrade.count({
      where: {
        followerId: follower.id,
        status: 'OPEN',
      },
    });

    if (openPositions >= config.maxPositions) {
      return { valid: false, reason: 'Max positions reached' };
    }

    // Check daily copy limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayCopies = await db.copiedTrade.count({
      where: {
        followerId: follower.id,
        createdAt: { gte: today },
      },
    });

    if (todayCopies >= (follower.maxDailyCopies || 20)) {
      return { valid: false, reason: 'Daily copy limit reached' };
    }

    return { valid: true };
  }

  /**
   * Calculate follower position size
   */
  private calculateFollowerQuantity(
    masterTrade: any,
    follower: any,
    config: CopyConfig
  ): number {
    // Base calculation: master quantity × copy ratio
    let quantity = masterTrade.quantity * config.copyRatio;

    // Adjust for follower balance
    const maxQuantity = config.maxFollowAmount / masterTrade.entryPrice;
    quantity = Math.min(quantity, maxQuantity);

    // Adjust for min/max
    quantity = Math.max(
      config.minFollowAmount / masterTrade.entryPrice,
      quantity
    );

    // Round to exchange precision
    quantity = Math.floor(quantity * 1000) / 1000;

    return quantity;
  }

  /**
   * Open copy position
   */
  private async openCopyPosition(
    accountId: string,
    masterTrade: any,
    quantity: number,
    config: CopyConfig
  ): Promise<CopyResult> {
    try {
      const orderManager = getOrderManager(accountId);

      const result = await orderManager.placeOrder({
        accountId,
        symbol: masterTrade.symbol,
        side: masterTrade.direction === 'LONG' ? 'BUY' : 'SELL',
        type: 'MARKET',
        quantity,
        leverage: masterTrade.leverage,
      });

      if (result.success) {
        return {
          success: true,
          followerTradeId: result.orderId,
          quantity,
          entryPrice: result.averagePrice,
        };
      } else {
        return {
          success: false,
          error: result.error,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Close copy position
   */
  private async closeCopyPosition(
    accountId: string,
    masterTrade: any,
    quantity: number
  ): Promise<CopyResult> {
    try {
      const orderManager = getOrderManager(accountId);

      const result = await orderManager.placeOrder({
        accountId,
        symbol: masterTrade.symbol,
        side: masterTrade.direction === 'LONG' ? 'SELL' : 'BUY',
        type: 'MARKET',
        quantity,
        reduceOnly: true,
      });

      if (result.success) {
        return {
          success: true,
          followerTradeId: result.orderId,
        };
      } else {
        return {
          success: false,
          error: result.error,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Save copy trade record
   */
  private async saveCopyTrade(copyTrade: CopyTrade): Promise<void> {
    await db.copiedTrade.create({
      data: {
        id: copyTrade.id,
        masterTradeId: copyTrade.masterTradeId,
        followerId: copyTrade.followerId,
        symbol: copyTrade.symbol,
        direction: copyTrade.direction,
        entryPrice: copyTrade.followerEntryPrice,
        quantity: copyTrade.followerQuantity,
        leverage: copyTrade.leverage,
        status: copyTrade.status,
        createdAt: copyTrade.createdAt,
      },
    });
  }

  /**
   * Update copy trade after master trade closes
   */
  async updateCopyTrade(
    masterTradeId: string,
    masterPnl: number
  ): Promise<void> {
    const copyTrades = await db.copiedTrade.findMany({
      where: { masterTradeId, status: 'OPEN' },
    });

    for (const copyTrade of copyTrades) {
      const ratio = copyTrade.quantity / (await db.masterTrade.findUnique({
        where: { id: masterTradeId },
      }))?.quantity || 1;

      const followerPnl = masterPnl * ratio;
      const profitShare = followerPnl * 0.1; // 10% to master

      await db.copiedTrade.update({
        where: { id: copyTrade.id },
        data: {
          status: 'CLOSED',
          pnl: followerPnl,
          profitShare,
          closedAt: new Date(),
        },
      });

      this.activeCopies.delete(copyTrade.id);
    }
  }

  /**
   * Get engine statistics
   */
  getStats(): CopyEngineStats {
    return { ...this.stats };
  }

  /**
   * Get active copies
   */
  getActiveCopies(): CopyTrade[] {
    return Array.from(this.activeCopies.values());
  }
}

// ==================== SINGLETON ====================

let engineInstance: CopyEngine | null = null;

export function getCopyEngine(): CopyEngine {
  if (!engineInstance) {
    engineInstance = new CopyEngine();
  }
  return engineInstance;
}

// ==================== EXPORTS ====================

export default {
  CopyEngine,
  getCopyEngine,
};
