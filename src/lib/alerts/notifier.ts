/**
 * Alert Notification Service for CITARION
 * 
 * Sends alert notifications to:
 * - Telegram (via Bot API)
 * - Slack (via Incoming Webhooks)
 * - Email (via SMTP)
 * 
 * Can be used standalone or integrated with Alertmanager webhook receiver
 */

import { logger } from './logger';

// ==================== TYPES ====================

export interface Alert {
  status: 'firing' | 'resolved';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt?: string;
  generatorURL?: string;
  fingerprint: string;
}

export interface AlertGroup {
  status: 'firing' | 'resolved';
  alerts: Alert[];
  groupLabels: Record<string, string>;
  commonLabels: Record<string, string>;
  commonAnnotations: Record<string, string>;
  externalURL: string;
  version: string;
  groupKey: string;
  truncatedAlerts: number;
}

export interface NotificationConfig {
  // Telegram
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramParseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  
  // Slack
  slackWebhookUrl?: string;
  slackChannel?: string;
  slackUsername?: string;
  slackIconEmoji?: string;
  
  // Email
  emailSmtpHost?: string;
  emailSmtpPort?: number;
  emailSmtpUser?: string;
  emailSmtpPass?: string;
  emailFrom?: string;
  emailTo?: string;
  
  // General
  environment?: string;
  grafanaUrl?: string;
}

// ==================== TELEGRAM NOTIFIER ====================

export class TelegramNotifier {
  private botToken: string;
  private chatId: string;
  private parseMode: 'Markdown' | 'MarkdownV2' | 'HTML';
  private baseUrl = 'https://api.telegram.org/bot';

  constructor(config: { botToken: string; chatId: string; parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML' }) {
    this.botToken = config.botToken;
    this.chatId = config.chatId;
    this.parseMode = config.parseMode || 'MarkdownV2';
  }

  /**
   * Send alert notification to Telegram
   */
  async sendAlert(alerts: Alert[], config: NotificationConfig): Promise<boolean> {
    try {
      const message = this.formatTelegramMessage(alerts, config);
      
      const response = await fetch(`${this.baseUrl}${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: this.parseMode,
          disable_web_page_preview: true,
        }),
      });

      const data = await response.json();
      
      if (!data.ok) {
        logger.error({ error: data, alerts }, 'Telegram notification failed');
        return false;
      }

      logger.info({ chatId: this.chatId, alertCount: alerts.length }, 'Telegram alert sent');
      return true;
    } catch (error) {
      logger.error(error, 'Telegram notification error');
      return false;
    }
  }

  /**
   * Format alert for Telegram message
   */
  private formatTelegramMessage(alerts: Alert[], config: NotificationConfig): string {
    const isCritical = alerts.some(a => a.labels.severity === 'critical');
    const emoji = isCritical ? '🔴' : alerts.some(a => a.labels.severity === 'warning') ? '🟡' : '🔵';
    
    const alertName = alerts[0]?.commonLabels?.alertname || alerts[0]?.labels?.alertname || 'Unknown Alert';
    
    let message = `*${emoji} ${alertName}*\n\n`;
    
    // Add common labels
    const commonLabels = alerts[0]?.commonLabels || {};
    if (commonLabels.severity) {
      message += `*Severity:* \\_${commonLabels.severity}\\_\n`;
    }
    if (commonLabels.service) {
      message += `*Service:* \\`${commonLabels.service}\\`\n`;
    }
    if (commonLabels.instance) {
      message += `*Instance:* \\`${commonLabels.instance}\\`\n`;
    }
    
    message += '\n';
    
    // Add individual alert details
    alerts.forEach((alert, index) => {
      if (alerts.length > 1) {
        message += `\\*${index + 1}\\*\\. `;
      }
      
      const summary = alert.annotations?.summary || alert.annotations?.description || 'No description';
      message += `${this.escapeMarkdownV2(summary)}\n`;
      
      if (alert.annotations?.runbook_url) {
        message += `[View Runbook]\\(${alert.annotations.runbook_url}\\)\n`;
      }
    });
    
    // Add footer
    const env = config.environment || 'unknown';
    const grafanaUrl = config.grafanaUrl;
    
    message += `\n_Environment: ${env}_`;
    
    if (grafanaUrl) {
      message += ` | [Dashboard]\\(${grafanaUrl}\\)`;
    }
    
    message += `\n_Triggered: ${new Date(alerts[0]?.startsAt).toLocaleString()}_`;
    
    return message;
  }

  /**
   * Escape text for Telegram MarkdownV2
   */
  private escapeMarkdownV2(text: string): string {
    const escapeChars = /([_*\[\]()~`>#+\-=|{}.!])/g;
    return text.replace(escapeChars, '\\$1');
  }
}

// ==================== SLACK NOTIFIER ====================

export class SlackNotifier {
  private webhookUrl: string;
  private channel?: string;
  private username: string;
  private iconEmoji: string;

  constructor(config: { webhookUrl: string; channel?: string; username?: string; iconEmoji?: string }) {
    this.webhookUrl = config.webhookUrl;
    this.channel = config.channel;
    this.username = config.username || 'CITARION Alerts';
    this.iconEmoji = config.iconEmoji || ':robot_face:';
  }

  /**
   * Send alert notification to Slack
   */
  async sendAlert(alerts: Alert[], config: NotificationConfig): Promise<boolean> {
    try {
      const payload = this.formatSlackPayload(alerts, config);
      
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ error, status: response.status }, 'Slack notification failed');
        return false;
      }

      logger.info({ channel: this.channel, alertCount: alerts.length }, 'Slack alert sent');
      return true;
    } catch (error) {
      logger.error(error, 'Slack notification error');
      return false;
    }
  }

  /**
   * Format alert for Slack message
   */
  private formatSlackPayload(alerts: Alert[], config: NotificationConfig): Record<string, any> {
    const isCritical = alerts.some(a => a.labels.severity === 'critical');
    const color = isCritical ? 'danger' : alerts.some(a => a.labels.severity === 'warning') ? 'warning' : '#36a64f';
    
    const alertName = alerts[0]?.commonLabels?.alertname || alerts[0]?.labels?.alertname || 'Unknown Alert';
    
    const fields: Array<{ title: string; value: string; short: boolean }> = [];
    
    const commonLabels = alerts[0]?.commonLabels || {};
    if (commonLabels.severity) {
      fields.push({ title: 'Severity', value: commonLabels.severity.toUpperCase(), short: true });
    }
    if (commonLabels.service) {
      fields.push({ title: 'Service', value: commonLabels.service, short: true });
    }
    if (commonLabels.instance) {
      fields.push({ title: 'Instance', value: `\`${commonLabels.instance}\``, short: true });
    }
    if (commonLabels.exchange) {
      fields.push({ title: 'Exchange', value: commonLabels.exchange, short: true });
    }
    if (commonLabels.symbol) {
      fields.push({ title: 'Symbol', value: commonLabels.symbol, short: true });
    }

    const blocks: Array<Record<string, any>> = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${isCritical ? '🔴' : '🟡'} ${alertName}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: fields.length > 0 ? fields : undefined,
      },
    ];

    // Add alert descriptions
    alerts.forEach((alert, index) => {
      const description = alert.annotations?.description || alert.annotations?.summary || 'No description';
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: alerts.length > 1 ? `*Alert ${index + 1}:* ${description}` : description,
        },
      });

      if (alert.annotations?.runbook_url) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `<${alert.annotations.runbook_url}|📖 View Runbook>`,
            },
          ],
        });
      }
    });

    // Add action buttons
    const actions: Array<Record<string, any>> = [];
    
    if (config.grafanaUrl) {
      actions.push({
        type: 'button',
        text: { type: 'plain_text', text: '📊 View Dashboard', emoji: true },
        url: config.grafanaUrl,
        action_id: 'view_dashboard',
      });
    }

    if (actions.length > 0) {
      blocks.push({
        type: 'actions',
        elements: actions,
      });
    }

    // Add footer
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Environment: \`${config.environment || 'unknown'}\` | Triggered: <!date^${Math.floor(new Date(alerts[0]?.startsAt).getTime() / 1000)}^{date} {time}|${alerts[0]?.startsAt}>`,
        },
      ],
    });

    return {
      channel: this.channel,
      username: this.username,
      icon_emoji: this.iconEmoji,
      attachments: [
        {
          color,
          blocks,
        },
      ],
    };
  }
}

// ==================== EMAIL NOTIFIER ====================

export class EmailNotifier {
  private config: {
    smtpHost: string;
    smtpPort: number;
    smtpUser?: string;
    smtpPass?: string;
    from: string;
    to: string;
  };

  constructor(config: {
    smtpHost: string;
    smtpPort: number;
    smtpUser?: string;
    smtpPass?: string;
    from: string;
    to: string;
  }) {
    this.config = config;
  }

  /**
   * Send alert notification via email
   * Note: For production, use a proper email library like nodemailer
   */
  async sendAlert(alerts: Alert[], config: NotificationConfig): Promise<boolean> {
    try {
      // This is a simplified implementation
      // For production, integrate with nodemailer or similar
      
      const subject = this.formatEmailSubject(alerts, config);
      const html = this.formatEmailHtml(alerts, config);
      
      // Placeholder for actual email sending
      // In production, use:
      // const transporter = nodemailer.createTransport({...});
      // await transporter.sendMail({ from, to, subject, html });
      
      logger.info({ to: this.config.to, subject, alertCount: alerts.length }, 'Email alert prepared');
      
      // For now, just log the email content
      logger.debug({ html }, 'Email content');
      
      return true;
    } catch (error) {
      logger.error(error, 'Email notification error');
      return false;
    }
  }

  private formatEmailSubject(alerts: Alert[], config: NotificationConfig): string {
    const isCritical = alerts.some(a => a.labels.severity === 'critical');
    const prefix = isCritical ? '🔴 [CRITICAL]' : '⚠️ [WARNING]';
    const alertName = alerts[0]?.commonLabels?.alertname || 'Alert';
    const service = alerts[0]?.commonLabels?.service || '';
    
    return `${prefix} ${alertName} - ${service}`;
  }

  private formatEmailHtml(alerts: Alert[], config: NotificationConfig): string {
    const isCritical = alerts.some(a => a.labels.severity === 'critical');
    const color = isCritical ? '#dc3545' : '#ffc107';
    
    const alertName = alerts[0]?.commonLabels?.alertname || 'Unknown Alert';
    const commonLabels = alerts[0]?.commonLabels || {};
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .header { background: ${color}; color: white; padding: 16px; border-radius: 4px 4px 0 0; }
          .content { padding: 16px; border: 1px solid #ddd; border-radius: 0 0 4px 4px; }
          .label { font-weight: 600; color: #666; }
          .value { font-family: monospace; background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
          .alert { margin: 12px 0; padding: 12px; background: #f8f9fa; border-left: 4px solid ${color}; border-radius: 0 4px 4px 0; }
          .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
          .button { display: inline-block; padding: 8px 16px; background: ${color}; color: white; text-decoration: none; border-radius: 4px; margin: 4px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="margin: 0;">${isCritical ? '🔴' : '⚠️'} ${alertName}</h2>
        </div>
        <div class="content">
    `;

    // Common labels
    html += '<p>';
    if (commonLabels.severity) {
      html += `<span class="label">Severity:</span> <span class="value">${commonLabels.severity.toUpperCase()}</span> `;
    }
    if (commonLabels.service) {
      html += `<span class="label">Service:</span> <span class="value">${commonLabels.service}</span> `;
    }
    if (commonLabels.instance) {
      html += `<span class="label">Instance:</span> <span class="value">${commonLabels.instance}</span>`;
    }
    html += '</p>';

    // Alert details
    alerts.forEach((alert, index) => {
      html += `<div class="alert">`;
      if (alerts.length > 1) {
        html += `<strong>Alert ${index + 1}:</strong><br>`;
      }
      
      const description = alert.annotations?.description || alert.annotations?.summary || 'No description';
      html += `<p>${description}</p>`;
      
      if (alert.annotations?.runbook_url) {
        html += `<a href="${alert.annotations.runbook_url}" class="button">📖 View Runbook</a>`;
      }
      html += `</div>`;
    });

    // Footer
    const env = config.environment || 'unknown';
    const grafanaUrl = config.grafanaUrl;
    
    html += `
      <div class="footer">
        <p>
          <strong>Environment:</strong> ${env}<br>
          <strong>Triggered:</strong> ${new Date(alerts[0]?.startsAt).toLocaleString()}<br>
          ${grafanaUrl ? `<a href="${grafanaUrl}" class="button">📊 View Dashboard</a>` : ''}
        </p>
      </div>
    </body>
    </html>
    `;

    return html;
  }
}

// ==================== MAIN NOTIFIER ====================

export class AlertNotifier {
  private telegram?: TelegramNotifier;
  private slack?: SlackNotifier;
  private email?: EmailNotifier;

  constructor(config: NotificationConfig) {
    if (config.telegramBotToken && config.telegramChatId) {
      this.telegram = new TelegramNotifier({
        botToken: config.telegramBotToken,
        chatId: config.telegramChatId,
        parseMode: config.telegramParseMode,
      });
    }
    
    if (config.slackWebhookUrl) {
      this.slack = new SlackNotifier({
        webhookUrl: config.slackWebhookUrl,
        channel: config.slackChannel,
        username: config.slackUsername,
        iconEmoji: config.slackIconEmoji,
      });
    }
    
    if (config.emailSmtpHost && config.emailTo) {
      this.email = new EmailNotifier({
        smtpHost: config.emailSmtpHost,
        smtpPort: config.emailSmtpPort || 587,
        smtpUser: config.emailSmtpUser,
        smtpPass: config.emailSmtpPass,
        from: config.emailFrom || 'alerts@citarion.app',
        to: config.emailTo,
      });
    }
  }

  /**
   * Send alert to all configured channels
   */
  async sendAlert(alerts: Alert[], channels?: Array<'telegram' | 'slack' | 'email'>): Promise<{
    telegram?: boolean;
    slack?: boolean;
    email?: boolean;
  }> {
    const results: Record<string, boolean> = {};
    const targets = channels || ['telegram', 'slack', 'email'].filter(c => this[c as keyof this]);

    for (const channel of targets) {
      try {
        switch (channel) {
          case 'telegram':
            if (this.telegram) {
              results.telegram = await this.telegram.sendAlert(alerts, { environment: process.env.NODE_ENV });
            }
            break;
          case 'slack':
            if (this.slack) {
              results.slack = await this.slack.sendAlert(alerts, { environment: process.env.NODE_ENV });
            }
            break;
          case 'email':
            if (this.email) {
              results.email = await this.email.sendAlert(alerts, { environment: process.env.NODE_ENV });
            }
            break;
        }
      } catch (error) {
        logger.error({ channel, error }, `Failed to send alert to ${channel}`);
        results[channel] = false;
      }
    }

    return results;
  }

  /**
   * Send test notification to verify configuration
   */
  async sendTest(channels?: Array<'telegram' | 'slack' | 'email'>): Promise<{
    [key: string]: { success: boolean; message?: string };
  }> {
    const testAlert: Alert = {
      status: 'firing',
      labels: {
        alertname: 'TestAlert',
        severity: 'info',
        service: 'citarion',
        instance: 'test',
      },
      annotations: {
        summary: 'This is a test alert',
        description: 'If you receive this, your alert notification configuration is working correctly.',
      },
      startsAt: new Date().toISOString(),
      fingerprint: `test-${Date.now()}`,
    };

    const results: Record<string, { success: boolean; message?: string }> = {};
    const targets = channels || ['telegram', 'slack', 'email'].filter(c => this[c as keyof this]);

    for (const channel of targets) {
      try {
        switch (channel) {
          case 'telegram':
            if (this.telegram) {
              const success = await this.telegram.sendAlert([testAlert], {});
              results.telegram = { success, message: success ? 'Test sent' : 'Failed to send' };
            }
            break;
          case 'slack':
            if (this.slack) {
              const success = await this.slack.sendAlert([testAlert], {});
              results.slack = { success, message: success ? 'Test sent' : 'Failed to send' };
            }
            break;
          case 'email':
            if (this.email) {
              const success = await this.email.sendAlert([testAlert], {});
              results.email = { success, message: success ? 'Test prepared' : 'Failed to prepare' };
            }
            break;
        }
      } catch (error) {
        results[channel] = { 
          success: false, 
          message: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    }

    return results;
  }
}

// ==================== WEBHOOK RECEIVER FOR ALERTMANAGER ====================

/**
 * Express/Next.js handler for Alertmanager webhook
 * 
 * Usage in Next.js API route:
 * ```typescript
 * import { handleAlertmanagerWebhook } from '@/lib/alerts';
 * 
 * export async function POST(request: NextRequest) {
 *   return handleAlertmanagerWebhook(request, {
 *     telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
 *     telegramChatId: process.env.TELEGRAM_ALERT_CHAT_ID,
 *     slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
 *     environment: process.env.NODE_ENV,
 *     grafanaUrl: process.env.GRAFANA_URL,
 *   });
 * }
 * ```
 */
export async function handleAlertmanagerWebhook(
  request: Request,
  config: NotificationConfig
): Promise<Response> {
  try {
    const body: AlertGroup = await request.json();
    
    // Filter to only firing alerts (optional)
    const firingAlerts = body.alerts.filter(a => a.status === 'firing');
    
    if (firingAlerts.length === 0) {
      return new Response(JSON.stringify({ status: 'ok', message: 'No firing alerts' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const notifier = new AlertNotifier(config);
    const results = await notifier.sendAlert(firingAlerts);

    // Log results
    logger.info({ results, alertCount: firingAlerts.length }, 'Alert notifications sent');

    return new Response(JSON.stringify({ status: 'ok', results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error(error, 'Alertmanager webhook error');
    
    return new Response(JSON.stringify({ status: 'error', error: 'Failed to process alert' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ==================== EXPORTS ====================

export { TelegramNotifier, SlackNotifier, EmailNotifier };

export default AlertNotifier;
