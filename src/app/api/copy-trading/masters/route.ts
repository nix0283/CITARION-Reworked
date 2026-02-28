/**
 * Copy Trading - Master Traders API
 * 
 * Get list of master traders, their stats, and performance
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/copy-trading/masters
 * 
 * Get all active master traders
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const sortBy = searchParams.get('sortBy') || 'totalFollowers';
    const minRoi = parseFloat(searchParams.get('minRoi') || '0');
    
    // Build where clause
    const where: any = {
      isActive: true,
    };
    
    if (minRoi > 0) {
      where.roi30d = { gte: minRoi };
    }
    
    // Build orderBy
    const orderBy: any = {};
    switch (sortBy) {
      case 'roi30d':
        orderBy.roi30d = 'desc';
        break;
      case 'totalProfit':
        orderBy.totalProfit = 'desc';
        break;
      case 'winRate':
        orderBy.winRate = 'desc';
        break;
      case 'totalFollowers':
      default:
        orderBy.totalFollowers = 'desc';
    }
    
    // Get masters
    const masters = await db.masterTrader.findMany({
      where,
      orderBy,
      take: limit,
      include: {
        followers: {
          select: {
            userId: true,
            isActive: true,
            investedAmount: true,
          },
        },
        trades: {
          select: {
            id: true,
            symbol: true,
            direction: true,
            pnl: true,
            status: true,
            openedAt: true,
          },
          orderBy: { openedAt: 'desc' },
          take: 10,
        },
      },
    });
    
    // Format response
    const formattedMasters = masters.map(master => ({
      id: master.id,
      displayName: master.displayName,
      description: master.description,
      avatar: master.avatar,
      isVerified: master.isVerified,
      stats: {
        totalFollowers: master.totalFollowers,
        totalAUM: master.totalAUM,
        totalProfit: master.totalProfit,
        winRate: master.winRate,
        totalTrades: master.totalTrades,
        roi30d: master.roi30d,
        roi90d: master.roi90d,
        maxDrawdown: master.maxDrawdown,
        sharpeRatio: master.sharpeRatio,
      },
      settings: {
        profitSharePercent: master.profitSharePercent,
        minFollowAmount: master.minFollowAmount,
        maxFollowers: master.maxFollowers,
      },
      recentTrades: master.trades.slice(0, 5).map(t => ({
        symbol: t.symbol,
        direction: t.direction,
        pnl: t.pnl,
        pnlPercent: t.pnlPercent,
        status: t.status,
        openedAt: t.openedAt,
      })),
    }));
    
    return NextResponse.json({
      success: true,
      masters: formattedMasters,
      count: formattedMasters.length,
    });
  } catch (error) {
    console.error('[Copy Trading Masters API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch master traders' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/copy-trading/masters
 * 
 * Register as master trader
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, displayName, description, profitSharePercent, minFollowAmount } = body;
    
    if (!userId || !displayName) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, displayName' },
        { status: 400 }
      );
    }
    
    // Check if already a master
    const existing = await db.masterTrader.findUnique({
      where: { userId },
    });
    
    if (existing) {
      return NextResponse.json(
        { error: 'User is already a master trader' },
        { status: 400 }
      );
    }
    
    // Create master trader
    const master = await db.masterTrader.create({
      data: {
        userId,
        displayName,
        description: description || '',
        profitSharePercent: profitSharePercent || 10,
        minFollowAmount: minFollowAmount || 100,
        isActive: false, // Require verification first
        isVerified: false,
      },
    });
    
    return NextResponse.json({
      success: true,
      master: {
        id: master.id,
        displayName: master.displayName,
        isActive: master.isActive,
        isVerified: master.isVerified,
      },
      message: 'Master trader registered. Pending verification.',
    });
  } catch (error) {
    console.error('[Copy Trading Masters API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to register master trader' },
      { status: 500 }
    );
  }
}
