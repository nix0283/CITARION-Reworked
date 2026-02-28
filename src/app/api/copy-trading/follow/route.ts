/**
 * Copy Trading - Follow/Unfollow API
 * 
 * Follow or unfollow a master trader
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/copy-trading/follow
 * 
 * Follow a master trader
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      masterId,
      copyRatio = 1.0,
      maxFollowAmount = 1000,
      stopLossPercent = 20,
      takeProfitPercent = 50,
    } = body;
    
    if (!userId || !masterId) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, masterId' },
        { status: 400 }
      );
    }
    
    // Check if master exists and is active
    const master = await db.masterTrader.findUnique({
      where: { id: masterId },
    });
    
    if (!master) {
      return NextResponse.json(
        { error: 'Master trader not found' },
        { status: 404 }
      );
    }
    
    if (!master.isActive) {
      return NextResponse.json(
        { error: 'Master trader is not active' },
        { status: 400 }
      );
    }
    
    // Check if already following
    const existing = await db.copyFollower.findUnique({
      where: {
        userId_masterId: {
          userId,
          masterId,
        },
      },
    });
    
    if (existing) {
      return NextResponse.json(
        { error: 'Already following this master' },
        { status: 400 }
      );
    }
    
    // Check master's max followers
    const followerCount = await db.copyFollower.count({
      where: { masterId, isActive: true },
    });
    
    if (followerCount >= master.maxFollowers) {
      return NextResponse.json(
        { error: 'Master has reached maximum followers' },
        { status: 400 }
      );
    }
    
    // Create follower
    const follower = await db.copyFollower.create({
      data: {
        userId,
        masterId,
        copyRatio,
        maxFollowAmount,
        stopLossPercent,
        takeProfitPercent,
        profitSharePercent: master.profitSharePercent,
        isActive: true,
      },
    });
    
    // Update master's follower count
    await db.masterTrader.update({
      where: { id: masterId },
      data: {
        totalFollowers: followerCount + 1,
      },
    });
    
    return NextResponse.json({
      success: true,
      follower: {
        id: follower.id,
        masterId: follower.masterId,
        copyRatio: follower.copyRatio,
        maxFollowAmount: follower.maxFollowAmount,
        isActive: follower.isActive,
      },
      message: `Now following ${master.displayName}`,
    });
  } catch (error) {
    console.error('[Copy Trading Follow API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to follow master trader' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/copy-trading/follow
 * 
 * Unfollow a master trader
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const masterId = searchParams.get('masterId');
    
    if (!userId || !masterId) {
      return NextResponse.json(
        { error: 'Missing userId or masterId' },
        { status: 400 }
      );
    }
    
    // Find follower
    const follower = await db.copyFollower.findUnique({
      where: {
        userId_masterId: {
          userId,
          masterId,
        },
      },
    });
    
    if (!follower) {
      return NextResponse.json(
        { error: 'Not following this master' },
        { status: 404 }
      );
    }
    
    // Close any open copied trades
    await db.copiedTrade.updateMany({
      where: {
        followerId: follower.id,
        status: 'OPEN',
      },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });
    
    // Delete follower
    await db.copyFollower.delete({
      where: { id: follower.id },
    });
    
    // Update master's follower count
    const followerCount = await db.copyFollower.count({
      where: { masterId, isActive: true },
    });
    
    await db.masterTrader.update({
      where: { id: masterId },
      data: {
        totalFollowers: followerCount,
      },
    });
    
    return NextResponse.json({
      success: true,
      message: 'Unfollowed master trader',
    });
  } catch (error) {
    console.error('[Copy Trading Follow API] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to unfollow master trader' },
      { status: 500 }
    );
  }
}
