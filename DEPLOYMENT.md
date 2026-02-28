# 🚀 CITARION - Production Deployment Guide

**Версия:** 1.2.0
**Статус:** Production Ready

---

## 📋 Содержание

1. [Требования](#требования)
2. [Docker развёртывание](#docker-развёртывание)
3. [VPS развёртывание](#vps-развёртывание)
4. [Vercel развёртывание](#vercel-развёртывание)
5. [Настройка окружения](#настройка-окружения)
6. [База данных](#база-данных)
7. [Мониторинг](#мониторинг)
8. [Безопасность](#безопасность)
9. [Backup](#backup)
10. [Troubleshooting](#troubleshooting)

---

## 🔧 Требования

### Минимальные

| Компонент | Требование |
|-----------|------------|
| CPU | 2 cores |
| RAM | 4 GB |
| Storage | 20 GB SSD |
| OS | Linux (Ubuntu 22.04+) / Windows 10/11 |

### Рекомендуемые

| Компонент | Требование |
|-----------|------------|
| CPU | 4 cores |
| RAM | 8 GB |
| Storage | 50 GB SSD |
| OS | Ubuntu 22.04 LTS |

---

## 🐳 Docker развёртывание

### 1. Dockerfile

```dockerfile
# Dockerfile
FROM node:20-alpine AS base

# Dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json bun.lock* ./
RUN npm install --legacy-peer-deps

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### 2. Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  citarion:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=file:/app/data/dev.db
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - TRADINGVIEW_WEBHOOK_SECRET=${TRADINGVIEW_WEBHOOK_SECRET}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
    networks:
      - citarion-network

  # Optional: PostgreSQL for production
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: citarion
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: citarion
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - citarion-network
    restart: unless-stopped

  # Optional: Redis for caching
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    networks:
      - citarion-network
    restart: unless-stopped

  # Optional: Grafana for monitoring
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    networks:
      - citarion-network
    restart: unless-stopped
    depends_on:
      - postgres

volumes:
  postgres_data:
  redis_data:
  grafana_data:

networks:
  citarion-network:
    driver: bridge
```

### 3. Запуск

```bash
# Build
docker-compose build

# Start
docker-compose up -d

# Check logs
docker-compose logs -f citarion

# Stop
docker-compose down
```

---

## 🖥️ VPS развёртывание (Ubuntu)

### 1. Подготовка сервера

```bash
# Обновление
sudo apt update && sudo apt upgrade -y

# Установка Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Установка PM2
sudo npm install -g pm2

# Установка Git
sudo apt install -y git

# Создание пользователя
sudo adduser citarion
sudo usermod -aG sudo citarion
```

### 2. Клонирование проекта

```bash
su - citarion
git clone https://github.com/your-org/citarion.git
cd citarion
```

### 3. Установка зависимостей

```bash
npm install --legacy-peer-deps
```

### 4. Настройка окружения

```bash
cp .env.example .env
nano .env
```

### 5. База данных

```bash
# Для SQLite
npx prisma db push

# Для PostgreSQL
# Измените DATABASE_URL в .env
# DATABASE_URL="postgresql://user:password@localhost:5432/citarion"
npx prisma migrate deploy
npx prisma generate
```

### 6. Build

```bash
npm run build
```

### 7. Запуск через PM2

```bash
# Создать ecosystem config
nano ecosystem.config.js
```

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'citarion',
    script: 'npm',
    args: 'start',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

```bash
# Запуск
pm2 start ecosystem.config.js

# Сохранить
pm2 save

# Автозапуск
pm2 startup
```

### 8. Nginx reverse proxy

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/citarion
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/webhook {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 10M;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/citarion /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# SSL (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## ▲ Vercel развёртывание

### 1. Подготовка

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login
```

### 2. Деплой

```bash
# Development
vercel dev

# Production
vercel --prod
```

### 3. Environment Variables

Настройте в Vercel Dashboard:

```
DATABASE_URL=file:./dev.db
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=https://your-domain.vercel.app
TRADINGVIEW_WEBHOOK_SECRET=your-webhook-secret
TELEGRAM_BOT_TOKEN=your-bot-token
ENCRYPTION_KEY=your-32-char-key
```

### 4. Ограничения Vercel

| Функция | Поддержка |
|---------|-----------|
| Serverless API | ✅ |
| Webhooks | ✅ |
| Cron Jobs | ⚠️ Limited |
| WebSocket | ❌ |
| Background Jobs | ❌ |
| SQLite | ⚠️ Ephemeral |

**Рекомендация:** Используйте Vercel для frontend, а backend на VPS.

---

## 🔐 Настройка окружения

### Production .env

```env
# ==================== DATABASE ====================
DATABASE_URL="postgresql://user:password@localhost:5432/citarion"
# Или для SQLite
# DATABASE_URL="file:/app/data/dev.db"

# ==================== AUTHENTICATION ====================
NEXTAUTH_SECRET="generate-32-char-secret-openssl-rand-base64-32"
NEXTAUTH_URL="https://your-domain.com"

# ==================== TRADINGVIEW WEBHOOK ====================
TRADINGVIEW_WEBHOOK_SECRET="generate-secure-webhook-secret"

# ==================== TELEGRAM BOT ====================
TELEGRAM_BOT_TOKEN="bot-token-from-botfather"

# ==================== ENCRYPTION ====================
ENCRYPTION_KEY="exactly-32-characters-long-key!!"

# ==================== RATE LIMITING ====================
API_RATE_LIMIT="100"

# ==================== MONITORING ====================
PROMETHEUS_ENABLED="true"
GRAFANA_ENABLED="true"

# ==================== LOGGING ====================
LOG_LEVEL="warn"
LOG_FILE="/app/logs/app.log"

# ==================== PAPER TRADING ====================
PAPER_TRADING_DEFAULT_BALANCE="10000"

# ==================== HYPEROPT ====================
HYPEROPT_MAX_ITERATIONS="100"
HYPEROPT_EARLY_STOPPING="50"

# ==================== MARKET FORECAST ====================
MARKET_FORECAST_ENABLED="true"
MARKET_FORECAST_CONFIDENCE_THRESHOLD="0.7"

# ==================== COPY TRADING ====================
COPY_TRADING_ENABLED="true"
COPY_TRADING_DEFAULT_PROFIT_SHARE="0.1"
```

### Генерация секретов

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# ENCRYPTION_KEY (exactly 32 chars)
openssl rand -hex 16

# WEBHOOK_SECRET
openssl rand -hex 32
```

---

## 🗄️ База данных

### PostgreSQL настройка

```bash
# Установка
sudo apt install -y postgresql postgresql-contrib

# Создание пользователя и БД
sudo -u postgres psql
CREATE DATABASE citarion;
CREATE USER citarion WITH PASSWORD 'secure-password';
GRANT ALL PRIVILEGES ON DATABASE citarion TO citarion;
\q

# Миграции
npx prisma migrate deploy
npx prisma generate
```

### Backup

```bash
# Daily backup script
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -U citarion citarion > /backups/citarion_$DATE.sql

# Keep last 7 days
find /backups -name "citarion_*.sql" -mtime +7 -delete
```

```bash
# Cron job (daily at 3 AM)
0 3 * * * /path/to/backup.sh
```

---

## 📊 Мониторинг

### Prometheus + Grafana

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafana_data:/var/lib/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    restart: unless-stopped
```

### Метрики для мониторинга

| Метрика | Alert Threshold |
|---------|-----------------|
| CPU Usage | > 80% |
| Memory Usage | > 85% |
| Disk Usage | > 90% |
| API Response Time | > 2s |
| Error Rate | > 1% |
| Active Users | Monitor |
| Paper Trading Accounts | Monitor |

---

## 🔒 Безопасность

### Firewall

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### Fail2Ban

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### SSL/TLS

```bash
# Let's Encrypt
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

### API Security

- ✅ Rate limiting (100 req/min)
- ✅ HMAC signature validation
- ✅ API key authentication
- ✅ CORS configuration
- ✅ Input validation (Zod)

---

## 💾 Backup

### Автоматический backup

```bash
#!/bin/bash
# /opt/citarion/backup.sh

BACKUP_DIR="/backups/citarion"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup dir
mkdir -p $BACKUP_DIR

# Backup database
if [ "$DATABASE_TYPE" = "postgresql" ]; then
    pg_dump -U citarion citarion > $BACKUP_DIR/db_$DATE.sql
else
    cp /app/data/dev.db $BACKUP_DIR/dev.db_$DATE
fi

# Backup .env
cp /app/citarion/.env $BACKUP_DIR/env_$DATE

# Backup logs
tar -czf $BACKUP_DIR/logs_$DATE.tar.gz /app/citarion/logs/

# Keep last 7 days
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.db_*" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

### Restore

```bash
# PostgreSQL
psql -U citarion citarion < backup.sql

# SQLite
cp backup.db /app/data/dev.db

# Restart
pm2 restart citarion
```

---

## 🐛 Troubleshooting

### Common issues

#### 1. Port already in use

```bash
# Find process
lsof -i :3000

# Kill process
kill -9 <PID>

# Or change port
PORT=3001 npm start
```

#### 2. Database locked

```bash
# SQLite
rm dev.db-journal

# PostgreSQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'citarion';
```

#### 3. Memory issues

```bash
# Increase Node memory
export NODE_OPTIONS="--max-old-space-size=4096"
npm start

# Or in ecosystem.config.js
max_memory_restart: '2G'
```

#### 4. Prisma errors

```bash
# Regenerate client
npx prisma generate

# Reset database (development only!)
npx prisma migrate reset
```

#### 5. PM2 issues

```bash
# Check status
pm2 status

# View logs
pm2 logs citarion

# Restart
pm2 restart citarion

# Clear logs
pm2 flush
```

---

## ✅ Production Checklist

- [ ] Environment variables configured
- [ ] Database migrated
- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] Backup script running
- [ ] Monitoring enabled
- [ ] Rate limiting enabled
- [ ] Error logging configured
- [ ] Health check endpoint working
- [ ] Load testing completed
- [ ] Documentation updated
- [ ] Team trained

---

**Статус:** Production Ready
**Версия:** 1.2.0
