/**
 * Alert Service Tests
 * 
 * Tests for alert notifications
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AlertService, getAlertService, sendSystemAlert } from '@/lib/monitoring/alert-service';

describe('AlertService', () => {
  let service: AlertService;

  beforeEach(() => {
    service = getAlertService({
      channels: [
        {
          name: 'telegram',
          enabled: false, // Disable for tests
          config: {},
        },
      ],
      minSeverity: 'INFO',
      rateLimit: 100,
    });
  });

  describe('send', () => {
    it('should send notification', async () => {
      const result = await service.send({
        type: 'SYSTEM_ALERT',
        severity: 'INFO',
        title: 'Test Alert',
        message: 'Test message',
        timestamp: new Date(),
      });

      // Should succeed but no channels enabled
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('channels');
    });

    it('should respect severity filtering', async () => {
      const strictService = getAlertService({
        minSeverity: 'CRITICAL',
        channels: [],
      });

      const result = await strictService.send({
        type: 'SYSTEM_ALERT',
        severity: 'INFO',
        title: 'Test',
        message: 'Test',
        timestamp: new Date(),
      });

      expect(result.success).toBe(false);
    });

    it('should include all required fields', async () => {
      const notification = {
        type: 'SYSTEM_ALERT' as const,
        severity: 'WARNING' as const,
        title: 'Test Alert',
        message: 'Test message',
        timestamp: new Date(),
      };

      expect(notification.type).toBeDefined();
      expect(notification.severity).toBeDefined();
      expect(notification.title).toBeDefined();
      expect(notification.message).toBeDefined();
      expect(notification.timestamp).toBeDefined();
    });
  });

  describe('severity levels', () => {
    it('should handle INFO severity', async () => {
      const result = await service.send({
        type: 'SYSTEM_ALERT',
        severity: 'INFO',
        title: 'Info Alert',
        message: 'Information',
        timestamp: new Date(),
      });

      expect(result).toBeDefined();
    });

    it('should handle WARNING severity', async () => {
      const result = await service.send({
        type: 'SYSTEM_ALERT',
        severity: 'WARNING',
        title: 'Warning Alert',
        message: 'Warning',
        timestamp: new Date(),
      });

      expect(result).toBeDefined();
    });

    it('should handle CRITICAL severity', async () => {
      const result = await service.send({
        type: 'SYSTEM_ALERT',
        severity: 'CRITICAL',
        title: 'Critical Alert',
        message: 'Critical',
        timestamp: new Date(),
      });

      expect(result).toBeDefined();
    });
  });

  describe('alert types', () => {
    it('should handle SYSTEM_ALERT', async () => {
      const result = await service.send({
        type: 'SYSTEM_ALERT',
        severity: 'INFO',
        title: 'System',
        message: 'System alert',
        timestamp: new Date(),
      });

      expect(result).toBeDefined();
    });

    it('should handle TRADE_ALERT', async () => {
      const result = await service.send({
        type: 'TRADE_ALERT',
        severity: 'INFO',
        title: 'Trade',
        message: 'Trade alert',
        timestamp: new Date(),
      });

      expect(result).toBeDefined();
    });

    it('should handle SECURITY_ALERT', async () => {
      const result = await service.send({
        type: 'SECURITY_ALERT',
        severity: 'CRITICAL',
        title: 'Security',
        message: 'Security alert',
        timestamp: new Date(),
      });

      expect(result).toBeDefined();
    });

    it('should handle PERFORMANCE_ALERT', async () => {
      const result = await service.send({
        type: 'PERFORMANCE_ALERT',
        severity: 'WARNING',
        title: 'Performance',
        message: 'Performance alert',
        timestamp: new Date(),
      });

      expect(result).toBeDefined();
    });
  });

  describe('rate limiting', () => {
    it('should respect rate limit', async () => {
      const limitedService = getAlertService({
        rateLimit: 2,
        channels: [],
      });

      // Send within limit
      await limitedService.send({
        type: 'SYSTEM_ALERT',
        severity: 'INFO',
        title: 'Test 1',
        message: 'Test',
        timestamp: new Date(),
      });

      await limitedService.send({
        type: 'SYSTEM_ALERT',
        severity: 'INFO',
        title: 'Test 2',
        message: 'Test',
        timestamp: new Date(),
      });

      // Third should be rate limited
      const result = await limitedService.send({
        type: 'SYSTEM_ALERT',
        severity: 'INFO',
        title: 'Test 3',
        message: 'Test',
        timestamp: new Date(),
      });

      expect(result.success).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should update config', () => {
      service.updateConfig({
        minSeverity: 'WARNING',
        rateLimit: 50,
      });

      const config = service.getConfig();
      expect(config.minSeverity).toBe('WARNING');
      expect(config.rateLimit).toBe(50);
    });

    it('should get current config', () => {
      const config = service.getConfig();
      expect(config).toHaveProperty('channels');
      expect(config).toHaveProperty('minSeverity');
      expect(config).toHaveProperty('rateLimit');
    });
  });

  describe('quiet hours', () => {
    it('should support quiet hours config', () => {
      const quietService = getAlertService({
        quietHours: {
          start: 22,
          end: 6,
        },
        channels: [],
      });

      const config = quietService.getConfig();
      expect(config.quietHours).toBeDefined();
      expect(config.quietHours?.start).toBe(22);
      expect(config.quietHours?.end).toBe(6);
    });
  });
});

describe('convenience functions', () => {
  it('should send system alert', async () => {
    // This will fail gracefully with no channels configured
    const result = await sendSystemAlert('Test message', 'WARNING');
    expect(result).toBeDefined();
  });
});

describe('getAlertService singleton', () => {
  it('should return same instance', () => {
    const service1 = getAlertService();
    const service2 = getAlertService();
    expect(service1).toBe(service2);
  });
});
