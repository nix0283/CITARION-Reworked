/**
 * Position Monitor Service
 * 
 * Отслеживает позиции в реальном времени:
 * - Исполнение ордеров (полностью/частично)
 * - Достижение Take Profit целей
 * - Срабатывание Stop Loss
 * - Изменение PnL
 * - Trailing Stop отслеживание
 * - External Positions (ADOPTED) мониторинг
 * 
 * Интеграция с Telegram и UI уведомлениями
 * 
 * IMPORTANT: Trailing Stop теперь вызывается автоматически при каждом цикле мониторинга
 */

import { db } from "@/lib/db";
import { notifyTelegram, notifyUI, type NotificationEvent } from "@/lib/notification-service";
import { checkTrailingStop, type TrailingStopConfig } from "@/lib/trailing-stop";
import { getDefaultUserId } from "@/lib/default-user";

// ==================== WEBSOCKET PRICE INTEGRATION ====================

// Глобальный кэш цен от WebSocket
let wsPriceCache: Record<string, number> = {};
let wsPriceCallbacks: Set<(prices: Record<string, number>) => void> = new Set();

/**
 * Обновить кэш цен от WebSocket (вызывается из price-provider)
 */
export function updateWsPrices(prices: Record<string, number>): void {
  wsPriceCache = { ...wsPriceCache, ...prices };
  wsPriceCallbacks.forEach(cb => cb(wsPriceCache));
}

/**
 * Подписаться на обновления цен WebSocket
 */
export function subscribeToWsPrices(callback: (prices: Record<string, number>) => void): () => void {
  wsPriceCallbacks.add(callback);
  return () => wsPriceCallbacks.delete(callback);
}

/**
 * Получить кэшированную WebSocket цену
 */
export function getWsPrice(symbol: string): number | null {
  return wsPriceCache[symbol.toUpperCase()] || null;
}

// ==================== TYPES ====================

export interface PositionEvent {
  type: "ORDER_FILLED" | "ORDER_PARTIAL" | "TP_HIT" | "TP_PARTIAL" | "SL_HIT" | "POSITION_OPENED" | "POSITION_CLOSED" | "LIQUIDATION_WARNING";
  positionId: string;
  signalId?: number;
  symbol: string;
  direction: "LONG" | "SHORT";
  data: {
    entryPrice?: number;
    currentPrice?: number;
    fillPercentage?: number;
    tpIndex?: number;
    tpPrice?: number;
    tpPercentage?: number;
    slPrice?: number;
    pnl?: number;
    pnlPercent?: number;
    leverage?: number;
    amount?: number;
    reason?: string;
  };
  timestamp: Date;
}

export interface SignalState {
  id: string;
  signalId: number;
  symbol: string;
  direction: "LONG" | "SHORT";
  status: "PENDING" | "ACTIVE" | "TP_HIT" | "SL_HIT" | "CLOSED";
  entryPrices: number[];
  entriesFilled: boolean[];
  takeProfits: { price: number; percentage: number; hit: boolean }[];
  stopLoss?: number;
  stopLossHit: boolean;
  positionId?: string;
  lastPrice?: number;
}

// ==================== PRICE FETCHER ====================

const DEMO_PRICES: Record<string, number> = {
  BTCUSDT: 97500,
  ETHUSDT: 3450,
  BNBUSDT: 680,
  SOLUSDT: 195,
  XRPUSDT: 2.35,
  DOGEUSDT: 0.38,
  ADAUSDT: 0.95,
  AVAXUSDT: 42,
  LINKUSDT: 22,
  DOTUSDT: 8.5,
  MATICUSDT: 0.55,
  ATOMUSDT: 9.2,
  LTCUSDT: 105,
  NEARUSDT: 5.8,
  APTUSDT: 10.5,
  ARBUSDT: 1.15,
  OPUSDT: 2.1,
  SUIUSDT: 4.2,
  SEIUSDT: 0.45,
  WLDUSDT: 2.8,
};

// Кэш цен с обновлением
let priceCache: Record<string, { price: number; timestamp: number }> = {};
let priceUpdateInterval: NodeJS.Timeout | null = null;

/**
 * Получить текущую цену символа
 * Приоритет: WebSocket кэш > REST API > Demo цены
 */
export async function getCurrentPrice(symbol: string): Promise<number> {
  const upperSymbol = symbol.toUpperCase();
  
  // 1. Проверяем WebSocket кэш (самый быстрый и точный)
  const wsPrice = getWsPrice(upperSymbol);
  if (wsPrice && wsPrice > 0) {
    return wsPrice;
  }
  
  // 2. Проверяем REST кэш (обновляем каждые 5 секунд)
  const cached = priceCache[upperSymbol];
  if (cached && Date.now() - cached.timestamp < 5000) {
    return cached.price;
  }
  
  // 3. Пытаемся получить реальную цену через REST API
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${upperSymbol}`, {
      signal: AbortSignal.timeout(3000),
    });
    
    if (response.ok) {
      const data = await response.json();
      const price = parseFloat(data.price);
      priceCache[upperSymbol] = { price, timestamp: Date.now() };
      return price;
    }
  } catch {
    // Fallback к демо ценам
  }
  
  // 4. Используем демо цену с небольшим случайным изменением для реалистичности
  const basePrice = DEMO_PRICES[upperSymbol] || 100;
  const variation = basePrice * 0.001 * (Math.random() - 0.5);
  const price = basePrice + variation;
  
  priceCache[upperSymbol] = { price, timestamp: Date.now() };
  return price;
}

/**
 * Получить цены для списка символов
 */
export async function getPrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  
  await Promise.all(
    symbols.map(async (symbol) => {
      prices[symbol] = await getCurrentPrice(symbol);
    })
  );
  
  return prices;
}

// ==================== POSITION MONITOR ====================

/**
 * Проверить одну позицию на события TP/SL
 */
async function checkPosition(
  position: {
    id: string;
    symbol: string;
    direction: string;
    avgEntryPrice: number;
    currentPrice: number | null;
    leverage: number;
    totalAmount: number;
    filledAmount: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
    unrealizedPnl: number | null;
    isDemo: boolean;
  },
  signal?: {
    id: string;
    signalId: number;
    takeProfits: string | null;
    stopLoss: number | null;
    entryPrices: string | null;
  } | null
): Promise<PositionEvent[]> {
  const events: PositionEvent[] = [];
  const currentPrice = await getCurrentPrice(position.symbol);
  
  // Обновляем текущую цену позиции
  await db.position.update({
    where: { id: position.id },
    data: { currentPrice },
  });
  
  const direction = position.direction as "LONG" | "SHORT";
  const isLong = direction === "LONG";
  
  // Проверяем Stop Loss
  if (position.stopLoss) {
    const slHit = isLong 
      ? currentPrice <= position.stopLoss 
      : currentPrice >= position.stopLoss;
    
    if (slHit) {
      events.push({
        type: "SL_HIT",
        positionId: position.id,
        signalId: signal?.signalId,
        symbol: position.symbol,
        direction,
        data: {
          slPrice: position.stopLoss,
          currentPrice,
          pnl: calculatePnL(position.avgEntryPrice, position.stopLoss, position.totalAmount, direction, position.leverage),
        },
        timestamp: new Date(),
      });
      
      return events; // SL имеет приоритет
    }
  }
  
  // Проверяем Take Profit
  if (signal?.takeProfits) {
    const tps = JSON.parse(signal.takeProfits) as { price: number; percentage: number }[];
    
    for (let i = 0; i < tps.length; i++) {
      const tp = tps[i];
      const tpHit = isLong 
        ? currentPrice >= tp.price 
        : currentPrice <= tp.price;
      
      if (tpHit) {
        events.push({
          type: "TP_HIT",
          positionId: position.id,
          signalId: signal.signalId,
          symbol: position.symbol,
          direction,
          data: {
            tpIndex: i + 1,
            tpPrice: tp.price,
            tpPercentage: tp.percentage,
            currentPrice,
            pnl: calculatePnL(position.avgEntryPrice, tp.price, position.totalAmount * (tp.percentage / 100), direction, position.leverage),
          },
          timestamp: new Date(),
        });
      }
    }
  } else if (position.takeProfit) {
    const tpHit = isLong 
      ? currentPrice >= position.takeProfit 
      : currentPrice <= position.takeProfit;
    
    if (tpHit) {
      events.push({
        type: "TP_HIT",
        positionId: position.id,
        symbol: position.symbol,
        direction,
        data: {
          tpIndex: 1,
          tpPrice: position.takeProfit,
          tpPercentage: 100,
          currentPrice,
          pnl: calculatePnL(position.avgEntryPrice, position.takeProfit, position.totalAmount, direction, position.leverage),
        },
        timestamp: new Date(),
      });
    }
  }
  
  // Проверяем предупреждение о ликвидации (95% потерь)
  const liquidationPrice = isLong 
    ? position.avgEntryPrice * (1 - 0.95 / position.leverage)
    : position.avgEntryPrice * (1 + 0.95 / position.leverage);
  
  const nearLiquidation = isLong 
    ? currentPrice <= liquidationPrice * 1.05
    : currentPrice >= liquidationPrice * 0.95;
  
  if (nearLiquidation && position.leverage >= 10) {
    events.push({
      type: "LIQUIDATION_WARNING",
      positionId: position.id,
      signalId: signal?.signalId,
      symbol: position.symbol,
      direction,
      data: {
        currentPrice,
        entryPrice: position.avgEntryPrice,
        leverage: position.leverage,
        pnl: calculatePnL(position.avgEntryPrice, currentPrice, position.totalAmount, direction, position.leverage),
        pnlPercent: calculatePnLPercent(position.avgEntryPrice, currentPrice, direction, position.leverage),
      },
      timestamp: new Date(),
    });
  }
  
  return events;
}

/**
 * Рассчитать PnL
 */
function calculatePnL(
  entryPrice: number,
  exitPrice: number,
  amount: number,
  direction: "LONG" | "SHORT",
  leverage: number
): number {
  const priceChange = direction === "LONG" 
    ? (exitPrice - entryPrice) / entryPrice
    : (entryPrice - exitPrice) / entryPrice;
  
  return amount * entryPrice * priceChange * leverage;
}

/**
 * Рассчитать PnL в процентах
 */
function calculatePnLPercent(
  entryPrice: number,
  currentPrice: number,
  direction: "LONG" | "SHORT",
  leverage: number
): number {
  const priceChange = direction === "LONG" 
    ? (currentPrice - entryPrice) / entryPrice
    : (entryPrice - currentPrice) / entryPrice;
  
  return priceChange * leverage * 100;
}

// ==================== MAIN MONITOR LOOP ====================

let monitorInterval: NodeJS.Timeout | null = null;
let isMonitoring = false;

/**
 * Запустить мониторинг позиций
 */
export function startPositionMonitor(intervalMs: number = 5000): void {
  if (monitorInterval) {
    console.log("[PositionMonitor] Already running");
    return;
  }
  
  console.log("[PositionMonitor] Starting position monitor...");
  
  monitorInterval = setInterval(async () => {
    if (isMonitoring) return;
    isMonitoring = true;
    
    try {
      await monitorAllPositions();
    } catch (error) {
      console.error("[PositionMonitor] Error:", error);
    } finally {
      isMonitoring = false;
    }
  }, intervalMs);
  
  // Запускаем первый раз сразу
  monitorAllPositions().catch(console.error);
}

/**
 * Остановить мониторинг
 */
export function stopPositionMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("[PositionMonitor] Stopped");
  }
}

/**
 * Мониторинг всех открытых позиций
 * Включает: TP/SL проверку, Trailing Stop, предупреждения о ликвидации
 * Также мониторит внешние позиции со статусом ADOPTED
 */
export async function monitorAllPositions(): Promise<void> {
  // Получаем все открытые позиции
  const positions = await db.position.findMany({
    where: { status: "OPEN" },
    include: {
      Signal: true,
    },
  });
  
  if (positions.length === 0) return;
  
  console.log(`[PositionMonitor] Checking ${positions.length} positions...`);
  
  for (const position of positions) {
    try {
      // Получаем текущую цену
      const currentPrice = await getCurrentPrice(position.symbol);
      
      // Обновляем текущую цену позиции
      await db.position.update({
        where: { id: position.id },
        data: { currentPrice },
      });
      
      // ===== TRAILING STOP CHECK =====
      // Проверяем и обновляем трейлинг-стоп если он активен
      if (position.trailingStop || position.trailingActivated) {
        try {
          const trailingResult = await checkTrailingStop(
            {
              id: position.id,
              symbol: position.symbol,
              direction: position.direction,
              avgEntryPrice: position.avgEntryPrice,
              currentPrice,
              stopLoss: position.stopLoss,
              trailingStop: position.trailingStop,
              trailingActivated: position.trailingActivated,
              highestPrice: position.highestPrice,
              lowestPrice: position.lowestPrice,
              leverage: position.leverage,
              totalAmount: position.totalAmount,
              isDemo: position.isDemo,
            },
            position.Signal ? {
              signalId: position.Signal.signalId,
              takeProfits: position.Signal.takeProfits,
            } : null
          );
          
          if (trailingResult.updated) {
            console.log(`[PositionMonitor] Trailing stop updated for ${position.symbol}: SL=${trailingResult.newStopLoss}`);
          }
        } catch (trailingError) {
          console.error(`[PositionMonitor] Trailing stop error for ${position.id}:`, trailingError);
        }
      }
      
      // ===== TP/SL CHECK =====
      const events = await checkPosition(
        {
          id: position.id,
          symbol: position.symbol,
          direction: position.direction,
          avgEntryPrice: position.avgEntryPrice,
          currentPrice,
          leverage: position.leverage,
          totalAmount: position.totalAmount,
          filledAmount: position.filledAmount,
          stopLoss: position.stopLoss,
          takeProfit: position.takeProfit,
          unrealizedPnl: position.unrealizedPnl,
          isDemo: position.isDemo,
        },
        position.Signal ? {
          id: position.Signal.id,
          signalId: position.Signal.signalId,
          takeProfits: position.Signal.takeProfits,
          stopLoss: position.Signal.stopLoss,
          entryPrices: position.Signal.entryPrices,
        } : null
      );
      
      // Обрабатываем события
      for (const event of events) {
        await handlePositionEvent(event, position);
      }
    } catch (error) {
      console.error(`[PositionMonitor] Error checking position ${position.id}:`, error);
    }
  }

  // ===== MONITOR EXTERNAL POSITIONS =====
  // Также мониторим внешние позиции со статусом ADOPTED
  try {
    const externalResult = await monitorExternalPositions();
    if (externalResult.checked > 0 || externalResult.closed > 0) {
      console.log(`[PositionMonitor] External positions: checked=${externalResult.checked}, closed=${externalResult.closed}`);
    }
    if (externalResult.errors.length > 0) {
      console.error(`[PositionMonitor] External position errors:`, externalResult.errors);
    }
  } catch (error) {
    console.error(`[PositionMonitor] Error monitoring external positions:`, error);
  }
}

/**
 * Обработать событие позиции
 */
async function handlePositionEvent(
  event: PositionEvent,
  position: {
    id: string;
    symbol: string;
    direction: string;
    avgEntryPrice: number;
    totalAmount: number;
    leverage: number;
    isDemo: boolean;
    Signal?: {
      id: string;
      signalId: number;
      takeProfits: string | null;
    } | null;
  }
): Promise<void> {
  console.log(`[PositionMonitor] Event: ${event.type} for ${event.symbol}`);
  
  // Определяем режим (Demo/Real)
  const modeLabel = position.isDemo ? "[DEMO] " : "";
  
  switch (event.type) {
    case "SL_HIT": {
      // Закрываем позицию по SL
      await db.position.update({
        where: { id: position.id },
        data: {
          status: "CLOSED",
          unrealizedPnl: event.data.pnl || 0,
        },
      });
      
      // Обновляем сигнал
      if (position.Signal) {
        await db.signal.update({
          where: { id: position.Signal.id },
          data: {
            status: "SL_HIT",
            closedAt: new Date(),
            closeReason: "STOP_LOSS",
          },
        });
      }
      
      // Создаем трейд
      const userIdForTrade = await getDefaultUserId();
      await db.trade.create({
        data: {
          userId: userIdForTrade,
          accountId: (await db.account.findFirst({ where: { accountType: position.isDemo ? "DEMO" : "REAL" } }))?.id || "",
          symbol: position.symbol,
          direction: position.direction,
          status: "CLOSED",
          entryPrice: position.avgEntryPrice,
          exitPrice: event.data.slPrice || 0,
          exitTime: new Date(),
          amount: position.totalAmount,
          leverage: position.leverage,
          pnl: event.data.pnl || 0,
          signalSource: "POSITION_MONITOR",
          isDemo: position.isDemo,
        },
      });
      
      // Отправляем уведомления
      await notifyTelegram({
        type: "SL_HIT",
        title: `${modeLabel}🛑 Stop Loss Reached`,
        message: `#${event.signalId || "?"} ${event.symbol} ${event.direction}\nSL: $${event.data.slPrice?.toLocaleString()}\nPnL: ${formatPnL(event.data.pnl || 0)}`,
        data: { ...event } as Record<string, unknown>,
      });
      
      await notifyUI({
        type: "SL_HIT",
        title: `${modeLabel}Stop Loss Triggered`,
        message: `${event.symbol} ${event.direction} - SL at $${event.data.slPrice?.toLocaleString()}`,
        data: { ...event } as Record<string, unknown>,
      });
      break;
    }
    
    case "TP_HIT": {
      const tpIndex = event.data.tpIndex || 1;
      const tpPercentage = event.data.tpPercentage || 100;
      
      // Если это последний TP или 100%, закрываем позицию
      if (tpPercentage >= 100) {
        await db.position.update({
          where: { id: position.id },
          data: {
            status: "CLOSED",
            unrealizedPnl: event.data.pnl || 0,
          },
        });
        
        if (position.Signal) {
          await db.signal.update({
            where: { id: position.Signal.id },
            data: {
              status: "TP_HIT",
              closedAt: new Date(),
              closeReason: "TAKE_PROFIT",
            },
          });
        }
      } else {
        // Частичное закрытие
        const closeAmount = position.totalAmount * (tpPercentage / 100);
        const remainingAmount = position.totalAmount - closeAmount;
        
        await db.position.update({
          where: { id: position.id },
          data: {
            totalAmount: remainingAmount,
            realizedPnl: { increment: event.data.pnl || 0 },
          },
        });
      }
      
      // Создаем трейд
      const userIdForTradeTP = await getDefaultUserId();
      await db.trade.create({
        data: {
          userId: userIdForTradeTP,
          accountId: (await db.account.findFirst({ where: { accountType: position.isDemo ? "DEMO" : "REAL" } }))?.id || "",
          symbol: position.symbol,
          direction: position.direction,
          status: "CLOSED",
          entryPrice: position.avgEntryPrice,
          exitPrice: event.data.tpPrice || 0,
          exitTime: new Date(),
          amount: position.totalAmount * ((event.data.tpPercentage || 100) / 100),
          leverage: position.leverage,
          pnl: event.data.pnl || 0,
          signalSource: "POSITION_MONITOR",
          isDemo: position.isDemo,
        },
      });
      
      // Отправляем уведомления
      const fullText = tpPercentage >= 100 ? "fully hit" : `partially hit (${tpPercentage}%)`;
      await notifyTelegram({
        type: "TP_HIT",
        title: `${modeLabel}🎯 Take Profit ${fullText}`,
        message: `#${event.signalId || "?"} ${event.symbol} ${event.direction}\nTP${tpIndex}: $${event.data.tpPrice?.toLocaleString()}\nPnL: ${formatPnL(event.data.pnl || 0)}`,
        data: { ...event } as Record<string, unknown>,
      });
      
      await notifyUI({
        type: "TP_HIT",
        title: `${modeLabel}Take Profit ${tpIndex} Hit`,
        message: `${event.symbol} ${event.direction} - TP${tpIndex} at $${event.data.tpPrice?.toLocaleString()}`,
        data: { ...event } as Record<string, unknown>,
      });
      break;
    }
    
    case "LIQUIDATION_WARNING": {
      await notifyTelegram({
        type: "LIQUIDATION_WARNING",
        title: `⚠️ Liquidation Warning`,
        message: `#${event.signalId || "?"} ${event.symbol} ${event.direction}\nPrice: $${event.data.currentPrice?.toLocaleString()}\nPnL: ${event.data.pnlPercent?.toFixed(1)}%\nLeverage: ${position.leverage}x`,
        data: { ...event } as Record<string, unknown>,
      });
      
      await notifyUI({
        type: "LIQUIDATION_WARNING",
        title: `⚠️ Near Liquidation`,
        message: `${event.symbol} ${event.direction} - PnL: ${event.data.pnlPercent?.toFixed(1)}%`,
        data: { ...event } as Record<string, unknown>,
      });
      break;
    }
  }
}

/**
 * Форматировать PnL для отображения
 */
function formatPnL(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}$${pnl.toFixed(2)}`;
}

// ==================== PUBLIC API ====================

/**
 * Проверить конкретную позицию
 */
export async function checkPositionById(positionId: string): Promise<PositionEvent[]> {
  const position = await db.position.findUnique({
    where: { id: positionId },
    include: { Signal: true },
  });
  
  if (!position || position.status !== "OPEN") {
    return [];
  }
  
  return checkPosition(
    {
      id: position.id,
      symbol: position.symbol,
      direction: position.direction,
      avgEntryPrice: position.avgEntryPrice,
      currentPrice: position.currentPrice,
      leverage: position.leverage,
      totalAmount: position.totalAmount,
      filledAmount: position.filledAmount,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      unrealizedPnl: position.unrealizedPnl,
      isDemo: position.isDemo,
    },
    position.Signal ? {
      id: position.Signal.id,
      signalId: position.Signal.signalId,
      takeProfits: position.Signal.takeProfits,
      stopLoss: position.Signal.stopLoss,
      entryPrices: position.Signal.entryPrices,
    } : null
  );
}

/**
 * Получить состояние сигнала
 */
export async function getSignalState(signalId: number): Promise<SignalState | null> {
  const signal = await db.signal.findFirst({
    where: { signalId },
    include: { position: true },
  });
  
  if (!signal) return null;
  
  const entryPrices = signal.entryPrices ? JSON.parse(signal.entryPrices) : [];
  const takeProfits = signal.takeProfits ? JSON.parse(signal.takeProfits) : [];
  
  return {
    id: signal.id,
    signalId: signal.signalId,
    symbol: signal.symbol,
    direction: signal.direction as "LONG" | "SHORT",
    status: signal.status as SignalState["status"],
    entryPrices,
    entriesFilled: entryPrices.map(() => true), // TODO: track actual fills
    takeProfits: takeProfits.map((tp: { price: number; percentage: number }) => ({
      ...tp,
      hit: false, // TODO: track actual hits
    })),
    stopLoss: signal.stopLoss || undefined,
    stopLossHit: false,
    positionId: signal.positionId || undefined,
    lastPrice: await getCurrentPrice(signal.symbol),
  };
}

// ==================== EXTERNAL POSITIONS MONITOR ====================

/**
 * Мониторинг внешних позиций со статусом ADOPTED
 * Проверяет TP/SL и Trailing Stop для принятых позиций
 */
export async function monitorExternalPositions(): Promise<{
  checked: number;
  updated: number;
  closed: number;
  errors: string[];
}> {
  const result = {
    checked: 0,
    updated: 0,
    closed: 0,
    errors: [] as string[],
  };

  try {
    // Получаем все внешние позиции со статусом ADOPTED
    const externalPositions = await db.externalPosition.findMany({
      where: { status: "ADOPTED" },
      include: {
        account: {
          select: {
            exchangeName: true,
          },
        },
      },
    });

    if (externalPositions.length === 0) {
      return result;
    }

    console.log(`[PositionMonitor] Checking ${externalPositions.length} adopted external positions...`);

    for (const extPos of externalPositions) {
      try {
        result.checked++;

        // Получаем текущую цену
        const currentPrice = await getCurrentPrice(extPos.symbol);

        // Обновляем текущую цену и PnL
        const isLong = extPos.direction === "LONG";
        const pnlPercent = isLong
          ? ((currentPrice - extPos.avgEntryPrice) / extPos.avgEntryPrice * extPos.leverage * 100)
          : ((extPos.avgEntryPrice - currentPrice) / extPos.avgEntryPrice * extPos.leverage * 100);
        const unrealizedPnl = extPos.amountUsd * (pnlPercent / 100);

        await db.externalPosition.update({
          where: { id: extPos.id },
          data: {
            currentPrice,
            unrealizedPnl,
            unrealizedPnlPercent: pnlPercent,
            lastSyncAt: new Date(),
          },
        });

        // Если есть связанная внутренняя позиция, обновляем её тоже
        if (extPos.positionId) {
          await db.position.update({
            where: { id: extPos.positionId },
            data: {
              currentPrice,
              unrealizedPnl,
            },
          });
        }

        // Проверяем Stop Loss
        if (extPos.stopLoss) {
          const slHit = isLong
            ? currentPrice <= extPos.stopLoss
            : currentPrice >= extPos.stopLoss;

          if (slHit) {
            await closeExternalPosition(extPos.id, "STOP_LOSS", currentPrice, unrealizedPnl);
            result.closed++;
            continue;
          }
        }

        // Проверяем Take Profit
        if (extPos.takeProfit) {
          const tpHit = isLong
            ? currentPrice >= extPos.takeProfit
            : currentPrice <= extPos.takeProfit;

          if (tpHit) {
            await closeExternalPosition(extPos.id, "TAKE_PROFIT", currentPrice, unrealizedPnl);
            result.closed++;
            continue;
          }
        }

        // Проверяем Trailing Stop
        if (extPos.trailingStop) {
          const trailingConfig = JSON.parse(extPos.trailingStop) as TrailingStopConfig;
          
          if (trailingConfig.activated || trailingConfig.value) {
            // Обновляем highest/lowest price
            let highestPrice = extPos.currentPrice || extPos.avgEntryPrice;
            let lowestPrice = extPos.currentPrice || extPos.avgEntryPrice;

            if (currentPrice > highestPrice) highestPrice = currentPrice;
            if (currentPrice < lowestPrice) lowestPrice = currentPrice;

            // Проверяем трейлинг
            let newStopLoss = extPos.stopLoss;

            if (isLong && trailingConfig.type === "PERCENT") {
              const trailingDistance = highestPrice * (trailingConfig.value / 100);
              const calculatedSL = highestPrice - trailingDistance;
              
              if (!newStopLoss || calculatedSL > newStopLoss) {
                newStopLoss = calculatedSL;
              }
            } else if (!isLong && trailingConfig.type === "PERCENT") {
              const trailingDistance = lowestPrice * (trailingConfig.value / 100);
              const calculatedSL = lowestPrice + trailingDistance;
              
              if (!newStopLoss || calculatedSL < newStopLoss) {
                newStopLoss = calculatedSL;
              }
            }

            // Если SL обновился, сохраняем
            if (newStopLoss !== extPos.stopLoss && newStopLoss) {
              await db.externalPosition.update({
                where: { id: extPos.id },
                data: {
                  stopLoss: newStopLoss,
                  trailingStop: JSON.stringify({
                    ...trailingConfig,
                    highestPrice,
                    lowestPrice,
                    activated: true,
                  }),
                },
              });

              // Обновляем связанную внутреннюю позицию
              if (extPos.positionId) {
                await db.position.update({
                  where: { id: extPos.positionId },
                  data: {
                    stopLoss: newStopLoss,
                    highestPrice,
                    lowestPrice,
                    trailingActivated: true,
                  },
                });
              }

              result.updated++;
              console.log(`[PositionMonitor] Trailing stop updated for external position ${extPos.symbol}: SL=${newStopLoss}`);
            }

            // Проверяем, не сработал ли новый SL
            if (newStopLoss) {
              const slHit = isLong
                ? currentPrice <= newStopLoss
                : currentPrice >= newStopLoss;

              if (slHit) {
                await closeExternalPosition(extPos.id, "TRAILING_STOP", currentPrice, unrealizedPnl);
                result.closed++;
              }
            }
          }
        }

        result.updated++;
      } catch (error) {
        const errorMsg = `Error checking external position ${extPos.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
        console.error(`[PositionMonitor] ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }
  } catch (error) {
    const errorMsg = `Error in external positions monitor: ${error instanceof Error ? error.message : "Unknown error"}`;
    console.error(`[PositionMonitor] ${errorMsg}`);
    result.errors.push(errorMsg);
  }

  return result;
}

/**
 * Закрыть внешнюю позицию
 */
async function closeExternalPosition(
  externalPositionId: string,
  reason: string,
  exitPrice: number,
  pnl: number
): Promise<void> {
  const extPos = await db.externalPosition.findUnique({
    where: { id: externalPositionId },
  });

  if (!extPos) return;

  // Обновляем внешнюю позицию
  await db.externalPosition.update({
    where: { id: externalPositionId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closeReason: reason,
      currentPrice: exitPrice,
      unrealizedPnl: pnl,
    },
  });

  // Если есть связанная внутренняя позиция, закрываем её тоже
  if (extPos.positionId) {
    await db.position.update({
      where: { id: extPos.positionId },
      data: {
        status: "CLOSED",
        unrealizedPnl: pnl,
        currentPrice: exitPrice,
      },
    });
  }

  // Отправляем уведомление
  const directionEmoji = extPos.direction === "LONG" ? "🟢" : "🔴";
  const reasonEmoji = reason === "TAKE_PROFIT" ? "🎯" : reason === "STOP_LOSS" ? "🛑" : "📍";
  const pnlSign = pnl >= 0 ? "+" : "";

  await notifyTelegram({
    type: reason === "TAKE_PROFIT" ? "TP_HIT" : "SL_HIT",
    title: `${reasonEmoji} External Position Closed`,
    message: `${directionEmoji} *${extPos.symbol}* ${extPos.direction}\nReason: ${reason}\nExit: $${exitPrice.toLocaleString()}\nPnL: ${pnlSign}$${pnl.toFixed(2)}`,
    data: {
      externalPositionId,
      reason,
      exitPrice,
      pnl,
    },
  });

  await notifyUI({
    type: "POSITION_CLOSED",
    title: `${reasonEmoji} External Position Closed`,
    message: `${extPos.symbol} ${extPos.direction} - ${reason} at $${exitPrice.toLocaleString()}`,
    data: {
      externalPositionId,
      reason,
      exitPrice,
      pnl,
    },
  });
}

// Экспорт типов
export type { NotificationEvent };
