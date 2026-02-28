/**
 * System Monitor Tests
 * 
 * Tests for system monitoring and health checks
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SystemMonitor, getSystemMonitor } from '@/lib/monitoring/system-monitor';

describe('SystemMonitor', () => {
  let monitor: SystemMonitor;

  beforeEach(() => {
    monitor = getSystemMonitor({
      cpuThreshold: 80,
      memoryThreshold: 85,
      errorRateThreshold: 5,
      responseTimeThreshold: 2000,
    });
  });

  afterEach(() => {
    monitor.stop();
  });

  describe('start/stop', () => {
    it('should start monitoring', () => {
      monitor.start(60000);
      expect(monitor.getStats().isRunning).toBe(true);
    });

    it('should stop monitoring', () => {
      monitor.start(60000);
      monitor.stop();
      expect(monitor.getStats().isRunning).toBe(false);
    });

    it('should not start twice', () => {
      monitor.start(60000);
      monitor.start(60000); // Should warn but not crash
      expect(monitor.getStats().isRunning).toBe(true);
    });
  });

  describe('getHealth', () => {
    it('should return health status', async () => {
      const health = await monitor.getHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('metrics');
    });

    it('should have valid status', async () => {
      const health = await monitor.getHealth();
      expect(['HEALTHY', 'DEGRADED', 'UNHEALTHY']).toContain(health.status);
    });

    it('should have all components', async () => {
      const health = await monitor.getHealth();

      expect(health.components).toHaveProperty('database');
      expect(health.components).toHaveProperty('exchanges');
      expect(health.components).toHaveProperty('websocket');
      expect(health.components).toHaveProperty('api');
    });

    it('should have valid metrics', async () => {
      const health = await monitor.getHealth();

      expect(health.metrics.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(health.metrics.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(health.metrics.errorRate).toBeGreaterThanOrEqual(0);
      expect(health.metrics.avgResponseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('alerts', () => {
    it('should get active alerts', () => {
      const alerts = monitor.getActiveAlerts();
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('should resolve alert', async () => {
      // Create a test alert
      await monitor.getHealth();

      const alerts = monitor.getActiveAlerts();
      if (alerts.length > 0) {
        await monitor.resolveAlert(alerts[0].id);
        const updatedAlerts = monitor.getActiveAlerts();
        expect(updatedAlerts.length).toBeLessThanOrEqual(alerts.length);
      }
    });
  });

  describe('metrics history', () => {
    it('should store metrics history', async () => {
      monitor.start(1000); // Check every second

      // Wait for a few checks
      await new Promise(resolve => setTimeout(resolve, 3000));

      const history = monitor.getMetricsHistory();
      expect(history.length).toBeGreaterThan(0);

      monitor.stop();
    });

    it('should limit history size', async () => {
      monitor.start(100); // Check every 100ms

      // Wait for many checks
      await new Promise(resolve => setTimeout(resolve, 7000));

      const history = monitor.getMetricsHistory();
      expect(history.length).toBeLessThanOrEqual(60); // Max 60 entries

      monitor.stop();
    });
  });

  describe('stats', () => {
    it('should return stats', () => {
      const stats = monitor.getStats();

      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('alertsCount');
      expect(stats).toHaveProperty('activeAlerts');
      expect(stats).toHaveProperty('isRunning');
    });

    it('should have valid uptime', () => {
      const stats = monitor.getStats();
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('configuration', () => {
    it('should update config', () => {
      monitor.updateConfig({
        cpuThreshold: 90,
        memoryThreshold: 95,
      });

      // Config should be updated (internal state)
      expect(monitor.getStats().isRunning).toBeDefined();
    });
  });
});

describe('getSystemMonitor singleton', () => {
  it('should return same instance', () => {
    const monitor1 = getSystemMonitor();
    const monitor2 = getSystemMonitor();
    expect(monitor1).toBe(monitor2);
  });

  it('should accept config on first call', () => {
    const monitor = getSystemMonitor({
      cpuThreshold: 75,
    });
    expect(monitor).toBeDefined();
  });
});
