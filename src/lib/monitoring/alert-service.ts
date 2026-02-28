/**
 * Alert Notification Service
 * 
 * Multi-channel alert notifications:
 * - Telegram
 * - Email
 * - Webhook
 * - Push notifications
 * 
 * @module lib/monitoring/alert-service
 */

import { logger } from '@/lib/logger';
import { notifyTelegram } from '@/lib/notification-service';

// ==================== TYPES ====================

export interface AlertNotification {
  type: 'SYSTEM_ALERT' | 'TRADE_ALERT' | 'SECURITY_ALERT' | 'PERFORMANCE_ALERT';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  data?: Record<string, any>;
  timestamp: Date;
}

export interface NotificationChannel {
  name: string;
  enabled: boolean;
  config: Record<string, any>;
}

export interface AlertServiceConfig {
  channels: NotificationChannel[];
  minSeverity: 'INFO' | 'WARNING' | 'CRITICAL';
  rateLimit: number; // Max notifications per minute
  quietHours?: {
    start: number; // Hour (0-23)
    end: number;
  };
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: AlertServiceConfig = {
  channels: [
    {
      name: 'telegram',
      enabled: true,
      config: {},
    },
  ],
  minSeverity: 'WARNING',
  rateLimit: 10,
  quietHours: undefined,
};

// ==================== ALERT SERVICE CLASS ====================

export class AlertService {
  private config: AlertServiceConfig;
  private notificationCount: Map<string, number>;
  private lastReset: Date;

  constructor(config?: Partial<AlertServiceConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.notificationCount = new Map();
    this.lastReset = new Date();
  }

  /**
   * Send alert notification
   */
  async send(notification: AlertNotification): Promise<{ success: boolean; channels: string[] }> {
    // Check severity
    if (!this.shouldSend(notification.severity)) {
      logger.debug({ severity: notification.severity }, 'Alert severity too low');
      return { success: false, channels: [] };
    }

    // Check quiet hours
    if (this.isQuietHours()) {
      logger.debug('In quiet hours, skipping notification');
      return { success: false, channels: [] };
    }

    // Check rate limit
    if (!this.checkRateLimit()) {
      logger.warn('Rate limit exceeded, skipping notification');
      return { success: false, channels: [] };
    }

    const sentChannels: string[] = [];

    // Send to each enabled channel
    for (const channel of this.config.channels) {
      if (!channel.enabled) continue;

      try {
        switch (channel.name) {
          case 'telegram':
            await this.sendToTelegram(notification);
            sentChannels.push('telegram');
            break;

          case 'email':
            await this.sendToEmail(notification);
            sentChannels.push('email');
            break;

          case 'webhook':
            await this.sendToWebhook(notification);
            sentChannels.push('webhook');
            break;

          default:
            logger.warn({ channel: channel.name }, 'Unknown notification channel');
        }
      } catch (error) {
        logger.error({ channel: channel.name, error }, 'Failed to send notification');
      }
    }

    // Update rate limit counter
    this.incrementRateLimit();

    logger.info({
      type: notification.type,
      severity: notification.severity,
      channels: sentChannels,
    }, 'Alert notification sent');

    return {
      success: sentChannels.length > 0,
      channels: sentChannels,
    };
  }

  /**
   * Send to Telegram
   */
  private async sendToTelegram(notification: AlertNotification): Promise<void> {
    const emoji = this.getSeverityEmoji(notification.severity);

    const message = `
${emoji} *${notification.title}*

${notification.message}

${this.formatData(notification.data)}

_Time: ${notification.timestamp.toISOString()}_
    `.trim();

    await notifyTelegram({
      type: notification.type,
      title: notification.title,
      message,
      parseMode: 'Markdown',
    });
  }

  /**
   * Send to Email (placeholder)
   */
  private async sendToEmail(notification: AlertNotification): Promise<void> {
    // In production, integrate with email service (SendGrid, SES, etc.)
    logger.info({ notification }, 'Email notification (placeholder)');
  }

  /**
   * Send to Webhook
   */
  private async sendToWebhook(notification: AlertNotification): Promise<void> {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;

    if (!webhookUrl) {
      logger.debug('No webhook URL configured');
      return;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notification),
      });

      if (!response.ok) {
        throw new Error(`Webhook responded with ${response.status}`);
      }

      logger.info('Webhook notification sent');
    } catch (error) {
      logger.error({ error }, 'Failed to send webhook notification');
      throw error;
    }
  }

  /**
   * Check if should send based on severity
   */
  private shouldSend(severity: AlertNotification['severity']): boolean {
    const severityOrder = { INFO: 0, WARNING: 1, CRITICAL: 2 };
    const minSeverityOrder = severityOrder[this.config.minSeverity];

    return severityOrder[severity] >= minSeverityOrder;
  }

  /**
   * Check if in quiet hours
   */
  private isQuietHours(): boolean {
    if (!this.config.quietHours) return false;

    const currentHour = new Date().getUTCHours();
    const { start, end } = this.config.quietHours;

    if (start > end) {
      // Spans midnight (e.g., 22:00 - 06:00)
      return currentHour >= start || currentHour < end;
    } else {
      return currentHour >= start && currentHour < end;
    }
  }

  /**
   * Check rate limit
   */
  private checkRateLimit(): boolean {
    // Reset counter every minute
    const now = new Date();
    if (now.getTime() - this.lastReset.getTime() > 60000) {
      this.notificationCount.clear();
      this.lastReset = now;
    }

    const total = Array.from(this.notificationCount.values()).reduce(
      (sum, count) => sum + count,
      0
    );

    return total < this.config.rateLimit;
  }

  /**
   * Increment rate limit counter
   */
  private incrementRateLimit(): void {
    const minute = new Date().getMinutes();
    const key = `minute-${minute}`;
    this.notificationCount.set(key, (this.notificationCount.get(key) || 0) + 1);
  }

  /**
   * Get severity emoji
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'INFO':
        return 'ℹ️';
      case 'WARNING':
        return '⚠️';
      case 'CRITICAL':
        return '🚨';
      default:
        return '📢';
    }
  }

  /**
   * Format data for message
   */
  private formatData(data?: Record<string, any>): string {
    if (!data || Object.keys(data).length === 0) return '';

    return Object.entries(data)
      .map(([key, value]) => `*${key}:* ${value}`)
      .join('\n');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AlertServiceConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): AlertServiceConfig {
    return { ...this.config };
  }
}

// ==================== SINGLETON ====================

let serviceInstance: AlertService | null = null;

export function getAlertService(config?: Partial<AlertServiceConfig>): AlertService {
  if (!serviceInstance) {
    serviceInstance = new AlertService(config);
  } else if (config) {
    serviceInstance.updateConfig(config);
  }
  return serviceInstance;
}

// ==================== CONVENIENCE FUNCTIONS ====================

/**
 * Send system alert
 */
export async function sendSystemAlert(
  message: string,
  severity: AlertNotification['severity'] = 'WARNING'
): Promise<void> {
  const service = getAlertService();

  await service.send({
    type: 'SYSTEM_ALERT',
    severity,
    title: 'System Alert',
    message,
    timestamp: new Date(),
  });
}

/**
 * Send trade alert
 */
export async function sendTradeAlert(
  message: string,
  data?: Record<string, any>
): Promise<void> {
  const service = getAlertService();

  await service.send({
    type: 'TRADE_ALERT',
    severity: 'INFO',
    title: 'Trade Alert',
    message,
    data,
    timestamp: new Date(),
  });
}

/**
 * Send security alert
 */
export async function sendSecurityAlert(
  message: string,
  severity: AlertNotification['severity'] = 'CRITICAL'
): Promise<void> {
  const service = getAlertService();

  await service.send({
    type: 'SECURITY_ALERT',
    severity,
    title: 'Security Alert',
    message,
    timestamp: new Date(),
  });
}

/**
 * Send performance alert
 */
export async function sendPerformanceAlert(
  message: string,
  data?: Record<string, any>
): Promise<void> {
  const service = getAlertService();

  await service.send({
    type: 'PERFORMANCE_ALERT',
    severity: 'WARNING',
    title: 'Performance Alert',
    message,
    data,
    timestamp: new Date(),
  });
}

// ==================== EXPORTS ====================

export default {
  AlertService,
  getAlertService,
  sendSystemAlert,
  sendTradeAlert,
  sendSecurityAlert,
  sendPerformanceAlert,
  DEFAULT_CONFIG,
};
