# 📊 CITARION Monitoring & Observability

Production-ready monitoring stack with Prometheus, Grafana, Loki, and Promtail.

```
┌─────────────────────────────────────────────────────┐
│                  CITARION APP                        │
│  ┌─────────────────────────────────────────┐       │
│  │  /api/metrics (Prometheus format)      │       │
│  │  - HTTP metrics                        │       │
│  │  - Trading metrics                     │       │
│  │  - Exchange API metrics                │       │
│  │  - Business metrics                    │       │
│  └─────────────────────────────────────────┘       │
└────────┬───────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│   Prometheus    │────▶│     Grafana     │
│   (Metrics)     │     │  (Dashboards)   │
│   :9090         │     │   :3001         │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│      Loki       │◀────│    Promtail     │
│   (Logs)        │     │ (Log Collector) │
│   :3100         │     │                 │
└─────────────────┘     └─────────────────┘
```

## 🚨 Alert Integration (Slack/Telegram)

Alertmanager routes alerts to multiple channels based on severity and service:

```
┌─────────────────┐
│   Prometheus    │
│   (Alerts)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Alertmanager   │
│  (Routing)      │
└────────┬────────┘
         │
    ┌────┴────┬────────┐
    ▼         ▼        ▼
┌───────┐ ┌──────┐ ┌──────┐
│Slack  │ │Telegram│ │Email │
│#trading│ │@alerts │ │ops@ │
└───────┘ └──────┘ └──────┘
```

### Routing Rules

| Severity | Service | Channels |
|----------|---------|----------|
| 🔴 Critical | Any | Slack + Telegram + Email |
| 🟡 Warning | trading | Slack #trading-alerts |
| 🟡 Warning | infrastructure | Slack #infra-alerts |
| 🟡 Warning | Other | Telegram only |
| 🔵 Info | loki | Telegram logs channel |

### Setup Notifications

1. **Telegram Bot**:
```bash
# Create bot via @BotFather
# Get chat ID via @userinfobot or send message to bot then:
curl "https://api.telegram.org/bot<BOT_TOKEN>/getUpdates"

# Add to .env.monitoring:
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_ALERT_CHAT_ID=-1001234567890  # Group/chat ID
TELEGRAM_CRITICAL_CHAT_ID=-1009876543210  # Critical alerts channel
```

2. **Slack Webhook**:
```bash
# Create Incoming Webhook in Slack:
# https://your-workspace.slack.com/apps/manage/custom-integrations

# Add to .env.monitoring:
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
SLACK_ALERT_CHANNEL=#citarion-alerts
```

3. **Email (Optional)**:
```bash
# Add to .env.monitoring:
ALERT_EMAIL_TO=ops@citarion.app
ALERT_EMAIL_FROM=alerts@citarion.app
ALERT_EMAIL_SMTP_HOST=smtp.gmail.com
ALERT_EMAIL_SMTP_PORT=587
ALERT_EMAIL_SMTP_USER=your-email@gmail.com
ALERT_EMAIL_SMTP_PASS=your-app-password
```

---

## 🚀 Quick Start

### 1. Start the Monitoring Stack

```bash
# Start all monitoring services
docker-compose -f docker-compose.monitoring.yml up -d

# View logs
docker-compose -f docker-compose.monitoring.yml logs -f

# Stop services
docker-compose -f docker-compose.monitoring.yml down
```

### 2. Access Dashboards

| Service | URL | Credentials |
|---------|-----|-------------|
| **Grafana** | http://localhost:3001 | admin / admin |
| **Prometheus** | http://localhost:9090 | None |
| **Loki** | http://localhost:3100 | None |
| **cAdvisor** | http://localhost:8080 | None |

### 3. Verify Metrics Endpoint

```bash
# Check application metrics
curl http://localhost:3000/api/metrics | head -20

# Expected output:
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
# http_requests_total{method="GET",route="/api/health",status_code="200"} 42
```

### 4. Test Alert Notifications

```bash
# Set environment variables first
export TELEGRAM_BOT_TOKEN=xxx
export TELEGRAM_ALERT_CHAT_ID=xxx
export SLACK_WEBHOOK_URL=xxx

# Run test script
bun run scripts/test-alerts.ts

# Test specific channel
bun run scripts/test-alerts.ts --channel slack --severity critical

# Check webhook endpoint health
curl http://localhost:3000/api/alerts/webhook
```

### 5. Trigger a Test Alert in Prometheus

```bash
# Connect to Prometheus container
docker exec -it citarion-prometheus sh

# Use promtool to fire a test alert
# Or manually create an alert rule for testing:
echo '
groups:
- name: test-alerts
  rules:
  - alert: TestAlert
    expr: up == 0
    for: 1s
    labels:
      severity: info
    annotations:
      summary: "Test alert"
' > /etc/prometheus/rules/test.yml

# Reload Prometheus
curl -X POST http://localhost:9090/-/reload
```

---

## 🔧 Alertmanager Configuration

Edit `monitoring/alertmanager/alertmanager.yml` to customize:

### Add New Routing Rules

```yaml
route:
  routes:
    # New route for bot-specific alerts
    - match:
        service: bot
      receiver: 'telegram-bots'
      group_by: ['bot_type', 'symbol']

receivers:
  - name: 'telegram-bots'
    telegram_configs:
      - bot_token: '${TELEGRAM_BOT_TOKEN}'
        chat_id: '${TELEGRAM_BOTS_CHAT_ID}'
        message: '🤖 Bot Alert: {{ .CommonLabels.alertname }}\n{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

### Customize Alert Messages

Edit `monitoring/alertmanager/templates/` to create custom message templates:

```gotmpl
{{ define "telegram.citarion.message" }}
*🚨 {{ .CommonLabels.alertname }}*

*Severity:* {{ .CommonLabels.severity }}
*Service:* {{ .CommonLabels.service }}

{{ range .Alerts }}
{{ .Annotations.description }}
{{ end }}

[View Dashboard]({{ .CommonAnnotations.grafana_url }})
{{ end }}
```

### Silence Alerts During Maintenance

```yaml
# In alertmanager.yml
mute_time_intervals:
  - name: 'scheduled-maintenance'
    time_intervals:
      - weekdays: ['sunday']
        times:
          - start_time: '02:00'
            end_time: '06:00'

route:
  routes:
    - match:
        service: infrastructure
      mute_time_intervals:
        - scheduled-maintenance
```

---

## ⚙️ Configuration

### Environment Variables

Create `.env.monitoring` for sensitive values:

```bash
# Grafana admin credentials
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=change-me-in-production

# Metrics endpoint auth (optional)
METRICS_USER=metrics
METRICS_PASSWORD=secure-password-here

# Environment labels
ENVIRONMENT=production
CLUSTER_NAME=citarion-prod
```

### Prometheus Configuration

Edit `monitoring/prometheus/prometheus.yml`:

```yaml
# Adjust scrape intervals
global:
  scrape_interval: 15s  # Default: 15s
  
# Add custom scrape targets
scrape_configs:
  - job_name: 'custom-service'
    static_configs:
      - targets: ['service:8080']
```

### Grafana Dashboards

Pre-configured dashboard: `CITARION - Production Dashboard`

**Panels included:**
- 🚀 Application Health (status, request rate, latency)
- 💰 Trading Metrics (PnL, positions, win rate)
- 🔧 Infrastructure (CPU, memory, disk)
- 🪵 Logs (error/warning logs from Loki)

**Add custom panels:**
1. Go to Grafana → Dashboards → New → Panel
2. Select datasource (Prometheus or Loki)
3. Write query and configure visualization

---

## 📈 Available Metrics

### HTTP Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_requests_total` | Counter | method, route, status_code | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | method, route, status_code | Request latency |
| `http_requests_active` | Gauge | method, route | Currently active requests |

### Trading Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `trade_executions_total` | Counter | exchange, symbol, direction, mode | Successful trades |
| `trade_executions_failed_total` | Counter | exchange, symbol, error_type | Failed trades |
| `trade_execution_duration_seconds` | Histogram | exchange, symbol | Trade execution latency |
| `trading_total_pnl_usd` | Gauge | mode | Total PnL in USD |
| `trading_open_positions` | Gauge | exchange, direction | Open positions count |
| `trading_win_rate_percent` | Gauge | exchange, timeframe | Win rate percentage |

### Exchange API Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `exchange_api_calls_total` | Counter | exchange, endpoint, method | API calls made |
| `exchange_api_errors_total` | Counter | exchange, endpoint, error_code | API errors |
| `exchange_api_latency_seconds` | Histogram | exchange, endpoint | API call latency |
| `exchange_rate_limit_hits_total` | Counter | exchange | Rate limit hits |

### Signal Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `signals_received_total` | Counter | source | Signals received |
| `signals_processed_total` | Counter | source, action | Successfully processed |
| `signals_failed_total` | Counter | source, error_type | Failed to process |

### System Metrics (via prom-client)

| Metric | Type | Description |
|--------|------|-------------|
| `process_cpu_seconds_total` | Counter | CPU time consumed |
| `process_resident_memory_bytes` | Gauge | Memory usage |
| `nodejs_eventloop_lag_seconds` | Gauge | Event loop lag |
| `nodejs_gc_duration_seconds` | Histogram | GC pause times |

---

## 🔍 Query Examples

### Prometheus Queries

```promql
# Request rate per endpoint
sum(rate(http_requests_total[5m])) by (route)

# 95th percentile latency
histogram_quantile(0.95, 
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)
)

# Error rate percentage
sum(rate(http_requests_total{status=~"5.."}[5m])) 
/ 
sum(rate(http_requests_total[5m])) * 100

# Trade execution success rate
sum(rate(trade_executions_total[1h])) 
/ 
(sum(rate(trade_executions_total[1h])) + sum(rate(trade_executions_failed_total[1h]))) * 100

# Exchange API error rate by exchange
sum(rate(exchange_api_errors_total[5m])) by (exchange)
```

### Loki Log Queries

```logql
# All error logs from the app
{job="citarion", level="error"}

# Errors from a specific service
{job="citarion", service="api"} |= "error"

# Search by request ID
{job="citarion"} | json | requestId="abc123-def456"

# Count errors by type over time
sum by (error_type) (
  count_over_time(
    {job="citarion", level="error"} | json | error_type != "" [5m]
  )
)

# Logs containing "timeout" with context
{job="citarion"} |~ "timeout" | json | line_format "{{.level}} [{{.service}}] {{.msg}}"
```

---

## 🚨 Alerting

Alerts are defined in `monitoring/prometheus/rules/alerts.yml`.

### Configured Alerts

| Alert | Condition | Severity | Description |
|-------|-----------|----------|-------------|
| `CitarionAppDown` | `up == 0` for 1m | 🔴 Critical | Application is down |
| `CitarionHighErrorRate` | Error rate > 5% for 5m | 🟡 Warning | High HTTP error rate |
| `CitarionHighLatency` | p95 latency > 2s for 5m | 🟡 Warning | Slow responses |
| `CitarionTradeFailures` | >10 failed trades in 5m | 🔴 Critical | Trading issues |
| `CitarionExchangeApiErrors` | >20 API errors in 5m | 🟡 Warning | Exchange connectivity |
| `CitarionHighMemoryUsage` | Memory > 1.5GB for 5m | 🟡 Warning | Resource pressure |
| `HostDiskSpaceLow` | Disk < 10% free for 10m | 🔴 Critical | Disk full risk |

### Adding Custom Alerts

1. Edit `monitoring/prometheus/rules/alerts.yml`
2. Add new rule:

```yaml
- alert: MyCustomAlert
  expr: my_metric > threshold
  for: 5m
  labels:
    severity: warning
    service: my-service
  annotations:
    summary: "Brief description"
    description: "Detailed explanation with {{ $labels.instance }}"
    runbook_url: "https://docs/runbooks/my-alert"
```

3. Reload Prometheus: `curl -X POST http://localhost:9090/-/reload`

### Alert Routing (Optional)

To send alerts to Slack/Email, add Alertmanager:

```yaml
# docker-compose.monitoring.yml
services:
  alertmanager:
    image: prom/alertmanager:v0.25.0
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml
```

---

## 🪵 Log Collection

### Log Format (Pino JSON)

Application logs use structured JSON format:

```json
{
  "level": "info",
  "time": "2026-02-24T12:00:00.000Z",
  "pid": 12345,
  "hostname": "server-1",
  "service": "citarion",
  "env": "production",
  "msg": "Trade executed successfully",
  "symbol": "BTCUSDT",
  "direction": "LONG",
  "amount": 100,
  "price": 67000,
  "requestId": "abc123-def456",
  "duration": 245
}
```

### Promtail Configuration

Edit `monitoring/promtail/promtail.yml` to:
- Change log paths
- Add new log sources
- Modify parsing rules

### Viewing Logs in Grafana

1. Go to Explore → Select Loki datasource
2. Enter query: `{job="citarion"}`
3. Use filters: `|= "error"` or `| json | level="warn"`
4. Click on log lines to see full context

---

## 🔐 Security

### Production Hardening

1. **Restrict metrics endpoint access:**
```typescript
// src/app/api/metrics/route.ts
export async function GET(request: NextRequest) {
  // IP whitelist
  const allowedIps = ['10.0.0.0/8', '192.168.1.0/24'];
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0];
  
  if (!allowedIps.some(cidr => ipInCidr(clientIp, cidr))) {
    return new Response('Forbidden', { status: 403 });
  }
  
  return metricsHandler(request);
}
```

2. **Enable Grafana authentication:**
```bash
# .env.monitoring
GRAFANA_ADMIN_USER=your-secure-user
GRAFANA_ADMIN_PASSWORD=your-secure-password
GF_USERS_ALLOW_SIGN_UP=false
```

3. **Use HTTPS for Grafana:**
```yaml
# docker-compose.monitoring.yml
grafana:
  environment:
    - GF_SERVER_PROTOCOL=https
    - GF_SERVER_CERT_FILE=/etc/grafana/ssl/cert.pem
    - GF_SERVER_CERT_KEY=/etc/grafana/ssl/key.pem
  volumes:
    - ./grafana/ssl:/etc/grafana/ssl:ro
```

4. **Network isolation:**
```yaml
# docker-compose.monitoring.yml
networks:
  monitoring:
    driver: bridge
    internal: true  # No external access
```

---

## 🛠️ Troubleshooting

### Prometheus not scraping app

```bash
# Check if metrics endpoint responds
curl http://localhost:3000/api/metrics

# Check Prometheus targets
# Visit: http://localhost:9090/targets

# Check Prometheus logs
docker logs citarion-prometheus
```

### Loki not receiving logs

```bash
# Check Promtail logs
docker logs citarion-promtail

# Test Loki directly
curl -G http://localhost:3100/loki/api/v1/labels

# Check log file permissions
ls -la ./logs/
```

### Grafana dashboards not loading

```bash
# Check datasource configuration
# Visit: http://localhost:3001/connections/datasources

# Check provisioning logs
docker logs citarion-grafana | grep -i provision

# Verify dashboard files
ls -la ./monitoring/grafana/dashboards/
```

### High resource usage

```bash
# Check Prometheus storage
du -sh ./monitoring/prometheus/data

# Reduce retention in prometheus.yml:
# --storage.tsdb.retention.time=7d

# Check Loki chunk size
# Adjust in loki.yml: limits_config.max_entries_limit
```

---

## 📦 Resource Requirements

| Service | CPU | Memory | Disk |
|---------|-----|--------|------|
| Prometheus | 1-2 cores | 2-4 GB | 10-50 GB* |
| Grafana | 0.5-1 core | 512 MB - 1 GB | 1 GB |
| Loki | 1-2 cores | 2-4 GB | 20-100 GB* |
| Promtail | 0.25-0.5 core | 256-512 MB | Minimal |

*Disk usage depends on retention period and log volume

### Optimizing Resource Usage

```yaml
# prometheus.yml - Reduce data retention
global:
  scrape_interval: 30s  # Less frequent scraping
  
# loki.yml - Reduce log retention
limits_config:
  retention_period: 72h  # 3 days instead of 7

# promtail.yml - Filter verbose logs
pipeline_stages:
  - drop:
      expression: 'level="debug"'
```

---

## 🔄 Updates & Maintenance

### Updating Stack Versions

1. Edit `docker-compose.monitoring.yml` with new image tags
2. Test in staging first
3. Deploy with rolling update:

```bash
docker-compose -f docker-compose.monitoring.yml pull
docker-compose -f docker-compose.monitoring.yml up -d --no-deps prometheus grafana loki promtail
```

### Backup Strategy

```bash
# Backup Prometheus data
tar -czf prometheus-backup-$(date +%Y%m%d).tar.gz ./monitoring/prometheus/data

# Backup Grafana dashboards
tar -czf grafana-backup-$(date +%Y%m%d).tar.gz ./monitoring/grafana/dashboards

# Backup Loki data (if using filesystem)
tar -czf loki-backup-$(date +%Y%m%d).tar.gz ./monitoring/loki/chunks
```

### Monitoring the Monitor

Add health checks for the monitoring stack itself:

```yaml
# Add to prometheus.yml
- job_name: 'monitoring-health'
  static_configs:
    - targets: 
        - 'prometheus:9090'
        - 'grafana:3000'
        - 'loki:3100'
  metrics_path: '/-/healthy'
```

---

## 📚 Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Loki Documentation](https://grafana.com/docs/loki/)
- [Promtail Documentation](https://grafana.com/docs/loki/latest/clients/promtail/)
- [Prometheus Querying Guide](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [LogQL Reference](https://grafana.com/docs/loki/latest/logql/)

---

## 🆘 Support

- 🐛 Issues: https://github.com/citarion/citarion/issues
- 💬 Discussion: https://github.com/citarion/citarion/discussions
- 📧 Email: ops@citarion.app

---

> 💡 **Pro Tip:** Set up alert notifications to Slack/Discord for critical alerts. Use Grafana's built-in alerting or integrate with Alertmanager for advanced routing.

*Last updated: 2026-02-24 | Version: 1.5.0*
