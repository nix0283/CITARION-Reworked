# 📊 Monitoring & Alerting (Phase 9)

**Version:** 1.8.0  
**Date:** 2025-01-22  
**Status:** ✅ Complete

---

## 📋 Overview

Comprehensive system monitoring and alerting with real-time health checks, performance metrics, and multi-channel notifications.

### Key Features

- ✅ System health monitoring
- ✅ Performance metrics tracking
- ✅ Multi-channel alerts (Telegram, Email, Webhook)
- ✅ Real-time WebSocket updates
- ✅ Alert management
- ✅ Rate limiting
- ✅ Quiet hours support

---

## 🚀 Quick Start

### Start System Monitor

```typescript
import { getSystemMonitor } from '@/lib/monitoring/system-monitor';

const monitor = getSystemMonitor({
  enabled: true,
  cpuThreshold: 80,
  memoryThreshold: 85,
  errorRateThreshold: 5,
  responseTimeThreshold: 2000,
  notifyChannels: ['telegram'],
});

monitor.start(60000); // Check every 60 seconds
```

### Send Alert

```typescript
import { sendSystemAlert, sendSecurityAlert } from '@/lib/monitoring/alert-service';

// System alert
await sendSystemAlert('High CPU usage detected', 'WARNING');

// Security alert
await sendSecurityAlert('Multiple failed login attempts', 'CRITICAL');
```

---

## 📖 System Monitor

### Configuration

```typescript
interface AlertConfig {
  enabled: boolean;
  cpuThreshold: number;        // Default: 80%
  memoryThreshold: number;     // Default: 85%
  errorRateThreshold: number;  // Default: 5%
  responseTimeThreshold: number; // Default: 2000ms
  notifyChannels: string[];    // ['telegram']
}
```

### Health Check Components

| Component | Check | Status |
|-----------|-------|--------|
| Database | Query latency | UP/DOWN/DEGRADED |
| Exchanges | Account access | UP/DOWN/DEGRADED |
| WebSocket | Server status | UP/DOWN |
| API | Response check | UP/DOWN |

### Health Status

| Status | Description |
|--------|-------------|
| HEALTHY | All components UP |
| DEGRADED | Some components degraded or high error rate |
| UNHEALTHY | One or more components DOWN |

### Get Health

```typescript
const monitor = getSystemMonitor();
const health = await monitor.getHealth();

console.log(`Status: ${health.status}`);
console.log(`Uptime: ${health.uptime}ms`);
console.log(`CPU: ${health.metrics.cpuUsage}%`);
console.log(`Memory: ${health.metrics.memoryUsage}%`);
console.log(`Error Rate: ${health.metrics.errorRate}%`);
console.log(`Active Connections: ${health.metrics.activeConnections}`);
```

---

## 📖 Alert Service

### Alert Types

| Type | Description |
|------|-------------|
| SYSTEM_ALERT | System health issues |
| TRADE_ALERT | Trade-related notifications |
| SECURITY_ALERT | Security incidents |
| PERFORMANCE_ALERT | Performance degradation |

### Alert Severity

| Severity | Description | Notification |
|----------|-------------|--------------|
| INFO | Informational | Optional |
| WARNING | Needs attention | Yes |
| CRITICAL | Immediate action | Yes + Escalation |

### Notification Channels

#### Telegram

```typescript
const alertService = getAlertService({
  channels: [
    {
      name: 'telegram',
      enabled: true,
      config: {},
    },
  ],
});
```

#### Webhook

```typescript
// Set in .env
ALERT_WEBHOOK_URL=https://hooks.slack.com/your-webhook

const alertService = getAlertService({
  channels: [
    {
      name: 'webhook',
      enabled: true,
      config: {},
    },
  ],
});
```

#### Email (Placeholder)

```typescript
// In production, integrate with SendGrid, SES, etc.
const alertService = getAlertService({
  channels: [
    {
      name: 'email',
      enabled: true,
      config: {
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        from: 'alerts@example.com',
        to: ['admin@example.com'],
      },
    },
  ],
});
```

### Rate Limiting

```typescript
const alertService = getAlertService({
  rateLimit: 10, // Max 10 notifications per minute
});
```

### Quiet Hours

```typescript
const alertService = getAlertService({
  quietHours: {
    start: 22, // 10 PM
    end: 6,    // 6 AM
  },
});
```

---

## 📊 API Endpoints

### GET /api/monitoring/health

Get system health status.

**Response:**
```json
{
  "success": true,
  "health": {
    "status": "HEALTHY",
    "uptime": 3600000,
    "timestamp": "2025-01-22T10:00:00Z",
    "components": {
      "database": { "status": "UP", "latency": 50 },
      "exchanges": { "status": "UP", "latency": 100 },
      "websocket": { "status": "UP" },
      "api": { "status": "UP" }
    },
    "metrics": {
      "cpuUsage": 45.2,
      "memoryUsage": 62.5,
      "activeConnections": 15,
      "errorRate": 0.5,
      "avgResponseTime": 250
    }
  }
}
```

### GET /api/monitoring/alerts

Get active alerts.

**Response:**
```json
{
  "success": true,
  "alerts": [
    {
      "id": "CPU-1705920000000",
      "type": "CPU",
      "severity": "CRITICAL",
      "message": "High CPU usage: 85.5%",
      "value": 85.5,
      "threshold": 80,
      "timestamp": "2025-01-22T10:00:00Z",
      "resolved": false
    }
  ],
  "count": 1
}
```

### POST /api/monitoring/alerts/resolve

Resolve an alert.

**Request:**
```json
{
  "alertId": "CPU-1705920000000"
}
```

### GET /api/monitoring/metrics

Get system metrics.

**Query Parameters:**
- `history=true` - Get metrics history

**Response:**
```json
{
  "success": true,
  "metrics": {
    "cpuUsage": 45.2,
    "memoryUsage": 62.5,
    "activeConnections": 15,
    "errorRate": 0.5,
    "avgResponseTime": 250
  }
}
```

### POST /api/monitoring/alerts/test

Send test alert.

**Request:**
```json
{
  "severity": "INFO",
  "message": "Test alert message"
}
```

---

## 📈 Examples

### Example 1: Monitor System Health

```typescript
import { getSystemMonitor } from '@/lib/monitoring/system-monitor';

const monitor = getSystemMonitor();
monitor.start(60000);

// Get health status
const health = await monitor.getHealth();

if (health.status === 'UNHEALTHY') {
  console.error('System is unhealthy!');
  
  // Check which component is down
  for (const [name, component] of Object.entries(health.components)) {
    if (component.status === 'DOWN') {
      console.error(`${name} is DOWN`);
    }
  }
}
```

### Example 2: Send Custom Alert

```typescript
import { getAlertService } from '@/lib/monitoring/alert-service';

const alertService = getAlertService();

await alertService.send({
  type: 'TRADE_ALERT',
  severity: 'INFO',
  title: 'Large Trade Executed',
  message: 'A large trade was executed on BTCUSDT',
  data: {
    symbol: 'BTCUSDT',
    side: 'BUY',
    quantity: 1.5,
    price: 50000,
    value: 75000,
  },
  timestamp: new Date(),
});
```

### Example 3: Configure Alert Channels

```typescript
import { getAlertService } from '@/lib/monitoring/alert-service';

const alertService = getAlertService({
  channels: [
    {
      name: 'telegram',
      enabled: true,
      config: {},
    },
    {
      name: 'webhook',
      enabled: true,
      config: {
        url: 'https://hooks.slack.com/your-webhook',
      },
    },
  ],
  minSeverity: 'WARNING',
  rateLimit: 10,
  quietHours: {
    start: 22,
    end: 6,
  },
});
```

### Example 4: Monitor Alerts Programmatically

```typescript
import { getSystemMonitor } from '@/lib/monitoring/system-monitor';

const monitor = getSystemMonitor();

// Get active alerts
const alerts = monitor.getActiveAlerts();

console.log(`Active alerts: ${alerts.length}`);

for (const alert of alerts) {
  console.log(`${alert.severity}: ${alert.message}`);
  
  // Auto-resolve if older than 1 hour
  const age = Date.now() - alert.timestamp.getTime();
  if (age > 3600000) {
    await monitor.resolveAlert(alert.id);
    console.log(`Resolved old alert: ${alert.id}`);
  }
}
```

---

## 🛡️ Alert Thresholds

### Default Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| CPU Usage | 70% | 80% |
| Memory Usage | 75% | 85% |
| Error Rate | 3% | 5% |
| Response Time | 1000ms | 2000ms |

### Custom Thresholds

```typescript
const monitor = getSystemMonitor({
  cpuThreshold: 90,        // Higher CPU tolerance
  memoryThreshold: 95,     // Higher memory tolerance
  errorRateThreshold: 10,  // Higher error tolerance
  responseTimeThreshold: 5000, // Slower response tolerance
});
```

---

## 📊 Monitoring Dashboard

### Health Widget

```tsx
import { useEffect, useState } from 'react';

export function HealthWidget() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    const fetchHealth = async () => {
      const response = await fetch('/api/monitoring/health');
      const data = await response.json();
      setHealth(data.health);
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);

    return () => clearInterval(interval);
  }, []);

  if (!health) return <div>Loading...</div>;

  return (
    <div className={`health-status ${health.status.toLowerCase()}`}>
      <div>Status: {health.status}</div>
      <div>Uptime: {(health.uptime / 3600000).toFixed(1)}h</div>
      <div>CPU: {health.metrics.cpuUsage}%</div>
      <div>Memory: {health.metrics.memoryUsage}%</div>
    </div>
  );
}
```

---

## 📚 Related Documentation

- [WebSocket Server](./REALTIME_DASHBOARD.md)
- [Security Encryption](./SECURITY_ENCRYPTION.md)
- [Deployment Guide](./PRODUCTION_DEPLOYMENT.md)
- [Home Deployment](./HOME_DEPLOYMENT.md)

---

**Last Reviewed:** 2025-01-22  
**Next Review:** After each major update
