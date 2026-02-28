/**
 * Drawing Tools Types and Interfaces
 * 
 * Defines the structure for TradingView-style drawing tools
 * compatible with Lightweight Charts
 */

// ==================== TOOL TYPES ====================

export type DrawingToolType =
  | 'cursor'
  | 'crosshair'
  | 'trend_line'
  | 'horizontal_line'
  | 'vertical_line'
  | 'fibonacci_retracement'
  | 'fibonacci_extension'
  | 'rectangle'
  | 'ellipse'
  | 'text'
  | 'arrow_up'
  | 'arrow_down'
  | 'ray_line'
  | 'parallel_channel'
  | 'pitchfork'
  | 'measure'
  | 'eraser'
  | 'remove_all';

export interface DrawingTool {
  id: DrawingToolType;
  name: string;
  icon: string; // SVG path or icon name
  shortcut?: string;
  category: 'lines' | 'shapes' | 'fibonacci' | 'annotations' | 'tools';
  description: string;
}

// ==================== DRAWING OBJECTS ====================

export interface DrawingPoint {
  time: number; // Unix timestamp
  price: number;
  pane?: number; // For multi-pane charts
}

export interface DrawingObject {
  id: string;
  type: DrawingToolType;
  points: DrawingPoint[];
  properties: DrawingProperties;
  createdAt: number;
  updatedAt: number;
  visible: boolean;
  locked: boolean;
  zIndex: number;
}

export interface DrawingProperties {
  // Common
  color: string;
  width: number;
  opacity: number;
  visible: boolean;
  
  // Line styles
  lineStyle: 'solid' | 'dotted' | 'dashed';
  
  // Text
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  
  // Shape fills
  fillColor?: string;
  fillOpacity?: number;
  
  // Fibonacci specific
  levels?: FibonacciLevel[];
  extendLines?: boolean;
  
  // Arrow specific
  arrowSize?: number;
  
  // Measure tool
  showPriceDiff?: boolean;
  showPercentDiff?: boolean;
  showTimeDiff?: boolean;
}

export interface FibonacciLevel {
  level: number; // 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, etc.
  color: string;
  visible: boolean;
  showPrice: boolean;
  showPercent: boolean;
}

// ==================== TOOLBAR STATE ====================

export interface ToolbarState {
  activeTool: DrawingToolType | null;
  activeColor: string;
  activeWidth: number;
  activeOpacity: number;
  
  // Tool-specific settings
  fibonacciLevels: FibonacciLevel[];
  defaultTextSettings: {
    fontSize: number;
    fontFamily: string;
    textAlign: 'left' | 'center' | 'right';
  };
  
  // UI state
  isExpanded: boolean;
  activeCategory: string;
}

// ==================== EVENTS ====================

export interface DrawingEvent {
  type: 'draw_start' | 'draw_move' | 'draw_end' | 'select' | 'deselect' | 'update' | 'delete';
  drawingId: string;
  data?: unknown;
}

export interface ChartInteractionEvent {
  type: 'click' | 'dblclick' | 'mousedown' | 'mouseup' | 'mousemove' | 'contextmenu';
  event: MouseEvent | TouchEvent;
  logical: {
    time: number;
    price: number;
  };
  pane: number;
}

// ==================== PREDEFINED TOOLS ====================

export const DRAWING_TOOLS: DrawingTool[] = [
  // Navigation
  {
    id: 'cursor',
    name: 'Cursor',
    icon: 'cursor',
    shortcut: 'Esc',
    category: 'tools',
    description: 'Select and move drawings',
  },
  {
    id: 'crosshair',
    name: 'Crosshair',
    icon: 'crosshair',
    shortcut: 'Alt+H',
    category: 'tools',
    description: 'Show crosshair on hover',
  },
  
  // Lines
  {
    id: 'trend_line',
    name: 'Trend Line',
    icon: 'trend-line',
    shortcut: 'Alt+T',
    category: 'lines',
    description: 'Draw a trend line between two points',
  },
  {
    id: 'horizontal_line',
    name: 'Horizontal Line',
    icon: 'horizontal-line',
    shortcut: 'Alt+H',
    category: 'lines',
    description: 'Draw a horizontal line at a price level',
  },
  {
    id: 'vertical_line',
    name: 'Vertical Line',
    icon: 'vertical-line',
    shortcut: 'Alt+V',
    category: 'lines',
    description: 'Draw a vertical line at a time point',
  },
  {
    id: 'ray_line',
    name: 'Ray',
    icon: 'ray',
    category: 'lines',
    description: 'Draw a ray line extending infinitely',
  },
  
  // Fibonacci
  {
    id: 'fibonacci_retracement',
    name: 'Fibonacci Retracement',
    icon: 'fib-retrace',
    category: 'fibonacci',
    description: 'Draw Fibonacci retracement levels',
  },
  {
    id: 'fibonacci_extension',
    name: 'Fibonacci Extension',
    icon: 'fib-extend',
    category: 'fibonacci',
    description: 'Draw Fibonacci extension levels',
  },
  
  // Shapes
  {
    id: 'rectangle',
    name: 'Rectangle',
    icon: 'rectangle',
    shortcut: 'Alt+R',
    category: 'shapes',
    description: 'Draw a rectangle',
  },
  {
    id: 'ellipse',
    name: 'Ellipse',
    icon: 'ellipse',
    category: 'shapes',
    description: 'Draw an ellipse',
  },
  
  // Annotations
  {
    id: 'text',
    name: 'Text',
    icon: 'text',
    shortcut: 'Alt+X',
    category: 'annotations',
    description: 'Add text annotation',
  },
  {
    id: 'arrow_up',
    name: 'Arrow Up',
    icon: 'arrow-up',
    category: 'annotations',
    description: 'Add upward arrow marker',
  },
  {
    id: 'arrow_down',
    name: 'Arrow Down',
    icon: 'arrow-down',
    category: 'annotations',
    description: 'Add downward arrow marker',
  },
  
  // Advanced Tools
  {
    id: 'parallel_channel',
    name: 'Parallel Channel',
    icon: 'channel',
    category: 'lines',
    description: 'Draw a parallel channel',
  },
  {
    id: 'pitchfork',
    name: 'Andrew\'s Pitchfork',
    icon: 'pitchfork',
    category: 'lines',
    description: 'Draw Andrews Pitchfork',
  },
  {
    id: 'measure',
    name: 'Measure Tool',
    icon: 'measure',
    shortcut: 'Alt+M',
    category: 'tools',
    description: 'Measure price and time distance',
  },
  
  // Actions
  {
    id: 'eraser',
    name: 'Eraser',
    icon: 'eraser',
    shortcut: 'Delete',
    category: 'tools',
    description: 'Remove selected drawing',
  },
  {
    id: 'remove_all',
    name: 'Remove All',
    icon: 'trash',
    category: 'tools',
    description: 'Remove all drawings',
  },
];

// ==================== DEFAULT SETTINGS ====================

export const DEFAULT_DRAWING_PROPERTIES: DrawingProperties = {
  color: '#2962FF',
  width: 2,
  opacity: 1,
  visible: true,
  lineStyle: 'solid',
  fontSize: 12,
  fontFamily: 'Arial, sans-serif',
  textAlign: 'left',
  fillOpacity: 0.1,
  arrowSize: 10,
  showPriceDiff: true,
  showPercentDiff: true,
  showTimeDiff: true,
  extendLines: true,
};

export const DEFAULT_FIBONACCI_LEVELS: FibonacciLevel[] = [
  { level: 0, color: '#2962FF', visible: true, showPrice: true, showPercent: true },
  { level: 0.236, color: '#2962FF', visible: true, showPrice: true, showPercent: true },
  { level: 0.382, color: '#2962FF', visible: true, showPrice: true, showPercent: true },
  { level: 0.5, color: '#2962FF', visible: true, showPrice: true, showPercent: true },
  { level: 0.618, color: '#2962FF', visible: true, showPrice: true, showPercent: true },
  { level: 0.786, color: '#2962FF', visible: true, showPrice: true, showPercent: true },
  { level: 1, color: '#2962FF', visible: true, showPrice: true, showPercent: true },
];

export const DEFAULT_TOOLBAR_STATE: ToolbarState = {
  activeTool: null,
  activeColor: '#2962FF',
  activeWidth: 2,
  activeOpacity: 1,
  fibonacciLevels: DEFAULT_FIBONACCI_LEVELS,
  defaultTextSettings: {
    fontSize: 12,
    fontFamily: 'Arial, sans-serif',
    textAlign: 'left',
  },
  isExpanded: true,
  activeCategory: 'lines',
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Generate unique ID for drawing objects
 */
export function generateDrawingId(): string {
  return `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Clone drawing object with new ID
 */
export function cloneDrawing(drawing: DrawingObject): DrawingObject {
  return {
    ...drawing,
    id: generateDrawingId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Check if point is within drawing hit area
 */
export function isPointInDrawing(
  point: { time: number; price: number },
  drawing: DrawingObject,
  tolerance: number = 5 // pixels
): boolean {
  // Simplified: check distance to nearest point
  if (drawing.points.length === 0) return false;
  
  const nearestPoint = drawing.points.reduce((nearest, current) => {
    const distCurrent = Math.sqrt(
      Math.pow(current.time - point.time, 2) + 
      Math.pow(current.price - point.price, 2)
    );
    const distNearest = Math.sqrt(
      Math.pow(nearest.time - point.time, 2) + 
      Math.pow(nearest.price - point.price, 2)
    );
    return distCurrent < distNearest ? current : nearest;
  });
  
  const distance = Math.sqrt(
    Math.pow(nearestPoint.time - point.time, 2) + 
    Math.pow(nearestPoint.price - point.price, 2)
  );
  
  return distance <= tolerance;
}

/**
 * Format price difference for measure tool
 */
export function formatPriceDiff(start: number, end: number, symbol: string): string {
  const diff = end - start;
  const percent = (diff / start) * 100;
  
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(symbol.includes('JPY') ? 2 : 4)} (${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%)`;
}

/**
 * Format time difference for measure tool
 */
export function formatTimeDiff(start: number, end: number): string {
  const diffMs = end - start;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (diffDays > 0) {
    return `${diffDays}d ${diffHours}h`;
  }
  return `${diffHours}h`;
}

// ==================== EXPORTS ====================

export type {
  DrawingToolType,
  DrawingTool,
  DrawingPoint,
  DrawingObject,
  DrawingProperties,
  FibonacciLevel,
  ToolbarState,
  DrawingEvent,
  ChartInteractionEvent,
};

export {
  DRAWING_TOOLS,
  DEFAULT_DRAWING_PROPERTIES,
  DEFAULT_FIBONACCI_LEVELS,
  DEFAULT_TOOLBAR_STATE,
  generateDrawingId,
  cloneDrawing,
  isPointInDrawing,
  formatPriceDiff,
  formatTimeDiff,
};

export default {
  DRAWING_TOOLS,
  DEFAULT_DRAWING_PROPERTIES,
  DEFAULT_FIBONACCI_LEVELS,
  DEFAULT_TOOLBAR_STATE,
  generateDrawingId,
  cloneDrawing,
  isPointInDrawing,
  formatPriceDiff,
  formatTimeDiff,
};
