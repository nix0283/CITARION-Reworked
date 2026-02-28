# Интеграция Библиотек и Фильтров - Citarion v2.6

## Обзор

В этом обновлении интегрированы следующие компоненты:

### ✅ Готовые модули

#### 1. Bot Filters (`src/lib/bot-filters/`)
- `index.ts` - централизованный экспорт всех фильтров
- **BBSignalFilter** - фильтр сигналов для Bollinger Bands бота с Lawrence Classifier
- **DCAEntryFilter** - фильтр точек входа для DCA стратегии
- **VISIONSignalFilter** - ensemble-фильтр для VISION бота
- **EnhancedSignalFilter** - универсальный фильтр с ML-индикаторами

**Использование:**
```typescript
import { getBotFilter } from '@/lib/bot-filters';

// Получить фильтр для бота
const filter = await getBotFilter('BB', 'BTCUSDT', { minProbability: 0.7 });

// Инициализация (обучение ML модели)
await filter.initialize?.();

// Оценка сигнала
const result = await filter.evaluate(signalData);
if (result.approved) {
  // Выполнить сделку
}
```

#### 2. Technical Indicators (`src/lib/indicators/`)
- `index.ts` - экспорт всех индикаторов
- **Basic**: RSI, MACD, Bollinger Bands, EMA, SMA, ATR, ADX
- **ML-Enhanced**: MLAdaptiveSuperTrend, NeuralProbabilityChannel, SqueezeMomentum
- **Advanced**: AdaptiveSuperTrend, KernelRegression, KMeansVolatility, WaveTrend

**Использование:**
```typescript
import { getIndicator, type Candle } from '@/lib/indicators';

// Получить индикатор
const rsi = getIndicator('RSI');
const results = rsi.calculate(candles);

// ML индикатор с настройками
const mlSt = getIndicator('ML_ST', { atrLength: 10, baseFactor: 3 });
const mlResults = mlSt.calculate(candles);
```

#### 3. Skills Integration (`src/lib/skills/`)

##### Finance API Client
```typescript
import { getFinanceClient } from '@/lib/skills';

const finance = getFinanceClient();

// Котировка
const quote = await finance.getQuote('BTCUSDT');

// Исторические данные
const history = await finance.getHistoricalData('BTCUSDT', '1h', 100);

// Финансовые показатели
const metrics = await finance.getFinancialMetrics('AAPL');

// Новости
const news = await finance.getNews('crypto');

// Технический анализ
const technical = await finance.getTechnicalAnalysis('BTCUSDT');
```

##### Web Search Client
```typescript
import { getWebSearchClient } from '@/lib/skills';

const search = getWebSearchClient();

// Поиск в интернете
const results = await search.search('bitcoin price prediction');

// Поиск новостей
const news = await search.searchNews('crypto regulation');

// Извлечение контента
const page = await search.fetchPage('https://example.com/article');

// Суммаризация
const summary = await search.summarizeContent(longText, 300);
```

##### LLM Client (placeholder для будущего расширения)
```typescript
import { getLLMClient } from '@/lib/skills';

const llm = getLLMClient({ provider: 'zhipu', model: 'glm-4' });

const response = await llm.generate('Analyze this trading signal...', {
  systemPrompt: 'You are a trading assistant...'
});
```

### 🎨 UI Компоненты (`src/components/skills/`)

#### FinancePanel
Панель финансовых данных с вкладками:
- Quote - текущая котировка
- Metrics - финансовые показатели  
- News - новости рынка
- Technical - технический анализ

```tsx
import { FinancePanel } from '@/components/skills';

<FinancePanel 
  defaultSymbol="BTCUSDT"
  onSymbolSelect={(symbol) => console.log('Selected:', symbol)}
/>
```

#### WebSearchPanel
Панель веб-поиска с поддержкой:
- Обычный поиск и поиск новостей
- Кэширование результатов
- Быстрые теги популярных запросов

```tsx
import { WebSearchPanel } from '@/components/skills';

<WebSearchPanel 
  initialQuery="crypto market analysis"
  onResultSelect={(result) => console.log(result.url)}
/>
```

#### FilterIndicatorPanel
Панель управления фильтрами и индикаторами для TradingView-style интерфейса:
- Переключение фильтров по типам ботов (BB, DCA, VISION, GRID, ARGUS)
- Включение/выключение технических индикаторов
- Настройка пороговых значений вероятности и уверенности
- Кнопка обучения ML моделей

```tsx
import { FilterIndicatorPanel } from '@/components/skills';

<FilterIndicatorPanel
  symbol="BTCUSDT"
  timeframe="1h"
  onFilterChange={(config) => updateBotConfig(config)}
  onIndicatorChange={(config) => updateChartIndicators(config)}
/>
```

## 📁 Структура файлов

```
src/
├── lib/
│   ├── bot-filters/
│   │   ├── index.ts ← НОВЫЙ: централизованный экспорт
│   │   ├── bb-signal-filter.ts
│   │   ├── dca-entry-filter.ts
│   │   ├── enhanced-signal-filter.ts
│   │   └── vision-signal-filter.ts
│   ├── indicators/
│   │   ├── index.ts ← НОВЫЙ: централизованный экспорт
│   │   ├── builtin.ts
│   │   ├── calculator.ts
│   │   ├── ml-adaptive-supertrend.ts
│   │   ├── neural-probability-channel.ts
│   │   └── squeeze-momentum.ts
│   ├── skills/ ← НОВЫЙ: интеграция external skills
│   │   ├── index.ts
│   │   ├── finance-client.ts
│   │   ├── web-search-client.ts
│   │   └── (LLM placeholder)
│   └── index.ts ← НОВЫЙ: главный экспорт библиотеки
├── components/
│   └── skills/ ← НОВЫЕ UI компоненты
│       ├── finance-panel.tsx
│       ├── web-search-panel.tsx
│       └── filter-indicator-panel.tsx
└── skills/ ← Оригинальные standalone skills (не изменены)
    ├── finance/
    ├── web-search/
    ├── LLM/
    └── ...
```

## 🔧 Настройка

### 1. Environment Variables
Добавьте в `.env`:
```env
# Finance API
FINANCE_API_KEY=your_key_here
FINANCE_API_BASE_URL=https://api.finance.example.com/v1

# Web Search
SEARCH_API_KEY=your_key_here
SEARCH_PROVIDER=google  # google|bing|duckduckgo

# LLM (опционально)
LLM_API_KEY=your_key_here
LLM_PROVIDER=zhipu  # openai|anthropic|zhipu
```

### 2. Обновление зависимостей
Если используете новые API, добавьте в `package.json`:
```json
{
  "dependencies": {
    // ... существующие
    "node-fetch": "^3.3.2",
    "cheerio": "^1.0.0-rc.12"
  }
}
```

### 3. TypeScript Config
Убедитесь, что `tsconfig.json` включает:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## 🚀 Быстрый старт

1. **Импортируйте модули:**
```typescript
import { getBotFilter, getIndicator, getFinanceClient } from '@/lib';
```

2. **Настройте фильтры для бота:**
```typescript
const bbFilter = await getBotFilter('BB', 'BTCUSDT');
await bbFilter.initialize?.();
```

3. **Добавьте индикаторы на график:**
```typescript
const rsi = getIndicator('RSI');
const rsiValues = rsi.calculate(candles);
// Отобразите rsiValues на lightweight-charts
```

4. **Интегрируйте UI компоненты:**
```tsx
// В вашей странице дашборда
import { FinancePanel, FilterIndicatorPanel } from '@/components/skills';

<div className="grid grid-cols-3 gap-4">
  <FilterIndicatorPanel symbol="BTCUSDT" timeframe="1h" />
  <FinancePanel defaultSymbol="BTCUSDT" />
  {/* Ваш график */}
</div>
```

## 🧪 Тестирование

```bash
# Запустить тесты фильтров
npm test -- bot-filters

# Запустить тесты индикаторов  
npm test -- indicators

# E2E тест UI компонентов
npm run test:e2e -- skills
```

## 📊 Производительность

- **Кэширование**: Finance и Search клиенты используют in-memory cache с TTL
- **Lazy loading**: Фильтры загружаются по требованию через dynamic imports
- **ML модели**: Обучаются асинхронно, не блокируя UI

## 🔐 Безопасность

- API ключи хранятся в environment variables
- Все внешние запросы проходят через централизованный клиент с rate limiting
- ML модели изолированы по символам для предотвращения cross-contamination

## 🔄 Миграция с предыдущих версий

Если вы использовали фильтры напрямую:
```typescript
// Было:
import { BBSignalFilter } from '@/lib/bot-filters/bb-signal-filter';

// Стало (рекомендуется):
import { getBotFilter } from '@/lib/bot-filters';
const filter = await getBotFilter('BB', symbol);
```

Старый импорт продолжает работать для обратной совместимости.

---

> **Примечание**: Skills в папке `skills/` остаются как standalone модули для использования вне проекта. Интегрированные версии находятся в `src/lib/skills/` с адаптацией под архитектуру Citarion.

**Версия**: 2.6.0  
**Дата**: Февраль 2026  
**Статус**: ✅ Готово к production
