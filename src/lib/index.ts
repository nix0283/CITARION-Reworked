/**
 * Library Module Index
 * 
 * Центральный экспорт всех библиотек проекта Citarion
 * @module lib
 */

// Bot Filters
export * from './bot-filters';

// Indicators
export * from './indicators';

// Skills Integration
export * from './skills';

// ML & AI
export * from './ml/lawrence-classifier';
export * from './deep-learning/predictor';

// Trading Core
export * from './strategy';
export * from './strategy-bot';
export * from './signal-trading';

// Exchange Integration
export * from './exchange';

// Analytics & Monitoring
export * from './analytics/trade-analyzer';
export * from './analytics/risk-engine';
export * from './monitoring/system-monitor';
export * from './monitoring/cross-bot-correlation';

// Infrastructure (v2.7.0)
export * from './feature-flags';
export * from './ab-testing';
export * from './recalibration';

// v2.8.0 Advanced Infrastructure
export * from './webhooks';
export * from './multi-region';
export * from './versioning';
export * from './reports';
export * from './cross-experiment';
export * from './advanced-optimization';

// Utilities
export * from './utils';
export * from './format';
export * from './logger';
export * from './db';

// Security
export * from './security/encryption';
export * from './security/rate-limiter';
export * from './security/circuit-breaker';

// Default export for convenience
export default {
  // Bot Filters
  botFilters: require('./bot-filters'),
  
  // Indicators
  indicators: require('./indicators'),
  
  // Skills
  skills: require('./skills'),
  
  // ML
  ml: {
    lawrenceClassifier: require('./ml/lawrence-classifier'),
    predictor: require('./deep-learning/predictor'),
  },
  
  // Trading
  trading: {
    strategy: require('./strategy'),
    signalTrading: require('./signal-trading'),
  },
  
  // Exchange
  exchange: require('./exchange'),
  
  // Analytics & Monitoring
  analytics: {
    tradeAnalyzer: require('./analytics/trade-analyzer'),
    riskEngine: require('./analytics/risk-engine'),
  },
  monitoring: {
    systemMonitor: require('./monitoring/system-monitor'),
    crossBotCorrelation: require('./monitoring/cross-bot-correlation'),
  },
  
  // Infrastructure (v2.7.0)
  infrastructure: {
    featureFlags: require('./feature-flags'),
    abTesting: require('./ab-testing'),
    recalibration: require('./recalibration'),
  },
  
  // v2.8.0 Advanced Infrastructure
  advanced: {
    webhooks: require('./webhooks'),
    multiRegion: require('./multi-region'),
    versioning: require('./versioning'),
    reports: require('./reports'),
    crossExperiment: require('./cross-experiment'),
    optimization: require('./advanced-optimization'),
  },
  
  // Utils
  utils: require('./utils'),
  logger: require('./logger'),
  db: require('./db'),
};
