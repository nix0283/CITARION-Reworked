/**
 * Alertmanager Webhook Receiver
 * 
 * POST /api/alerts/webhook
 * 
 * Receives alerts from Prometheus Alertmanager and forwards them to:
 * - Telegram
 * - Slack
 * - Email (optional)
 * 
 * Security:
 * - Verify webhook signature if configured
 * - Rate limit incoming alerts
 * - Log all received alerts for audit
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { handleAlertmanagerWebhook, type NotificationConfig } from '@/lib/alerts/notifier';

// Rate limiting for webhook (prevent abuse)
const WEBHOOK_RATE_LIMIT = {
  maxRequests: 100,
  windowMs: 60_000, // 1 minute
};

const requestTracker = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - WEBHOOK_RATE_LIMIT.windowMs;
  
  const requests = requestTracker.get(ip) || [];
  const recentRequests = requests.filter(t => t > windowStart);
  
  if (recentRequests.length >= WEBHOOK_RATE_LIMIT.maxRequests) {
    return false;
  }
  
  recentRequests.push(now);
  requestTracker.set(ip, recentRequests);
  return true;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  
  try {
    // Rate limiting
    if (!checkRateLimit(ip)) {
      logger.warn({ ip }, 'Alert webhook rate limit exceeded');
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Optional: Verify webhook signature
    const signature = request.headers.get('x-alertmanager-signature');
    const expectedSignature = process.env.ALERTMANAGER_WEBHOOK_SECRET 
      ? require('crypto').createHmac('sha256', process.env.ALERTMANAGER_WEBHOOK_SECRET)
          .update(await request.clone().text())
          .digest('hex')
      : null;
    
    if (process.env.ALERTMANAGER_WEBHOOK_SECRET && signature !== expectedSignature) {
      logger.warn({ ip, signature }, 'Alert webhook signature mismatch');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Build notification config from environment
    const config: NotificationConfig = {
      // Telegram
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.TELEGRAM_ALERT_CHAT_ID,
      telegramParseMode: 'MarkdownV2',
      
      // Slack
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
      slackChannel: process.env.SLACK_ALERT_CHANNEL,
      slackUsername: 'CITARION Alerts',
      slackIconEmoji: ':robot_face:',
      
      // Email
      emailSmtpHost: process.env.ALERT_EMAIL_SMTP_HOST,
      emailSmtpPort: parseInt(process.env.ALERT_EMAIL_SMTP_PORT || '587'),
      emailSmtpUser: process.env.ALERT_EMAIL_SMTP_USER,
      emailSmtpPass: process.env.ALERT_EMAIL_SMTP_PASS,
      emailFrom: process.env.ALERT_EMAIL_FROM || 'alerts@citarion.app',
      emailTo: process.env.ALERT_EMAIL_TO,
      
      // General
      environment: process.env.NODE_ENV,
      grafanaUrl: process.env.GRAFANA_URL,
    };

    // Process the alert
    const response = await handleAlertmanagerWebhook(request, config);
    
    const duration = Date.now() - startTime;
    logger.info({ ip, duration, status: response.status }, 'Alert webhook processed');
    
    return response;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(error, 'Alert webhook error', { ip, duration });
    
    return NextResponse.json(
      { error: 'Failed to process alert', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Health check for the webhook endpoint
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/alerts/webhook',
    configured: {
      telegram: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_ALERT_CHAT_ID,
      slack: !!process.env.SLACK_WEBHOOK_URL,
      email: !!process.env.ALERT_EMAIL_SMTP_HOST && !!process.env.ALERT_EMAIL_TO,
    },
  });
}
