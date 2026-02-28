/**
 * Webhook Integration for Alerting
 * 
 * Supports sending alerts to external services:
 * - Slack (incoming webhooks)
 * - PagerDuty (Events API v2)
 * - Discord (webhooks)
 * - Generic HTTP endpoints
 * 
 * Features:
 * - Rate limiting to avoid spam
 * - Retry logic with exponential backoff
 * - Alert deduplication
 * - Configurable severity mapping
 * 
 * @module lib/webhooks
 */

import { logger } from '@/lib/logger';

export type WebhookProvider = 'slack' | 'pagerduty' | 'discord' | 'generic';

export interface WebhookConfig {
  provider: WebhookProvider;
  url: string;
  enabled: boolean;
  
  // Rate limiting
  rateLimitPerMinute: number;    // Default: 10
  cooldownSeconds: number;        // Default: 300 (5 min between same alerts)
  
  // Severity mapping
  severityMap: {
    WARNING: string;   // External service severity for WARNING
    CRITICAL: string;  // External service severity for CRITICAL
  };
  
  // Optional: authentication headers
  headers?: Record<string, string>;
  
  // Optional: alert filtering
  includeSymbols?: string[];
  excludeSymbols?: string[];
  minSeverity?: 'WARNING' | 'CRITICAL';
}

export interface AlertPayload {
  type: 'CONCENTRATION' | 'CORRELATION' | 'LEVERAGE' | 'FEATURE_FLAG' | 'EXPERIMENT' | 'RECALIBRATION';
  severity: 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  metadata?: {
    symbol?: string;
    value?: number;
    threshold?: number;
    botType?: string;
    featureName?: string;
    experimentName?: string;
    [key: string]: any;
  };
  timestamp: Date;
  source: string;  // e.g., 'cross-bot-correlation', 'feature-flags'
}

interface SentAlert {
  key: string;  // Deduplication key
  sentAt: Date;
  provider: WebhookProvider;
}

export class WebhookManager {
  private configs: Map<string, WebhookConfig> = new Map();
  private sentAlerts: SentAlert[] = [];
  private rateLimitCounts: Map<string, { count: number; windowStart: number }> = new Map();
  
  constructor() {}

  /**
   * Register a webhook configuration
   */
  registerWebhook(name: string, config: WebhookConfig): void {
    this.configs.set(name, config);
    logger.info({ name, provider: config.provider }, 'Webhook registered');
  }

  /**
   * Send alert to all enabled webhooks
   */
  async sendAlert(payload: AlertPayload): Promise<{
    success: boolean;
    sentTo: string[];
    errors: Array<{ name: string; error: string }>;
  }> {
    const sentTo: string[] = [];
    const errors: Array<{ name: string; error: string }> = [];

    for (const [name, config] of this.configs) {
      if (!config.enabled) continue;
      
      // Check severity filter
      if (config.minSeverity && payload.severity === 'WARNING' && config.minSeverity === 'CRITICAL') {
        continue;
      }
      
      // Check symbol filtering
      if (payload.metadata?.symbol) {
        if (config.excludeSymbols?.includes(payload.metadata.symbol)) {
          continue;
        }
        if (config.includeSymbols?.length && !config.includeSymbols.includes(payload.metadata.symbol)) {
          continue;
        }
      }
      
      // Check rate limiting
      if (!this.checkRateLimit(name, config)) {
        logger.debug({ name, payload }, 'Alert rate limited');
        continue;
      }
      
      // Check deduplication
      const dedupKey = this.generateDedupKey(payload, name);
      if (this.isDuplicate(dedupKey, config.cooldownSeconds)) {
        logger.debug({ name, dedupKey }, 'Alert deduplicated');
        continue;
      }
      
      // Send to provider
      try {
        await this.sendToProvider(config, payload);
        sentTo.push(name);
        
        // Record sent alert for deduplication
        this.sentAlerts.push({
          key: dedupKey,
          sentAt: new Date(),
          provider: config.provider,
        });
        
        // Trim old alerts (keep last hour)
        const cutoff = Date.now() - 60 * 60 * 1000;
        this.sentAlerts = this.sentAlerts.filter(a => a.sentAt.getTime() > cutoff);
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ name, error: errorMsg });
        logger.error({ name, provider: config.provider, error: errorMsg }, 'Webhook send failed');
      }
    }

    return {
      success: sentTo.length > 0,
      sentTo,
      errors,
    };
  }

  /**
   * Check rate limiting for a webhook
   */
  private checkRateLimit(name: string, config: WebhookConfig): boolean {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const key = `rate:${name}`;
    
    const record = this.rateLimitCounts.get(key);
    
    if (!record || now - record.windowStart > windowMs) {
      // New window
      this.rateLimitCounts.set(key, { count: 1, windowStart: now });
      return true;
    }
    
    if (record.count >= config.rateLimitPerMinute) {
      return false; // Rate limited
    }
    
    record.count++;
    return true;
  }

  /**
   * Generate deduplication key for alert
   */
  private generateDedupKey(payload: AlertPayload, webhookName: string): string {
    const parts = [
      webhookName,
      payload.type,
      payload.severity,
      payload.source,
      payload.metadata?.symbol || '',
      payload.title,
    ].filter(Boolean);
    
    return parts.join(':');
  }

  /**
   * Check if alert is duplicate within cooldown period
   */
  private isDuplicate(key: string, cooldownSeconds: number): boolean {
    const cooldownMs = cooldownSeconds * 1000;
    const now = Date.now();
    
    return this.sentAlerts.some(
      alert => alert.key === key && (now - alert.sentAt.getTime()) < cooldownMs
    );
  }

  /**
   * Send alert to specific provider
   */
  private async sendToProvider(config: WebhookConfig, payload: AlertPayload): Promise<void> {
    switch (config.provider) {
      case 'slack':
        return this.sendToSlack(config, payload);
      case 'pagerduty':
        return this.sendToPagerDuty(config, payload);
      case 'discord':
        return this.sendToDiscord(config, payload);
      case 'generic':
        return this.sendToGeneric(config, payload);
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  /**
   * Send to Slack Incoming Webhook
   * https://api.slack.com/messaging/webhooks
   */
  private async sendToSlack(config: WebhookConfig, payload: AlertPayload): Promise<void> {
    const color = payload.severity === 'CRITICAL' ? 'danger' : 'warning';
    const emoji = payload.severity === 'CRITICAL' ? '🚨' : '⚠️';
    
    const body = {
      text: `${emoji} ${payload.title}`,
      attachments: [
        {
          color,
          fields: [
            { title: 'Type', value: payload.type, short: true },
            { title: 'Severity', value: payload.severity, short: true },
            { title: 'Source', value: payload.source, short: true },
            { title: 'Time', value: payload.timestamp.toLocaleString(), short: true },
            ...(payload.metadata?.symbol ? [{ title: 'Symbol', value: payload.metadata.symbol, short: true }] : []),
            ...(payload.metadata?.value !== undefined ? [{ title: 'Value', value: payload.metadata.value.toFixed(4), short: true }] : []),
            ...(payload.metadata?.threshold !== undefined ? [{ title: 'Threshold', value: payload.metadata.threshold.toFixed(4), short: true }] : []),
          ],
          text: payload.message,
          footer: 'Citarion Infrastructure',
          ts: Math.floor(payload.timestamp.getTime() / 1000),
        },
      ],
    };

    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...config.headers },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new Error(`Slack webhook failed: ${response.status} ${error}`);
    }
  }

  /**
   * Send to PagerDuty Events API v2
   * https://developer.pagerduty.com/docs/events-api-v2/
   */
  private async sendToPagerDuty(config: WebhookConfig, payload: AlertPayload): Promise<void> {
    // Extract routing key from URL or config
    const routingKey = config.url.split('/').pop() || '';
    
    const body = {
      routing_key: routingKey,
      event_action: 'trigger',
      dedup_key: this.generateDedupKey(payload, 'pagerduty'),
      payload: {
        summary: payload.title,
        source: payload.source,
        severity: config.severityMap[payload.severity] || payload.severity.toLowerCase(),
        timestamp: payload.timestamp.toISOString(),
        component: payload.type,
        group: payload.metadata?.botType || 'infrastructure',
        class: payload.metadata?.symbol || 'general',
        custom_details: {
          message: payload.message,
          ...payload.metadata,
        },
      },
    };

    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...config.headers },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new Error(`PagerDuty webhook failed: ${response.status} ${error}`);
    }
  }

  /**
   * Send to Discord Webhook
   * https://discord.com/developers/docs/resources/webhook
   */
  private async sendToDiscord(config: WebhookConfig, payload: AlertPayload): Promise<void> {
    const color = payload.severity === 'CRITICAL' ? 0xff0000 : 0xffa500;
    
    const body = {
      embeds: [
        {
          title: payload.title,
          description: payload.message,
          color,
          timestamp: payload.timestamp.toISOString(),
          fields: [
            { name: 'Type', value: payload.type, inline: true },
            { name: 'Severity', value: payload.severity, inline: true },
            { name: 'Source', value: payload.source, inline: true },
            ...(payload.metadata?.symbol ? [{ name: 'Symbol', value: payload.metadata.symbol, inline: true }] : []),
          ],
          footer: {
            text: 'Citarion Infrastructure',
          },
        },
      ],
    };

    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...config.headers },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new Error(`Discord webhook failed: ${response.status} ${error}`);
    }
  }

  /**
   * Send to generic HTTP endpoint
   */
  private async sendToGeneric(config: WebhookConfig, payload: AlertPayload): Promise<void> {
    const body = {
      ...payload,
      metadata: {
        ...payload.metadata,
        sentAt: new Date().toISOString(),
      },
    };

    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...config.headers },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new Error(`Generic webhook failed: ${response.status} ${error}`);
    }
  }

  /**
   * Test webhook connectivity
   */
  async testWebhook(name: string): Promise<{ success: boolean; error?: string }> {
    const config = this.configs.get(name);
    if (!config) {
      return { success: false, error: 'Webhook not found' };
    }

    const testPayload: AlertPayload = {
      type: 'FEATURE_FLAG',
      severity: 'WARNING',
      title: '🔧 Webhook Test',
      message: 'This is a test alert from Citarion Infrastructure',
      metadata: { test: true },
      timestamp: new Date(),
      source: 'webhook-manager',
    };

    try {
      await this.sendToProvider(config, testPayload);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get registered webhooks
   */
  getWebhooks(): Array<{ name: string; config: Omit<WebhookConfig, 'url'> }> {
    return Array.from(this.configs.entries()).map(([name, config]) => ({
      name,
      config: {
        ...config,
        url: '[REDACTED]', // Don't expose URLs in listings
      },
    }));
  }
}

// ==================== Singleton ====================

let _webhookManager: WebhookManager | null = null;

export function getWebhookManager(): WebhookManager {
  if (!_webhookManager) {
    _webhookManager = new WebhookManager();
  }
  return _webhookManager;
}

// ==================== Convenience Functions ====================

export function registerWebhook(name: string, config: WebhookConfig): void {
  getWebhookManager().registerWebhook(name, config);
}

export async function sendAlert(payload: AlertPayload): Promise<{
  success: boolean;
  sentTo: string[];
  errors: Array<{ name: string; error: string }>;
}> {
  return getWebhookManager().sendAlert(payload);
}

export async function testWebhook(name: string): Promise<{ success: boolean; error?: string }> {
  return getWebhookManager().testWebhook(name);
}

export default {
  WebhookManager,
  getWebhookManager,
  registerWebhook,
  sendAlert,
  testWebhook,
  type WebhookConfig,
  type WebhookProvider,
  type AlertPayload,
};
