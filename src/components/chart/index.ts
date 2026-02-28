/**
 * Chart Module Index
 * 
 * Exports for Lightweight Charts integration with TradingView-style toolbar
 */

// Main component
export { ChartWithToolbar, type ChartWithToolbarProps, type ChartDataPoint } from './ChartWithToolbar';

// Toolbar component
export { DrawingToolbar } from './toolbar/DrawingToolbar';

// Drawing manager
export { DrawingCanvasOverlay } from '@/lib/chart/drawing-manager';

// Types
export * from './drawing-tools/types';

// Quick usage example:
/*
import { ChartWithToolbar } from '@/components/chart';

function MyChartPage() {
  const data = [
    { time: '2024-01-01' as Time, open: 42000, high: 43000, low: 41000, close: 42500 },
    // ... more data
  ];
  
  return (
    <ChartWithToolbar
      data={data}
      symbol="BTCUSDT"
      timeframe="1h"
      seriesType="candlestick"
      onDrawingChange={(event, drawings) => {
        console.log('Drawing event:', event);
        console.log('Current drawings:', drawings);
      }}
      height={600}
    />
  );
}
*/

// Available drawing tools:
export const AVAILABLE_TOOLS = [
  // Navigation
  'cursor', 'crosshair',
  
  // Lines
  'trend_line', 'horizontal_line', 'vertical_line', 'ray_line',
  
  // Fibonacci
  'fibonacci_retracement', 'fibonacci_extension',
  
  // Shapes
  'rectangle', 'ellipse',
  
  // Annotations
  'text', 'arrow_up', 'arrow_down',
  
  // Advanced
  'parallel_channel', 'pitchfork', 'measure',
  
  // Actions
  'eraser', 'remove_all',
] as const;

// Keyboard shortcuts:
export const KEYBOARD_SHORTCUTS = {
  'Esc': 'Cancel drawing / Select tool',
  'Alt+T': 'Trend Line',
  'Alt+H': 'Horizontal Line',
  'Alt+V': 'Vertical Line',
  'Alt+M': 'Measure Tool',
  'Alt+X': 'Text',
  'Alt+R': 'Rectangle',
  'Delete': 'Delete selected drawing',
} as const;

// Default configuration:
export const DEFAULT_CHART_CONFIG = {
  seriesType: 'candlestick' as const,
  toolbarExpanded: true,
  initialTool: 'cursor' as const,
  defaultColor: '#2962FF',
  defaultWidth: 2,
  fibonacciLevels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
};
