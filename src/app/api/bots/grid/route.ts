/**
 * Grid Bot API
 * 
 * Create and manage grid trading bots
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { EXCHANGE_CONFIGS, ExchangeId } from "@/lib/exchange";

// GET - List all grid bots (or single bot by id param)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const botId = searchParams.get("id");
    
    // Get single bot by ID
    if (botId) {
      const bot = await db.gridBot.findUnique({
        where: { id: botId },
        include: {
          account: {
            select: {
              exchangeId: true,
              exchangeName: true,
              accountType: true,
            },
          },
          gridOrders: {
            orderBy: { gridLevel: "asc" },
          },
          _count: {
            select: { gridOrders: true },
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

    const bots = await db.gridBot.findMany({
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
          select: { gridOrders: true },
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
    console.error("Get grid bots error:", error);
    return NextResponse.json(
      { error: "Failed to fetch grid bots" },
      { status: 500 }
    );
  }
}

// POST - Create a new grid bot
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      symbol,
      exchangeId = "binance",
      gridType = "ARITHMETIC",
      gridCount = 10,
      upperPrice,
      lowerPrice,
      totalInvestment,
      perGridAmount,
      leverage = 1,
      marginMode = "ISOLATED",
      takeProfit,
      stopLoss,
      triggerPrice,
      triggerType,
      accountId,
    } = body;

    // Validation
    if (!name || !symbol || !upperPrice || !lowerPrice || !totalInvestment) {
      return NextResponse.json(
        { error: "Missing required fields: name, symbol, upperPrice, lowerPrice, totalInvestment" },
        { status: 400 }
      );
    }

    if (lowerPrice >= upperPrice) {
      return NextResponse.json(
        { error: "Lower price must be less than upper price" },
        { status: 400 }
      );
    }

    if (gridCount < 2 || gridCount > 100) {
      return NextResponse.json(
        { error: "Grid count must be between 2 and 100" },
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

    // Calculate grid levels
    const gridLevels: number[] = [];
    const priceStep = (upperPrice - lowerPrice) / (gridCount - 1);

    if (gridType === "ARITHMETIC") {
      for (let i = 0; i < gridCount; i++) {
        gridLevels.push(lowerPrice + priceStep * i);
      }
    } else {
      // Geometric
      const ratio = Math.pow(upperPrice / lowerPrice, 1 / (gridCount - 1));
      for (let i = 0; i < gridCount; i++) {
        gridLevels.push(lowerPrice * Math.pow(ratio, i));
      }
    }

    // Create bot
    const bot = await db.gridBot.create({
      data: {
        userId: account.userId,
        accountId: account.id,
        name,
        description,
        symbol: symbol.toUpperCase(),
        exchangeId,
        gridType,
        gridCount,
        upperPrice,
        lowerPrice,
        totalInvestment,
        perGridAmount: perGridAmount || totalInvestment / gridCount,
        leverage,
        marginMode,
        takeProfit,
        stopLoss,
        triggerPrice,
        triggerType,
        status: "STOPPED",
      },
    });

    // Create grid orders (pending)
    const ordersData = gridLevels.map((price, index) => ({
      gridBotId: bot.id,
      gridLevel: index + 1,
      price,
      side: index < gridCount / 2 ? "BUY" : "SELL",
      status: "PENDING",
      amount: perGridAmount || totalInvestment / gridCount,
    }));

    await db.gridOrder.createMany({
      data: ordersData,
    });

    return NextResponse.json({
      success: true,
      bot,
      gridLevels,
      message: `Grid bot "${name}" created with ${gridCount} levels from $${lowerPrice} to $${upperPrice}`,
    });
  } catch (error) {
    console.error("Create grid bot error:", error);
    return NextResponse.json(
      { error: "Failed to create grid bot", details: error instanceof Error ? error.message : "Unknown error" },
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

    const bot = await db.gridBot.findUnique({
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
        message = `Grid bot "${bot.name}" запущен`;
        break;
      
      case "stop":
        updateData = {
          isActive: false,
          status: "STOPPED",
          stoppedAt: new Date(),
        };
        message = `Grid bot "${bot.name}" остановлен`;
        break;
      
      case "pause":
        updateData = {
          isActive: false,
          status: "PAUSED",
        };
        message = `Grid bot "${bot.name}" приостановлен`;
        break;
      
      default:
        return NextResponse.json(
          { error: "Invalid action. Use: start, stop, pause" },
          { status: 400 }
        );
    }

    const updatedBot = await db.gridBot.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      bot: updatedBot,
      message,
    });
  } catch (error) {
    console.error("Update grid bot error:", error);
    return NextResponse.json(
      { error: "Failed to update grid bot", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a grid bot
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

    const bot = await db.gridBot.findUnique({
      where: { id },
    });

    if (!bot) {
      return NextResponse.json(
        { error: "Bot not found" },
        { status: 404 }
      );
    }

    // Delete all grid orders first (cascade should handle this, but let's be explicit)
    await db.gridOrder.deleteMany({
      where: { gridBotId: id },
    });

    // Delete the bot
    await db.gridBot.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `Grid bot "${bot.name}" удалён`,
    });
  } catch (error) {
    console.error("Delete grid bot error:", error);
    return NextResponse.json(
      { error: "Failed to delete grid bot", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
