/**
 * Enhanced Telegram Signal Parser
 * 
 * Advanced signal parsing from Telegram messages:
 * - Multiple format support (Cornix, TradingView, Custom)
 * - Natural language processing
 * - Entity extraction (symbol, direction, entry, TP, SL)
 * - Confidence scoring
 * - Spam detection
 * 
 * @module lib/signal-trading/telegram-parser
 */

import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface ParsedSignal {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  action: 'BUY' | 'SELL' | 'CLOSE';
  entryPrices: number[];
  takeProfits: Array<{ price: number; percentage: number }>;
  stopLoss?: number;
  leverage?: number;
  sourceChannel: string;
  sourceReliability: number;
  confidence: number;
  rawText: string;
  parsedFields: string[];
  warnings: string[];
  timestamp: Date;
}

export interface ParserConfig {
  defaultLeverage: number;
  minConfidence: number;
  spamThreshold: number;
  supportedSymbols: string[];
}

// ==================== PARSER PATTERNS ====================

const PATTERNS = {
  // Symbol patterns
  symbol: /#?([A-Z]{3,6})(?:\/|:|_)?(USDT|USD|BUSD|USDC)?/gi,
  
  // Direction patterns
  direction: {
    long: /\b(LONG|BUY|GO|UP|BULL)\b/i,
    short: /\b(SHORT|SELL|DOWN|BEAR)\b/i,
  },
  
  // Entry patterns
  entry: /(?:ENTRY|ENTRIES|ENTER|BUY|AT)[:\s]*([\d.,\s]+)/i,
  entryMulti: /(?:ZONES?|ENTRIES?)[:\s]*([\d.,\s\-]+)/i,
  
  // Take profit patterns
  tp: /(?:TP|TARGET|TAKE\s*PROFIT)[:\s]*([\d.,\s%]+)/i,
  tpMulti: /(?:TP1|TP2|TP3|TARGETS?)[:\s]*([\d.,\s%]+)/i,
  
  // Stop loss patterns
  sl: /(?:SL|STOP\s*LOSS|STOP)[:\s]*([\d.,]+)/i,
  
  // Leverage patterns
  leverage: /(?:LEVERAGE|LEV|X)[:\s]*(\d{1,3})x?/i,
  
  // Price patterns
  price: /\$?(\d{1,3}(?:[.,]\d{3})*(?:\.\d+)?)/g,
};

// ==================== TELEGRAM PARSER CLASS ====================

export class TelegramSignalParser {
  private config: ParserConfig;
  private spamPatterns: RegExp[];

  constructor(config?: Partial<ParserConfig>) {
    this.config = {
      defaultLeverage: 10,
      minConfidence: 0.5,
      spamThreshold: 0.7,
      supportedSymbols: [
        'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'MATIC',
        'LINK', 'UNI', 'LTC', 'ATOM', 'ETC', 'FIL', 'NEAR', 'ALGO', 'VET', 'ICP',
      ],
      ...config,
    };

    this.spamPatterns = [
      /1000%|10000%|100000%/i, // Unrealistic gains
      /GUARANTEED|NO\s*RISK/i, // Risk-free claims
      /SEND\s*(BTC|ETH|USDT)/i, // Send money requests
      /PRIVATE\s*KEY|SEED\s*PHRASE/i, // Security scams
      /CLICK\s*HERE|JOIN\s*NOW/i, // Spam calls
    ];
  }

  /**
   * Parse Telegram message
   */
  parse(message: string, sourceChannel: string): ParsedSignal | null {
    try {
      // Check for spam
      const spamScore = this.calculateSpamScore(message);
      if (spamScore > this.config.spamThreshold) {
        logger.warn({ sourceChannel, spamScore }, 'Spam signal detected');
        return null;
      }

      // Extract symbol
      const symbol = this.extractSymbol(message);
      if (!symbol) {
        logger.warn({ sourceChannel }, 'No symbol found');
        return null;
      }

      // Extract direction
      const direction = this.extractDirection(message);
      if (!direction) {
        logger.warn({ sourceChannel, symbol }, 'No direction found');
        return null;
      }

      // Extract entry prices
      const entryPrices = this.extractEntryPrices(message);
      
      // Extract take profits
      const takeProfits = this.extractTakeProfits(message, direction);
      
      // Extract stop loss
      const stopLoss = this.extractStopLoss(message, direction);
      
      // Extract leverage
      const leverage = this.extractLeverage(message);

      // Calculate confidence
      const parsedFields = this.getParsedFields({
        symbol: !!symbol,
        direction: !!direction,
        entry: entryPrices.length > 0,
        tp: takeProfits.length > 0,
        sl: !!stopLoss,
        leverage: !!leverage,
      });

      const confidence = this.calculateConfidence(parsedFields, spamScore);

      // Create signal
      const signal: ParsedSignal = {
        id: `sig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        symbol,
        direction,
        action: direction === 'LONG' ? 'BUY' : 'SELL',
        entryPrices,
        takeProfits,
        stopLoss,
        leverage: leverage || this.config.defaultLeverage,
        sourceChannel,
        sourceReliability: 0.5, // Will be updated by ML filter
        confidence,
        rawText: message,
        parsedFields,
        warnings: this.getWarnings({ entryPrices, takeProfits, stopLoss, direction }),
        timestamp: new Date(),
      };

      logger.info({
        id: signal.id,
        symbol: signal.symbol,
        direction: signal.direction,
        confidence: signal.confidence,
      }, 'Signal parsed');

      return signal;
    } catch (error) {
      logger.error({ error, message: message.substring(0, 100) }, 'Parse error');
      return null;
    }
  }

  /**
   * Extract symbol from message
   */
  private extractSymbol(message: string): string | null {
    const matches = message.match(PATTERNS.symbol);
    if (!matches) return null;

    for (const match of matches) {
      const cleanMatch = match.replace(/[#:/_]/g, '');
      const baseSymbol = cleanMatch.replace(/(USDT|USD|BUSD|USDC)$/i, '');
      
      if (this.config.supportedSymbols.includes(baseSymbol.toUpperCase())) {
        return baseSymbol.toUpperCase() + 'USDT';
      }
    }

    // Fallback: return first match
    const firstMatch = matches[0].replace(/[#:/_]/g, '');
    return firstMatch.replace(/(USDT|USD|BUSD|USDC)$/i, '') + 'USDT';
  }

  /**
   * Extract direction from message
   */
  private extractDirection(message: string): 'LONG' | 'SHORT' | null {
    if (PATTERNS.direction.long.test(message)) {
      return 'LONG';
    }
    if (PATTERNS.direction.short.test(message)) {
      return 'SHORT';
    }
    return null;
  }

  /**
   * Extract entry prices from message
   */
  private extractEntryPrices(message: string): number[] {
    const prices: number[] = [];

    // Try entry pattern first
    const entryMatch = message.match(PATTERNS.entry) || message.match(PATTERNS.entryMulti);
    if (entryMatch) {
      const priceMatches = entryMatch[1].match(PATTERNS.price);
      if (priceMatches) {
        priceMatches.forEach(p => {
          const price = parseFloat(p.replace(/[$,]/g, ''));
          if (price > 0) prices.push(price);
        });
      }
    }

    // Fallback: look for prices near "entry" keyword
    if (prices.length === 0) {
      const lines = message.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().includes('entry')) {
          const priceMatches = line.match(PATTERNS.price);
          if (priceMatches) {
            priceMatches.forEach(p => {
              const price = parseFloat(p.replace(/[$,]/g, ''));
              if (price > 0) prices.push(price);
            });
          }
        }
      }
    }

    // Current price as last resort
    if (prices.length === 0) {
      const allPrices = message.match(PATTERNS.price);
      if (allPrices && allPrices.length > 0) {
        prices.push(parseFloat(allPrices[0].replace(/[$,]/g, '')));
      }
    }

    return prices;
  }

  /**
   * Extract take profits from message
   */
  private extractTakeProfits(message: string, direction: 'LONG' | 'SHORT'): Array<{ price: number; percentage: number }> {
    const takeProfits: Array<{ price: number; percentage: number }> = [];

    // Try TP pattern
    const tpMatch = message.match(PATTERNS.tp) || message.match(PATTERNS.tpMulti);
    if (tpMatch) {
      const parts = tpMatch[1].split(/[\s,]+/);
      let cumulativePercent = 0;
      
      parts.forEach((part: string, index: number) => {
        const percent = parseFloat(part.replace('%', ''));
        if (!isNaN(percent) && part.includes('%')) {
          cumulativePercent += percent;
        } else {
          const price = parseFloat(part.replace(/[$,]/g, ''));
          if (price > 0) {
            takeProfits.push({
              price,
              percentage: cumulativePercent > 0 ? cumulativePercent : 100 / (parts.filter(p => !p.includes('%')).length),
            });
          }
        }
      });
    }

    // Fallback: look for TP keywords
    if (takeProfits.length === 0) {
      const lines = message.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().includes('tp') || line.toLowerCase().includes('target')) {
          const priceMatches = line.match(PATTERNS.price);
          if (priceMatches) {
            priceMatches.forEach(p => {
              const price = parseFloat(p.replace(/[$,]/g, ''));
              if (price > 0) {
                takeProfits.push({ price, percentage: 0 });
              }
            });
          }
        }
      }
    }

    // Calculate percentages if not set
    if (takeProfits.length > 0) {
      const totalPercent = takeProfits.reduce((sum, tp) => sum + tp.percentage, 0);
      if (totalPercent === 0) {
        const equalPercent = 100 / takeProfits.length;
        takeProfits.forEach(tp => tp.percentage = equalPercent);
      }
    }

    return takeProfits;
  }

  /**
   * Extract stop loss from message
   */
  private extractStopLoss(message: string, direction: 'LONG' | 'SHORT'): number | undefined {
    const slMatch = message.match(PATTERNS.sl);
    if (slMatch) {
      const priceMatches = slMatch[1].match(PATTERNS.price);
      if (priceMatches) {
        return parseFloat(priceMatches[0].replace(/[$,]/g, ''));
      }
    }

    // Fallback: look for SL keyword
    const lines = message.split('\n');
    for (const line of lines) {
      if (line.toLowerCase().includes('sl') || line.toLowerCase().includes('stop')) {
        const priceMatches = line.match(PATTERNS.price);
        if (priceMatches) {
          return parseFloat(priceMatches[0].replace(/[$,]/g, ''));
        }
      }
    }

    return undefined;
  }

  /**
   * Extract leverage from message
   */
  private extractLeverage(message: string): number | undefined {
    const levMatch = message.match(PATTERNS.leverage);
    if (levMatch) {
      const leverage = parseInt(levMatch[1]);
      if (leverage > 0 && leverage <= 125) {
        return leverage;
      }
    }
    return undefined;
  }

  /**
   * Calculate spam score
   */
  private calculateSpamScore(message: string): number {
    let score = 0;

    for (const pattern of this.spamPatterns) {
      if (pattern.test(message)) {
        score += 0.2;
      }
    }

    // Excessive emojis
    const emojiCount = (message.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu) || []).length;
    if (emojiCount > 10) score += 0.2;

    // All caps
    const capsRatio = (message.match(/[A-Z]/g) || []).length / message.length;
    if (capsRatio > 0.8) score += 0.2;

    // Excessive punctuation
    const exclamationCount = (message.match(/!/g) || []).length;
    if (exclamationCount > 5) score += 0.1;

    return Math.min(1, score);
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(parsedFields: string[], spamScore: number): number {
    const fieldScore = parsedFields.length / 6; // 6 possible fields
    const spamPenalty = 1 - spamScore;
    
    // Required fields: symbol, direction, entry
    const hasRequired = parsedFields.includes('symbol') && 
                        parsedFields.includes('direction') && 
                        parsedFields.includes('entry');

    const baseConfidence = hasRequired ? 0.5 : 0.2;
    const confidence = baseConfidence + (fieldScore * 0.3) + (spamPenalty * 0.2);

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get parsed fields list
   */
  private getParsedFields(fields: {
    symbol: boolean;
    direction: boolean;
    entry: boolean;
    tp: boolean;
    sl: boolean;
    leverage: boolean;
  }): string[] {
    const parsedFields: string[] = [];
    if (fields.symbol) parsedFields.push('symbol');
    if (fields.direction) parsedFields.push('direction');
    if (fields.entry) parsedFields.push('entry');
    if (fields.tp) parsedFields.push('tp');
    if (fields.sl) parsedFields.push('sl');
    if (fields.leverage) parsedFields.push('leverage');
    return parsedFields;
  }

  /**
   * Get warnings for signal
   */
  private getWarnings(data: {
    entryPrices: number[];
    takeProfits: Array<{ price: number; percentage: number }>;
    stopLoss?: number;
    direction: 'LONG' | 'SHORT';
  }): string[] {
    const warnings: string[] = [];

    if (data.entryPrices.length === 0) {
      warnings.push('No entry price found');
    }

    if (data.takeProfits.length === 0) {
      warnings.push('No take profit found');
    }

    if (!data.stopLoss) {
      warnings.push('No stop loss found');
    }

    if (data.takeProfits.length > 5) {
      warnings.push('Many take profit levels');
    }

    return warnings;
  }
}

// ==================== SINGLETON ====================

let parserInstance: TelegramSignalParser | null = null;

export function getTelegramSignalParser(config?: Partial<ParserConfig>): TelegramSignalParser {
  if (!parserInstance) {
    parserInstance = new TelegramSignalParser(config);
  } else if (config) {
    // Update config if provided
    parserInstance = new TelegramSignalParser({
      ...parserInstance.config,
      ...config,
    });
  }
  return parserInstance;
}

// ==================== EXPORTS ====================

export default {
  TelegramSignalParser,
  getTelegramSignalParser,
  PATTERNS,
};
