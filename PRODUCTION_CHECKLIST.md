# ✅ Production Readiness Checklist

**Версия:** 1.2.0
**Дата:** 2025-01-22

---

## 🔧 Подготовка

### 1. Окружение

- [ ] `.env.production` создан и заполнен
- [ ] Все секреты сгенерированы (openssl)
- [ ] Переменные окружения проверены
- [ ] Тестовые данные удалены

### 2. База данных

- [ ] PostgreSQL установлен и настроен
- [ ] Миграции применены (`prisma migrate deploy`)
- [ ] Prisma Client сгенерирован (`prisma generate`)
- [ ] Backup скрипт настроен
- [ ] Recovery протестирован

### 3. Безопасность

- [ ] Firewall настроен (UFW)
- [ ] Fail2Ban установлен
- [ ] SSL сертификат установлен (Let's Encrypt)
- [ ] Rate limiting включён
- [ ] API keys сгенерированы
- [ ] CORS настроен

---

## 🐳 Docker развёртывание

### 1. Build

```bash
docker-compose build
```

- [ ] Build прошёл без ошибок
- [ ] Размер образа < 500MB
- [ ] Health checks работают

### 2. Запуск

```bash
docker-compose up -d
```

- [ ] Все сервисы запущены
- [ ] Health checks зелёные
- [ ] Логи чистые (нет ошибок)

### 3. Проверка

```bash
docker-compose ps
docker-compose logs citarion
```

- [ ] CITARION app: running (healthy)
- [ ] PostgreSQL: running (healthy)
- [ ] Redis: running (healthy)
- [ ] Grafana: running
- [ ] Prometheus: running
- [ ] Nginx: running

---

## 🖥️ VPS развёртывание

### 1. Сервер

- [ ] Ubuntu 22.04 LTS
- [ ] Минимум 4 GB RAM
- [ ] Минимум 2 CPU cores
- [ ] SSD диск (20+ GB)
- [ ] Статический IP

### 2. Установка

```bash
# Node.js
node --version  # v20.x

# PM2
pm2 --version  # 5.x

# Nginx
nginx -v  # 1.24+
```

- [ ] Node.js 20.x установлен
- [ ] PM2 установлен
- [ ] Nginx установлен

### 3. Приложение

```bash
npm install --legacy-peer-deps
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

- [ ] Зависимости установлены
- [ ] Build успешен
- [ ] PM2 настроен
- [ ] Автозапуск включён

### 4. Nginx

```bash
sudo nginx -t
sudo systemctl restart nginx
```

- [ ] Config валиден
- [ ] Reverse proxy работает
- [ ] SSL настроен

---

## 🧪 Тестирование

### 1. API Tests

```bash
# Health check
curl https://your-domain.com/api/health

# Vision Forecast
curl "https://your-domain.com/api/vision/forecast?symbol=BTC/USDT"

# Copy Trading Masters
curl https://your-domain.com/api/copy-trading/masters
```

- [ ] Health check: 200 OK
- [ ] Vision API: работает
- [ ] Copy Trading API: работает
- [ ] Webhook endpoint: доступен

### 2. Frontend Tests

- [ ] Главная страница загружается
- [ ] Dashboard работает
- [ ] Trading формы работают
- [ ] Charts отображаются
- [ ] Mobile version responsive

### 3. Integration Tests

- [ ] Telegram бот отвечает
- [ ] TradingView webhook принимается
- [ ] Paper Trading сохраняет данные
- [ ] Copy Trading работает

### 4. Load Tests

```bash
# Apache Bench
ab -n 1000 -c 10 https://your-domain.com/

# wrk
wrk -t12 -c400 -d30s https://your-domain.com/
```

- [ ] Response time < 500ms
- [ ] Error rate < 1%
- [ ] Max concurrent users: 100+

---

## 📊 Мониторинг

### 1. Grafana

- [ ] Dashboard доступен (порт 3001)
- [ ] Prometheus datasource подключён
- [ ] Метрики отображаются
- [ ] Alerts настроены

### 2. Alerts

| Метрика | Threshold | Статус |
|---------|-----------|--------|
| CPU Usage | > 80% | [ ] |
| Memory Usage | > 85% | [ ] |
| Disk Usage | > 90% | [ ] |
| API Response Time | > 2s | [ ] |
| Error Rate | > 1% | [ ] |
| Database Connections | > 80% | [ ] |

### 3. Logging

- [ ] Логи пишутся в файлы
- [ ] Log rotation настроен
- [ ] Centralized logging (опционально)
- [ ] Error tracking (Sentry)

---

## 💾 Backup

### 1. Database Backup

```bash
# Manual backup
pg_dump -U citarion citarion > backup.sql

# Check backup
ls -lh /backups/db/
```

- [ ] Backup скрипт работает
- [ ] Backups создаются ежедневно
- [ ] Retention policy настроена (7 дней)
- [ ] Recovery протестирован

### 2. Application Backup

- [ ] .env backed up
- [ ] Prisma schema backed up
- [ ] Custom configs backed up

### 3. Disaster Recovery

- [ ] Recovery документация есть
- [ ] Recovery протестирован
- [ ] RTO < 4 hours
- [ ] RPO < 24 hours

---

## 🔒 Security Audit

### 1. Dependencies

```bash
npm audit
```

- [ ] Нет critical уязвимостей
- [ ] Зависимости обновлены
- [ ] Lock file committed

### 2. Network

- [ ] Только нужные порты открыты
- [ ] SSH на нестандартном порту
- [ ] Fail2Ban активен
- [ ] DDoS protection (Cloudflare)

### 3. Application

- [ ] Input validation (Zod)
- [ ] SQL injection protection (Prisma)
- [ ] XSS protection (Next.js)
- [ ] CSRF protection
- [ ] Rate limiting active

### 4. Secrets

- [ ] Нет секретов в коде
- [ ] .env в .gitignore
- [ ] Secrets rotated regularly
- [ ] Encryption keys secure

---

## 📈 Performance

### 1. Frontend

- [ ] Lighthouse score > 90
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3.5s
- [ ] Cumulative Layout Shift < 0.1

### 2. Backend

- [ ] API response time < 200ms
- [ ] Database queries < 50ms
- [ ] Cache hit rate > 80%
- [ ] Memory usage < 2GB

### 3. Database

- [ ] Indexes настроены
- [ ] Query performance оптимизирован
- [ ] Connection pooling настроен
- [ ] Vacuum/Analyze настроен

---

## 📝 Документация

- [ ] API документация актуальна
- [ ] Deployment guide есть
- [ ] Troubleshooting guide есть
- [ ] User documentation есть
- [ ] Changelog ведётся

---

## 👥 Team Readiness

- [ ] Команда обучена
- [ ] On-call rotation настроен
- [ ] Incident response plan есть
- [ ] Communication channels настроены

---

## 🚀 Go-Live

### Pre-Launch

- [ ] Все тесты прошли
- [ ] Backup настроен
- [ ] Мониторинг активен
- [ ] Команда готова

### Launch Day

- [ ] Deploy completed
- [ ] Smoke tests passed
- [ ] Monitoring checked
- [ ] Team on standby

### Post-Launch (24h)

- [ ] No critical errors
- [ ] Performance acceptable
- [ ] User feedback positive
- [ ] Backups working

---

## ✅ Final Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| DevOps | | | |
| Developer | | | |
| QA | | | |
| Manager | | | |

---

**Статус:** [ ] ГОТОВО К PRODUCTION

**Дата запуска:** _______________

**Подпись:** _______________

---

*Версия чеклиста: 1.0*
*Последнее обновление: 2025-01-22*
