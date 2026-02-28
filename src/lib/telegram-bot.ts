/**
 * Telegram Bot Extended - Full Command Set
 * 
 * Полный набор команд, синхронизированных с UI чат-ботом:
 * - Справка / help
 * - Шаблоны сигналов
 * - Long / Short шаблоны
 * - Позиции - показать открытые позиции
 * - Close all - закрыть все позиции
 * - Удалить сигналы - очистить сигналы
 * - Очистить базу - полный сброс
 * 
 * Интеграция с Position Monitor и Notification Service
 */

import { db } from "@/lib/db";
import { 
  parseSignal, 
  parseManagementCommand,
  formatSignal,
  type ParsedSignal,
  type SignalManagementCommand 
} from "@/lib/signal-parser";
import {
  subscribeTelegramChat,
  unsubscribeTelegramChat,
  notifyTelegram,
  notifyPositionOpened,
  notifyOrderFilled,
  notifyTakeProfit,
  notifyStopLoss,
  type NotificationEvent,
} from "@/lib/notification-service";
import {
  getCurrentPrice,
  startPositionMonitor,
  getSignalState,
} from "@/lib/position-monitor";
import { getDefaultUserId } from "@/lib/default-user";

// ==================== TYPES ====================

export interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
  chat: {
    id: number;
    type: "private" | "group" | "supergroup" | "channel";
    title?: string;
    username?: string;
  };
  date: number;
  text?: string;
  entities?: TelegramEntity[];
}

export interface TelegramEntity {
  type: "bot_command" | "url" | "mention" | "hashtag" | "cashtag" | string;
  offset: number;
  length: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

export interface SignalTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  example: string;
}

// ==================== CONFIGURATION ====================

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

export function getTelegramApiUrl(): string {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  return `${TELEGRAM_API_BASE}${botToken}`;
}

// ==================== SIGNAL TEMPLATES ====================

const SIGNAL_TEMPLATES: SignalTemplate[] = [
  {
    id: "long",
    name: "LONG Signal",
    description: "Шаблон для лонг сигнала",
    template: "#SYMBOL LONG\nEntry: ENTRY_PRICE\nTP: TAKE_PROFIT\nSL: STOP_LOSS\nLeverage: 10x",
    example: "#BTCUSDT LONG\nEntry: 97000\nTP: 100000\nSL: 94000\nLeverage: 10x",
  },
  {
    id: "short",
    name: "SHORT Signal",
    description: "Шаблон для шорт сигнала",
    template: "#SYMBOL SHORT\nEntry: ENTRY_PRICE\nTP: TAKE_PROFIT\nSL: STOP_LOSS\nLeverage: 10x",
    example: "#ETHUSDT SHORT\nEntry: 3500\nTP: 3200\nSL: 3700\nLeverage: 15x",
  },
  {
    id: "multi-tp",
    name: "Multi TP Signal",
    description: "Сигнал с несколькими тейками",
    template: "#SYMBOL LONG\nEntry: ENTRY_PRICE\nTP1: TP1_PRICE\nTP2: TP2_PRICE\nTP3: TP3_PRICE\nSL: STOP_LOSS\nLeverage: 10x",
    example: "#SOLUSDT LONG\nEntry: 190\nTP1: 200\nTP2: 210\nTP3: 220\nSL: 175\nLeverage: 20x",
  },
  {
    id: "entry-zone",
    name: "Entry Zone Signal",
    description: "Сигнал с зоной входа",
    template: "#SYMBOL LONG\nEntry Zone: MIN - MAX\nTP: TAKE_PROFIT\nSL: STOP_LOSS\nLeverage: 10x",
    example: "#BTCUSDT LONG\nEntry Zone: 96000 - 98000\nTP: 102000\nSL: 93000\nLeverage: 10x cross",
  },
  {
    id: "market",
    name: "Market Entry Signal",
    description: "Вход по рынку",
    template: "#SYMBOL LONG entry market\nTP: TAKE_PROFIT\nSL: STOP_LOSS\nLeverage: 10x",
    example: "#BTCUSDT LONG entry market\nTP: 100000\nSL: 94000\nLeverage: 10x",
  },
  {
    id: "scalp",
    name: "Scalp Signal",
    description: "Краткосрочная торговля",
    template: "#SYMBOL LONG\nEntry: ENTRY_PRICE\nTP: TAKE_PROFIT (quick)\nSL: STOP_LOSS (tight)\nLeverage: 20-50x",
    example: "#BTCUSDT LONG\nEntry: 97500\nTP: 98000\nSL: 97200\nLeverage: 30x",
  },
];

// ==================== API FUNCTIONS ====================

export async function sendMessage(
  chatId: number,
  text: string,
  options: {
    parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
    disable_notification?: boolean;
    reply_to_message_id?: number;
    reply_markup?: object;
  } = {}
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  try {
    const apiUrl = `${getTelegramApiUrl()}/sendMessage`;
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode || "Markdown",
        disable_notification: options.disable_notification || false,
        reply_to_message_id: options.reply_to_message_id,
        reply_markup: options.reply_markup,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error("Telegram API error:", data.description);
      return { success: false, error: data.description };
    }

    return { success: true, messageId: data.result.message_id };
  } catch (error) {
    console.error("Send message error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ==================== SIGNAL ID MANAGEMENT ====================

export async function getNextSignalId(): Promise<number> {
  const counter = await db.signalIdCounter.upsert({
    where: { id: "signal_counter" },
    update: { lastId: { increment: 1 } },
    create: { id: "signal_counter", lastId: 1 },
  });
  return counter.lastId;
}

async function getCurrentSignalId(): Promise<number> {
  const counter = await db.signalIdCounter.findUnique({
    where: { id: "signal_counter" },
  });
  return counter?.lastId || 0;
}

async function resetSignalIdCounter(): Promise<void> {
  await db.signalIdCounter.upsert({
    where: { id: "signal_counter" },
    update: { lastId: 0 },
    create: { id: "signal_counter", lastId: 0 },
  });
}

// ==================== COMMAND HANDLERS ====================

export function handleStartCommand(): string {
  // Запускаем мониторинг позиций
  startPositionMonitor();
  
  return `🤖 *GLYDEO Trading Bot*

Полноценный торговый бот с синхронизацией UI ↔ Telegram

🔹 *Возможности:*
• Парсинг сигналов в формате Cornix
• Поддержка EN + RU ключевых слов
• Автоматическое отслеживание TP/SL
• Уведомления в реальном времени
• Demo/Real режимы торговли

📋 *Команды:*
/start - Это сообщение
/help - Справка по сигналам
/menu - Главное меню
/balance - Баланс аккаунта
/positions - Открытые позиции
/signals - Активные сигналы
/status - Статус бота
/mode - Переключить DEMO/REAL

💡 *Быстрые команды:*
• \`шаблон\` - Шаблоны сигналов
• \`long\` / \`short\` - Быстрые шаблоны
• \`позиции\` - Открытые позиции
• \`close all\` - Закрыть всё
• \`сигналы\` - Активные сигналы
• \`удалить сигналы\` - Очистить сигналы
• \`очистить базу\` - Полный сброс

🎯 *Пример сигнала:*
\`\`\`
#BTCUSDT LONG
Entry: 97000
TP: 100000
SL: 94000
Leverage: 10x cross
\`\`\`

⚡ *Real-time уведомления:*
• Открытие позиции
• Исполнение ордера
• Достижение TP/SL
• Предупреждение о ликвидации`;
}

export function handleHelpCommand(): string {
  return `📚 *Справка по сигналам*

🎮 *Режимы торговли:*
• DEMO - Виртуальная торговля на 10,000 USDT
• REAL - Реальная торговля (требует API ключи)

🔹 *Ключевые слова (EN/RU):*
• Направление: long/лонг, short/шорт
• Вход: entry/вход, market/рынок
• Диапазон: range/диапазон, zone/зона
• TP: tp/тп, take profit, target/цель
• SL: sl, stop/стоп, stop loss
• Плечо: leverage/плечо, lev/лев
• Тип: cross/крос, isolated/изол

🔹 *Форматы пар:*
• BTCUSDT, BTC/USDT, BTC USDT
• BTC → автоматически BTCUSDT

🔹 *Форматы входа:*
• Entry: 97000
• Entry Zone: 96000-98000
• Range: 96000 98000
• Entry market (по рынку)

🔹 *Форматы TP:*
• TP: 100000
• TP1: 99000 TP2: 100000 TP3: 102000
• TP: 99000 100000 102000

🔹 *Управление сигналами:*
• \`BTCUSDT long tp2 102000\` - Обновить TP2
• \`BTCUSDT long sl 95000\` - Обновить SL
• \`BTCUSDT long close\` - Закрыть сигнал
• \`BTCUSDT enter\` - Вход по рынку

⚠️ *Правила:*
• Указывайте направление для управления
• "spot"/"спот" = SPOT, иначе FUTURES
• Порядок ключевых слов любой`;
}

export function handleMenuCommand(): string {
  return `📋 *Главное меню*

📊 *Информация:*
• /balance - Баланс
• /positions - Позиции
• /signals - Сигналы
• /status - Статус

⚙️ *Настройки:*
• /mode - DEMO/REAL
• /config - Конфигурация

📝 *Сигналы:*
• шаблон - Шаблоны
• long - LONG шаблон
• short - SHORT шаблон

🚪 *Управление:*
• close all - Закрыть всё
• позиции - Открытые позиции
• сигналы - Активные сигналы

🧹 *Админ:*
• удалить сигналы - Очистить сигналы
• очистить базу - Полный сброс
• id reset - Сброс ID

🆘 *Помощь:*
• /help - Справка`;
}

export async function handleBalanceCommand(): Promise<string> {
  try {
    const account = await db.account.findFirst({
      where: { accountType: "DEMO" },
    });

    if (!account) {
      return "❌ Аккаунт не найден.";
    }

    const balance = account.virtualBalance 
      ? JSON.parse(account.virtualBalance) 
      : { USDT: 0 };

    const usdt = balance.USDT || 0;
    
    let message = "💰 *Баланс аккаунта*\n\n";
    message += `💵 USDT: \`${usdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\`\n`;
    message += `🎮 Режим: DEMO\n`;
    message += `📊 Позиций: ${await db.position.count({ where: { status: "OPEN" } })}\n`;
    
    return message;
  } catch (error) {
    console.error("Balance command error:", error);
    return "❌ Ошибка получения баланса.";
  }
}

export async function handlePositionsCommand(): Promise<string> {
  try {
    const positions = await db.position.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (positions.length === 0) {
      return "📭 *Нет открытых позиций*";
    }

    let message = `📊 *Открытые позиции (${positions.length})*\n\n`;
    
    for (const pos of positions) {
      const dirEmoji = pos.direction === "LONG" ? "🟢" : "🔴";
      const currentPrice = await getCurrentPrice(pos.symbol);
      const pnlPercent = pos.direction === "LONG"
        ? ((currentPrice - pos.avgEntryPrice) / pos.avgEntryPrice * pos.leverage * 100)
        : ((pos.avgEntryPrice - currentPrice) / pos.avgEntryPrice * pos.leverage * 100);
      const pnlSign = pnlPercent >= 0 ? "+" : "";
      
      message += `${dirEmoji} *${pos.symbol}* ${pos.direction}\n`;
      message += `  Entry: \`$${pos.avgEntryPrice.toLocaleString()}\`\n`;
      message += `  Current: \`$${currentPrice.toLocaleString()}\`\n`;
      message += `  Lev: \`${pos.leverage}x\` | PnL: \`${pnlSign}${pnlPercent.toFixed(2)}%\`\n`;
      
      if (pos.stopLoss) {
        message += `  SL: \`$${pos.stopLoss.toLocaleString()}\`\n`;
      }
      if (pos.takeProfit) {
        message += `  TP: \`$${pos.takeProfit.toLocaleString()}\`\n`;
      }
      message += `\n`;
    }

    return message;
  } catch (error) {
    console.error("Positions command error:", error);
    return "❌ Ошибка получения позиций.";
  }
}

export async function handleSignalsCommand(): Promise<string> {
  try {
    const signals = await db.signal.findMany({
      where: { status: { in: ["PENDING", "ACTIVE"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (signals.length === 0) {
      return "📭 *Нет активных сигналов*";
    }

    let message = `📡 *Активные сигналы (${signals.length})*\n\n`;
    
    for (const sig of signals) {
      const dirEmoji = sig.direction === "LONG" ? "🟢" : "🔴";
      const marketEmoji = sig.marketType === "SPOT" ? "💱" : "⚡";
      const currentPrice = await getCurrentPrice(sig.symbol);
      
      message += `${dirEmoji} *#${sig.signalId} ${sig.symbol}* ${sig.direction}\n`;
      message += `  ${marketEmoji} ${sig.marketType}\n`;
      message += `  Price: \`$${currentPrice.toLocaleString()}\`\n`;
      
      if (sig.stopLoss) {
        message += `  SL: \`$${sig.stopLoss.toLocaleString()}\`\n`;
      }
      
      if (sig.takeProfits) {
        const tps = JSON.parse(sig.takeProfits);
        message += `  TP: ${tps.length} target(s)\n`;
      }
      
      message += `\n`;
    }

    return message;
  } catch (error) {
    console.error("Signals command error:", error);
    return "❌ Ошибка получения сигналов.";
  }
}

export async function handleStatusCommand(): Promise<string> {
  try {
    const openPositions = await db.position.count({ where: { status: "OPEN" } });
    const activeSignals = await db.signal.count({ where: { status: { in: ["PENDING", "ACTIVE"] } } });
    const currentId = await getCurrentSignalId();
    const demoAccount = await db.account.findFirst({ where: { accountType: "DEMO" } });
    const balance = demoAccount?.virtualBalance ? JSON.parse(demoAccount.virtualBalance) : { USDT: 0 };
    const totalTrades = await db.trade.count();
    const totalPnl = await db.trade.aggregate({
      _sum: { pnl: true },
    });

    let message = "🤖 *Статус бота*\n\n";
    message += `📊 *Статистика:*\n`;
    message += `• Открыто позиций: \`${openPositions}\`\n`;
    message += `• Активных сигналов: \`${activeSignals}\`\n`;
    message += `• Всего сделок: \`${totalTrades}\`\n`;
    message += `• Текущий ID: \`#${currentId}\`\n\n`;
    
    message += `💰 *Финансы:*\n`;
    message += `• Demo баланс: \`$${(balance.USDT || 0).toLocaleString()}\`\n`;
    message += `• Общий PnL: \`${(totalPnl._sum.pnl || 0) >= 0 ? '+' : ''}$${(totalPnl._sum.pnl || 0).toFixed(2)}\`\n\n`;
    
    message += `⚙️ *Функции:*\n`;
    message += `• Формат: Cornix Compatible\n`;
    message += `• Языки: EN + RU\n`;
    message += `• Рынки: SPOT / FUTURES\n`;
    message += `• Real-time: ✅ Активен\n`;
    message += `• TP/SL Monitor: ✅ Активен`;

    return message;
  } catch (error) {
    console.error("Status command error:", error);
    return "❌ Ошибка получения статуса.";
  }
}

export async function handleSwitchModeCommand(args: string[]): Promise<string> {
  try {
    let user = await db.user.findFirst();
    
    if (!user) {
      user = await db.user.create({
        data: {
          email: "demo@glydeo.trade",
          name: "Demo User",
          currentMode: "DEMO",
        },
      });
    }
    
    let targetMode: "DEMO" | "REAL";
    
    if (args.length > 0) {
      const arg = args[0].toUpperCase();
      if (arg === "DEMO" || arg === "ДЕМО") {
        targetMode = "DEMO";
      } else if (arg === "REAL" || arg === "РЕАЛ") {
        targetMode = "REAL";
      } else {
        return `❌ Неверный режим: ${args[0]}\n\nИспользование: /mode demo|real`;
      }
    } else {
      targetMode = user.currentMode === "DEMO" ? "REAL" : "DEMO";
    }
    
    await db.user.update({
      where: { id: user.id },
      data: { currentMode: targetMode },
    });
    
    const modeEmoji = targetMode === "DEMO" ? "🎮" : "💰";
    const warningText = targetMode === "REAL" 
      ? "\n\n⚠️ *Внимание:* REAL режим требует настроенных API ключей!"
      : "\n\n💡 Demo режим использует виртуальный баланс.";
    
    return `${modeEmoji} *Режим изменён*\n\nТип аккаунта: *${targetMode}*${warningText}`;
  } catch (error) {
    console.error("Switch mode error:", error);
    return "❌ Ошибка переключения режима.";
  }
}

export function handleTemplatesCommand(): string {
  let message = "📋 *Шаблоны сигналов*\n\n";
  
  for (const template of SIGNAL_TEMPLATES) {
    message += `• \`${template.id}\` - ${template.name}\n`;
    message += `  _${template.description}_\n\n`;
  }
  
  message += "💡 Введите ID шаблона для просмотра примера.";
  return message;
}

export function handleTemplateDetail(templateId: string): string {
  const template = SIGNAL_TEMPLATES.find(t => t.id === templateId);
  
  if (!template) {
    return `❌ Шаблон "${templateId}" не найден.\n\nВведите "шаблон" для списка.`;
  }
  
  let message = `📋 *${template.name}*\n\n`;
  message += `_${template.description}_\n\n`;
  message += `📝 *Шаблон:*\n\`\`\`\n${template.template}\n\`\`\`\n\n`;
  message += `✨ *Пример:*\n\`\`\`\n${template.example}\n\`\`\``;
  
  return message;
}

export async function handleCloseAllCommand(): Promise<string> {
  try {
    const positions = await db.position.findMany({
      where: { status: "OPEN" },
      include: { Signal: true },
    });

    if (positions.length === 0) {
      return "📭 Нет открытых позиций для закрытия.";
    }

    let totalPnl = 0;
    
    for (const pos of positions) {
      const currentPrice = await getCurrentPrice(pos.symbol);
      const pnl = pos.direction === "LONG"
        ? (currentPrice - pos.avgEntryPrice) * pos.totalAmount
        : (pos.avgEntryPrice - currentPrice) * pos.totalAmount;
      
      totalPnl += pnl;
      
      await db.position.update({
        where: { id: pos.id },
        data: { status: "CLOSED", unrealizedPnl: pnl },
      });
      
      if (pos.Signal) {
        await db.signal.update({
          where: { id: pos.Signal.id },
          data: { status: "CLOSED", closedAt: new Date(), closeReason: "MANUAL_CLOSE_ALL" },
        });
      }
    }

    const pnlSign = totalPnl >= 0 ? "+" : "";
    return `✅ *Все позиции закрыты*\n\nЗакрыто: ${positions.length} позиций\nОбщий PnL: ${pnlSign}$${totalPnl.toFixed(2)}`;
  } catch (error) {
    console.error("Close all error:", error);
    return "❌ Ошибка закрытия позиций.";
  }
}

export async function handleDeleteSignalsCommand(): Promise<string> {
  try {
    const result = await db.signal.deleteMany({
      where: { status: { in: ["CLOSED", "TP_HIT", "SL_HIT"] } },
    });

    return `🗑️ *Сигналы удалены*\n\nУдалено: ${result.count} сигналов\nАктивные сигналы сохранены.`;
  } catch (error) {
    console.error("Delete signals error:", error);
    return "❌ Ошибка удаления сигналов.";
  }
}

export async function handleClearBaseCommand(): Promise<string> {
  try {
    const signalsCount = await db.signal.count();
    const positionsCount = await db.position.count();
    
    await db.signal.deleteMany({});
    await db.position.deleteMany({});
    await db.trade.deleteMany({});
    await resetSignalIdCounter();

    return `🧹 *База очищена*\n\n• Сигналов: ${signalsCount}\n• Позиций: ${positionsCount}\n• ID сброшен\n\nГотово к работе!`;
  } catch (error) {
    console.error("Clear base error:", error);
    return "❌ Ошибка очистки базы.";
  }
}

export async function handleResetIdCommand(): Promise<string> {
  try {
    await resetSignalIdCounter();
    const currentId = await getCurrentSignalId();
    return `🔄 *ID сброшен*\n\nСчётчик: ${currentId}\nСледующий сигнал будет #1`;
  } catch (error) {
    console.error("Reset ID error:", error);
    return "❌ Ошибка сброса ID.";
  }
}

// ==================== SIGNAL EXECUTION ====================

export async function executeSignal(
  signal: ParsedSignal,
  chatId: number,
  isDemo: boolean = true
): Promise<{ success: boolean; signalId?: number; error?: string }> {
  try {
    const exchangeType = signal.marketType === "SPOT" ? "spot" : "futures";
    
    let account = await db.account.findFirst({
      where: { accountType: "DEMO", exchangeType },
    });

    if (!account) {
      const userId = await getDefaultUserId();
      account = await db.account.create({
        data: {
          userId,
          accountType: "DEMO",
          exchangeId: "binance",
          exchangeType,
          exchangeName: signal.marketType === "SPOT" ? "Binance Spot" : "Binance Futures",
          virtualBalance: JSON.stringify({ USDT: 10000 }),
          isActive: true,
        },
      });
    }

    const signalId = await getNextSignalId();

    // Получаем текущую цену
    const marketPrice = await getCurrentPrice(signal.symbol);
    const price = signal.isMarketEntry ? marketPrice : (signal.entryPrices[0] || marketPrice);
    
    const balance = account.virtualBalance ? JSON.parse(account.virtualBalance) : { USDT: 10000 };
    const positionSize = Math.min(balance.USDT * 0.1, 100); // 10% или $100
    const leverage = signal.marketType === "SPOT" ? 1 : signal.leverage;
    const quantity = (positionSize * leverage) / price;
    const fee = positionSize * leverage * 0.0004;

    if (balance.USDT < positionSize + fee) {
      return { success: false, error: "Недостаточно средств" };
    }

    balance.USDT -= (positionSize + fee);
    await db.account.update({
      where: { id: account.id },
      data: { virtualBalance: JSON.stringify(balance) },
    });

    const position = await db.position.create({
      data: {
        accountId: account.id,
        symbol: signal.symbol,
        direction: signal.direction,
        status: "OPEN",
        totalAmount: quantity,
        filledAmount: quantity,
        avgEntryPrice: price,
        currentPrice: price,
        leverage,
        stopLoss: signal.stopLoss || null,
        takeProfit: signal.takeProfits[0]?.price || null,
        unrealizedPnl: 0,
        realizedPnl: 0,
        isDemo,
      },
    });

    const trade = await db.trade.create({
      data: {
        userId: account.userId,
        accountId: account.id,
        symbol: signal.symbol,
        direction: signal.direction,
        status: "OPEN",
        entryPrice: price,
        entryTime: new Date(),
        amount: quantity,
        leverage,
        stopLoss: signal.stopLoss || null,
        fee,
        signalSource: "TELEGRAM",
        isDemo,
        positionId: position.id,
      },
    });

    const dbSignal = await db.signal.create({
      data: {
        signalId,
        source: "TELEGRAM",
        sourceMessage: signal.rawText,
        symbol: signal.symbol,
        direction: signal.direction,
        action: signal.action,
        marketType: signal.marketType,
        entryPrices: JSON.stringify(signal.entryPrices),
        takeProfits: JSON.stringify(signal.takeProfits),
        stopLoss: signal.stopLoss,
        leverage,
        status: "ACTIVE",
        positionId: position.id,
        processedAt: new Date(),
      },
    });

    // Отправляем уведомления
    const modeLabel = isDemo ? "[DEMO] " : "";
    const directionEmoji = signal.direction === "LONG" ? "🟢" : "🔴";
    
    await sendMessage(chatId, 
      `✅ *${modeLabel}Сигнал #${signalId} открыт*\n\n` +
      `${directionEmoji} ${signal.symbol} ${signal.direction}\n` +
      `Entry: \`$${price.toLocaleString()}\`\n` +
      `Size: \`${quantity.toFixed(6)}\`\n` +
      `Leverage: \`${leverage}x\`\n` +
      (signal.stopLoss ? `SL: \`$${signal.stopLoss.toLocaleString()}\`\n` : '') +
      (signal.takeProfits.length > 0 ? `TP: \`${signal.takeProfits.length} target(s)\`\n` : '')
    );

    return {
      success: true,
      signalId,
    };
  } catch (error) {
    console.error("Execute signal error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ==================== WEBHOOK VERIFICATION ====================

export function verifyTelegramWebhook(
  body: unknown,
  botToken?: string
): body is TelegramUpdate {
  if (!body || typeof body !== "object") {
    return false;
  }

  const update = body as Record<string, unknown>;
  
  if (typeof update.update_id !== "number") {
    return false;
  }
  
  return true;
}

export function parseSignalFromMessage(text: string): ParsedSignal | null {
  if (!text || text.trim().length === 0) {
    return null;
  }
  return parseSignal(text);
}

export function formatSignalMessage(signal: ParsedSignal): string {
  const directionEmoji = signal.direction === "LONG" ? "🟢📈" : "🔴📉";
  
  let message = `${directionEmoji} *#${signal.symbol}* ${signal.direction}\n`;
  message += `⚡ *Market:* ${signal.marketType}\n\n`;
  
  if (signal.entryZone) {
    message += `📍 *Entry Zone:* \`${signal.entryZone.min.toLocaleString()} - ${signal.entryZone.max.toLocaleString()}\`\n`;
  } else if (signal.entryPrices.length > 0) {
    if (signal.entryPrices.length === 1) {
      message += `📍 *Entry:* \`$${signal.entryPrices[0].toLocaleString()}\`\n`;
    } else {
      message += `📍 *Entries:*\n`;
      signal.entryPrices.forEach((price, i) => {
        message += `  ${i + 1}. \`$${price.toLocaleString()}\`\n`;
      });
    }
  }
  
  if (signal.takeProfits.length > 0) {
    message += `\n🎯 *Take Profits:*\n`;
    signal.takeProfits.forEach((tp, i) => {
      message += `  TP${i + 1}: \`$${tp.price.toLocaleString()}\` (${tp.percentage}%)\n`;
    });
  }
  
  if (signal.stopLoss) {
    message += `\n🛑 *Stop Loss:* \`$${signal.stopLoss.toLocaleString()}\`\n`;
  }
  
  if (signal.marketType === "FUTURES") {
    message += `\n⚡ *Leverage:* ${signal.leverageType} \`${signal.leverage}x\`\n`;
  }
  
  return message;
}

export type { ParsedSignal, SignalManagementCommand };
