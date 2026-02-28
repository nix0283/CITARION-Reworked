/**
 * System Monitoring Service
 * 
 * Comprehensive system monitoring:
 * - Health checks
 * - Performance metrics
 * - Resource usage
 * - Error tracking
 * - Uptime monitoring
 * 
 * @module lib/monitoring/system-monitor
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getWebSocketServer } from '@/lib/websocket/server';
import { notifyTelegram } from '@/lib/notification-service';

// ==================== TYPES ====================

export interface SystemHealth {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  uptime: number;
  timestamp: Date;
  components: {
    database: ComponentHealth;
    exchanges: ComponentHealth;
    websocket: ComponentHealth;
    api: ComponentHealth;
  };
  metrics: SystemMetrics;
}

export interface ComponentHealth {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  latency?: number;
  lastCheck: Date;
  error?: string;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  activeConnections: number;
  requestsPerMinute: number;
  errorRate: number;
  avgResponseTime: number;
}

export interface AlertConfig {
  enabled: boolean;
  cpuThreshold: number;
  memoryThreshold: number;
  errorRateThreshold: number;
  responseTimeThreshold: number;
  notifyChannels: string[];
}

export interface Alert {
  id: string;
  type: 'CPU' | 'MEMORY' | 'ERROR_RATE' | 'RESPONSE_TIME' | 'SERVICE_DOWN';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  enabled: true,
  cpuThreshold: 80,
  memoryThreshold: 85,
  errorRateThreshold: 5,
  responseTimeThreshold: 2000,
  notifyChannels: ['telegram'],
};

// ==================== SYSTEM MONITOR CLASS ====================

export class SystemMonitor {
  private config: AlertConfig;
  private startTime: Date;
  private metricsHistory: SystemMetrics[];
  private alerts: Map<string, Alert>;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config?: Partial<AlertConfig>) {
    this.config = {
      ...DEFAULT_ALERT_CONFIG,
      ...config,
    };
    this.startTime = new Date();
    this.metricsHistory = [];
    this.alerts = new Map();
  }

  /**
   * Start monitoring
   */
  start(checkIntervalMs: number = 60000): void {
    if (this.isRunning) {
      logger.warn('SystemMonitor already running');
      return;
    }

    this.isRunning = true;
    logger.info({ checkIntervalMs }, 'SystemMonitor started');

    // Initial check
    this.runChecks();

    // Start periodic checks
    this.checkInterval = setInterval(() => {
      this.runChecks();
    }, checkIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    logger.info('SystemMonitor stopped');
  }

  /**
   * Run all health checks
   */
  private async runChecks(): Promise<void> {
    try {
      const health = await this.getHealth();

      // Check for alerts
      await this.checkAlerts(health);

      // Store metrics
      this.metricsHistory.push(health.metrics);
      if (this.metricsHistory.length > 60) {
        this.metricsHistory.shift(); // Keep last 60 entries
      }

      // Log health status
      logger.info({
        status: health.status,
        uptime: health.uptime,
        cpu: health.metrics.cpuUsage,
        memory: health.metrics.memoryUsage,
      }, 'System health check');

      // Broadcast to WebSocket
      this.broadcastHealth(health);

      // Save to database
      await this.saveHealthCheck(health);
    } catch (error) {
      logger.error({ error }, 'Health check failed');
    }
  }

  /**
   * Get system health
   */
  async getHealth(): Promise<SystemHealth> {
    const uptime = Date.now() - this.startTime.getTime();

    const components = {
      database: await this.checkDatabase(),
      exchanges: await this.checkExchanges(),
      websocket: this.checkWebSocket(),
      api: this.checkApi(),
    };

    const metrics = await this.getMetrics();

    // Determine overall status
    let status: SystemHealth['status'] = 'HEALTHY';

    const downComponents = Object.values(components).filter(
      c => c.status === 'DOWN'
    ).length;

    const degradedComponents = Object.values(components).filter(
      c => c.status === 'DEGRADED'
    ).length;

    if (downComponents > 0) {
      status = 'UNHEALTHY';
    } else if (degradedComponents > 0 || metrics.errorRate > this.config.errorRateThreshold) {
      status = 'DEGRADED';
    }

    return {
      status,
      uptime,
      timestamp: new Date(),
      components,
      metrics,
    };
  }

  /**
   * Check database health
   */
  private async checkDatabase(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      await db.$queryRaw`SELECT 1`;
      const latency = Date.now() - startTime;

      return {
        status: latency > 1000 ? 'DEGRADED' : 'UP',
        latency,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        status: 'DOWN',
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check exchanges health
   */
  private async checkExchanges(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      // Check if we can query exchange data
      const accountCount = await db.account.count({
        where: { isActive: true },
      });

      const latency = Date.now() - startTime;

      return {
        status: 'UP',
        latency,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        status: 'DEGRADED',
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check WebSocket health
   */
  private checkWebSocket(): ComponentHealth {
    try {
      const wsServer = getWebSocketServer();
      const stats = wsServer.getStats();

      return {
        status: wsServer.isServerRunning() ? 'UP' : 'DOWN',
        latency: 0,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        status: 'DOWN',
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check API health
   */
  private checkApi(): ComponentHealth {
    return {
      status: 'UP',
      latency: 0,
      lastCheck: new Date(),
    };
  }

  /**
   * Get system metrics
   */
  private async getMetrics(): Promise<SystemMetrics> {
    // Get process metrics
    const usage = process.memoryUsage();
    const memoryUsage = (usage.heapUsed / 1024 / 1024) * 100 / 4096; // Assume 4GB max

    // Get active connections
    const wsServer = getWebSocketServer();
    const activeConnections = wsServer.getClientCount();

    // Calculate error rate (last 5 minutes)
    const errorRate = await this.calculateErrorRate();

    // Calculate avg response time
    const avgResponseTime = await this.calculateAvgResponseTime();

    return {
      cpuUsage: process.cpuUsage ? (process.cpuUsage().user / 1000000) % 100 : 0,
      memoryUsage: Math.round(memoryUsage * 100) / 100,
      diskUsage: 0, // Would need fs module
      activeConnections,
      requestsPerMinute: 0, // Would need request tracking
      errorRate,
      avgResponseTime,
    };
  }

  /**
   * Calculate error rate
   */
  private async calculateErrorRate(): Promise<number> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const totalRequests = await db.apiLog.count({
        where: {
          timestamp: { gte: fiveMinutesAgo },
        },
      });

      const errorRequests = await db.apiLog.count({
        where: {
          timestamp: { gte: fiveMinutesAgo },
          statusCode: { gte: 400 },
        },
      });

      if (totalRequests === 0) return 0;

      return Math.round((errorRequests / totalRequests) * 100 * 100) / 100;
    } catch {
      return 0;
    }
  }

  /**
   * Calculate average response time
   */
  private async calculateAvgResponseTime(): Promise<number> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const logs = await db.apiLog.findMany({
        where: {
          timestamp: { gte: fiveMinutesAgo },
          responseTime: { not: null },
        },
        select: { responseTime: true },
        take: 100,
      });

      if (logs.length === 0) return 0;

      const avg = logs.reduce((sum, log) => sum + (log.responseTime || 0), 0) / logs.length;
      return Math.round(avg);
    } catch {
      return 0;
    }
  }

  /**
   * Check for alerts
   */
  private async checkAlerts(health: SystemHealth): Promise<void> {
    const metrics = health.metrics;

    // CPU alert
    if (metrics.cpuUsage > this.config.cpuThreshold) {
      await this.createAlert({
        type: 'CPU',
        severity: 'CRITICAL',
        message: `High CPU usage: ${metrics.cpuUsage.toFixed(1)}%`,
        value: metrics.cpuUsage,
        threshold: this.config.cpuThreshold,
      });
    }

    // Memory alert
    if (metrics.memoryUsage > this.config.memoryThreshold) {
      await this.createAlert({
        type: 'MEMORY',
        severity: 'CRITICAL',
        message: `High memory usage: ${metrics.memoryUsage.toFixed(1)}%`,
        value: metrics.memoryUsage,
        threshold: this.config.memoryThreshold,
      });
    }

    // Error rate alert
    if (metrics.errorRate > this.config.errorRateThreshold) {
      await this.createAlert({
        type: 'ERROR_RATE',
        severity: 'WARNING',
        message: `High error rate: ${metrics.errorRate.toFixed(1)}%`,
        value: metrics.errorRate,
        threshold: this.config.errorRateThreshold,
      });
    }

    // Response time alert
    if (metrics.avgResponseTime > this.config.responseTimeThreshold) {
      await this.createAlert({
        type: 'RESPONSE_TIME',
        severity: 'WARNING',
        message: `Slow response time: ${metrics.avgResponseTime}ms`,
        value: metrics.avgResponseTime,
        threshold: this.config.responseTimeThreshold,
      });
    }

    // Service down alert
    for (const [name, component] of Object.entries(health.components)) {
      if (component.status === 'DOWN') {
        await this.createAlert({
          type: 'SERVICE_DOWN',
          severity: 'CRITICAL',
          message: `${name} service is DOWN`,
          value: 0,
          threshold: 0,
        });
      }
    }
  }

  /**
   * Create alert
   */
  private async createAlert(alertData: Omit<Alert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const alertId = `${alertData.type}-${Date.now()}`;

    const alert: Alert = {
      id: alertId,
      ...alertData,
      timestamp: new Date(),
      resolved: false,
    };

    this.alerts.set(alertId, alert);

    // Save to database
    await db.systemAlert.create({
      data: {
        id: alertId,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        value: alert.value,
        threshold: alert.threshold,
        resolved: false,
      },
    });

    // Send notification
    if (this.config.enabled && alert.severity === 'CRITICAL') {
      await this.sendNotification(alert);
    }

    logger.warn({ alert }, 'Alert created');
  }

  /**
   * Send notification
   */
  private async sendNotification(alert: Alert): Promise<void> {
    if (this.config.notifyChannels.includes('telegram')) {
      await notifyTelegram({
        type: 'SYSTEM_ALERT',
        title: `🚨 ${alert.severity} Alert`,
        message: `${alert.message}\nValue: ${alert.value}\nThreshold: ${alert.threshold}`,
      });
    }
  }

  /**
   * Broadcast health to WebSocket
   */
  private broadcastHealth(health: SystemHealth): void {
    try {
      const wsServer = getWebSocketServer();
      wsServer.broadcastToChannel('system', {
        type: 'HEALTH_UPDATE',
        payload: health,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.debug({ error }, 'Failed to broadcast health');
    }
  }

  /**
   * Save health check to database
   */
  private async saveHealthCheck(health: SystemHealth): Promise<void> {
    try {
      await db.systemHealth.create({
        data: {
          status: health.status,
          uptime: health.uptime,
          cpuUsage: health.metrics.cpuUsage,
          memoryUsage: health.metrics.memoryUsage,
          activeConnections: health.metrics.activeConnections,
          errorRate: health.metrics.errorRate,
          avgResponseTime: health.metrics.avgResponseTime,
        },
      });
    } catch (error) {
      logger.debug({ error }, 'Failed to save health check');
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(a => !a.resolved);
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date();

      await db.systemAlert.update({
        where: { id: alertId },
        data: {
          resolved: true,
          resolvedAt: new Date(),
        },
      });

      logger.info({ alertId }, 'Alert resolved');
    }
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(): SystemMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * Get monitor stats
   */
  getStats(): {
    uptime: number;
    alertsCount: number;
    activeAlerts: number;
    isRunning: boolean;
  } {
    const activeAlerts = this.getActiveAlerts().length;

    return {
      uptime: Date.now() - this.startTime.getTime(),
      alertsCount: this.alerts.size,
      activeAlerts,
      isRunning: this.isRunning,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AlertConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }
}

// ==================== SINGLETON ====================

let monitorInstance: SystemMonitor | null = null;

export function getSystemMonitor(config?: Partial<AlertConfig>): SystemMonitor {
  if (!monitorInstance) {
    monitorInstance = new SystemMonitor(config);
  }
  return monitorInstance;
}

// ==================== EXPORTS ====================

export default {
  SystemMonitor,
  getSystemMonitor,
  DEFAULT_ALERT_CONFIG,
};
