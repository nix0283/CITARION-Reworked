# 🏠 CITARION v1.3.0 - Домашняя Установка

**Версия:** 1.3.0  
**Платформа:** Windows (Home)  
**Статус:** ✅ Ready

---

## 📋 Требования

| Компонент | Требование | Статус |
|-----------|------------|--------|
| ОС | Windows 10/11 | ✅ |
| Node.js | 18+ | ✅ (v24.13.1) |
| npm | 9+ | ✅ (v11.8.0) |
| RAM | 4GB+ | ✅ |
| Disk | 10GB+ | ✅ |

---

## 🚀 Быстрый Старт

### 1. Запуск

```powershell
# В PowerShell
.\deploy-production.ps1
```

### 2. Открыть Приложение

```
http://localhost:3000
```

### 3. Первый Вход

- Первый пользователь создаётся автоматически
- Все функции доступны сразу

---

## ⚙️ Конфигурация

### База Данных

**SQLite** (по умолчанию) - идеально для дома:
- Нет необходимости в PostgreSQL
- Все данные в одном файле
- Автоматический backup

Путь: `prisma/dev.db`

### Порты

| Сервис | Порт | Доступ |
|--------|------|--------|
| Web UI | 3000 | localhost |
| API | 3000 | localhost |

---

## 💡 Повседневное Использование

### Запуск

```powershell
# Вариант 1: npm
npm start

# Вариант 2: PM2 (если установлен)
pm2 start npm --name "citarion" -- start

# Вариант 3: Дважды кликнуть на start.bat (создать ниже)
```

### Остановка

```powershell
# Ctrl+C в терминале

# Или PM2
pm2 stop citarion
```

### Перезапуск

```powershell
# PM2
pm2 restart citarion

# Или Ctrl+C, затем npm start
```

---

## 📊 Мониторинг

### Логи

```powershell
# Просмотр в реальном времени
Get-Content logs\app.log -Tail 50 -Wait

# Последние 100 строк
Get-Content logs\app.log -Tail 100

# Ошибки
Get-Content logs\app.log | Select-String "ERROR"
```

### Здоровье

```powershell
# Проверка API
curl http://localhost:3000/api/health

# Статус circuit breaker
curl http://localhost:3000/api/admin/circuit-breaker/status
```

---

## 🔧 Обслуживание

### Backup Базы Данных

```powershell
# Ручной backup
Copy-Item "prisma\dev.db" "prisma\dev.db.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"

# Автоматический backup (ежедневно)
# Создать task в Task Scheduler
```

### Обновление

```powershell
# 1. Остановить
pm2 stop citarion  # или Ctrl+C

# 2. Обновить код
git pull

# 3. Установить зависимости
npm install

# 4. Миграция БД
npx prisma db push

# 5. Запустить
npm start
```

### Очистка

```powershell
# Очистить старые логи
Get-ChildItem logs\*.log | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | Remove-Item

# Очистить npm cache
npm cache clean --force
```

---

## 🛡️ Безопасность (Дом)

### Минимальные Требования

- [x] ✅ ENCRYPTION_KEY настроен
- [ ] ⏳ Windows Firewall (опционально)
- [ ] ⏳ Регулярные backup'ы

### Firewall (Опционально)

```powershell
# Разрешить порт 3000 (если нужен доступ из локальной сети)
New-NetFirewallRule -DisplayName "CITARION" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow

# Запретить (только localhost)
Remove-NetFirewallRule -DisplayName "CITARION"
```

### Доступ из Локальной Сети (Опционально)

```powershell
# В .env.production добавить
echo 'HOSTNAME="0.0.0.0"' >> .env.production

# Перезапустить
npm start
```

**⚠️ Внимание:** Это откроет доступ с других устройств в вашей сети!

---

## 📁 Структура Файлов (Дом)

```
C:\Users\CITARION\
├── prisma\
│   └── dev.db              # База данных
├── logs\
│   └── app.log             # Логи приложения
├── .next\                  # Build файлы
├── node_modules\           # Зависимости
├── .env.production         # Конфигурация
├── deploy-production.ps1   # Скрипт развёртывания
└── start.bat               # Ярлык запуска (создать)
```

### Создать Ярлык Запуска

```powershell
# Создать start.bat
@"
@echo off
echo Starting CITARION...
npm start
"@ | Out-File -FilePath "start.bat" -Encoding ASCII
```

---

## 🆘 Troubleshooting (Дом)

### Приложение не запускается

```powershell
# Проверить логи
Get-Content logs\app.log -Tail 100

# Проверить порт
netstat -ano | findstr :3000

# Остановить процесс на порту 3000
$pid = (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess
Stop-Process -Id $pid -Force
```

### База данных заблокирована

```powershell
# Остановить приложение
# Удалить lock файл
Remove-Item "prisma\dev.db-journal" -ErrorAction SilentlyContinue

# Запустить снова
npm start
```

### Мало места на диске

```powershell
# Очистить логи
Remove-Item "logs\*.log" -ErrorAction SilentlyContinue

# Очистить npm cache
npm cache clean --force

# Очистить старые backup'ы
Get-ChildItem "backups\*" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item
```

---

## 📈 Производительность (Дом)

### Ожидаемое Использование

| Ресурс | Простой | Активная Торговля |
|--------|---------|-------------------|
| CPU | 2-5% | 10-20% |
| RAM | 300-500 MB | 500-800 MB |
| Disk | 2-3 GB | 3-5 GB |
| Network | Минимальный | Зависит от активности |

### Оптимизация

```powershell
# Ограничить использование RAM
$env:NODE_OPTIONS="--max-old-space-size=2048"
npm start
```

---

## 🎯 Чеклист Первого Запуска

- [ ] ✅ Deployment завершён успешно
- [ ] ⏳ Приложение открывается (http://localhost:3000)
- [ ] ⏳ Health check проходит
- [ ] ⏳ Первый вход выполнен
- [ ] ⏳ Биржи подключены
- [ ] ⏳ Тестовая сделка выполнена
- [ ] ⏳ Backup настроен

---

## 📞 Поддержка (Дом)

### Логи

```powershell
# Просмотр
Get-Content logs\app.log -Tail 50 -Wait

# Экспорт
Get-Content logs\app.log | Out-File "logs-export-$(Get-Date -Format 'yyyyMMdd').txt"
```

### Диагностика

```powershell
# Запустить диагностику
npx ts-node -e "
  console.log('Node:', process.version);
  console.log('Platform:', process.platform);
  console.log('Memory:', process.memoryUsage());
"
```

---

## 🎉 Готово!

После успешного deployment:

1. Откройте http://localhost:3000
2. Создайте первого пользователя
3. Подключите биржи
4. Настройте ботов
5. Наслаждайтесь!

---

**Приятной торговли!** 🚀

*Последнее обновление: 2025-01-22*
