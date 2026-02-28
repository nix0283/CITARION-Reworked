/**
 * Profit Sharing Automation
 * 
 * Automated profit distribution system:
 * - Calculate profit shares
 * - Distribute to master traders
 * - Track payment history
 * - Handle withdrawals
 * 
 * @module lib/copy-trading/profit-sharing
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface ProfitDistribution {
  id: string;
  masterId: string;
  periodStart: Date;
  periodEnd: Date;
  totalProfit: number;
  totalFollowers: number;
  profitSharePercent: number;
  masterShare: number;
  platformFee: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  distributedAt?: Date;
}

export interface ProfitShareConfig {
  defaultProfitSharePercent: number;
  minProfitSharePercent: number;
  maxProfitSharePercent: number;
  platformFeePercent: number;
  minPayoutAmount: number;
  payoutSchedule: 'DAILY' | 'WEEKLY' | 'MONTHLY';
}

export interface ProfitStats {
  totalDistributed: number;
  totalPlatformFees: number;
  pendingPayouts: number;
  completedPayouts: number;
  avgPayoutTime: number;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: ProfitShareConfig = {
  defaultProfitSharePercent: 10,
  minProfitSharePercent: 5,
  maxProfitSharePercent: 30,
  platformFeePercent: 5,
  minPayoutAmount: 10,
  payoutSchedule: 'WEEKLY',
};

// ==================== PROFIT SHARING SERVICE ====================

export class ProfitSharingService {
  private config: ProfitShareConfig;
  private stats: ProfitStats;

  constructor(config?: Partial<ProfitShareConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.stats = {
      totalDistributed: 0,
      totalPlatformFees: 0,
      pendingPayouts: 0,
      completedPayouts: 0,
      avgPayoutTime: 0,
    };
  }

  /**
   * Calculate profit share for a master trader
   */
  async calculateProfitShare(
    masterId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{
    totalProfit: number;
    masterShare: number;
    platformFee: number;
    followerShares: number;
  }> {
    // Get all closed copied trades for this master in period
    const copiedTrades = await db.copiedTrade.findMany({
      where: {
        masterTrade: {
          masterId,
        },
        status: 'CLOSED',
        closedAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      include: {
        follower: true,
      },
    });

    // Calculate total profit
    const totalProfit = copiedTrades.reduce((sum, trade) => {
      return sum + (trade.pnl || 0);
    }, 0);

    if (totalProfit <= 0) {
      return {
        totalProfit: 0,
        masterShare: 0,
        platformFee: 0,
        followerShares: 0,
      };
    }

    // Get master's profit share percent
    const master = await db.masterTrader.findUnique({
      where: { id: masterId },
    });

    const profitSharePercent = master?.profitSharePercent || 
                               this.config.defaultProfitSharePercent;

    // Calculate shares
    const platformFee = totalProfit * (this.config.platformFeePercent / 100);
    const masterShare = totalProfit * (profitSharePercent / 100);
    const followerShares = totalProfit - platformFee - masterShare;

    return {
      totalProfit,
      masterShare,
      platformFee,
      followerShares,
    };
  }

  /**
   * Distribute profits to master traders
   */
  async distributeProfits(
    masterId?: string,
    periodStart?: Date,
    periodEnd?: Date
  ): Promise<{ success: boolean; distributions: ProfitDistribution[] }> {
    const startTime = Date.now();

    try {
      // Default to last week if not specified
      if (!periodStart || !periodEnd) {
        periodEnd = new Date();
        periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - 7);
      }

      // Get masters to distribute
      const masters = await db.masterTrader.findMany({
        where: masterId ? { id: masterId } : {
          isActive: true,
          profitSharePercent: { gt: 0 },
        },
        include: {
          followers: {
            where: { active: true },
          },
        },
      });

      const distributions: ProfitDistribution[] = [];

      for (const master of masters) {
        // Calculate profit share
        const profitShare = await this.calculateProfitShare(
          master.id,
          periodStart,
          periodEnd
        );

        if (profitShare.totalProfit <= 0) {
          continue;
        }

        // Check minimum payout
        if (profitShare.masterShare < this.config.minPayoutAmount) {
          logger.info({
            masterId: master.id,
            share: profitShare.masterShare,
          }, 'Profit share below minimum payout');
          continue;
        }

        // Create distribution record
        const distribution: ProfitDistribution = {
          id: `dist-${Date.now()}-${master.id}`,
          masterId: master.id,
          periodStart,
          periodEnd,
          totalProfit: profitShare.totalProfit,
          totalFollowers: master.followers.length,
          profitSharePercent: master.profitSharePercent || this.config.defaultProfitSharePercent,
          masterShare: profitShare.masterShare,
          platformFee: profitShare.platformFee,
          status: 'PENDING',
        };

        await db.profitDistribution.create({
          data: {
            id: distribution.id,
            masterId: distribution.masterId,
            periodStart: distribution.periodStart,
            periodEnd: distribution.periodEnd,
            totalProfit: distribution.totalProfit,
            totalFollowers: distribution.totalFollowers,
            profitSharePercent: distribution.profitSharePercent,
            masterShare: distribution.masterShare,
            platformFee: distribution.platformFee,
            status: distribution.status,
          },
        });

        distributions.push(distribution);
        this.stats.pendingPayouts++;

        logger.info({
          masterId: master.id,
          totalProfit: profitShare.totalProfit,
          masterShare: profitShare.masterShare,
          platformFee: profitShare.platformFee,
        }, 'Profit distribution created');
      }

      // Update stats
      this.stats.totalDistributed += distributions.reduce(
        (sum, d) => sum + d.masterShare, 0
      );
      this.stats.totalPlatformFees += distributions.reduce(
        (sum, d) => sum + d.platformFee, 0
      );

      logger.info({
        count: distributions.length,
        totalDistributed: this.stats.totalDistributed,
      }, 'Profit distribution completed');

      return {
        success: true,
        distributions,
      };
    } catch (error) {
      logger.error({ error }, 'Profit distribution failed');
      return { success: false, distributions: [] };
    }
  }

  /**
   * Process pending distributions
   */
  async processDistributions(): Promise<{
    processed: number;
    failed: number;
  }> {
    const pendingDistributions = await db.profitDistribution.findMany({
      where: { status: 'PENDING' },
    });

    let processed = 0;
    let failed = 0;

    for (const distribution of pendingDistributions) {
      try {
        // Update status to processing
        await db.profitDistribution.update({
          where: { id: distribution.id },
          data: { status: 'PROCESSING' },
        });

        // Process payout (integrate with payment system)
        await this.processPayout(distribution);

        // Mark as completed
        await db.profitDistribution.update({
          where: { id: distribution.id },
          data: {
            status: 'COMPLETED',
            distributedAt: new Date(),
          },
        });

        processed++;
        this.stats.completedPayouts++;
        this.stats.pendingPayouts--;

        logger.info({
          distributionId: distribution.id,
          masterId: distribution.masterId,
          amount: distribution.masterShare,
        }, 'Profit distribution processed');
      } catch (error) {
        failed++;

        await db.profitDistribution.update({
          where: { id: distribution.id },
          data: { status: 'FAILED' },
        });

        logger.error({
          error,
          distributionId: distribution.id,
        }, 'Profit distribution failed');
      }
    }

    return { processed, failed };
  }

  /**
   * Process individual payout
   */
  private async processPayout(distribution: ProfitDistribution): Promise<void> {
    // Get master's payout account
    const master = await db.masterTrader.findUnique({
      where: { id: distribution.masterId },
      include: { user: true },
    });

    if (!master || !master.user) {
      throw new Error('Master not found');
    }

    // In production, integrate with actual payment system
    // For now, just update user balance
    await db.user.update({
      where: { id: master.userId },
      data: {
        balance: {
          increment: distribution.masterShare,
        },
      },
    });

    // Create transaction record
    await db.transaction.create({
      data: {
        userId: master.userId,
        type: 'PROFIT_SHARE',
        amount: distribution.masterShare,
        status: 'COMPLETED',
        description: `Profit share ${distribution.periodStart.toISOString()} - ${distribution.periodEnd.toISOString()}`,
      },
    });
  }

  /**
   * Get profit statistics
   */
  async getProfitStats(masterId?: string): Promise<ProfitStats> {
    const distributions = await db.profitDistribution.findMany({
      where: masterId ? { masterId } : {},
    });

    const completed = distributions.filter(d => d.status === 'COMPLETED');
    const pending = distributions.filter(d => d.status === 'PENDING' || d.status === 'PROCESSING');

    return {
      totalDistributed: completed.reduce((sum, d) => sum + d.masterShare, 0),
      totalPlatformFees: completed.reduce((sum, d) => sum + d.platformFee, 0),
      pendingPayouts: pending.length,
      completedPayouts: completed.length,
      avgPayoutTime: this.stats.avgPayoutTime,
    };
  }

  /**
   * Get master's profit history
   */
  async getMasterProfitHistory(
    masterId: string,
    limit: number = 50
  ): Promise<ProfitDistribution[]> {
    return db.profitDistribution.findMany({
      where: { masterId },
      orderBy: { periodEnd: 'desc' },
      take: limit,
    });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProfitShareConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): ProfitShareConfig {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStats(): ProfitStats {
    return { ...this.stats };
  }
}

// ==================== SINGLETON ====================

let serviceInstance: ProfitSharingService | null = null;

export function getProfitSharingService(
  config?: Partial<ProfitShareConfig>
): ProfitSharingService {
  if (!serviceInstance) {
    serviceInstance = new ProfitSharingService(config);
  } else if (config) {
    serviceInstance.updateConfig(config);
  }
  return serviceInstance;
}

// ==================== EXPORTS ====================

export default {
  ProfitSharingService,
  getProfitSharingService,
  DEFAULT_CONFIG,
};
