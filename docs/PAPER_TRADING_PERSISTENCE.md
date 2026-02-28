# 📊 Paper Trading Persistence

**Версия:** 1.2.0
**Статус:** ✅ Реализовано

---

## 🎯 Что это

Paper Trading Persistence сохраняет состояние Paper Trading аккаунтов в базу данных.

### Проблемы которые решает:

| Проблема | Было | Стало |
|----------|------|-------|
| **Потеря данных** | ❌ При рестарте все данные терялись | ✅ Данные сохраняются в БД |
| **Нет истории** | ❌ Невозможно продолжить сессию | ✅ Загрузка последней сессии |
| **Один аккаунт** | ❌ Только один аккаунт в памяти | ✅ Множество аккаунтов |
| **Нет бэкапа** | ❌ Нет резервного копирования | ✅ Авто-сохранение каждые 5 минут |

---

## 🏗️ Архитектура

```
┌─────────────────────┐
│  Paper Trading      │
│  Engine             │
│                     │
│  • Accounts         │
│  • Positions        │
│  • Trades           │
└──────────┬──────────┘
           │
           │ Auto-save (5 min)
           │ On events
           ▼
┌─────────────────────┐
│  Persistence        │
│  Service            │
│                     │
│  • Save to DB       │
│  • Load from DB     │
│  • Auto-save timer  │
└──────────┬──────────┘
           │
           │ Prisma ORM
           ▼
┌─────────────────────┐
│  Database           │
│  (SQLite)           │
│                     │
│  • PaperAccount     │
│  • Positions (JSON) │
│  • Equity (JSON)    │
└─────────────────────┘
```

---

## 📁 Новые файлы

| Файл | Описание |
|------|----------|
| `src/lib/paper-trading/persistence.ts` | Service для сохранения/загрузки |
| `src/app/api/paper-trading/accounts/route.ts` | API endpoints |
| `prisma/schema.prisma` | Обновлена схема (PaperAccount модель) |

---

## 🗄️ Схема базы данных

```prisma
model PaperAccount {
  id              String   @id @default(cuid())
  userId          String
  
  // Конфигурация
  name            String
  initialBalance  Float
  maxLeverage     Int      @default(10)
  maxOpenPositions Int     @default(5)
  maxRiskPerTrade Float    @default(2)
  feePercent      Float    @default(0.1)
  maxDrawdown     Float    @default(20)
  
  // Текущее состояние
  balance         Float
  equity          Float
  status          String   @default("IDLE")
  
  // Данные (JSON)
  positions       String   @default("[]")
  equityCurve     String   @default("[]")
  tradeHistory    String   @default("[]")
  
  // Метрики
  totalPnl        Float    @default(0)
  realizedPnl     Float    @default(0)
  maxDrawdown     Float    @default(0)
  
  // Временные метки
  startedAt       DateTime?
  stoppedAt       DateTime?
  lastUpdate      DateTime @default(now())
  
  @@index([userId, status])
}
```

---

## 🚀 Использование

### API Endpoints

#### 1. Создать аккаунт

```bash
POST /api/paper-trading/accounts?userId=user123

{
  "name": "My Test Account",
  "initialBalance": 10000,
  "maxLeverage": 10,
  "maxOpenPositions": 5
}
```

**Response:**
```json
{
  "success": true,
  "account": {
    "id": "paper-1737580000000-abc123",
    "name": "My Test Account",
    "balance": 10000,
    "equity": 10000,
    "status": "RUNNING"
  }
}
```

#### 2. Получить все аккаунты

```bash
GET /api/paper-trading/accounts?userId=user123
```

**Response:**
```json
{
  "success": true,
  "accounts": [
    {
      "id": "paper-1737580000000-abc123",
      "name": "My Test Account",
      "balance": 10500,
      "equity": 10500,
      "status": "RUNNING",
      "totalPnl": 500
    }
  ],
  "count": 1
}
```

#### 3. Удалить аккаунт

```bash
DELETE /api/paper-trading/accounts?accountId=paper-1737580000000-abc123
```

---

## 🔧 Как работает авто-сохранение

### 1. При создании аккаунта

```typescript
const account = engine.createAccount(config, userId);

// Автоматически:
// 1. Сохраняет в БД
// 2. Запускает авто-сохранение (каждые 5 минут)
```

### 2. При событиях

```typescript
// Сохраняет при критических событиях:
// - POSITION_OPENED
// - POSITION_CLOSED
// - BALANCE_UPDATE
```

### 3. По таймеру

```typescript
// Каждые 5 минут:
setInterval(() => {
  persistence.saveAccount(account, userId);
}, 300000);
```

---

## 📊 Хранение данных

### Equity Curve

- Хранит последние **1000 точек**
- Частота: 1 точка в минуту
- История: ~16 часов торговли

```json
[
  {
    "timestamp": "2025-01-22T10:00:00Z",
    "balance": 10000,
    "equity": 10100,
    "drawdownPercent": 0
  },
  ...
]
```

### Trade History

- Хранит последние **100 сделок**
- Полная информация о каждой сделке

```json
[
  {
    "id": "trade-1",
    "symbol": "BTCUSDT",
    "direction": "LONG",
    "pnl": 200,
    "closedAt": "2025-01-22T12:00:00Z"
  },
  ...
]
```

### Positions

- Все открытые позиции в JSON формате
- Включает SL/TP, trailing stop состояние

---

## ✅ Преимущества

| Функция | Описание |
|---------|----------|
| **Persistence** | Данные не теряются при рестарте |
| **Auto-save** | Сохранение каждые 5 минут |
| **Event-based** | Сохранение при важных событиях |
| **Multi-account** | Поддержка множества аккаунтов |
| **History** | Кривая эквити и история сделок |
| **Metrics** | Все метрики сохраняются |

---

## 🔍 Миграция

### Обновление базы данных

```bash
# Применить изменения схемы
npm run db:push

# Или с миграциями
npm run db:migrate
```

### Проверка

```bash
# Открыть Prisma Studio
npm run db:studio

# Проверить таблицу PaperAccount
```

---

## 📈 Метрики

| Показатель | Значение |
|------------|----------|
| Auto-save interval | 5 минут |
| Max equity points | 1000 |
| Max trade history | 100 |
| Storage per account | ~50-100 KB |
| Save on events | POSITION_OPENED, POSITION_CLOSED, BALANCE_UPDATE |

---

## 🐛 Известные ограничения

1. **JSON хранение** - позиции хранятся как JSON (не нормализовано)
   - Будет улучшено в v1.3.0

2. **Одна БД** - все аккаунты в одной SQLite БД
   - PostgreSQL поддержка в v1.3.0

3. **Нет синхронизации** - нет multi-server sync
   - Будет добавлено в v1.4.0

---

## 🎯 Тестирование

### Создать аккаунт

```bash
curl -X POST "http://localhost:3000/api/paper-trading/accounts?userId=test123" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Account","initialBalance":10000}'
```

### Проверить сохранение

1. Создайте аккаунт
2. Откройте позицию
3. Перезапустите сервер
4. Загрузите аккаунты - данные должны сохраниться!

---

**Статус:** ✅ Готово к использованию
**Версия:** 1.2.0
