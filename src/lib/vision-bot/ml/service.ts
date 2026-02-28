/**
 * Vision Bot - Market Forecast Service
 * 
 * Generates market forecasts using ML model
 * Tracks forecast accuracy over time
 * 
 * Features:
 * - Real-time forecasting
 * - Historical accuracy tracking
 * - Multi-symbol support
 * - Confidence-based trading signals
 */

import { db } from '@/lib/db';
import { getMarketForecastModel, MarketForecast, FeatureVector } from './ml/model';
import { FeatureEngineer } from './ml/model';
import { Candle } from '@/lib/strategy/types';

export interface ForecastServiceConfig {
  symbol: string;
  timeframe: string;
  confidenceThreshold: number;
  lookbackDays: number;
  autoTrade: boolean;
}

export class MarketForecastService {
  private model = getMarketForecastModel();
  private featureEngineer = new FeatureEngineer();
  private config: ForecastServiceConfig;
  private lastForecast: MarketForecast | null = null;
  private forecastHistory: MarketForecast[] = [];
  
  constructor(config: ForecastServiceConfig) {
    this.config = config;
  }
  
  /**
   * Generate forecast for current market conditions
   */
  async generateForecast(candles: Candle[]): Promise<MarketForecast> {
    if (candles.length < 50) {
      throw new Error('Not enough candles for forecast (minimum 50)');
    }
    
    // Calculate features
    const features = this.featureEngineer.calculateFeatures(candles);
    
    // Generate prediction
    const forecast = this.model.predict(features);
    forecast.symbol = this.config.symbol;
    forecast.timeframe = this.config.timeframe;
    
    // Store forecast
    this.lastForecast = forecast;
    this.forecastHistory.push(forecast);
    
    // Keep only last 100 forecasts
    if (this.forecastHistory.length > 100) {
      this.forecastHistory.shift();
    }
    
    // Save to database for accuracy tracking
    await this.saveForecast(forecast, features);
    
    return forecast;
  }
  
  /**
   * Get trading signal from forecast
   */
  getTradingSignal(forecast: MarketForecast): {
    action: 'BUY' | 'SELL' | 'HOLD';
    leverage: number;
    stopLossPercent: number;
    takeProfitPercent: number;
    reason: string;
  } {
    const { direction, confidence, predictedChange24h } = forecast;
    
    // Check confidence threshold
    if (confidence < this.config.confidenceThreshold) {
      return {
        action: 'HOLD',
        leverage: 1,
        stopLossPercent: 0,
        takeProfitPercent: 0,
        reason: `Confidence too low (${(confidence * 100).toFixed(1)}% < ${(this.config.confidenceThreshold * 100).toFixed(1)}%)`,
      };
    }
    
    // Determine action
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let leverage = 1;
    
    if (direction === 'UPWARD' && confidence > 0.7) {
      action = 'BUY';
      leverage = Math.min(10, Math.floor(confidence * 15));
    } else if (direction === 'DOWNWARD' && confidence > 0.7) {
      action = 'SELL';
      leverage = Math.min(10, Math.floor(confidence * 15));
    }
    
    // Calculate SL/TP based on predicted change
    const stopLossPercent = Math.abs(predictedChange24h) * 0.5;
    const takeProfitPercent = Math.abs(predictedChange24h) * 1.5;
    
    // Build reason
    const reason = `${direction} forecast with ${(confidence * 100).toFixed(1)}% confidence. Predicted 24h change: ${predictedChange24h.toFixed(2)}%`;
    
    return {
      action,
      leverage,
      stopLossPercent,
      takeProfitPercent,
      reason,
    };
  }
  
  /**
   * Evaluate forecast accuracy after 24 hours
   */
  async evaluateForecast(forecastId: string, actualChange: number): Promise<{
    wasCorrect: boolean;
    accuracy: number;
  }> {
    const forecast = await db.marketForecastHistory.findUnique({
      where: { id: forecastId },
    });
    
    if (!forecast) {
      return { wasCorrect: false, accuracy: 0 };
    }
    
    // Determine actual direction
    let actualDirection: 'UPWARD' | 'DOWNWARD' | 'CONSOLIDATION';
    if (actualChange > 2) {
      actualDirection = 'UPWARD';
    } else if (actualChange < -2) {
      actualDirection = 'DOWNWARD';
    } else {
      actualDirection = 'CONSOLIDATION';
    }
    
    // Check if forecast was correct
    const wasCorrect = forecast.direction === actualDirection;
    
    // Update database
    await db.marketForecastHistory.update({
      where: { id: forecastId },
      data: {
        actualDirection,
        priceChange24h: actualChange,
        wasCorrect,
        evaluatedAt: new Date(),
      },
    });
    
    // Update model metrics
    this.model.updateMetrics(wasCorrect);
    
    return {
      wasCorrect,
      accuracy: this.model.getMetrics().accuracy,
    };
  }
  
  /**
   * Get forecast statistics
   */
  async getStatistics(): Promise<{
    totalForecasts: number;
    accuracy: number;
    avgConfidence: number;
    profitableForecasts: number;
    last24hAccuracy: number;
  }> {
    const stats = await db.marketForecastHistory.groupBy({
      by: ['wasCorrect'],
      _count: true,
      _avg: {
        confidence: true,
      },
    });
    
    const total = stats.reduce((sum, s) => sum + s._count, 0);
    const correct = stats.find(s => s.wasCorrect === true)?._count || 0;
    const accuracy = total > 0 ? correct / total : 0;
    const avgConfidence = stats[0]?._avg.confidence || 0;
    
    // Last 24h accuracy
    const last24h = await db.marketForecastHistory.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });
    
    const last24hCorrect = last24h.filter(f => f.wasCorrect === true).length;
    const last24hAccuracy = last24h.length > 0 ? last24hCorrect / last24h.length : 0;
    
    return {
      totalForecasts: total,
      accuracy,
      avgConfidence,
      profitableForecasts: correct,
      last24hAccuracy,
    };
  }
  
  /**
   * Get last forecast
   */
  getLastForecast(): MarketForecast | null {
    return this.lastForecast;
  }
  
  /**
   * Get forecast history
   */
  getForecastHistory(): MarketForecast[] {
    return this.forecastHistory;
  }
  
  /**
   * Save forecast to database
   */
  private async saveForecast(forecast: MarketForecast, features: FeatureVector): Promise<void> {
    try {
      await db.marketForecastHistory.create({
        data: {
          direction: forecast.direction,
          confidence: forecast.confidence,
          upwardProb: forecast.upwardProb,
          downwardProb: forecast.downwardProb,
          consolidationProb: forecast.consolidationProb,
          avgRoc24h: features.roc24h,
          avgAtrPercent: features.atrPercent,
          avgTrendStrength: features.trendStrength,
          avgVolumeRatio: features.volumeRatio,
          avgCorrelation: features.btcCorrelation,
          tradingAction: this.getTradingSignal(forecast).action,
          tradingLeverage: this.getTradingSignal(forecast).leverage,
          stopLossPercent: this.getTradingSignal(forecast).stopLossPercent,
          takeProfitPercent: this.getTradingSignal(forecast).takeProfitPercent,
          tradingReason: this.getTradingSignal(forecast).reason,
          timestamp: forecast.timestamp,
        },
      });
    } catch (error) {
      console.error('[Forecast Service] Save error:', error);
    }
  }
}

// ==================== SINGLETON ====================

let serviceInstance: MarketForecastService | null = null;

export function getMarketForecastService(
  config?: ForecastServiceConfig
): MarketForecastService {
  if (!serviceInstance || config) {
    serviceInstance = new MarketForecastService(config || {
      symbol: 'BTC/USDT',
      timeframe: '1h',
      confidenceThreshold: 0.7,
      lookbackDays: 30,
      autoTrade: false,
    });
  }
  return serviceInstance;
}
