/**
 * TradingView Signal Parser and Executor
 * 
 * Parses TradingView webhook payloads and executes trades
 */

import { db } from '@/lib/db';

interface TradingViewPayload {
  action: 'BUY' | 'SELL' | 'CLOSE';
  symbol: string;
  direction?: 'LONG' | 'SHORT';
  leverage?: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  takeProfits?: Array<{
    price: number;
    percent: number;
  }>;
  comment?: string;
}

interface ExecuteResult {
  success: boolean;
  tradeId?: string;
  error?: string;
}

/**
 * Execute trading signal from TradingView
 */
export async function executeTradingViewSignal(params: {
  payload: TradingViewPayload;
  userId?: string;
}): Promise<ExecuteResult> {
  const { payload, userId } = params;
  
  try {
    // 1. Get or create default account
    let account = await getDefaultAccount(userId);
    
    if (!account) {
      return {
        success: false,
        error: 'No trading account configured',
      };
    }
    
    // 2. Get current market price
    const marketPrice = await db.marketPrice.findUnique({
      where: { symbol: payload.symbol },
    });
    
    const currentPrice = payload.price || marketPrice?.price;
    if (!currentPrice) {
      return {
        success: false,
        error: `No price available for ${payload.symbol}`,
      };
    }
    
    // 3. Execute based on action
    switch (payload.action) {
      case 'BUY':
        return executeBuySignal(account.id, payload, currentPrice);
      
      case 'SELL':
        return executeSellSignal(account.id, payload, currentPrice);
      
      case 'CLOSE':
        return executeCloseSignal(account.id, payload.symbol);
      
      default:
        return {
          success: false,
          error: `Unknown action: ${payload.action}`,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TradingView Parser] Error:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Execute BUY signal
 */
async function executeBuySignal(
  accountId: string,
  payload: TradingViewPayload,
  price: number
): Promise<ExecuteResult> {
  const direction = payload.direction || 'LONG';
  const leverage = payload.leverage || 10;
  const amount = 100; // Default amount, should come from bot config
  
  // Calculate quantity
  const quantity = (amount * leverage) / price;
  
  // Create position
  const position = await db.position.create({
    data: {
      accountId,
      symbol: payload.symbol,
      direction,
      status: 'OPEN',
      totalAmount: quantity,
      filledAmount: quantity,
      avgEntryPrice: price,
      currentPrice: price,
      leverage,
      stopLoss: payload.stopLoss || null,
      takeProfit: payload.takeProfit || null,
      isDemo: true,
    },
  });
  
  // Create take profit targets if provided
  if (payload.takeProfits && payload.takeProfits.length > 0) {
    // Store TP targets in position metadata (could be separate table)
    await db.position.update({
      where: { id: position.id },
      data: {
        takeProfit: JSON.stringify(payload.takeProfits),
      },
    });
  }
  
  // Create trade record
  const trade = await db.trade.create({
    data: {
      userId: position.account.userId,
      accountId,
      symbol: payload.symbol,
      direction,
      status: 'OPEN',
      entryPrice: price,
      entryTime: new Date(),
      amount: quantity,
      leverage,
      stopLoss: payload.stopLoss || null,
      isDemo: true,
      positionId: position.id,
      signalSource: 'TRADINGVIEW',
    },
  });
  
  // Log the trade
  await db.systemLog.create({
    data: {
      level: 'INFO',
      category: 'TRADE',
      message: `[TradingView] Opened ${direction} position: ${payload.symbol} @ $${price}`,
      details: JSON.stringify({
        positionId: position.id,
        tradeId: trade.id,
        quantity,
        leverage,
      }),
    },
  });
  
  return {
    success: true,
    tradeId: trade.id,
  };
}

/**
 * Execute SELL signal (for SHORT positions)
 */
async function executeSellSignal(
  accountId: string,
  payload: TradingViewPayload,
  price: number
): Promise<ExecuteResult> {
  const direction = payload.direction || 'SHORT';
  const leverage = payload.leverage || 10;
  const amount = 100; // Default amount
  
  const quantity = (amount * leverage) / price;
  
  const position = await db.position.create({
    data: {
      accountId,
      symbol: payload.symbol,
      direction,
      status: 'OPEN',
      totalAmount: quantity,
      filledAmount: quantity,
      avgEntryPrice: price,
      currentPrice: price,
      leverage,
      stopLoss: payload.stopLoss || null,
      takeProfit: payload.takeProfit || null,
      isDemo: true,
    },
  });
  
  const trade = await db.trade.create({
    data: {
      userId: position.account.userId,
      accountId,
      symbol: payload.symbol,
      direction,
      status: 'OPEN',
      entryPrice: price,
      entryTime: new Date(),
      amount: quantity,
      leverage,
      stopLoss: payload.stopLoss || null,
      isDemo: true,
      positionId: position.id,
      signalSource: 'TRADINGVIEW',
    },
  });
  
  return {
    success: true,
    tradeId: trade.id,
  };
}

/**
 * Execute CLOSE signal
 */
async function executeCloseSignal(
  accountId: string,
  symbol: string
): Promise<ExecuteResult> {
  // Find open position
  const position = await db.position.findFirst({
    where: {
      accountId,
      symbol,
      status: 'OPEN',
    },
  });
  
  if (!position) {
    return {
      success: false,
      error: `No open position found for ${symbol}`,
    };
  }
  
  // Get current price
  const marketPrice = await db.marketPrice.findUnique({
    where: { symbol },
  });
  
  const closePrice = marketPrice?.price || position.currentPrice;
  
  // Calculate PnL
  const pnl = position.direction === 'LONG'
    ? (closePrice - position.avgEntryPrice) * position.totalAmount
    : (position.avgEntryPrice - closePrice) * position.totalAmount;
  
  // Update position
  await db.position.update({
    where: { id: position.id },
    data: {
      status: 'CLOSED',
      currentPrice: closePrice,
      realizedPnl: pnl,
      closedAt: new Date(),
      closeReason: 'SIGNAL',
    },
  });
  
  // Update trade
  await db.trade.updateMany({
    where: { positionId: position.id },
    data: {
      status: 'CLOSED',
      exitPrice: closePrice,
      exitTime: new Date(),
      pnl,
      closeReason: 'SIGNAL',
    },
  });
  
  return {
    success: true,
    tradeId: position.id,
  };
}

/**
 * Get or create default trading account
 */
async function getDefaultAccount(userId?: string) {
  if (userId) {
    // Get user's first account
    return db.account.findFirst({
      where: { userId },
    });
  }
  
  // Get or create default demo account
  let user = await db.user.findFirst({
    where: { email: 'tradingview@citarion.local' },
  });
  
  if (!user) {
    user = await db.user.create({
      data: {
        email: 'tradingview@citarion.local',
        name: 'TradingView User',
      },
    });
  }
  
  let account = await db.account.findFirst({
    where: { userId: user.id, accountType: 'DEMO' },
  });
  
  if (!account) {
    account = await db.account.create({
      data: {
        userId: user.id,
        accountType: 'DEMO',
        exchangeId: 'binance',
        exchangeType: 'futures',
        exchangeName: 'Binance Demo',
        virtualBalance: JSON.stringify({ USDT: 10000 }),
        isActive: true,
      },
    });
  }
  
  return account;
}
