/**
 * Trade Analysis & Self-Learning System
 * 
 * Analyzes closed trades to identify patterns and improve future performance:
 * - Trade quality scoring
 * - Pattern recognition
 * - Performance analytics
 * - Self-learning recommendations
 * - Integration with ML signal filter
 * 
 * @module lib/analytics/trade-analyzer
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface TradeAnalysis {
  id: string;
  tradeId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  entryQuality: number;      // 0-1 score
  exitQuality: number;       // 0-1 score
  timingScore: number;       // 0-1 score
  marketCondition: string;   // BULLISH, BEARISH, SIDEWAYS, VOLATILE
  emotionalFactors: {
    followedSignal: boolean;
    deviatedFromPlan: boolean;
    panicExit: boolean;
    fomoEntry: boolean;
  };
  lessons: string[];
  createdAt: Date;
}

export interface TradePattern {
  id: string;
  name: string;
  conditions: PatternCondition[];
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  occurrenceCount: number;
  lastOccurrence: Date;
  profitable: boolean;
}

export interface PatternCondition {
  type: 'RSI' | 'MACD' | 'EMA' | 'VOLUME' | 'TIME' | 'VOLATILITY';
  operator: 'GT' | 'LT' | 'EQ' | 'BETWEEN';
  value: number | number[];
}

export interface LearningModel {
  patterns: TradePattern[];
  avoidPatterns: TradePattern[];
  confidenceByCondition: Map<string, number>;
  bestTimeOfDay: string;
  bestDayOfWeek: string;
  bestSymbol: string;
  worstSymbol: string;
  recommendations: string[];
  lastUpdated: Date;
}

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgHoldingTime: number;
  bestTimeOfDay: string;
  bestDayOfWeek: string;
  bestSymbol: string;
  worstSymbol: string;
}

// ==================== TRADE ANALYZER CLASS ====================

export class TradeAnalyzer {
  private learningModel: LearningModel | null = null;

  constructor() {
    this.learningModel = null;
  }

  /**
   * Analyze a closed trade
   */
  async analyzeTrade(trade: {
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    pnlPercent: number;
    entryTime: Date;
    exitTime: Date;
    followedSignal?: boolean;
    plannedStopLoss?: number;
    plannedTakeProfit?: number;
  }): Promise<TradeAnalysis> {
    // Calculate entry quality
    const entryQuality = await this.calculateEntryQuality(trade);

    // Calculate exit quality
    const exitQuality = await this.calculateExitQuality(trade);

    // Calculate timing score
    const timingScore = this.calculateTimingScore(trade);

    // Determine market condition
    const marketCondition = await this.determineMarketCondition(trade.symbol, trade.entryTime);

    // Analyze emotional factors
    const emotionalFactors = await this.analyzeEmotionalFactors(trade);

    // Generate lessons
    const lessons = this.generateLessons(trade, entryQuality, exitQuality, emotionalFactors);

    const analysis: TradeAnalysis = {
      id: `analysis-${Date.now()}-${trade.id}`,
      tradeId: trade.id,
      symbol: trade.symbol,
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      pnl: trade.pnl,
      pnlPercent: trade.pnlPercent,
      entryQuality,
      exitQuality,
      timingScore,
      marketCondition,
      emotionalFactors,
      lessons,
      createdAt: new Date(),
    };

    // Save to database
    await db.tradeAnalysis.create({
      data: {
        id: analysis.id,
        tradeId: trade.id,
        symbol: trade.symbol,
        direction: trade.direction,
        pnl: trade.pnl,
        pnlPercent: trade.pnlPercent,
        entryQuality,
        exitQuality,
        timingScore,
        marketCondition,
        lessons: analysis.lessons,
        createdAt: analysis.createdAt,
      },
    });

    // Update learning model
    await this.updateLearningModel(analysis);

    logger.info({
      tradeId: trade.id,
      entryQuality,
      exitQuality,
      lessons: lessons.length,
    }, 'Trade analyzed');

    return analysis;
  }

  /**
   * Calculate entry quality score (0-1)
   */
  private async calculateEntryQuality(trade: any): Promise<number> {
    let score = 0.5;

    // Check if entry was at support/resistance
    const atSupportResistance = await this.checkSupportResistance(trade.symbol, trade.entryPrice, trade.direction);
    if (atSupportResistance) {
      score += 0.2;
    }

    // Check RSI at entry
    const rsi = await this.getRSIAtTime(trade.symbol, trade.entryTime);
    if (trade.direction === 'LONG' && rsi < 40) {
      score += 0.15; // Good entry for long
    } else if (trade.direction === 'SHORT' && rsi > 60) {
      score += 0.15; // Good entry for short
    } else if ((trade.direction === 'LONG' && rsi > 70) || (trade.direction === 'SHORT' && rsi < 30)) {
      score -= 0.15; // Overbought/oversold entry
    }

    // Check volume at entry
    const volumeRatio = await this.getVolumeRatio(trade.symbol, trade.entryTime);
    if (volumeRatio > 1.5) {
      score += 0.1; // High volume confirms entry
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate exit quality score (0-1)
   */
  private async calculateExitQuality(trade: any): Promise<number> {
    let score = 0.5;

    // Check if exit was at resistance/support
    const atResistanceSupport = await this.checkSupportResistance(trade.symbol, trade.exitPrice, trade.direction === 'LONG' ? 'SHORT' : 'LONG');
    if (atResistanceSupport) {
      score += 0.2;
    }

    // Check if left money on table
    const maxProfit = await this.getMaxPossibleProfit(trade.symbol, trade.entryTime, trade.exitTime, trade.direction);
    if (maxProfit > 0) {
      const profitCaptured = trade.pnl / maxProfit;
      if (profitCaptured > 0.8) {
        score += 0.2; // Captured most of the move
      } else if (profitCaptured < 0.3) {
        score -= 0.2; // Left too much on table
      }
    }

    // Check if exited before major reversal
    const reversedAfterExit = await this.checkReversalAfterExit(trade.symbol, trade.exitTime, trade.direction);
    if (reversedAfterExit) {
      score += 0.15; // Good timing
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate timing score (0-1)
   */
  private calculateTimingScore(trade: any): number {
    let score = 0.5;

    const entryHour = trade.entryTime.getHours();
    const exitHour = trade.exitTime.getHours();

    // Best trading hours: 9-11 AM, 2-4 PM UTC
    if ((entryHour >= 9 && entryHour <= 11) || (entryHour >= 14 && entryHour <= 16)) {
      score += 0.15;
    }

    // Worst hours: 12-2 AM UTC
    if (entryHour >= 0 && entryHour <= 2) {
      score -= 0.15;
    }

    // Day of week
    const entryDay = trade.entryTime.getDay();
    if (entryDay >= 1 && entryDay <= 5) {
      score += 0.1; // Weekdays better
    } else {
      score -= 0.1; // Weekend worse
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Determine market condition at entry
   */
  private async determineMarketCondition(symbol: string, time: Date): Promise<string> {
    // Get candles around entry time
    const candles = await db.ohlcvCandle.findMany({
      where: {
        symbol,
        openTime: {
          lte: time,
          gte: new Date(time.getTime() - 24 * 60 * 60 * 1000), // 24 hours before
        },
      },
      orderBy: { openTime: 'desc' },
      take: 20,
    });

    if (candles.length < 20) {
      return 'UNKNOWN';
    }

    // Calculate volatility
    const prices = candles.map(c => c.close);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const volatility = prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length;
    const volPercent = Math.sqrt(volatility) / avgPrice;

    // Determine trend
    const priceChange = (prices[0] - prices[prices.length - 1]) / prices[prices.length - 1];

    if (volPercent > 0.05) {
      return 'VOLATILE';
    } else if (priceChange > 0.03) {
      return 'BULLISH';
    } else if (priceChange < -0.03) {
      return 'BEARISH';
    } else {
      return 'SIDEWAYS';
    }
  }

  /**
   * Analyze emotional factors
   */
  private async analyzeEmotionalFactors(trade: any): Promise<TradeAnalysis['emotionalFactors']> {
    const followedSignal = trade.followedSignal ?? true;

    // Check if deviated from planned stop loss
    const deviatedFromPlan = trade.plannedStopLoss && trade.plannedStopLoss !== trade.exitPrice;

    // Check if panic exit (exited very quickly with loss)
    const holdingTime = trade.exitTime.getTime() - trade.entryTime.getTime();
    const panicExit = holdingTime < 5 * 60 * 1000 && trade.pnl < 0; // Less than 5 minutes with loss

    // Check if FOMO entry (entered after large move)
    const priceMoveBeforeEntry = await this.getPriceMoveBeforeEntry(trade.symbol, trade.entryTime);
    const fomoEntry = Math.abs(priceMoveBeforeEntry) > 0.05; // More than 5% move before entry

    return {
      followedSignal,
      deviatedFromPlan,
      panicExit,
      fomoEntry,
    };
  }

  /**
   * Generate lessons from trade
   */
  private generateLessons(
    trade: any,
    entryQuality: number,
    exitQuality: number,
    emotionalFactors: TradeAnalysis['emotionalFactors']
  ): string[] {
    const lessons: string[] = [];

    if (entryQuality < 0.4) {
      lessons.push('Entry timing could be improved - wait for better setup');
    }

    if (exitQuality < 0.4 && trade.pnl > 0) {
      lessons.push('Exited too early - consider using trailing stop');
    }

    if (exitQuality < 0.4 && trade.pnl < 0) {
      lessons.push('Held losing position too long - respect stop loss');
    }

    if (emotionalFactors.panicExit) {
      lessons.push('Panic exit detected - stick to the plan');
    }

    if (emotionalFactors.fomoEntry) {
      lessons.push('FOMO entry detected - wait for pullback');
    }

    if (emotionalFactors.deviatedFromPlan) {
      lessons.push('Deviated from planned exit - follow the trading plan');
    }

    if (trade.pnl > 0 && entryQuality > 0.7 && exitQuality > 0.7) {
      lessons.push('Excellent trade - replicate this setup');
    }

    return lessons;
  }

  /**
   * Update learning model with new analysis
   */
  private async updateLearningModel(analysis: TradeAnalysis): Promise<void> {
    if (!this.learningModel) {
      await this.buildLearningModel();
    }

    if (!this.learningModel) return;

    // Update patterns based on this trade
    await this.updatePatterns(analysis);

    // Update confidence by condition
    const conditionKey = `${analysis.symbol}-${analysis.direction}-${analysis.marketCondition}`;
    const currentConfidence = this.learningModel.confidenceByCondition.get(conditionKey) || 0.5;
    const newConfidence = analysis.pnl > 0 ? Math.min(1, currentConfidence + 0.05) : Math.max(0, currentConfidence - 0.05);
    this.learningModel.confidenceByCondition.set(conditionKey, newConfidence);

    // Update recommendations
    this.learningModel.recommendations = this.generateRecommendations();

    this.learningModel.lastUpdated = new Date();
  }

  /**
   * Build learning model from historical trades
   */
  async buildLearningModel(): Promise<void> {
    logger.info('Building learning model from historical trades...');

    const analyses = await db.tradeAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const patterns: TradePattern[] = [];
    const confidenceByCondition = new Map<string, number>();

    // Group by conditions
    const conditionGroups = new Map<string, { wins: number; losses: number; profits: number[] }>();

    for (const analysis of analyses) {
      const key = `${analysis.symbol}-${analysis.direction}-${analysis.marketCondition}`;
      
      if (!conditionGroups.has(key)) {
        conditionGroups.set(key, { wins: 0, losses: 0, profits: [] });
      }

      const group = conditionGroups.get(key)!;
      if (analysis.pnl > 0) {
        group.wins++;
      } else {
        group.losses++;
      }
      group.profits.push(analysis.pnl);
    }

    // Create patterns from groups
    for (const [key, data] of conditionGroups.entries()) {
      const total = data.wins + data.losses;
      if (total < 5) continue; // Need minimum samples

      const winRate = data.wins / total;
      const avgProfit = data.profits.filter(p => p > 0).reduce((a, b) => a + b, 0) / Math.max(1, data.wins);
      const avgLoss = Math.abs(data.profits.filter(p => p < 0).reduce((a, b) => a + b, 0) / Math.max(1, data.losses));

      const [symbol, direction, marketCondition] = key.split('-');

      patterns.push({
        id: `pattern-${key}`,
        name: `${symbol} ${direction} in ${marketCondition} market`,
        conditions: [
          { type: 'TIME', operator: 'EQ', value: 0 }, // Placeholder
        ],
        winRate,
        avgProfit,
        avgLoss,
        occurrenceCount: total,
        lastOccurrence: new Date(),
        profitable: winRate > 0.5 && avgProfit > Math.abs(avgLoss),
      });

      confidenceByCondition.set(key, winRate);
    }

    // Sort patterns by profitability
    patterns.sort((a, b) => b.winRate - a.winRate);

    const profitablePatterns = patterns.filter(p => p.profitable);
    const avoidPatterns = patterns.filter(p => !p.profitable);

    // Find best/worst symbols
    const symbolStats = new Map<string, { pnl: number; count: number }>();
    for (const analysis of analyses) {
      if (!symbolStats.has(analysis.symbol)) {
        symbolStats.set(analysis.symbol, { pnl: 0, count: 0 });
      }
      const stats = symbolStats.get(analysis.symbol)!;
      stats.pnl += analysis.pnl;
      stats.count++;
    }

    let bestSymbol = '';
    let worstSymbol = '';
    let bestPnl = -Infinity;
    let worstPnl = Infinity;

    for (const [symbol, stats] of symbolStats.entries()) {
      const avgPnl = stats.pnl / stats.count;
      if (avgPnl > bestPnl) {
        bestPnl = avgPnl;
        bestSymbol = symbol;
      }
      if (avgPnl < worstPnl) {
        worstPnl = avgPnl;
        worstSymbol = symbol;
      }
    }

    this.learningModel = {
      patterns: profitablePatterns.slice(0, 20),
      avoidPatterns: avoidPatterns.slice(0, 20),
      confidenceByCondition,
      bestTimeOfDay: '09:00-11:00 UTC',
      bestDayOfWeek: 'Tuesday-Thursday',
      bestSymbol,
      worstSymbol,
      recommendations: this.generateRecommendations(),
      lastUpdated: new Date(),
    };

    logger.info({
      patterns: patterns.length,
      profitable: profitablePatterns.length,
      avoid: avoidPatterns.length,
    }, 'Learning model built');
  }

  /**
   * Update patterns with new analysis
   */
  private async updatePatterns(analysis: TradeAnalysis): Promise<void> {
    if (!this.learningModel) return;

    const key = `${analysis.symbol}-${analysis.direction}-${analysis.marketCondition}`;
    
    // Find or create pattern
    let pattern = this.learningModel.patterns.find(p => p.name.includes(key));
    
    if (!pattern) {
      pattern = {
        id: `pattern-${key}`,
        name: `${analysis.symbol} ${analysis.direction} in ${analysis.marketCondition} market`,
        conditions: [],
        winRate: 0,
        avgProfit: 0,
        avgLoss: 0,
        occurrenceCount: 0,
        lastOccurrence: new Date(),
        profitable: false,
      };
      this.learningModel.patterns.push(pattern);
    }

    // Update pattern stats
    pattern.occurrenceCount++;
    pattern.lastOccurrence = new Date();

    if (analysis.pnl > 0) {
      const wins = pattern.winRate * pattern.occurrenceCount;
      pattern.winRate = (wins + 1) / pattern.occurrenceCount;
      pattern.avgProfit = (pattern.avgProfit * (wins) + analysis.pnl) / (wins + 1);
    } else {
      const wins = pattern.winRate * pattern.occurrenceCount;
      pattern.winRate = wins / pattern.occurrenceCount;
      pattern.avgLoss = (pattern.avgLoss * (pattern.occurrenceCount - wins - 1) + Math.abs(analysis.pnl)) / (pattern.occurrenceCount - wins);
    }

    pattern.profitable = pattern.winRate > 0.5 && pattern.avgProfit > Math.abs(pattern.avgLoss);
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(): string[] {
    if (!this.learningModel) return [];

    const recommendations: string[] = [];

    // Best symbol recommendation
    if (this.learningModel.bestSymbol) {
      recommendations.push(`Focus on ${this.learningModel.bestSymbol} - best performing symbol`);
    }

    // Worst symbol warning
    if (this.learningModel.worstSymbol) {
      recommendations.push(`Be cautious with ${this.learningModel.worstSymbol} - worst performing symbol`);
    }

    // Time recommendation
    recommendations.push('Best trading hours: 09:00-11:00 UTC and 14:00-16:00 UTC');

    // Day recommendation
    recommendations.push('Best trading days: Tuesday-Thursday');

    // Pattern-based recommendations
    if (this.learningModel.patterns.length > 0) {
      const topPattern = this.learningModel.patterns[0];
      recommendations.push(`High probability setup: ${topPattern.name} (${(topPattern.winRate * 100).toFixed(1)}% win rate)`);
    }

    // Avoid patterns
    if (this.learningModel.avoidPatterns.length > 0) {
      const worstPattern = this.learningModel.avoidPatterns[0];
      recommendations.push(`Avoid: ${worstPattern.name} (${(worstPattern.winRate * 100).toFixed(1)}% win rate)`);
    }

    return recommendations;
  }

  /**
   * Check if signal should be executed based on learning
   */
  async shouldExecuteSignal(signal: {
    symbol: string;
    direction: 'LONG' | 'SHORT';
  }): Promise<{ shouldExecute: boolean; confidence: number; reason?: string }> {
    if (!this.learningModel) {
      await this.buildLearningModel();
    }

    if (!this.learningModel) {
      return { shouldExecute: true, confidence: 0.5 };
    }

    // Check if this is an avoid pattern
    const avoidPattern = this.learningModel.avoidPatterns.find(
      p => p.name.includes(signal.symbol) && p.name.includes(signal.direction)
    );

    if (avoidPattern && avoidPattern.winRate < 0.4) {
      return {
        shouldExecute: false,
        confidence: 1 - avoidPattern.winRate,
        reason: `Low probability pattern: ${(avoidPattern.winRate * 100).toFixed(1)}% win rate`,
      };
    }

    // Check confidence by condition
    const key = `${signal.symbol}-${signal.direction}`;
    const confidence = this.learningModel.confidenceByCondition.get(key) || 0.5;

    if (confidence < 0.4) {
      return {
        shouldExecute: false,
        confidence: 1 - confidence,
        reason: `Low confidence for ${key}: ${(confidence * 100).toFixed(1)}%`,
      };
    }

    return {
      shouldExecute: true,
      confidence,
    };
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(symbol?: string): Promise<PerformanceMetrics> {
    const where = symbol ? { symbol } : {};

    const analyses = await db.tradeAnalysis.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const totalTrades = analyses.length;
    const winningTrades = analyses.filter(a => a.pnl > 0).length;
    const losingTrades = analyses.filter(a => a.pnl <= 0).length;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

    const totalPnl = analyses.reduce((sum, a) => sum + a.pnl, 0);
    const wins = analyses.filter(a => a.pnl > 0);
    const losses = analyses.filter(a => a.pnl <= 0);

    const avgWin = wins.length > 0 ? wins.reduce((sum, a) => sum + a.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, a) => sum + a.pnl, 0) / losses.length : 0;

    const grossProfit = wins.reduce((sum, a) => sum + a.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, a) => sum + a.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Sharpe ratio (simplified)
    const returns = analyses.map(a => a.pnlPercent / 100);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / Math.max(1, returns.length - 1));
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    // Max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let cumulativePnl = 0;
    for (const analysis of analyses.reverse()) {
      cumulativePnl += analysis.pnl;
      if (cumulativePnl > peak) {
        peak = cumulativePnl;
      }
      const drawdown = peak - cumulativePnl;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Best/worst symbol
    const symbolStats = new Map<string, { pnl: number; count: number }>();
    for (const analysis of analyses) {
      if (!symbolStats.has(analysis.symbol)) {
        symbolStats.set(analysis.symbol, { pnl: 0, count: 0 });
      }
      const stats = symbolStats.get(analysis.symbol)!;
      stats.pnl += analysis.pnl;
      stats.count++;
    }

    let bestSymbol = '';
    let worstSymbol = '';
    let bestAvg = -Infinity;
    let worstAvg = Infinity;

    for (const [sym, stats] of symbolStats.entries()) {
      const avg = stats.pnl / stats.count;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestSymbol = sym;
      }
      if (avg < worstAvg) {
        worstAvg = avg;
        worstSymbol = sym;
      }
    }

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalPnl,
      avgWin,
      avgLoss,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      avgHoldingTime: 0, // Would need trade duration data
      bestTimeOfDay: '09:00-11:00 UTC',
      bestDayOfWeek: 'Tuesday-Thursday',
      bestSymbol,
      worstSymbol,
    };
  }

  /**
   * Get learning model
   */
  getLearningModel(): LearningModel | null {
    return this.learningModel;
  }

  /**
   * Get recommendations
   */
  getRecommendations(): string[] {
    if (!this.learningModel) {
      return ['Insufficient data for recommendations'];
    }
    return this.learningModel.recommendations;
  }

  // ==================== HELPER METHODS ====================

  private async checkSupportResistance(symbol: string, price: number, direction: string): Promise<boolean> {
    // Simplified - in production, use proper S/R levels
    return Math.random() > 0.5;
  }

  private async getRSIAtTime(symbol: string, time: Date): Promise<number> {
    // Simplified - in production, calculate from candles
    return 50 + (Math.random() - 0.5) * 40;
  }

  private async getVolumeRatio(symbol: string, time: Date): Promise<number> {
    // Simplified - in production, calculate from volume data
    return 1 + Math.random();
  }

  private async getMaxPossibleProfit(symbol: string, startTime: Date, endTime: Date, direction: string): Promise<number> {
    // Simplified - in production, find max price in range
    return Math.random() * 100;
  }

  private async checkReversalAfterExit(symbol: string, exitTime: Date, direction: string): Promise<boolean> {
    // Simplified - in production, check price movement after exit
    return Math.random() > 0.5;
  }

  private async getPriceMoveBeforeEntry(symbol: string, entryTime: Date): Promise<number> {
    // Simplified - in production, calculate from candles
    return (Math.random() - 0.5) * 0.1;
  }
}

// ==================== SINGLETON ====================

let analyzerInstance: TradeAnalyzer | null = null;

export function getTradeAnalyzer(): TradeAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new TradeAnalyzer();
  }
  return analyzerInstance;
}

// ==================== EXPORTS ====================

export default {
  TradeAnalyzer,
  getTradeAnalyzer,
};
