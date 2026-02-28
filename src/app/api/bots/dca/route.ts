/**
 * DCA Bot API
 * 
 * Create and manage DCA (Dollar Cost Averaging) trading bots
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { EXCHANGE_CONFIGS, ExchangeId } from "@/lib/exchange";

// GET - List all DCA bots (or single bot by id param)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const botId = searchParams.get("id");
    
    // Get single bot by ID
    if (botId) {
      const bot = await db.dcaBot.findUnique({
        where: { id: botId },
        include: {
          account: {
            select: {
              exchangeId: true,
              exchangeName: true,
              accountType: true,
            },
          },
          dcaOrders: {
            orderBy: { dcaLevel: "asc" },
          },
          _count: {
            select: { dcaOrders: true },
          },
        },
      });
      
      if (!bot) {
        return NextResponse.json(
          { error: "Bot not found" },
          { status: 404 }
        );
      }
      
      return NextResponse.json({
        success: true,
        bot,
      });
    }
    
    // List all bots
    const isActive = searchParams.get("active") === "true";

    const where: { isActive?: boolean } = {};
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const bots = await db.dcaBot.findMany({
      where,
      include: {
        account: {
          select: {
            exchangeId: true,
            exchangeName: true,
            accountType: true,
          },
        },
        _count: {
          select: { dcaOrders: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      bots,
      count: bots.length,
    });
  } catch (error) {
    console.error("Get DCA bots error:", error);
    return NextResponse.json(
      { error: "Failed to fetch DCA bots" },
      { status: 500 }
    );
  }
}

// POST - Create a new DCA bot
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      symbol,
      exchangeId = "binance",
      direction = "LONG",
      entryType = "MARKET",
      entryPrice,
      baseAmount,
      dcaLevels = 5,
      dcaPercent = 5,
      dcaMultiplier = 1.5,
      dcaCustomLevels,
      tpType = "PERCENT",
      tpValue = 10,
      tpSellBase = false,
      slEnabled = false,
      slType = "PERCENT",
      slValue,
      leverage = 1,
      marginMode = "ISOLATED",
      trailingEnabled = false,
      trailingPercent,
      accountId,
    } = body;

    // Validation
    if (!name || !symbol || !baseAmount) {
      return NextResponse.json(
        { error: "Missing required fields: name, symbol, baseAmount" },
        { status: 400 }
      );
    }

    if (baseAmount <= 0) {
      return NextResponse.json(
        { error: "Base amount must be greater than 0" },
        { status: 400 }
      );
    }

    if (dcaLevels < 1 || dcaLevels > 20) {
      return NextResponse.json(
        { error: "DCA levels must be between 1 and 20" },
        { status: 400 }
      );
    }

    // Get or create demo account
    let account;
    if (accountId) {
      account = await db.account.findUnique({ where: { id: accountId } });
    }

    if (!account) {
      let user = await db.user.findFirst({
        where: { email: "user@citarion.local" },
      });

      if (!user) {
        user = await db.user.create({
          data: {
            email: "user@citarion.local",
            name: "User",
            currentMode: "DEMO",
          },
        });
      }

      const exchangeName = EXCHANGE_CONFIGS[exchangeId as ExchangeId]?.name || exchangeId;

      account = await db.account.findFirst({
        where: { userId: user.id, accountType: "DEMO", exchangeId },
      });

      if (!account) {
        account = await db.account.create({
          data: {
            userId: user.id,
            accountType: "DEMO",
            exchangeId,
            exchangeType: "futures",
            exchangeName: `${exchangeName} Demo`,
            virtualBalance: JSON.stringify({ USDT: 10000 }),
            isActive: true,
          },
        });
      }
    }

    // Calculate DCA levels for preview
    const dcaLevelsPreview: { level: number; priceDrop: number; amountMult: number }[] = [];
    for (let i = 1; i <= dcaLevels; i++) {
      dcaLevelsPreview.push({
        level: i,
        priceDrop: dcaPercent * i,
        amountMult: Math.pow(dcaMultiplier, i),
      });
    }

    // Create bot
    const bot = await db.dcaBot.create({
      data: {
        userId: account.userId,
        accountId: account.id,
        name,
        description,
        symbol: symbol.toUpperCase(),
        exchangeId,
        direction,
        entryType,
        entryPrice,
        baseAmount,
        dcaLevels,
        dcaPercent,
        dcaMultiplier,
        dcaCustomLevels: dcaCustomLevels ? JSON.stringify(dcaCustomLevels) : null,
        tpType,
        tpValue,
        tpSellBase,
        slEnabled,
        slType,
        slValue,
        leverage,
        marginMode,
        trailingEnabled,
        trailingPercent,
        status: "STOPPED",
      },
    });

    // Create initial order (pending)
    await db.dcaOrder.create({
      data: {
        dcaBotId: bot.id,
        dcaLevel: 0,
        price: entryPrice,
        side: direction === "LONG" ? "BUY" : "SELL",
        orderType: entryType,
        status: "PENDING",
        amount: baseAmount,
      },
    });

    // Create DCA orders (pending)
    for (let i = 1; i <= dcaLevels; i++) {
      await db.dcaOrder.create({
        data: {
          dcaBotId: bot.id,
          dcaLevel: i,
          price: entryPrice ? entryPrice * (1 - (dcaPercent / 100) * i) : null,
          side: direction === "LONG" ? "BUY" : "SELL",
          orderType: "LIMIT",
          status: "PENDING",
          amount: baseAmount * Math.pow(dcaMultiplier, i),
        },
      });
    }

    return NextResponse.json({
      success: true,
      bot,
      dcaLevelsPreview,
      message: `DCA bot "${name}" created with ${dcaLevels} DCA levels (${dcaPercent}% price drop, ${dcaMultiplier}x amount multiplier)`,
    });
  } catch (error) {
    console.error("Create DCA bot error:", error);
    return NextResponse.json(
      { error: "Failed to create DCA bot", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// PATCH - Update bot status (start/stop/pause)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body;

    if (!id || !action) {
      return NextResponse.json(
        { error: "Missing required fields: id, action" },
        { status: 400 }
      );
    }

    const bot = await db.dcaBot.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!bot) {
      return NextResponse.json(
        { error: "Bot not found" },
        { status: 404 }
      );
    }

    let updateData: Record<string, unknown> = {};
    let message = "";

    switch (action) {
      case "start":
        updateData = {
          isActive: true,
          status: "RUNNING",
          startedAt: new Date(),
        };
        message = `DCA bot "${bot.name}" запущен`;
        break;
      
      case "stop":
        updateData = {
          isActive: false,
          status: "STOPPED",
          stoppedAt: new Date(),
        };
        message = `DCA bot "${bot.name}" остановлен`;
        break;
      
      case "pause":
        updateData = {
          isActive: false,
          status: "PAUSED",
        };
        message = `DCA bot "${bot.name}" приостановлен`;
        break;
      
      default:
        return NextResponse.json(
          { error: "Invalid action. Use: start, stop, pause" },
          { status: 400 }
        );
    }

    const updatedBot = await db.dcaBot.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      bot: updatedBot,
      message,
    });
  } catch (error) {
    console.error("Update DCA bot error:", error);
    return NextResponse.json(
      { error: "Failed to update DCA bot", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a DCA bot
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing required parameter: id" },
        { status: 400 }
      );
    }

    const bot = await db.dcaBot.findUnique({
      where: { id },
    });

    if (!bot) {
      return NextResponse.json(
        { error: "Bot not found" },
        { status: 404 }
      );
    }

    // Delete all DCA orders first
    await db.dcaOrder.deleteMany({
      where: { dcaBotId: id },
    });

    // Delete the bot
    await db.dcaBot.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `DCA bot "${bot.name}" удалён`,
    });
  } catch (error) {
    console.error("Delete DCA bot error:", error);
    return NextResponse.json(
      { error: "Failed to delete DCA bot", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
