# 🧪 Тестирование CITARION

Руководство по тестированию платформы CITARION.

---

## 📋 Содержание

- [Установка](#установка)
- [Запуск тестов](#запуск-тестов)
- [Структура тестов](#структура-тестов)
- [Написание тестов](#написание-тестов)
- [Best Practices](#best-practices)

---

## Установка

### Зависимости

```bash
npm install
```

### Переменные окружения

Тесты используют тестовую БД и моки. Убедитесь, что `.env` содержит:

```env
DATABASE_URL="file:./test.db"
NEXTAUTH_SECRET="test-secret-key-for-testing-only"
TRADINGVIEW_WEBHOOK_SECRET="test-webhook-secret"
TELEGRAM_BOT_TOKEN="test-bot-token"
```

---

## Запуск тестов

### Все тесты

```bash
npm test
```

### Watch режим (автоматический перезапуск)

```bash
npm run test:watch
```

### С отчётом покрытия

```bash
npm run test:coverage
```

Отчёт будет в `coverage/index.html`

### E2E тесты

```bash
npm run test:e2e
```

### E2E с UI

```bash
npm run test:e2e:ui
```

### Конкретный тест файл

```bash
npm test -- paper-trading.test.ts
```

### Тесты по паттерну

```bash
npm test -- -t "Paper Trading"
```

---

## Структура тестов

```
__tests__/
├── paper-trading.test.ts          # Paper Trading Engine
├── tradingview-webhook.test.ts    # Webhook Security
├── backtesting.test.ts            # Backtesting Engine (TODO)
├── bots/
│   ├── grid-bot.test.ts           # Grid Bot (TODO)
│   ├── dca-bot.test.ts            # DCA Bot (TODO)
│   └── bb-bot.test.ts             # BB Bot (TODO)
├── api/
│   ├── trade.test.ts              # Trade API (TODO)
│   └── webhook.test.ts            # Webhook API (TODO)
└── components/
    ├── dashboard.test.tsx         # Dashboard Component (TODO)
    └── forms.test.tsx             # Form Components (TODO)
```

---

## Написание тестов

### Unit тесты

```typescript
import { getPaperTradingEngine } from '@/lib/paper-trading/engine';

describe('PaperTradingEngine', () => {
  let engine: ReturnType<typeof getPaperTradingEngine>;
  
  beforeEach(() => {
    engine = getPaperTradingEngine();
  });
  
  afterEach(() => {
    // Cleanup
    engine.getAllAccounts().forEach(acc => {
      engine.deleteAccount(acc.id);
    });
  });
  
  it('should create account with initial balance', () => {
    const account = engine.createAccount({
      id: 'test-1',
      name: 'Test',
      initialBalance: 10000,
      // ... other config
    });
    
    expect(account.balance).toBe(10000);
    expect(account.equity).toBe(10000);
  });
});
```

### Async тесты

```typescript
it('should fetch data asynchronously', async () => {
  const data = await fetchData();
  
  expect(data).toBeDefined();
  expect(data.length).toBeGreaterThan(0);
});
```

### Тесты с моками

```typescript
// Mock модуля
jest.mock('@/lib/db', () => ({
  db: {
    position: {
      create: jest.fn().mockResolvedValue({ id: 'pos_123' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

it('should create position', async () => {
  await createPosition(...);
  
  expect(db.position.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      symbol: 'BTCUSDT',
    }),
  });
});
```

### Snapshot тесты

```typescript
it('should render correctly', () => {
  const { container } = render(<Dashboard />);
  
  expect(container).toMatchSnapshot();
});
```

---

## Best Practices

### ✅ Делайте

1. **Используйте описательные имена**
   ```typescript
   // ✅ Хорошо
   it('should calculate PnL correctly for LONG position')
   
   // ❌ Плохо
   it('should work')
   ```

2. **Один тест - одна ответственность**
   ```typescript
   // ✅ Хорошо
   it('should open position')
   it('should close position')
   it('should calculate PnL')
   
   // ❌ Плохо
   it('should open and close position and calculate PnL')
   ```

3. **Используйте beforeEach/afterEach**
   ```typescript
   beforeEach(() => {
     // Setup для каждого теста
   });
   
   afterEach(() => {
     // Cleanup после каждого теста
   });
   ```

4. **Тестируйте граничные случаи**
   ```typescript
   it('should handle zero amount')
   it('should handle negative price')
   it('should handle maximum leverage')
   ```

5. **Используйте custom matchers**
   ```typescript
   expect(date).toBeValidDate();
   expect(value).toBeWithinRange(0, 100);
   expect(price).toBeApproximately(50000, 0.01);
   ```

### ❌ Не делайте

1. **Не полагайтесь на порядок тестов**
   ```typescript
   // ❌ Плохо - тесты зависят друг от друга
   it('should create account', () => {...})
   it('should use account from previous test', () => {...})
   
   // ✅ Хорошо - каждый тест независим
   it('should create and use account', () => {
     const account = createAccount();
     // use account
   });
   ```

2. **Не используйте setTimeout без необходимости**
   ```typescript
   // ❌ Плохо
   setTimeout(() => {
     expect(value).toBe(1);
   }, 1000);
   
   // ✅ Хорошо
   await waitFor(() => {
     expect(value).toBe(1);
   });
   ```

3. **Не игнорируйте ошибки**
   ```typescript
   // ❌ Плохо
   try {
     doSomething();
   } catch (e) {
     // ignore
   }
   
   // ✅ Хорошо
   await expect(doSomething()).rejects.toThrow('Expected error');
   ```

---

## Покрытие кода

### Цели

| Тип | Цель |
|-----|------|
| Statements | 50% |
| Branches | 50% |
| Functions | 50% |
| Lines | 50% |

### Проверка покрытия

```bash
npm run test:coverage
open coverage/index.html
```

### Увеличение покрытия

1. Найдите непокрытые файлы в `coverage/lcov-report/`
2. Добавьте тесты для критических путей
3. Тестируйте error handling
4. Тестируйте граничные случаи

---

## Отладка тестов

### VS Code конфигурация

Создайте `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Jest Current File",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": [
        "${relativeFile}",
        "--config",
        "jest.config.ts"
      ],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### Логирование в тестах

```typescript
it('should log debug info', () => {
  console.log('Debug:', value);
  expect(value).toBe(1);
});
```

---

## CI/CD Интеграция

### GitHub Actions пример

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

---

## Ресурсы

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright](https://playwright.dev/docs/intro)
- [TypeScript Testing](https://www.typescriptlang.org/docs/handbook/testing.html)

---

*Последнее обновление: 2025-01-22*
