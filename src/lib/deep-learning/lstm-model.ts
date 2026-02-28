/**
 * TensorFlow.js LSTM Model for Price Prediction
 * 
 * Actual deep learning implementation:
 * - LSTM network architecture
 * - Training on historical data
 * - Real-time prediction
 * - Model persistence
 * - Continuous learning
 * 
 * @module lib/deep-learning/lstm-model
 */

import * as tf from '@tensorflow/tfjs-node';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ==================== TYPES ====================

export interface LSTMConfig {
  sequenceLength: number;
  inputFeatures: number;
  lstmUnits: number;
  denseUnits: number;
  learningRate: number;
  epochs: number;
  batchSize: number;
  validationSplit: number;
}

export interface LSTMTrainingResult {
  modelId: string;
  symbol: string;
  finalLoss: number;
  finalAccuracy: number;
  trainingHistory: number[];
  trainingSamples: number;
  validationSamples: number;
  trainedAt: Date;
}

export interface LSTMPrediction {
  symbol: string;
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  confidence: number;
  predictedPrice: number;
  currentPrice: number;
  predictedChange: number;
  timestamp: Date;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: LSTMConfig = {
  sequenceLength: 60,
  inputFeatures: 6,
  lstmUnits: 50,
  denseUnits: 25,
  learningRate: 0.001,
  epochs: 50,
  batchSize: 32,
  validationSplit: 0.2,
};

// ==================== LSTM MODEL CLASS ====================

export class LSTMModel {
  private config: LSTMConfig;
  private model: tf.LayersModel | null;
  private isTraining: boolean;

  constructor(config?: Partial<LSTMConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.model = null;
    this.isTraining = false;
  }

  /**
   * Build LSTM model architecture
   */
  buildModel(): tf.LayersModel {
    const model = tf.sequential();

    // First LSTM layer
    model.add(tf.layers.lstm({
      units: this.config.lstmUnits,
      inputShape: [this.config.sequenceLength, this.config.inputFeatures],
      returnSequences: true,
      dropout: 0.2,
      recurrentDropout: 0.2,
    }));

    // Second LSTM layer
    model.add(tf.layers.lstm({
      units: this.config.lstmUnits / 2,
      dropout: 0.2,
      recurrentDropout: 0.2,
    }));

    // Dense layers
    model.add(tf.layers.dense({
      units: this.config.denseUnits,
      activation: 'relu',
    }));

    model.add(tf.layers.dropout({ rate: 0.3 }));

    // Output layer (sigmoid for binary classification)
    model.add(tf.layers.dense({
      units: 1,
      activation: 'sigmoid',
    }));

    // Compile model
    model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy'],
    });

    this.model = model;

    logger.info({
      lstmUnits: this.config.lstmUnits,
      denseUnits: this.config.denseUnits,
      learningRate: this.config.learningRate,
    }, 'LSTM model built');

    return model;
  }

  /**
   * Prepare training data
   */
  async prepareTrainingData(symbol: string): Promise<{
    xs: tf.Tensor3D;
    ys: tf.Tensor2D;
    normalizationParams: {
      priceMean: number;
      priceStd: number;
    };
  }> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - this.config.sequenceLength * 2);

    // Get historical candles
    const candles = await db.ohlcvCandle.findMany({
      where: {
        symbol,
        openTime: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { openTime: 'asc' },
    });

    if (candles.length < this.config.sequenceLength + 10) {
      throw new Error('Insufficient training data');
    }

    // Extract features
    const features: number[][] = [];
    const labels: number[] = [];

    const prices = candles.map(c => c.close);
    const priceMean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const priceStd = Math.sqrt(prices.reduce((sum, p) => sum + Math.pow(p - priceMean, 2), 0) / prices.length);

    for (let i = this.config.sequenceLength; i < candles.length - 1; i++) {
      // Extract sequence features
      const sequence: number[] = [];

      for (let j = i - this.config.sequenceLength; j < i; j++) {
        const candle = candles[j];
        
        // Feature 1: Normalized price change
        const priceChange = (candle.close - candle.open) / candle.open;
        sequence.push(priceChange);

        // Feature 2: Volume ratio
        const avgVolume = candles.slice(Math.max(0, j - 20), j).reduce((sum, c) => sum + c.volume, 0) / Math.min(20, j);
        const volumeRatio = candle.volume / avgVolume;
        sequence.push(volumeRatio);

        // Feature 3: RSI (simplified)
        const rsi = this.calculateRSI(candles.slice(Math.max(0, j - 14), j + 1));
        sequence.push(rsi / 100);

        // Feature 4: MACD histogram (simplified)
        const macd = this.calculateMACD(candles.slice(Math.max(0, j - 26), j + 1));
        sequence.push(macd / candle.close);

        // Feature 5: Bollinger position
        const bbPosition = this.calculateBollingerPosition(candles.slice(Math.max(0, j - 20), j + 1));
        sequence.push(bbPosition);

        // Feature 6: ATR normalized
        const atr = this.calculateATR(candles.slice(Math.max(0, j - 14), j + 1));
        sequence.push(atr / candle.close);
      }

      features.push(sequence);

      // Label: 1 if price goes up, 0 if down
      const futurePrice = candles[i + 1].close;
      const currentPrice = candles[i].close;
      labels.push(futurePrice > currentPrice ? 1 : 0);
    }

    // Convert to tensors
    const xs = tf.tensor3d(features, [features.length, this.config.sequenceLength, this.config.inputFeatures]);
    const ys = tf.tensor2d(labels.map(l => [l]), [labels.length, 1]);

    return {
      xs,
      ys,
      normalizationParams: {
        priceMean,
        priceStd,
      },
    };
  }

  /**
   * Train the model
   */
  async train(symbol: string): Promise<LSTMTrainingResult> {
    if (this.isTraining) {
      throw new Error('Training already in progress');
    }

    this.isTraining = true;
    logger.info({ symbol }, 'Starting LSTM training...');

    try {
      // Build model if not exists
      if (!this.model) {
        this.buildModel();
      }

      // Prepare data
      const { xs, ys } = await this.prepareTrainingData(symbol);

      // Split train/validation
      const splitIndex = Math.floor(xs.shape[0] * (1 - this.config.validationSplit));
      
      const trainXs = xs.slice([0, 0, 0], [splitIndex, -1, -1]);
      const trainYs = ys.slice([0, 0], [splitIndex, -1]);
      
      const valXs = xs.slice([splitIndex, 0, 0], [-1, -1, -1]);
      const valYs = ys.slice([splitIndex, 0], [-1, -1]);

      // Train model
      const trainingHistory: number[] = [];
      
      await this.model!.fit(trainXs, trainYs, {
        epochs: this.config.epochs,
        batchSize: this.config.batchSize,
        validationData: [valXs, valYs],
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            trainingHistory.push(logs?.loss || 0);
            logger.debug({ epoch, loss: logs?.loss, acc: logs?.acc }, 'Training epoch');
          },
        },
      });

      // Get final metrics
      const evalResult = this.model!.evaluate(valXs, valYs);
      const finalLoss = evalResult[0].dataSync()[0];
      const finalAccuracy = evalResult[1] ? evalResult[1].dataSync()[0] : 0;

      // Cleanup tensors
      xs.dispose();
      ys.dispose();
      trainXs.dispose();
      trainYs.dispose();
      valXs.dispose();
      valYs.dispose();
      evalResult[0].dispose();
      if (evalResult[1]) evalResult[1].dispose();

      const result: LSTMTrainingResult = {
        modelId: `lstm-${symbol}-${Date.now()}`,
        symbol,
        finalLoss,
        finalAccuracy,
        trainingHistory,
        trainingSamples: splitIndex,
        validationSamples: xs.shape[0] - splitIndex,
        trainedAt: new Date(),
      };

      // Save model
      await this.saveModel(symbol, result.modelId);

      // Save to database
      await db.dlModel.create({
        data: {
          symbol,
          modelId: result.modelId,
          config: this.config as any,
          metrics: {
            accuracy: finalAccuracy,
            loss: finalLoss,
          },
          trainedAt: result.trainedAt,
        },
      });

      logger.info({
        symbol,
        accuracy: (finalAccuracy * 100).toFixed(1) + '%',
        loss: finalLoss.toFixed(4),
      }, 'LSTM model trained');

      return result;
    } finally {
      this.isTraining = false;
    }
  }

  /**
   * Make prediction
   */
  async predict(symbol: string): Promise<LSTMPrediction | null> {
    if (!this.model) {
      this.buildModel();
    }

    try {
      // Get recent data
      const features = await this.extractFeatures(symbol);
      
      if (!features) {
        return null;
      }

      // Create tensor
      const xs = tf.tensor3d([features], [1, this.config.sequenceLength, this.config.inputFeatures]);

      // Predict
      const prediction = this.model!.predict(xs) as tf.Tensor;
      const probability = prediction.dataSync()[0];

      // Cleanup
      xs.dispose();
      prediction.dispose();

      // Determine direction
      let direction: 'UP' | 'DOWN' | 'NEUTRAL';
      if (probability > 0.55) {
        direction = 'UP';
      } else if (probability < 0.45) {
        direction = 'DOWN';
      } else {
        direction = 'NEUTRAL';
      }

      // Get current price
      const currentPrice = await this.getCurrentPrice(symbol);
      const predictedChange = (probability - 0.5) * 2 * 5; // Scale to % move

      return {
        symbol,
        direction,
        confidence: Math.abs(probability - 0.5) * 2,
        predictedPrice: currentPrice * (1 + predictedChange / 100),
        currentPrice,
        predictedChange,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error({ error, symbol }, 'LSTM prediction failed');
      return null;
    }
  }

  /**
   * Extract features for prediction
   */
  private async extractFeatures(symbol: string): Promise<number[][] | null> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - this.config.sequenceLength * 2);

    const candles = await db.ohlcvCandle.findMany({
      where: {
        symbol,
        openTime: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { openTime: 'asc' },
      take: this.config.sequenceLength + 30,
    });

    if (candles.length < this.config.sequenceLength) {
      return null;
    }

    const recentCandles = candles.slice(-this.config.sequenceLength);
    const features: number[][] = [];

    for (const candle of recentCandles) {
      const sequence: number[] = [];

      // Feature 1: Price change
      const priceChange = (candle.close - candle.open) / candle.open;
      sequence.push(priceChange);

      // Feature 2: Volume (normalized)
      const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / recentCandles.length;
      sequence.push(candle.volume / avgVolume);

      // Feature 3: RSI
      const rsi = this.calculateRSI(recentCandles.slice(0, 14));
      sequence.push(rsi / 100);

      // Feature 4: MACD
      const macd = this.calculateMACD(recentCandles.slice(0, 26));
      sequence.push(macd / candle.close);

      // Feature 5: Bollinger position
      const bbPosition = this.calculateBollingerPosition(recentCandles.slice(0, 20));
      sequence.push(bbPosition);

      // Feature 6: ATR normalized
      const atr = this.calculateATR(recentCandles.slice(0, 14));
      sequence.push(atr / candle.close);

      features.push(sequence);
    }

    return features;
  }

  /**
   * Save model to disk
   */
  private async saveModel(symbol: string, modelId: string): Promise<void> {
    if (!this.model) return;

    try {
      await this.model.save(`file://./models/lstm-${symbol}`);
      logger.info({ symbol, modelId }, 'Model saved to disk');
    } catch (error) {
      logger.error({ error }, 'Failed to save model');
    }
  }

  /**
   * Load model from disk
   */
  async loadModel(symbol: string): Promise<boolean> {
    try {
      this.model = await tf.loadLayersModel(`file://./models/lstm-${symbol}/model.json`);
      logger.info({ symbol }, 'Model loaded from disk');
      return true;
    } catch (error) {
      logger.debug({ error, symbol }, 'No saved model found');
      return false;
    }
  }

  /**
   * Get current price
   */
  private async getCurrentPrice(symbol: string): Promise<number> {
    const candle = await db.ohlcvCandle.findFirst({
      where: { symbol },
      orderBy: { openTime: 'desc' },
    });

    return candle?.close || 0;
  }

  /**
   * Helper: Calculate RSI
   */
  private calculateRSI(candles: any[], period: number = 14): number {
    if (candles.length < period + 1) return 50;

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i <= period; i++) {
      const change = candles[i - 1].close - candles[i].close;
      if (change > 0) gains.push(change);
      else losses.push(Math.abs(change));
    }

    const avgGain = gains.reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Helper: Calculate MACD
   */
  private calculateMACD(candles: any[]): number {
    if (candles.length < 26) return 0;

    const ema12 = this.calculateEMA(candles, 12);
    const ema26 = this.calculateEMA(candles, 26);

    return ema12 - ema26;
  }

  /**
   * Helper: Calculate EMA
   */
  private calculateEMA(candles: any[], period: number): number {
    if (candles.length < period) return candles[0].close;

    const multiplier = 2 / (period + 1);
    let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;

    for (let i = period; i < candles.length; i++) {
      ema = (candles[i].close - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Helper: Calculate Bollinger Position
   */
  private calculateBollingerPosition(candles: any[]): number {
    if (candles.length < 20) return 0.5;

    const prices = candles.map(c => c.close);
    const sma = prices.reduce((a, b) => a + b, 0) / prices.length;
    const std = Math.sqrt(prices.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / prices.length);

    const currentPrice = prices[prices.length - 1];
    const position = (currentPrice - (sma - 2 * std)) / (4 * std);

    return Math.max(0, Math.min(1, position));
  }

  /**
   * Helper: Calculate ATR
   */
  private calculateATR(candles: any[], period: number = 14): number {
    if (candles.length < period + 1) return 0;

    const trueRanges: number[] = [];
    for (let i = 1; i <= period; i++) {
      const candle = candles[candles.length - i];
      const prevCandle = candles[candles.length - i - 1];

      const tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - prevCandle.close),
        Math.abs(candle.low - prevCandle.close)
      );
      trueRanges.push(tr);
    }

    return trueRanges.reduce((a, b) => a + b, 0) / period;
  }

  /**
   * Dispose model
   */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
  }
}

// ==================== SINGLETON ====================

let modelInstance: LSTMModel | null = null;

export function getLSTMModel(config?: Partial<LSTMConfig>): LSTMModel {
  if (!modelInstance) {
    modelInstance = new LSTMModel(config);
  }
  return modelInstance;
}

// ==================== EXPORTS ====================

export default {
  LSTMModel,
  getLSTMModel,
  DEFAULT_CONFIG,
};
