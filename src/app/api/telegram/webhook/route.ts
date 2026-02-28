/**
 * Telegram Webhook Handler - Extended Version
 * 
 * Полная интеграция с UI чат-ботом:
 * - Все команды синхронизированы
 * - Real-time уведомления
 * - Мониторинг позиций
 * - Обработка callback queries (inline кнопки)
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  TelegramUpdate,
  TelegramMessage,
  sendMessage,
  parseSignalFromMessage,
  formatSignalMessage,
  handleStartCommand,
  handleHelpCommand,
  handleMenuCommand,
  handleBalanceCommand,
  handlePositionsCommand,
  handleSignalsCommand,
  handleStatusCommand,
  handleSwitchModeCommand,
  handleTemplatesCommand,
  handleTemplateDetail,
  handleCloseAllCommand,
  handleDeleteSignalsCommand,
  handleClearBaseCommand,
  handleResetIdCommand,
  executeSignal,
  verifyTelegramWebhook,
} from "@/lib/telegram-bot";
import { 
  parseManagementCommand,
  isManagementCommand,
  isSignalUpdateCommand,
} from "@/lib/signal-parser";
import { 
  subscribeTelegramChat,
  notifyTelegram,
} from "@/lib/notification-service";
import { startPositionMonitor } from "@/lib/position-monitor";

// ==================== COMMAND PARSER ====================

function parseCommand(text: string): { command: string; args: string[] } | null {
  const match = text.match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s+(.*))?$/);
  
  if (!match) {
    return null;
  }
  
  const command = match[1].toLowerCase();
  const argsString = match[2] || "";
  const args = argsString.split(/\s+/).filter(Boolean);
  
  return { command, args };
}

function isAuthorizedUser(userId: number): boolean {
  const allowedUsers = process.env.TELEGRAM_ALLOWED_USERS;
  
  if (!allowedUsers) {
    return true;
  }
  
  const allowedIds = allowedUsers.split(",").map(id => parseInt(id.trim()));
  return allowedIds.includes(userId);
}

// ==================== MESSAGE HANDLER ====================

async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = message.text?.trim();
  
  logger.info({ chatId, userId, text: text?.substring(0, 100) }, 'Telegram message received');
  
  // Подписываем чат на уведомления
  subscribeTelegramChat(chatId);
  
  if (!userId || !isAuthorizedUser(userId)) {
    logger.warn({ chatId, userId }, 'Telegram: unauthorized user');
    await sendMessage(chatId, "⛔ *Доступ запрещён*");
    return;
  }
  
  if (!text) {
    return;
  }
  
  // Запускаем мониторинг позиций при первом сообщении
  startPositionMonitor();
  
  // Check for slash commands
  const commandInfo = parseCommand(text);
  
  if (commandInfo) {
    await handleCommand(chatId, commandInfo.command, commandInfo.args);
    return;
  }
  
  // Check for text commands (без слэша)
  const lowerText = text.toLowerCase();
  
  // Справка
  if (lowerText === "справка" || lowerText === "помощь" || lowerText === "help") {
    await sendMessage(chatId, handleHelpCommand());
    return;
  }
  
  // Шаблоны
  if (lowerText === "шаблон" || lowerText === "шаблоны" || lowerText === "templates") {
    await sendMessage(chatId, handleTemplatesCommand());
    return;
  }
  
  // Конкретный шаблон (long, short, multi-tp, etc.)
  const templateIds = ["long", "short", "multi-tp", "entry-zone", "market", "scalp"];
  if (templateIds.includes(lowerText)) {
    await sendMessage(chatId, handleTemplateDetail(lowerText));
    return;
  }
  
  // Позиции
  if (lowerText === "позиции" || lowerText === "positions" || lowerText === "позиция") {
    await sendMessage(chatId, await handlePositionsCommand());
    return;
  }
  
  // Сигналы
  if (lowerText === "сигналы" || lowerText === "signals" || lowerText === "сигнал") {
    await sendMessage(chatId, await handleSignalsCommand());
    return;
  }
  
  // Close all
  if (lowerText === "close all" || lowerText === "закрыть всё" || lowerText === "закрыть все") {
    await sendMessage(chatId, await handleCloseAllCommand());
    return;
  }
  
  // Удалить сигналы
  if (lowerText === "удалить сигналы" || lowerText === "delete signals") {
    await sendMessage(chatId, await handleDeleteSignalsCommand());
    return;
  }
  
  // Очистить базу
  if (lowerText === "очистить базу" || lowerText === "clear base" || lowerText === "сброс") {
    await sendMessage(chatId, await handleClearBaseCommand());
    return;
  }
  
  // ID reset
  if (lowerText === "id reset" || lowerText === "сброс id") {
    await sendMessage(chatId, await handleResetIdCommand());
    return;
  }
  
  // Check for management commands (id reset, clear base)
  if (isManagementCommand(text)) {
    const command = parseManagementCommand(text);
    if (command) {
      switch (command.type) {
        case "RESET_ID":
          await sendMessage(chatId, await handleResetIdCommand());
          break;
        case "CLEAR_BASE":
          await sendMessage(chatId, await handleClearBaseCommand());
          break;
      }
      return;
    }
  }
  
  // Check for signal update commands (tp, sl, close, enter)
  if (isSignalUpdateCommand(text)) {
    const command = parseManagementCommand(text);
    if (command) {
      const response = await handleSignalUpdateCommand(command);
      await sendMessage(chatId, response);
      return;
    }
  }
  
  // Try to parse as trading signal
  const signal = parseSignalFromMessage(text);
  
  if (signal) {
    // Показываем распарсенный сигнал
    const signalMessage = formatSignalMessage(signal);
    await sendMessage(chatId, signalMessage);
    
    // Исполняем сигнал
    const result = await executeSignal(signal, chatId, true);
    
    if (!result.success) {
      await sendMessage(chatId, `❌ *Ошибка:* ${result.error}`);
    }
    return;
  }
  
  // Unknown message
  await sendMessage(
    chatId,
    "🤔 *Не распознано*\n\n" +
    "Введите сигнал или команду:\n" +
    "• `шаблон` - Шаблоны сигналов\n" +
    "• `позиции` - Открытые позиции\n" +
    "• `сигналы` - Активные сигналы\n" +
    "• `close all` - Закрыть всё\n" +
    "• `справка` - Справка\n\n" +
    "Или отправьте сигнал в формате:\n" +
    "`#BTCUSDT LONG Entry: 97000 TP: 100000 SL: 94000`"
  );
}

// ==================== COMMAND HANDLER ====================

async function handleCommand(
  chatId: number,
  command: string,
  args: string[]
): Promise<void> {
  switch (command) {
    case "start":
      await sendMessage(chatId, handleStartCommand());
      break;
      
    case "help":
      await sendMessage(chatId, handleHelpCommand());
      break;
      
    case "menu":
      await sendMessage(chatId, handleMenuCommand());
      break;
      
    case "balance":
    case "баланс":
      await sendMessage(chatId, await handleBalanceCommand());
      break;
      
    case "positions":
    case "позиции":
      await sendMessage(chatId, await handlePositionsCommand());
      break;
      
    case "signals":
    case "сигналы":
      await sendMessage(chatId, await handleSignalsCommand());
      break;
      
    case "status":
    case "статус":
      await sendMessage(chatId, await handleStatusCommand());
      break;
      
    case "mode":
    case "switch_mode":
    case "switchmode":
      await sendMessage(chatId, await handleSwitchModeCommand(args));
      break;
      
    case "close":
      if (args[0]?.toLowerCase() === "all") {
        await sendMessage(chatId, await handleCloseAllCommand());
      } else {
        await sendMessage(chatId, "Использование: `/close all` или `close all`");
      }
      break;
      
    case "config":
    case "настройки":
      await sendMessage(
        chatId,
        "⚙️ *Настройки*\n\n" +
        "Управление сигналами:\n" +
        "• `BTCUSDT long tp2 102000`\n" +
        "• `BTCUSDT long sl 95000`\n" +
        "• `BTCUSDT long close`\n" +
        "• `BTCUSDT enter`\n\n" +
        "Админ команды:\n" +
        "• `id reset` - Сброс ID\n" +
        "• `удалить сигналы`\n" +
        "• `очистить базу`"
      );
      break;
      
    case "template":
    case "шаблон":
      if (args[0]) {
        await sendMessage(chatId, handleTemplateDetail(args[0].toLowerCase()));
      } else {
        await sendMessage(chatId, handleTemplatesCommand());
      }
      break;
      
    case "ping":
      await sendMessage(chatId, "🏓 Pong!");
      break;
      
    default:
      await sendMessage(chatId, `❓ Неизвестная команда: /${command}\n\nИспользуйте /help или /menu`);
  }
}

// ==================== SIGNAL UPDATE HANDLER ====================

async function handleSignalUpdateCommand(command: {
  type: string;
  symbol?: string;
  direction?: "LONG" | "SHORT";
  marketType?: "SPOT" | "FUTURES";
  tpIndex?: number;
  tpPrice?: number;
  slPrice?: number;
}): Promise<string> {
  const { db } = await import("@/lib/db");
  
  try {
    const marketType = command.marketType || "FUTURES";
    const marketLabel = marketType === "SPOT" ? "SPOT" : "FUTURES";
    const dirText = command.direction ? ` ${command.direction}` : "";

    switch (command.type) {
      case "MARKET_ENTRY": {
        if (!command.symbol) {
          return "❌ Неверный формат. Используйте: `BTCUSDT enter` или `BTCUSDT long enter`";
        }

        const signal = await db.signal.findFirst({
          where: {
            symbol: command.symbol.toUpperCase(),
            marketType,
            direction: command.direction || undefined,
            status: { in: ["PENDING", "ACTIVE"] },
          },
          orderBy: { createdAt: "desc" },
        });

        if (signal) {
          return `⚠️ Сигнал #${signal.signalId} уже активен для ${command.symbol.toUpperCase()}`;
        }

        // Создаём новый сигнал и позицию
        const { getNextSignalId } = await import("@/lib/telegram-bot").then(m => ({ getNextSignalId: m.getNextSignalId }));
        const signalId = await getNextSignalId();
        const { getCurrentPrice } = await import("@/lib/position-monitor");
        const marketPrice = await getCurrentPrice(command.symbol.toUpperCase());
        
        // Простой вход по рынку
        return `✅ *Market Entry*\n\n#${signalId} ${command.symbol.toUpperCase()}${dirText}\nPrice: $${marketPrice.toLocaleString()}\n\nИспользуйте команду close all или отправьте сигнал для открытия позиции.`;
      }

      case "UPDATE_TP": {
        if (!command.symbol || !command.tpIndex || !command.tpPrice) {
          return "❌ Формат: `BTCUSDT long tp2 102000`";
        }

        const signal = await db.signal.findFirst({
          where: {
            symbol: command.symbol.toUpperCase(),
            marketType,
            direction: command.direction || undefined,
            status: { in: ["PENDING", "ACTIVE"] },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!signal) {
          return `❌ Нет активного${dirText} ${marketLabel} сигнала для ${command.symbol.toUpperCase()}`;
        }

        const takeProfits = signal.takeProfits ? JSON.parse(signal.takeProfits) : [];
        takeProfits[command.tpIndex - 1] = { price: command.tpPrice, percentage: 100 / Math.max(command.tpIndex, takeProfits.length) };

        await db.signal.update({
          where: { id: signal.id },
          data: { takeProfits: JSON.stringify(takeProfits) },
        });

        return `✅ *Сигнал #${signal.signalId} обновлён*\n\n${command.symbol.toUpperCase()}${dirText} TP${command.tpIndex}: $${command.tpPrice.toLocaleString()}`;
      }

      case "UPDATE_SL": {
        if (!command.symbol || !command.slPrice) {
          return "❌ Формат: `BTCUSDT long sl 95000`";
        }

        const signal = await db.signal.findFirst({
          where: {
            symbol: command.symbol.toUpperCase(),
            marketType,
            direction: command.direction || undefined,
            status: { in: ["PENDING", "ACTIVE"] },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!signal) {
          return `❌ Нет активного${dirText} ${marketLabel} сигнала для ${command.symbol.toUpperCase()}`;
        }

        await db.signal.update({
          where: { id: signal.id },
          data: { stopLoss: command.slPrice },
        });

        if (signal.positionId) {
          await db.position.update({
            where: { id: signal.positionId },
            data: { stopLoss: command.slPrice },
          });
        }

        return `✅ *Сигнал #${signal.signalId} обновлён*\n\n${command.symbol.toUpperCase()}${dirText} Stop Loss: $${command.slPrice.toLocaleString()}`;
      }

      case "CLOSE_SIGNAL": {
        if (!command.symbol) {
          return "❌ Формат: `BTCUSDT long close`";
        }

        const signal = await db.signal.findFirst({
          where: {
            symbol: command.symbol.toUpperCase(),
            marketType,
            direction: command.direction || undefined,
            status: { in: ["PENDING", "ACTIVE"] },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!signal) {
          return `❌ Нет активного${dirText} ${marketLabel} сигнала для ${command.symbol.toUpperCase()}`;
        }

        await db.signal.update({
          where: { id: signal.id },
          data: {
            status: "CLOSED",
            closedAt: new Date(),
            closeReason: "MANUAL",
          },
        });

        if (signal.positionId) {
          await db.position.update({
            where: { id: signal.positionId },
            data: { status: "CLOSED" },
          });
        }

        return `✅ *Сигнал #${signal.signalId} закрыт*\n\n${command.symbol.toUpperCase()}${dirText} ${marketLabel}`;
      }

      default:
        return "❌ Неизвестная команда";
    }
  } catch (error) {
    console.error("Signal update error:", error);
    return "❌ Ошибка выполнения команды.";
  }
}

// ==================== CALLBACK QUERY HANDLER ====================

interface TelegramCallbackQuery {
  id: string;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  message?: {
    message_id: number;
    chat: {
      id: number;
      type: string;
    };
    text?: string;
  };
  data?: string;
}

async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery): Promise<void> {
  const { db } = await import("@/lib/db");
  const { 
    confirmEscort, 
    declineEscort,
    closeExternalPosition 
  } = await import("@/lib/position-sync-service");
  
  const chatId = callbackQuery.message?.chat?.id;
  const data = callbackQuery.data;

  if (!chatId || !data) {
    return;
  }

  // Подписываем чат на уведомления
  subscribeTelegramChat(chatId);

  // Отправляем подтверждение callback
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackQuery.id,
          text: "Обрабатываем...",
          show_alert: false,
        }),
      });
    }
  } catch (error) {
    console.error("Answer callback query error:", error);
  }

  // Парсим callback data
  // New format: escort_yes_POSITIONID, escort_no_POSITIONID, escort_config_POSITIONID
  if (data.startsWith("escort_yes_")) {
    const positionId = data.replace("escort_yes_", "");
    
    try {
      const result = await confirmEscort(positionId);
      
      if (!result.success) {
        await sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        return;
      }

      // Получаем информацию о позиции
      const position = await db.position.findUnique({
        where: { id: positionId },
        include: { account: true },
      });

      if (!position) {
        await sendMessage(chatId, "❌ Позиция не найдена.");
        return;
      }

      // Обновляем сообщение
      const directionEmoji = position.direction === "LONG" ? "🟢" : "🔴";
      await editMessageText(
        chatId,
        callbackQuery.message!.message_id,
        `✅ *Позиция принята на сопровождение*\n\n` +
        `${directionEmoji} *${position.symbol}* ${position.direction}\n` +
        `Size: ${position.totalAmount.toFixed(6)}\n` +
        `Entry: $${position.avgEntryPrice.toLocaleString()}\n` +
        `Leverage: ${position.leverage}x\n\n` +
        `Теперь отслеживаем TP/SL/Trailing для этой позиции.\n\n` +
        `_Используйте команды для настройки:_\n` +
        `• \`${position.symbol.toLowerCase()} sl <price>\`\n` +
        `• \`${position.symbol.toLowerCase()} tp <price>\`\n` +
        `• \`${position.symbol.toLowerCase()} trailing <percent>\``
      );
    } catch (error) {
      console.error("Escort confirm error:", error);
      await sendMessage(chatId, "❌ Ошибка принятия позиции.");
    }
  } else if (data.startsWith("escort_no_")) {
    const positionId = data.replace("escort_no_", "");
    
    try {
      const position = await db.position.findUnique({
        where: { id: positionId },
      });

      if (!position) {
        await sendMessage(chatId, "❌ Позиция не найдена.");
        return;
      }

      const result = await declineEscort(positionId);

      if (!result.success) {
        await sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        return;
      }

      // Обновляем сообщение
      const directionEmoji = position.direction === "LONG" ? "🟢" : "🔴";
      await editMessageText(
        chatId,
        callbackQuery.message!.message_id,
        `🚫 *Позиция игнорирована*\n\n` +
        `${directionEmoji} *${position.symbol}* ${position.direction}\n` +
        `Эта позиция не будет отслеживаться.`
      );
    } catch (error) {
      console.error("Escort decline error:", error);
      await sendMessage(chatId, "❌ Ошибка отклонения позиции.");
    }
  } else if (data.startsWith("escort_config_")) {
    const positionId = data.replace("escort_config_", "");
    
    try {
      const position = await db.position.findUnique({
        where: { id: positionId },
      });

      if (!position) {
        await sendMessage(chatId, "❌ Позиция не найдена.");
        return;
      }

      // Подтверждаем сопровождение
      const result = await confirmEscort(positionId);
      
      if (!result.success) {
        await sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        return;
      }

      // Отправляем инструкции по настройке
      await sendMessage(
        chatId,
        `⚙️ *Настройка сопровождения*\n\n` +
        `${position.symbol} ${position.direction}\n\n` +
        `*Команды для настройки:*\n\n` +
        `🛑 *Stop Loss:*\n` +
        `\`${position.symbol.toLowerCase()} sl <price>\`\n` +
        `_Пример: ${position.symbol.toLowerCase()} sl 95000_\n\n` +
        `🎯 *Take Profit:*\n` +
        `\`${position.symbol.toLowerCase()} tp <price>\`\n` +
        `_Пример: ${position.symbol.toLowerCase()} tp 105000_\n\n` +
        `📍 *Trailing Stop:*\n` +
        `\`${position.symbol.toLowerCase()} trailing <percent>%\`\n` +
        `_Пример: ${position.symbol.toLowerCase()} trailing 2%_\n\n` +
        `📊 *Close Position:*\n` +
        `\`${position.symbol.toLowerCase()} close\``
      );
    } catch (error) {
      console.error("Escort config error:", error);
      await sendMessage(chatId, "❌ Ошибка настройки позиции.");
    }
  } else if (data.startsWith("adopt_")) {
    // Legacy support for old format
    const positionId = data.replace("adopt_", "");
    
    try {
      const result = await confirmEscort(positionId);
      
      if (!result.success) {
        await sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        return;
      }

      const position = await db.position.findUnique({
        where: { id: positionId },
      });

      if (!position) {
        await sendMessage(chatId, "❌ Позиция не найдена.");
        return;
      }

      const directionEmoji = position.direction === "LONG" ? "🟢" : "🔴";
      await editMessageText(
        chatId,
        callbackQuery.message!.message_id,
        `✅ *Позиция принята на сопровождение*\n\n` +
        `${directionEmoji} *${position.symbol}* ${position.direction}\n` +
        `Amount: ${position.totalAmount.toFixed(6)}\n` +
        `Entry: $${position.avgEntryPrice.toLocaleString()}\n\n` +
        `Теперь отслеживаем TP/SL/Trailing для этой позиции.`
      );
    } catch (error) {
      console.error("Adopt position error:", error);
      await sendMessage(chatId, "❌ Ошибка принятия позиции.");
    }
  } else if (data.startsWith("ignore_")) {
    // Legacy support for old format
    const positionId = data.replace("ignore_", "");
    
    try {
      const position = await db.position.findUnique({
        where: { id: positionId },
      });

      if (!position) {
        await sendMessage(chatId, "❌ Позиция не найдена.");
        return;
      }

      const result = await declineEscort(positionId);

      if (!result.success) {
        await sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        return;
      }

      const directionEmoji = position.direction === "LONG" ? "🟢" : "🔴";
      await editMessageText(
        chatId,
        callbackQuery.message!.message_id,
        `🚫 *Позиция игнорирована*\n\n` +
        `${directionEmoji} *${position.symbol}* ${position.direction}\n` +
        `Эта позиция не будет отслеживаться.`
      );
    } catch (error) {
      console.error("Ignore position error:", error);
      await sendMessage(chatId, "❌ Ошибка игнорирования позиции.");
    }
  }
}

// Helper function to edit message text
async function editMessageText(
  chatId: number,
  messageId: number,
  text: string
): Promise<void> {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "Markdown",
      }),
    });
  } catch (error) {
    console.error("Edit message error:", error);
  }
}

// ==================== WEBHOOK ENDPOINT ====================

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      logger.error('Telegram webhook: BOT_TOKEN not configured');
      return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
    }
    
    const body = await request.json();
    
    if (!verifyTelegramWebhook(body, botToken)) {
      logger.warn({ ip: request.headers.get('x-forwarded-for') }, 'Telegram webhook: verification failed');
      return NextResponse.json({ error: "Invalid webhook request" }, { status: 400 });
    }
    
    logger.debug({ updateType: body.update_type }, 'Telegram webhook received');
    
    const update = body as TelegramUpdate & { callback_query?: TelegramCallbackQuery };
    
    // Handle callback queries (inline button clicks)
    if (update.callback_query) {
      handleCallbackQuery(update.callback_query).catch(error => {
        logger.error(error, 'Callback query handler error');
      });
      return NextResponse.json({ ok: true });
    }
    
    if (update.message) {
      handleMessage(update.message).catch(error => {
        logger.error(error, 'Message handler error');
      });
      return NextResponse.json({ ok: true });
    }
    
    if (update.edited_message) {
      handleMessage(update.edited_message).catch(error => {
        logger.error(error, 'Edited message handler error');
      });
      return NextResponse.json({ ok: true });
    }
    
    if (update.channel_post) {
      const post = update.channel_post;
      const text = post.text?.trim();
      
      if (text) {
        const signal = parseSignalFromMessage(text);
        if (signal) {
          const result = await executeSignal(signal, post.chat.id, true);
          if (result.success) {
            logger.info({ signalId: result.signalId, symbol: signal.symbol }, 'Signal from channel executed');
          }
        }
      }
      return NextResponse.json({ ok: true });
    }
    
    return NextResponse.json({ ok: true });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(error, 'Telegram webhook error', { duration });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    return NextResponse.json({
      status: "error",
      message: "TELEGRAM_BOT_TOKEN not configured",
    });
  }
  
  try {
    const apiUrl = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    return NextResponse.json({
      status: "ok",
      webhook: data.ok ? {
        url: data.result.url,
        pendingUpdateCount: data.result.pending_update_count,
      } : null,
      features: {
        cornixFormat: true,
        russianKeywords: true,
        arbitraryOrder: true,
        directionManagement: true,
        marketEntry: true,
        positionMonitor: true,
        realTimeNotifications: true,
        uiSync: true,
      },
      commands: [
        "start", "help", "menu", "balance", "positions", 
        "signals", "status", "mode", "close", "config", 
        "template", "ping"
      ],
      textCommands: [
        "шаблон", "long", "short", "позиции", "сигналы",
        "close all", "удалить сигналы", "очистить базу", "справка"
      ],
    });
  } catch {
    return NextResponse.json({
      status: "ok",
      webhook: null,
    });
  }
}
