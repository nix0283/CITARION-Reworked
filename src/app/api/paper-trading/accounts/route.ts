/**
 * Paper Trading Accounts API
 * 
 * Manage persistent paper trading accounts
 * - Create, load, save, delete accounts
 * - Auto-save every 5 minutes
 * - Load accounts on startup
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPaperTradingEngine } from '@/lib/paper-trading/engine';
import { getPaperTradingPersistence } from '@/lib/paper-trading/persistence';

interface CreateAccountRequest {
  name: string;
  initialBalance: number;
  maxLeverage?: number;
  maxOpenPositions?: number;
  maxRiskPerTrade?: number;
  feePercent?: number;
  maxDrawdown?: number;
}

/**
 * GET /api/paper-trading/accounts
 * 
 * Get all paper trading accounts for user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      // Return demo accounts
      const engine = getPaperTradingEngine();
      const accounts = engine.getAllAccounts();
      
      return NextResponse.json({
        success: true,
        accounts: accounts.map(acc => ({
          id: acc.id,
          name: acc.name,
          balance: acc.balance,
          equity: acc.equity,
          status: acc.status,
          totalPnl: acc.totalPnl,
          totalPnlPercent: acc.totalPnlPercent,
        })),
        count: accounts.length,
      });
    }
    
    // Load from database
    const persistence = getPaperTradingPersistence();
    const accounts = await persistence.loadAllAccounts(userId);
    
    return NextResponse.json({
      success: true,
      accounts: accounts.map(acc => ({
        id: acc.id,
        name: acc.name,
        balance: acc.balance,
        equity: acc.equity,
        status: acc.status,
        totalPnl: acc.totalPnl,
        totalPnlPercent: acc.totalPnlPercent,
        startedAt: acc.startedAt,
        stoppedAt: acc.stoppedAt,
      })),
      count: accounts.length,
    });
  } catch (error) {
    console.error('[Paper Trading API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/paper-trading/accounts
 * 
 * Create new paper trading account
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateAccountRequest = await request.json();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    // Validate required fields
    if (!body.name || !body.initialBalance) {
      return NextResponse.json(
        { error: 'Missing required fields: name, initialBalance' },
        { status: 400 }
      );
    }
    
    // Validate balance
    if (body.initialBalance <= 0) {
      return NextResponse.json(
        { error: 'Initial balance must be greater than 0' },
        { status: 400 }
      );
    }
    
    const engine = getPaperTradingEngine();
    
    // Generate unique ID
    const accountId = `paper-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create account
    const account = engine.createAccount(
      {
        id: accountId,
        name: body.name,
        initialBalance: body.initialBalance,
        maxLeverage: body.maxLeverage || 10,
        maxOpenPositions: body.maxOpenPositions || 5,
        maxRiskPerTrade: body.maxRiskPerTrade || 2,
        feePercent: body.feePercent || 0.1,
        maxDrawdown: body.maxDrawdown || 20,
        autoTrading: false,
        strategyId: '',
        tacticsSets: [],
      },
      userId || undefined
    );
    
    // Start trading
    engine.start(accountId);
    
    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        name: account.name,
        balance: account.balance,
        equity: account.equity,
        status: account.status,
      },
      message: `Account created with ${body.initialBalance} USDT`,
    });
  } catch (error) {
    console.error('[Paper Trading API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/paper-trading/accounts
 * 
 * Delete paper trading account
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    
    if (!accountId) {
      return NextResponse.json(
        { error: 'Missing accountId parameter' },
        { status: 400 }
      );
    }
    
    const engine = getPaperTradingEngine();
    const persistence = getPaperTradingPersistence();
    
    // Stop auto-save
    persistence.stopAutoSave(accountId);
    
    // Delete from database
    await persistence.deleteAccount(accountId);
    
    // Delete from engine
    engine.deleteAccount(accountId);
    
    return NextResponse.json({
      success: true,
      message: 'Account deleted',
    });
  } catch (error) {
    console.error('[Paper Trading API] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}
