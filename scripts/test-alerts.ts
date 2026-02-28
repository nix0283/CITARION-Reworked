#!/usr/bin/env node
/**
 * Test Alert Notifications Script
 * 
 * Usage:
 *   bun run scripts/test-alerts.ts
 *   bun run scripts/test-alerts.ts --channel telegram
 *   bun run scripts/test-alerts.ts --channel slack --severity critical
 * 
 * Environment variables required:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_ALERT_CHAT_ID (for Telegram)
 *   SLACK_WEBHOOK_URL (for Slack)
 */

import { AlertNotifier } from '../src/lib/alerts/notifier';
import { logger } from '../src/lib/logger';

// Parse command line arguments
const args = process.argv.slice(2);
const channelArg = args.find(a => a.startsWith('--channel='))?.split('=')[1];
const severityArg = args.find(a => a.startsWith('--severity='))?.split('=')[1] || 'warning';

const channels: Array<'telegram' | 'slack' | 'email'> = channelArg 
  ? [channelArg as any] 
  : ['telegram', 'slack', 'email'];

// Create test alerts
const testAlerts = [
  {
    status: 'firing' as const,
    labels: {
      alertname: 'TestAlert',
      severity: severityArg,
      service: 'citarion-test',
      instance: 'test-instance',
      environment: process.env.NODE_ENV || 'development',
    },
    annotations: {
      summary: '🧪 Test Alert Notification',
      description: `This is a test alert to verify ${channels.join(', ')} notification configuration.`,
      runbook_url: 'https://docs.citarion.app/runbooks/test-alert',
    },
    startsAt: new Date().toISOString(),
    fingerprint: `test-${Date.now()}`,
  },
];

async function main() {
  console.log('🚀 Testing alert notifications...\n');
  
  const config = {
    // Telegram
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_ALERT_CHAT_ID,
    telegramParseMode: 'MarkdownV2' as const,
    
    // Slack
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    slackChannel: process.env.SLACK_ALERT_CHANNEL,
    
    // Email
    emailSmtpHost: process.env.ALERT_EMAIL_SMTP_HOST,
    emailSmtpPort: parseInt(process.env.ALERT_EMAIL_SMTP_PORT || '587'),
    emailSmtpUser: process.env.ALERT_EMAIL_SMTP_USER,
    emailSmtpPass: process.env.ALERT_EMAIL_SMTP_PASS,
    emailFrom: process.env.ALERT_EMAIL_FROM,
    emailTo: process.env.ALERT_EMAIL_TO,
    
    // General
    environment: process.env.NODE_ENV,
    grafanaUrl: process.env.GRAFANA_URL,
  };

  // Check which channels are configured
  const availableChannels = channels.filter(c => {
    switch (c) {
      case 'telegram': return config.telegramBotToken && config.telegramChatId;
      case 'slack': return config.slackWebhookUrl;
      case 'email': return config.emailSmtpHost && config.emailTo;
      default: return false;
    }
  });

  if (availableChannels.length === 0) {
    console.log('❌ No notification channels configured.');
    console.log('\nSet environment variables:');
    console.log('  Telegram: TELEGRAM_BOT_TOKEN, TELEGRAM_ALERT_CHAT_ID');
    console.log('  Slack: SLACK_WEBHOOK_URL');
    console.log('  Email: ALERT_EMAIL_SMTP_HOST, ALERT_EMAIL_TO');
    process.exit(1);
  }

  console.log(`📡 Sending test alert to: ${availableChannels.join(', ')}\n`);
  
  const notifier = new AlertNotifier(config);
  const results = await notifier.sendAlert(testAlerts, availableChannels);
  
  console.log('\n📊 Results:');
  for (const [channel, success] of Object.entries(results)) {
    const emoji = success ? '✅' : '❌';
    console.log(`  ${emoji} ${channel}: ${success ? 'Sent' : 'Failed'}`);
  }
  
  // Summary
  const allSuccess = Object.values(results).every(r => r === true);
  if (allSuccess) {
    console.log('\n🎉 All notifications sent successfully!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some notifications failed. Check logs for details.');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    logger.error(error, 'Test script failed');
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export { main, testAlerts };
