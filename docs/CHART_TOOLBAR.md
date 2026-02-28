# 📊 Chart with TradingView-Style Toolbar

Полнофункциональный компонент графика с боковой панелью инструментов рисования, вдохновлённый TradingView.

```
┌─────────────────────────────────────────────────────────┐
│ 🔍 BTCUSDT  [1h]                              📐 3 рис. │
├────┬────────────────────────────────────────────────────┤
│ 📏 │                                                    │
│ ├──│                                                    │
│ 📐 │     ╭─────────────────────────╮                   │
│ ◻️ │    /                           \                  │
│ 📝 │   /    📈 Lightweight Charts   \                 │
│ 🔧 │  │   + Drawing Overlay Canvas  │                 │
│    │   \                           /                  │
│ 🎨 │    \─────────────────────────╯                   │
│ ── │                                                    │
│ 🗑️ │                                                    │
└────┴────────────────────────────────────────────────────┘
     ↑
  Боковая панель инструментов
```

---

## 🚀 Быстрый старт

### Установка зависимостей

```bash
# Lightweight Charts (основная библиотека)
bun add lightweight-charts

# Типы (опционально, для TypeScript)
bun add -d @types/lightweight-charts
```

### Базовое использование

```tsx
import { ChartWithToolbar } from '@/components/chart';

function TradingView() {
  const data = [
    { time: '2024-01-01', open: 42000, high: 43000, low: 41000, close: 42500 },
    { time: '2024-01-02', open: 42500, high: 44000, low: 42000, close: 43500 },
    // ... ваши данные
  ];
  
  return (
    <ChartWithToolbar
      data={data}
      symbol="BTCUSDT"
      timeframe="1h"
      seriesType="candlestick"
      height={600}
    />
  );
}
```

---

## 🎨 Доступные инструменты рисования

### 📏 Линии

| Инструмент | Shortcut | Описание |
|------------|----------|----------|
| **Trend Line** | `Alt+T` | Линия тренда между двумя точками |
| **Horizontal Line** | `Alt+H` | Горизонтальная линия на уровне цены |
| **Vertical Line** | `Alt+V` | Вертикальная линия на временной метке |
| **Ray** | — | Луч, уходящий в бесконечность |
| **Parallel Channel** | — | Параллельный канал |
| **Andrew's Pitchfork** | — | Вилы Эндрюса |

### 📐 Fibonacci

| Инструмент | Описание |
|------------|----------|
| **Fibonacci Retracement** | Уровни коррекции Фибоначчи (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1) |
| **Fibonacci Extension** | Уровни расширения Фибоначчи |

### ◻️ Фигуры

| Инструмент | Shortcut | Описание |
|------------|----------|----------|
| **Rectangle** | `Alt+R` | Прямоугольник с заливкой |
| **Ellipse** | — | Эллипс с заливкой |

### 📝 Аннотации

| Инструмент | Shortcut | Описание |
|------------|----------|----------|
| **Text** | `Alt+X` | Текстовая заметка |
| **Arrow Up** | — | Стрелка вверх (бычий сигнал) |
| **Arrow Down** | — | Стрелка вниз (медвежий сигнал) |

### 🔧 Инструменты

| Инструмент | Shortcut | Описание |
|------------|----------|----------|
| **Cursor** | `Esc` | Выбор и перемещение рисунков |
| **Crosshair** | `Alt+H` | Перекрестие для точного позиционирования |
| **Measure** | `Alt+M` | Измерение расстояния (цена, %, время) |
| **Eraser** | `Delete` | Удаление выбранного рисунка |
| **Remove All** | — | Удалить все рисунки |

---

## ⚙️ Конфигурация

### Props компонента

```typescript
interface ChartWithToolbarProps {
  // Обязательные
  data: ChartDataPoint[];        // Данные для графика
  symbol: string;                 // Торговая пара (BTCUSDT)
  timeframe: string;             // Таймфрейм (1h, 4h, 1d)
  
  // Опциональные
  seriesType?: 'candlestick' | 'line' | 'area';  // Тип серии
  initialToolbarState?: Partial<ToolbarState>;   // Начальное состояние панели
  onDrawingChange?: (event: DrawingEvent, drawings: DrawingObject[]) => void;
  onLoad?: (chart: IChartApi, series: ISeriesApi) => void;
  className?: string;
  height?: string | number;      // Высота графика
}
```

### Пример с расширенной конфигурацией

```tsx
<ChartWithToolbar
  data={candleData}
  symbol="ETHUSDT"
  timeframe="4h"
  seriesType="candlestick"
  
  // Начальные настройки инструментов
  initialToolbarState={{
    activeColor: '#00C853',
    activeWidth: 3,
    fibonacciLevels: [
      { level: 0, visible: true, color: '#FFD700' },
      { level: 0.382, visible: true, color: '#FFD700' },
      { level: 0.618, visible: true, color: '#FFD700' },
      { level: 1, visible: true, color: '#FFD700' },
    ],
  }}
  
  // Обработчик изменений рисунков
  onDrawingChange={(event, drawings) => {
    // Сохраняем рисунки в localStorage
    if (event.type === 'draw_end') {
      localStorage.setItem(
        `drawings_${symbol}`,
        JSON.stringify(drawings)
      );
    }
  }}
  
  // Доступ к API графика
  onLoad={(chart, series) => {
    // Добавляем дополнительные индикаторы
    // series.createPriceLine({ price: 42000, color: '#FF0000' });
  }}
  
  height={800}
/>
```

---

## 🔌 API и события

### Обработка событий рисования

```typescript
interface DrawingEvent {
  type: 'draw_start' | 'draw_move' | 'draw_end' | 'select' | 'deselect' | 'update' | 'delete';
  drawingId: string;
  data?: unknown;
}

// Пример: отслеживание создания нового рисунка
onDrawingChange={(event, drawings) => {
  if (event.type === 'draw_end') {
    const newDrawing = drawings.find(d => d.id === event.drawingId);
    console.log('Новый рисунок:', newDrawing);
    
    // Отправляем на сервер для сохранения
    saveDrawingToBackend(newDrawing);
  }
  
  if (event.type === 'delete' && event.drawingId === 'all') {
    console.log('Все рисунки удалены');
    clearBackendDrawings();
  }
}}
```

### Программное управление рисунками

```typescript
// Получение ссылки на DrawingManager
let drawingManager: DrawingCanvasOverlay | null = null;

<ChartWithToolbar
  onLoad={(chart, series) => {
    // DrawingManager создаётся внутри компонента
    // Для доступа используйте ref или callback
  }}
/>

// Альтернатива: используйте export/import
const exportDrawings = () => {
  const json = drawingManager?.exportDrawings();
  return json; // JSON string
};

const importDrawings = (json: string) => {
  drawingManager?.importDrawings(json);
};
```

---

## 🎨 Кастомизация стилей

### Цветовая схема

Компонент использует CSS-переменные для темизации:

```css
/* В вашем global.css или module.css */
.chart-container {
  --chart-bg: #0f1118;
  --chart-text: #d1d4dc;
  --chart-grid: #1e222d;
  --chart-border: #2a2e39;
  --chart-accent: #2962FF;
  --chart-bullish: #26a69a;
  --chart-bearish: #ef5350;
}

/* Тёмная тема (по умолчанию) */
.chart-container.dark {
  /* уже применены значения выше */
}

/* Светлая тема */
.chart-container.light {
  --chart-bg: #ffffff;
  --chart-text: #1e222d;
  --chart-grid: #e0e3eb;
  --chart-border: #d1d4dc;
  --chart-accent: #1976d2;
  --chart-bullish: #00c853;
  --chart-bearish: #ff1744;
}
```

### Применение темы

```tsx
<ChartWithToolbar
  className="chart-container dark"  // или "light"
  // ... остальные props
/>
```

---

## 💾 Сохранение и загрузка рисунков

### Сохранение в localStorage

```typescript
// Хук для сохранения рисунков
function useChartDrawingsPersistence(symbol: string) {
  const key = `citarion_drawings_${symbol}`;
  
  const save = useCallback((drawings: DrawingObject[]) => {
    localStorage.setItem(key, JSON.stringify(drawings));
  }, [key]);
  
  const load = useCallback((): DrawingObject[] => {
    const json = localStorage.getItem(key);
    return json ? JSON.parse(json) : [];
  }, [key]);
  
  const clear = useCallback(() => {
    localStorage.removeItem(key);
  }, [key]);
  
  return { save, load, clear };
}

// Использование в компоненте
function MyChart() {
  const { save, load } = useChartDrawingsPersistence('BTCUSDT');
  
  return (
    <ChartWithToolbar
      data={data}
      symbol="BTCUSDT"
      timeframe="1h"
      onDrawingChange={(event, drawings) => {
        if (['draw_end', 'update', 'delete'].includes(event.type)) {
          save(drawings);
        }
      }}
      onLoad={() => {
        // Загружаем сохранённые рисунки при инициализации
        const saved = load();
        if (saved.length > 0) {
          // Импорт через DrawingManager (нужен доступ к ref)
        }
      }}
    />
  );
}
```

### Сохранение на сервере

```typescript
// API endpoint для сохранения рисунков
// POST /api/chart/drawings
{
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "drawings": [
    {
      "id": "drawing_123",
      "type": "trend_line",
      "points": [
        { "time": 1704067200, "price": 42000 },
        { "time": 1704153600, "price": 43500 }
      ],
      "properties": {
        "color": "#2962FF",
        "width": 2,
        "opacity": 1
      },
      "createdAt": 1704067200000
    }
  ]
}
```

---

## ⌨️ Горячие клавиши

| Клавиша | Действие |
|---------|----------|
| `Esc` | Отменить рисование / Выбрать инструмент курсора |
| `Alt+T` | Линия тренда |
| `Alt+H` | Горизонтальная линия |
| `Alt+V` | Вертикальная линия |
| `Alt+M` | Инструмент измерения |
| `Alt+X` | Текст |
| `Alt+R` | Прямоугольник |
| `Delete` | Удалить выбранный рисунок |
| `Ctrl+Z` | Отменить (будущая версия) |
| `Ctrl+Y` | Повторить (будущая версия) |

---

## 🐛 Устранение неполадок

### Рисунок не отображается

```typescript
// 1. Проверьте что drawing visible: true
{
  "visible": true,  // ← должно быть true
  "opacity": 1      // ← не 0
}

// 2. Проверьте координаты точек
// Убедитесь что time — это Unix timestamp или Time из lightweight-charts
const point: DrawingPoint = {
  time: 1704067200,  // ✓ Unix timestamp
  // time: '2024-01-01',  // ✓ или строка формата YYYY-MM-DD
  price: 42000,
};

// 3. Проверьте z-index
{
  "zIndex": 10  // ← выше чем у других элементов
}
```

### Canvas не получает события мыши

```css
/* Убедитесь что canvas overlay имеет правильные стили */
.drawing-canvas {
  pointer-events: none;  /* Пропускать события к графику */
  /* Исключение: когда активен cursor или eraser */
}

/* При активном инструменте выбора */
.drawing-canvas.select-mode {
  pointer-events: auto;
}
```

### Проблемы с масштабированием

```typescript
// Lightweight Charts автоматически обрабатывает resize
// Но если вы меняете высоту динамически:

useEffect(() => {
  if (chartRef.current) {
    chartRef.current.applyOptions({
      height: newHeight,
    });
  }
}, [newHeight]);
```

---

## 🔄 Интеграция с существующим кодом CITARION

### Замена текущего графика

```diff
- import { LightweightChart } from '@/components/chart/LightweightChart';
+ import { ChartWithToolbar } from '@/components/chart';

- <LightweightChart data={data} symbol={symbol} />
+ <ChartWithToolbar 
+   data={data}
+   symbol={symbol}
+   timeframe={selectedTimeframe}
+   onDrawingChange={handleDrawingChange}
+ />
```

### Сохранение рисунков в контексте приложения

```typescript
// В вашем TradingContext или аналогичном
interface TradingContext {
  drawings: Record<string, DrawingObject[]>;  // symbol -> drawings
  addDrawing: (symbol: string, drawing: DrawingObject) => void;
  removeDrawing: (symbol: string, id: string) => void;
}

// Обработчик в компоненте
const handleDrawingChange = useCallback((event: DrawingEvent, drawings: DrawingObject[]) => {
  // Синхронизируем с глобальным состоянием
  setDrawings(prev => ({
    ...prev,
    [symbol]: drawings,
  }));
  
  // Опционально: сохраняем на сервер
  if (user.isAuthenticated) {
    api.chart.saveDrawings(symbol, drawings);
  }
}, [symbol, user.isAuthenticated]);
```

---

## 🚀 Производительность

### Оптимизация рендеринга

```typescript
// 1. Мемоизация пропсов
const chartData = useMemo(() => preprocessData(rawData), [rawData]);
const chartOptions = useMemo(() => ({...}), [symbol, theme]);

// 2. Debounce событий рисования
const debouncedSave = useDebounce((drawings: DrawingObject[]) => {
  api.chart.saveDrawings(symbol, drawings);
}, 1000);

const handleDrawingChange = useCallback((event: DrawingEvent, drawings: DrawingObject[]) => {
  debouncedSave(drawings);
}, [debouncedSave, symbol]);

// 3. Отключение рендеринга при неактивной вкладке
useEffect(() => {
  const handleVisibility = () => {
    if (document.hidden && chartRef.current) {
      // Приостановить анимации/обновления
      chartRef.current.timeScale().setVisibleRange({ 
        from: 0, 
        to: 0 
      });
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibility);
  return () => document.removeEventListener('visibilitychange', handleVisibility);
}, []);
```

---

## 📚 Дополнительные ресурсы

- [Lightweight Charts Documentation](https://tradingview.github.io/lightweight-charts/)
- [TradingView Drawing Tools Guide](https://www.tradingview.com/support/solutions/43000502017-drawing-tools/)
- [Canvas API Reference](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)

---

> 💡 **Совет:** Для production обязательно реализуйте сохранение рисунков на сервере, 
> чтобы пользователи не теряли свои аннотации при обновлении страницы.

*Версия компонента: 1.0.0 | Совместимо с Lightweight Charts v4.1+*
