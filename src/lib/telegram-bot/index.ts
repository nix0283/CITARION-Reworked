/**
 * Telegram Bot V2
 * 
 * Improved Telegram bot with:
 * - Command handlers (/start, /help, /status, /positions, /balance)
 * - Inline keyboards for interactive actions
 * - User authorization
 * - Rate limiting
 * - Conversation states for multi-step interactions
 * 
 * @see https://core.telegram.org/bots/api
 * @see https://core.telegram.org/bots#inline-keyboards-and-on-the-fly-updating
 */

import { Telegraf, Context } from 'telegraf';
import { message, callbackQuery } from 'telegraf/filters';
import { db } from '@/lib/db';
import { encryptApiKey, decryptApiKey } from '@/lib/encryption';

// Bot configuration
const BOT_CONFIG = {
  rateLimit: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute
  },
  conversationTimeout: 300000, // 5 minutes
};

// Rate limiting tracker
const rateLimitTracker = new Map<number, number[]>();

// Conversation state tracker
interface ConversationState {
  step: string;
  data: Record<string, any>;
  timeout: NodeJS.Timeout;
}

const conversationStates = new Map<number, ConversationState>();

/**
 * Check rate limit for user
 */
function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const windowStart = now - BOT_CONFIG.rateLimit.windowMs;
  
  const requests = rateLimitTracker.get(userId) || [];
  const recentRequests = requests.filter(t => t > windowStart);
  
  if (recentRequests.length >= BOT_CONFIG.rateLimit.maxRequests) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimitTracker.set(userId, recentRequests);
  
  return true;
}

/**
 * Main Telegram Bot Class
 */
export class TelegramBotV2 {
  private bot: Telegraf<Context>;
  private isRunning = false;
  
  constructor(token?: string) {
    const botToken = token || process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      throw new Error('Telegram bot token not configured');
    }
    
    this.bot = new Telegraf(botToken);
    this.setupCommands();
    this.setupInlineKeyboards();
    this.setupConversationHandlers();
    this.setupErrorHandling();
  }
  
  /**
   * Setup command handlers
   */
  private setupCommands() {
    // /start command
    this.bot.command('start', async (ctx) => {
      if (!checkRateLimit(ctx.from.id)) {
        return ctx.reply('⚠️ Слишком много запросов. Подождите минуту.');
      }
      
      const user = await this.findUserByTelegram(ctx.from.id);
      
      if (!user) {
        // User not registered
        await ctx.reply(
          '👋 Добро пожаловать в CITARION!\n\n' +
          'Для начала использования необходимо привязать ваш Telegram аккаунт.\n\n' +
          '1. Откройте веб-интерфейс CITARION\n' +
          '2. Перейдите в Настройки → Telegram\n' +
          '3. Нажмите "Привязать Telegram"\n' +
          '4. Введите код подтверждения\n\n' +
          'Или используйте команду /help для справки.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📖 Помощь', callback_data: 'help' }],
                [{ text: '⚙️ Настройки', callback_data: 'settings' }],
              ],
            },
          }
        );
        return;
      }
      
      // Registered user
      await ctx.reply(
        `👋 Привет, ${user.name || 'трейдер'}!\n\n` +
        'CITARION Trading Bot готов к работе.\n\n' +
        'Доступные команды:\n' +
        '/status - Статус ботов и позиций\n' +
        '/balance - Баланс аккаунта\n' +
        '/positions - Открытые позиции\n' +
        '/trades - История сделок\n' +
        '/settings - Настройки\n' +
        '/help - Помощь',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 Статус', callback_data: 'status' }],
              [{ text: '💰 Баланс', callback_data: 'balance' }],
              [{ text: '📈 Позиции', callback_data: 'positions' }],
            ],
          },
        }
      );
    });
    
    // /help command
    this.bot.command('help', async (ctx) => {
      if (!checkRateLimit(ctx.from.id)) return;
      
      await ctx.reply(
        '📖 **Помощь CITARION**\n\n' +
        '**Команды:**\n' +
        '/start - Запустить бота\n' +
        '/status - Статус ботов\n' +
        '/balance - Баланс\n' +
        '/positions - Позиции\n' +
        '/trades - История сделок\n' +
        '/settings - Настройки\n\n' +
        '**Быстрые действия:**\n' +
        'Используйте кнопки под сообщениями для быстрого доступа.\n\n' +
        '**Поддержка:**\n' +
        '@citarion_support',
        { parse_mode: 'Markdown' }
      );
    });
    
    // /status command
    this.bot.command('status', async (ctx) => {
      if (!checkRateLimit(ctx.from.id)) return;
      
      const user = await this.findUserByTelegram(ctx.from.id);
      if (!user) {
        return ctx.reply('❌ Аккаунт не найден. Используйте /start для регистрации.');
      }
      
      const bots = await this.getActiveBots(user.id);
      const positions = await this.getOpenPositions(user.id);
      
      let statusText = `📊 **Статус**\n\n`;
      
      if (bots.length === 0 && positions.length === 0) {
        statusText += 'Нет активных ботов и открытых позиций.';
      } else {
        if (bots.length > 0) {
          statusText += `**Активные боты:** ${bots.length}\n`;
          bots.forEach(bot => {
            statusText += `├ ${bot.name}: ${bot.status}\n`;
            statusText += `│  PnL: ${bot.pnl?.toFixed(2) || 0} USDT\n`;
          });
        }
        
        if (positions.length > 0) {
          statusText += `\n**Открытые позиции:** ${positions.length}\n`;
          positions.forEach(pos => {
            const pnlIcon = pos.unrealizedPnl >= 0 ? '🟢' : '🔴';
            statusText += `├ ${pnlIcon} ${pos.symbol} ${pos.direction}\n`;
            statusText += `│  PnL: ${pos.unrealizedPnl?.toFixed(2) || 0} USDT\n`;
          });
        }
      }
      
      await ctx.reply(statusText, { parse_mode: 'Markdown' });
    });
    
    // /balance command
    this.bot.command('balance', async (ctx) => {
      if (!checkRateLimit(ctx.from.id)) return;
      
      const user = await this.findUserByTelegram(ctx.from.id);
      if (!user) {
        return ctx.reply('❌ Аккаунт не найден.');
      }
      
      const accounts = await db.account.findMany({
        where: { userId: user.id },
      });
      
      let balanceText = '💰 **Баланс**\n\n';
      
      for (const account of accounts) {
        const virtualBalance = account.virtualBalance 
          ? JSON.parse(account.virtualBalance) 
          : { USDT: 0 };
        
        balanceText += `**${account.exchangeName}**\n`;
        balanceText += `├ USDT: ${virtualBalance.USDT?.toFixed(2) || 0}\n`;
        balanceText += `├ Тип: ${account.accountType}\n`;
        balanceText += `└ Статус: ${account.isActive ? '✅ Активен' : '❌ Неактивен'}\n\n`;
      }
      
      await ctx.reply(balanceText, { parse_mode: 'Markdown' });
    });
    
    // /positions command
    this.bot.command('positions', async (ctx) => {
      if (!checkRateLimit(ctx.from.id)) return;
      
      const user = await this.findUserByTelegram(ctx.from.id);
      if (!user) {
        return ctx.reply('❌ Аккаунт не найден.');
      }
      
      const positions = await this.getOpenPositions(user.id);
      
      if (positions.length === 0) {
        return ctx.reply('Нет открытых позиций.');
      }
      
      for (const pos of positions) {
        const pnlIcon = (pos.unrealizedPnl || 0) >= 0 ? '🟢' : '🔴';
        const pnlPercent = pos.unrealizedPnlPercent || 0;
        
        await ctx.reply(
          `${pnlIcon} **${pos.symbol} ${pos.direction}**\n\n` +
          `Вход: ${pos.avgEntryPrice?.toFixed(2)} USDT\n` +
          `Текущая: ${pos.currentPrice?.toFixed(2)} USDT\n` +
          `PnL: ${pos.unrealizedPnl?.toFixed(2)} USDT (${pnlPercent.toFixed(2)}%)\n` +
          `Плечо: ${pos.leverage}x\n` +
          `SL: ${pos.stopLoss?.toFixed(2) || 'Нет'}\n` +
          `TP: ${pos.takeProfit?.toFixed(2) || 'Нет'}\n\n` +
          `ID: ${pos.id}`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '❌ Закрыть', callback_data: `close_${pos.id}` }],
                [{ text: '✏️ SL/TP', callback_data: `edit_${pos.id}` }],
              ],
            },
          }
        );
      }
    });
    
    // /settings command
    this.bot.command('settings', async (ctx) => {
      if (!checkRateLimit(ctx.from.id)) return;
      
      const user = await this.findUserByTelegram(ctx.from.id);
      if (!user) {
        return ctx.reply('❌ Аккаунт не найден.');
      }
      
      await ctx.reply(
        '⚙️ **Настройки**\n\n' +
        'Выберите действие:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔔 Уведомления', callback_data: 'settings_notifications' }],
              [{ text: '🔑 API Ключи', callback_data: 'settings_api' }],
              [{ text: '📊 Лимиты', callback_data: 'settings_limits' }],
              [{ text: '🔗 Отвязать Telegram', callback_data: 'settings_unlink' }],
            ],
          },
        }
      );
    });
  }
  
  /**
   * Setup inline keyboard handlers
   */
  private setupInlineKeyboards() {
    this.bot.on(callbackQuery('data'), async (ctx) => {
      const data = ctx.callbackQuery.data;
      const userId = ctx.from.id;
      
      if (!checkRateLimit(userId)) {
        return ctx.answerCbQuery('⚠️ Слишком много запросов');
      }
      
      try {
        // Handle different callback actions
        if (data === 'help') {
          await ctx.answerCbQuery();
          await ctx.editMessageText('📖 Справка...\n\nИспользуйте команду /help для получения информации.');
        }
        
        if (data === 'status') {
          await ctx.answerCbQuery();
          await this.handleStatusCallback(ctx);
        }
        
        if (data === 'balance') {
          await ctx.answerCbQuery();
          await this.handleBalanceCallback(ctx);
        }
        
        if (data === 'positions') {
          await ctx.answerCbQuery();
          await this.handlePositionsCallback(ctx);
        }
        
        if (data.startsWith('close_')) {
          const positionId = data.replace('close_', '');
          await ctx.answerCbQuery('Закрываю позицию...');
          await this handleClosePosition(ctx, positionId);
        }
        
        if (data.startsWith('edit_')) {
          const positionId = data.replace('edit_', '');
          await ctx.answerCbQuery();
          await this.handleEditStopLossTakeProfit(ctx, positionId);
        }
      } catch (error) {
        console.error('[Telegram Bot] Callback error:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });
  }
  
  /**
   * Setup conversation handlers for multi-step interactions
   */
  private setupConversationHandlers() {
    this.bot.on(message('text'), async (ctx) => {
      const userId = ctx.from.id;
      const conversation = conversationStates.get(userId);
      
      if (!conversation) {
        return; // No active conversation
      }
      
      try {
        switch (conversation.step) {
          case 'WAITING_FOR_SYMBOL':
            conversation.data.symbol = ctx.message.text.toUpperCase();
            conversation.step = 'WAITING_FOR_AMOUNT';
            await ctx.reply('Введите сумму в USDT:');
            break;
            
          case 'WAITING_FOR_AMOUNT':
            const amount = parseFloat(ctx.message.text);
            if (isNaN(amount) || amount <= 0) {
              await ctx.reply('❌ Неверная сумма. Введите число больше 0:');
              return;
            }
            conversation.data.amount = amount;
            conversation.step = 'WAITING_FOR_LEVERAGE';
            await ctx.reply('Введите плечо (1-125):');
            break;
            
          case 'WAITING_FOR_LEVERAGE':
            const leverage = parseInt(ctx.message.text);
            if (isNaN(leverage) || leverage < 1 || leverage > 125) {
              await ctx.reply('❌ Неверное плечо. Введите число от 1 до 125:');
              return;
            }
            conversation.data.leverage = leverage;
            
            // Execute trade
            await this.executeConversationTrade(ctx, conversation.data);
            
            // Clear conversation
            clearTimeout(conversation.timeout);
            conversationStates.delete(userId);
            break;
        }
      } catch (error) {
        console.error('[Telegram Bot] Conversation error:', error);
        await ctx.reply('❌ Произошла ошибка. Попробуйте снова.');
        clearTimeout(conversation.timeout);
        conversationStates.delete(userId);
      }
    });
  }
  
  /**
   * Setup error handling
   */
  private setupErrorHandling() {
    this.bot.catch((error, ctx) => {
      console.error('[Telegram Bot] Error:', error);
      console.error('Context:', ctx.update);
    });
  }
  
  /**
   * Start the bot
   */
  async start() {
    if (this.isRunning) {
      return;
    }
    
    await this.bot.launch();
    this.isRunning = true;
    
    console.log('[Telegram Bot] Bot started');
    
    // Enable graceful stop
    process.once('SIGINT', () => this.stop());
    process.once('SIGTERM', () => this.stop());
  }
  
  /**
   * Stop the bot
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    await this.bot.stop('Bot stopped');
    this.isRunning = false;
    
    console.log('[Telegram Bot] Bot stopped');
  }
  
  // ==================== Helper Methods ====================
  
  private async findUserByTelegram(telegramId: number) {
    return db.user.findFirst({
      where: { telegramId, telegramVerified: true },
    });
  }
  
  private async getActiveBots(userId: string) {
    const [gridBots, dcaBots, bbBots] = await Promise.all([
      db.gridBot.findMany({ where: { userId, isActive: true } }),
      db.dcaBot.findMany({ where: { userId, isActive: true } }),
      db.bbBot.findMany({ where: { userId, isActive: true } }),
    ]);
    
    return [
      ...gridBots.map(b => ({ name: `Grid: ${b.symbol}`, status: 'RUNNING', pnl: b.totalProfit })),
      ...dcaBots.map(b => ({ name: `DCA: ${b.symbol}`, status: 'RUNNING', pnl: b.realizedPnL })),
      ...bbBots.map(b => ({ name: `BB: ${b.symbol}`, status: 'RUNNING', pnl: b.realizedPnL })),
    ];
  }
  
  private async getOpenPositions(userId: string) {
    const accounts = await db.account.findMany({ where: { userId } });
    const accountIds = accounts.map(a => a.id);
    
    return db.position.findMany({
      where: {
        accountId: { in: accountIds },
        status: 'OPEN',
      },
    });
  }
  
  private async handleStatusCallback(ctx: Context) {
    const user = await this.findUserByTelegram(ctx.from.id);
    if (!user) {
      return ctx.editMessageText('❌ Аккаунт не найден.');
    }
    
    const bots = await this.getActiveBots(user.id);
    const positions = await this.getOpenPositions(user.id);
    
    let text = `📊 Статус\n\n`;
    text += `Боты: ${bots.length}\n`;
    text += `Позиции: ${positions.length}\n`;
    
    await ctx.editMessageText(text);
  }
  
  private async handleBalanceCallback(ctx: Context) {
    const user = await this.findUserByTelegram(ctx.from.id);
    if (!user) {
      return ctx.editMessageText('❌ Аккаунт не найден.');
    }
    
    const account = await db.account.findFirst({ where: { userId: user.id } });
    if (!account) {
      return ctx.editMessageText('❌ Аккаунт не найден.');
    }
    
    const balance = account.virtualBalance 
      ? JSON.parse(account.virtualBalance) 
      : { USDT: 0 };
    
    await ctx.editMessageText(`💰 Баланс: ${balance.USDT?.toFixed(2) || 0} USDT`);
  }
  
  private async handlePositionsCallback(ctx: Context) {
    await ctx.answerCbQuery();
    await ctx.reply('Используйте команду /positions для просмотра позиций.');
  }
  
  private async handleClosePosition(ctx: Context, positionId: string) {
    try {
      // Import trade execution logic
      const { closePosition } = await import('@/lib/position-sync');
      
      await closePosition(positionId);
      
      await ctx.editMessageText('✅ Позиция закрыта');
    } catch (error) {
      console.error('[Telegram Bot] Close position error:', error);
      await ctx.editMessageText('❌ Не удалось закрыть позицию');
    }
  }
  
  private async handleEditStopLossTakeProfit(ctx: Context, positionId: string) {
    await ctx.reply(
      '✏️ Изменение SL/TP\n\n' +
      'Отправьте новые значения в формате:\n' +
      `SL <цена> TP <цена>\n\n` +
      'Пример: SL 48000 TP 52000'
    );
    
    // Start conversation for editing
    conversationStates.set(ctx.from.id, {
      step: 'WAITING_FOR_SL_TP',
      data: { positionId },
      timeout: setTimeout(() => {
        conversationStates.delete(ctx.from.id);
      }, BOT_CONFIG.conversationTimeout),
    });
  }
  
  private async executeConversationTrade(ctx: Context, data: any) {
    try {
      const user = await this.findUserByTelegram(ctx.from.id);
      if (!user) {
        await ctx.reply('❌ Аккаунт не найден.');
        return;
      }
      
      // Import trade execution
      const { executeTradingViewSignal } = await import('@/lib/tradingview-parser');
      
      const result = await executeTradingViewSignal({
        payload: {
          action: 'BUY',
          symbol: data.symbol,
          direction: 'LONG',
          leverage: data.leverage,
        },
        userId: user.id,
      });
      
      if (result.success) {
        await ctx.reply(`✅ Позиция открыта\n\nСимвол: ${data.symbol}\nСумма: ${data.amount} USDT\nПлечо: ${data.leverage}x`);
      } else {
        await ctx.reply(`❌ Ошибка: ${result.error}`);
      }
    } catch (error) {
      console.error('[Telegram Bot] Trade execution error:', error);
      await ctx.reply('❌ Не удалось открыть позицию');
    }
  }
  
  /**
   * Send notification to user
   */
  async sendNotification(telegramId: number, message: string, parseMode?: string) {
    try {
      await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: parseMode,
      });
    } catch (error) {
      console.error('[Telegram Bot] Notification error:', error);
    }
  }
  
  /**
   * Broadcast message to all users
   */
  async broadcast(message: string) {
    const users = await db.user.findMany({
      where: {
        telegramId: { not: null },
        telegramVerified: true,
      },
    });
    
    let successCount = 0;
    let failCount = 0;
    
    for (const user of users) {
      try {
        await this.sendNotification(user.telegramId!, message);
        successCount++;
      } catch (error) {
        failCount++;
      }
    }
    
    return { success: successCount, failed: failCount };
  }
}

// Singleton instance
let botInstance: TelegramBotV2 | null = null;

/**
 * Get or create Telegram bot instance
 */
export function getTelegramBot(): TelegramBotV2 {
  if (!botInstance) {
    botInstance = new TelegramBotV2();
  }
  return botInstance;
}

/**
 * Start Telegram bot
 */
export async function startTelegramBot() {
  const bot = getTelegramBot();
  await bot.start();
  return bot;
}
