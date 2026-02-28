/**
 * Close Position API Endpoint
 * 
 * Handles closing positions for both demo and real trading
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { createExchangeClient, ExchangeId, MarketType } from "@/lib/exchange";

interface CloseTradeRequest {
  positionId: string;
  closePrice?: number;
  closeReason?: "MANUAL" | "TP" | "SL" | "TRAILING_STOP";
  quantity?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: CloseTradeRequest = await request.json();
    const { positionId, closePrice, closeReason = "MANUAL", quantity } = body;

    if (!positionId) {
      return NextResponse.json(
        { error: "Position ID is required" },
        { status: 400 }
      );
    }

    // Fetch the position
    const position = await db.position.findUnique({
      where: { id: positionId },
      include: {
        account: true,
        trades: { where: { status: "OPEN" } },
      },
    });

    if (!position) {
      return NextResponse.json(
        { error: "Position not found" },
        { status: 404 }
      );
    }

    if (position.status !== "OPEN") {
      return NextResponse.json(
        { error: `Position is already ${position.status}` },
        { status: 400 }
      );
    }

    // Handle based on demo/real
    if (position.isDemo) {
      return handleCloseDemoPosition(position, closePrice, closeReason, quantity);
    } else {
      return handleCloseRealPosition(position, closeReason, quantity);
    }
  } catch (error) {
    console.error("Close position error:", error);
    return NextResponse.json(
      { error: "Failed to close position", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Handle closing demo position
 */
async function handleCloseDemoPosition(
  position: {
    id: string;
    accountId: string;
    symbol: string;
    direction: string;
    totalAmount: number;
    avgEntryPrice: number;
    currentPrice: number | null;
    leverage: number;
    totalFundingPaid: number;
    totalFundingReceived: number;
    account: {
      id: string;
      virtualBalance: string | null;
    } | null;
    trades: { id: string; fee: number }[];
  },
  closePrice?: number,
  closeReason?: string,
  closeQuantity?: number
) {
  // Get current market price
  const marketPrice = await db.marketPrice.findUnique({
    where: { symbol: position.symbol },
  });

  const exitPrice = closePrice || marketPrice?.price || position.currentPrice || position.avgEntryPrice;

  const entryPrice = position.avgEntryPrice;
  const quantity = closeQuantity || position.totalAmount;
  const leverage = position.leverage;

  // Calculate PnL
  let pnl: number;
  let pnlPercent: number;

  if (position.direction === "LONG") {
    pnl = (exitPrice - entryPrice) * quantity;
    pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100 * leverage;
  } else {
    pnl = (entryPrice - exitPrice) * quantity;
    pnlPercent = ((entryPrice - exitPrice) / entryPrice) * 100 * leverage;
  }

  // Calculate closing fee
  const positionValue = exitPrice * quantity;
  const closeFee = positionValue * 0.0004; // 0.04% taker fee
  const totalFee = closeFee + (position.trades[0]?.fee || 0);

  // Add funding PnL
  const netFunding = position.totalFundingReceived - position.totalFundingPaid;
  const netPnL = pnl - closeFee + netFunding;
  const netPnLPercent = pnlPercent - (closeFee / (entryPrice * quantity)) * 100;

  // Update position status
  await db.position.update({
    where: { id: position.id },
    data: {
      status: "CLOSED",
      currentPrice: exitPrice,
      realizedPnl: netPnL,
    },
  });

  // Update trades
  await db.trade.updateMany({
    where: {
      positionId: position.id,
      status: "OPEN",
    },
    data: {
      status: "CLOSED",
      exitPrice,
      exitTime: new Date(),
      closeReason,
      pnl: netPnL,
      pnlPercent: netPnLPercent,
      fee: totalFee,
    },
  });

  // Update balance for demo accounts
  if (position.account) {
    const balanceData = position.account.virtualBalance
      ? JSON.parse(position.account.virtualBalance)
      : { USDT: 10000 };

    const margin = (position.totalAmount * position.avgEntryPrice) / position.leverage;
    balanceData.USDT = (balanceData.USDT || 0) + margin + netPnL;

    await db.account.update({
      where: { id: position.account.id },
      data: { virtualBalance: JSON.stringify(balanceData) },
    });
  }

  // Log the trade close
  await db.systemLog.create({
    data: {
      level: netPnL >= 0 ? "INFO" : "WARNING",
      category: "TRADE",
      message: `[DEMO] Closed ${position.direction} position: ${position.symbol} @ $${exitPrice}`,
      details: JSON.stringify({
        positionId: position.id,
        entryPrice,
        exitPrice,
        quantity,
        leverage,
        pnl: netPnL,
        pnlPercent: netPnLPercent,
        closeReason,
        fee: closeFee,
        netFunding,
      }),
    },
  });

  return NextResponse.json({
    success: true,
    position: {
      id: position.id,
      symbol: position.symbol,
      direction: position.direction,
      status: "CLOSED",
      entryPrice,
      exitPrice,
      quantity,
      leverage,
    },
    pnl: {
      value: netPnL,
      percent: netPnLPercent,
      gross: pnl,
      fee: closeFee,
      funding: netFunding,
    },
    closeReason,
    message: `[DEMO] Позиция закрыта. PnL: $${netPnL.toFixed(2)} (${netPnLPercent >= 0 ? "+" : ""}${netPnLPercent.toFixed(2)}%)`,
  });
}

/**
 * Handle closing real position
 */
async function handleCloseRealPosition(
  position: {
    id: string;
    accountId: string;
    symbol: string;
    direction: string;
    totalAmount: number;
    avgEntryPrice: number;
    currentPrice: number | null;
    leverage: number;
    account: {
      id: string;
      exchangeId: string;
      exchangeType: string;
      isTestnet: boolean;
      apiKey: string | null;
      apiSecret: string | null;
      apiPassphrase: string | null;
    } | null;
    trades: { id: string }[];
  },
  closeReason?: string,
  closeQuantity?: number
) {
  if (!position.account) {
    return NextResponse.json(
      { error: "Account not found for position" },
      { status: 400 }
    );
  }

  const account = position.account;

  if (!account.apiKey || !account.apiSecret) {
    return NextResponse.json(
      { error: "API credentials not configured" },
      { status: 400 }
    );
  }

  // Decrypt credentials
  let decryptedApiKey: string;
  let decryptedApiSecret: string;

  try {
    decryptedApiKey = decryptApiKey(account.apiKey);
    decryptedApiSecret = decryptApiKey(account.apiSecret);
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt API credentials" },
      { status: 500 }
    );
  }

  const exchangeId = account.exchangeId as ExchangeId;
  const marketType = account.exchangeType as MarketType;
  const testnet = account.isTestnet;

  try {
    const client = createExchangeClient(exchangeId, {
      credentials: {
        apiKey: decryptedApiKey,
        apiSecret: decryptedApiSecret,
        passphrase: account.apiPassphrase || undefined,
      },
      marketType,
      testnet,
    });

    // Close position on exchange
    const result = await client.closePosition({
      symbol: position.symbol,
      quantity: closeQuantity,
      market: true,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to close position on exchange" },
        { status: 400 }
      );
    }

    // Get current price for calculations
    const ticker = await client.getTicker(position.symbol);
    const exitPrice = ticker.last;

    // Calculate final PnL
    const quantity = closeQuantity || position.totalAmount;
    let pnl: number;

    if (position.direction === "LONG") {
      pnl = (exitPrice - position.avgEntryPrice) * quantity;
    } else {
      pnl = (position.avgEntryPrice - exitPrice) * quantity;
    }

    // Update local position record
    await db.position.update({
      where: { id: position.id },
      data: {
        status: "CLOSED",
        currentPrice: exitPrice,
        realizedPnl: pnl,
      },
    });

    // Update trades
    await db.trade.updateMany({
      where: {
        positionId: position.id,
        status: "OPEN",
      },
      data: {
        status: "CLOSED",
        exitPrice,
        exitTime: new Date(),
        closeReason,
        pnl,
      },
    });

    // Log the trade close
    await db.systemLog.create({
      data: {
        level: pnl >= 0 ? "INFO" : "WARNING",
        category: "TRADE",
        message: `[REAL] Closed ${position.direction} position on ${exchangeId}: ${position.symbol} @ $${exitPrice}`,
        details: JSON.stringify({
          positionId: position.id,
          exchangeId,
          symbol: position.symbol,
          exitPrice,
          quantity,
          pnl,
          closeReason,
          order: result.order,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      position: {
        id: position.id,
        symbol: position.symbol,
        direction: position.direction,
        status: "CLOSED",
        entryPrice: position.avgEntryPrice,
        exitPrice,
        quantity,
        leverage: position.leverage,
      },
      pnl: {
        value: pnl,
        gross: pnl,
      },
      order: result.order,
      exchange: exchangeId,
      testnet,
      closeReason,
      message: `[REAL] Позиция закрыта на ${exchangeId}. PnL: $${pnl.toFixed(2)}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await db.systemLog.create({
      data: {
        level: "ERROR",
        category: "TRADE",
        message: `[REAL] Failed to close position on ${exchangeId}: ${errorMessage}`,
        details: JSON.stringify({
          positionId: position.id,
          symbol: position.symbol,
          error: errorMessage,
        }),
      },
    });

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
