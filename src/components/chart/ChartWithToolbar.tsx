/**
 * Chart with TradingView-style Toolbar
 * 
 * Integrates Lightweight Charts with drawing tools sidebar
 */

'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickSeriesPartialOptions,
  LineSeriesPartialOptions,
  UTCTimestamp,
  Time,
} from 'lightweight-charts';
import { DrawingToolbar } from './toolbar/DrawingToolbar';
import { DrawingCanvasOverlay } from '@/lib/chart/drawing-manager';
import {
  DrawingToolType,
  DrawingObject,
  ToolbarState,
  DEFAULT_TOOLBAR_STATE,
  DrawingEvent,
} from '../drawing-tools/types';

// ==================== TYPES ====================

export interface ChartDataPoint {
  time: Time;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

export interface ChartWithToolbarProps {
  data: ChartDataPoint[];
  symbol: string;
  timeframe: string;
  seriesType?: 'candlestick' | 'line' | 'area';
  initialToolbarState?: Partial<ToolbarState>;
  onDrawingChange?: (event: DrawingEvent, drawings: DrawingObject[]) => void;
  onLoad?: (chart: IChartApi, series: ISeriesApi) => void;
  className?: string;
  height?: string | number;
}

// ==================== COMPONENT ====================

export const ChartWithToolbar: React.FC<ChartWithToolbarProps> = ({
  data,
  symbol,
  timeframe,
  seriesType = 'candlestick',
  initialToolbarState,
  onDrawingChange,
  onLoad,
  className = '',
  height = '100%',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi | null>(null);
  const drawingManagerRef = useRef<DrawingCanvasOverlay | null>(null);
  
  const [toolbarState, setToolbarState] = useState<ToolbarState>({
    ...DEFAULT_TOOLBAR_STATE,
    ...initialToolbarState,
  });
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(true);
  const [drawings, setDrawings] = useState<DrawingObject[]>([]);
  
  // Chart options
  const chartOptions = useMemo(() => ({
    layout: {
      backgroundColor: '#0f1118',
      textColor: '#d1d4dc',
    },
    grid: {
      vertLines: { color: '#1e222d' },
      horzLines: { color: '#1e222d' },
    },
    crosshair: {
      mode: 1, // Normal crosshair
      vertLine: {
        color: '#758696',
        width: 1,
        style: 3, // Dashed
        visible: true,
        labelVisible: true,
      },
      horzLine: {
        color: '#758696',
        width: 1,
        style: 3,
        visible: true,
        labelVisible: true,
      },
    },
    rightPriceScale: {
      borderColor: '#2a2e39',
      autoScale: true,
      scaleMargins: {
        top: 0.1,
        bottom: 0.1,
      },
    },
    timeScale: {
      borderColor: '#2a2e39',
      timeVisible: true,
      secondsVisible: false,
    },
    localization: {
      priceFormatter: (price: number) => {
        if (symbol.includes('JPY')) {
          return price.toFixed(2);
        }
        if (price < 0.01) {
          return price.toFixed(8);
        }
        if (price < 1) {
          return price.toFixed(4);
        }
        return price.toFixed(2);
      },
    },
  }), [symbol]);
  
  const seriesOptions = useMemo(() => {
    const common: CandlestickSeriesPartialOptions & LineSeriesPartialOptions = {
      priceFormat: {
        type: 'price',
        precision: symbol.includes('JPY') ? 2 : symbol.includes('BTC') ? 2 : 4,
        minMove: symbol.includes('JPY') ? 0.01 : 0.0001,
      },
    };
    
    if (seriesType === 'candlestick') {
      return {
        ...common,
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      } as CandlestickSeriesPartialOptions;
    }
    
    return {
      ...common,
      color: '#2962FF',
      lineWidth: 2,
      lineType: 2, // LineWithSteps
      pointMarkersVisible: false,
    } as LineSeriesPartialOptions;
  }, [seriesType, symbol]);
  
  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Create chart
    const chart = createChart(containerRef.current, {
      ...chartOptions,
      width: containerRef.current.clientWidth,
      height: typeof height === 'number' ? height : 400,
    });
    
    // Create series
    let series: ISeriesApi;
    
    if (seriesType === 'candlestick') {
      series = chart.addCandlestickSeries(seriesOptions as CandlestickSeriesPartialOptions);
    } else {
      series = chart.addLineSeries(seriesOptions as LineSeriesPartialOptions);
    }
    
    // Set data
    if (data.length > 0) {
      series.setData(data as any);
      
      // Fit content
      chart.timeScale().fitContent();
    }
    
    // Store refs
    chartRef.current = chart;
    seriesRef.current = series;
    
    // Initialize drawing manager
    if (containerRef.current) {
      drawingManagerRef.current = new DrawingCanvasOverlay(chart, containerRef.current);
      drawingManagerRef.current.setOnDrawingChange(handleDrawingEvent);
    }
    
    // Handle resize
    const handleResize = () => {
      if (containerRef.current && chart) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: typeof height === 'number' ? height : containerRef.current.clientHeight,
        });
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Call onLoad callback
    if (onLoad) {
      onLoad(chart, series);
    }
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      drawingManagerRef.current?.destroy();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []); // Run once on mount
  
  // Update data when it changes
  useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      seriesRef.current.setData(data as any);
      chartRef.current?.timeScale().fitContent();
    }
  }, [data]);
  
  // Update chart options when they change
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions(chartOptions);
    }
  }, [chartOptions]);
  
  // Handle drawing events
  const handleDrawingEvent = useCallback((event: DrawingEvent) => {
    if (drawingManagerRef.current) {
      const currentDrawings = drawingManagerRef.current.getDrawings();
      setDrawings(currentDrawings);
      
      if (onDrawingChange) {
        onDrawingChange(event, currentDrawings);
      }
    }
  }, [onDrawingChange]);
  
  // Toolbar handlers
  const handleToolSelect = useCallback((tool: DrawingToolType | null) => {
    setToolbarState(prev => ({ ...prev, activeTool: tool }));
    drawingManagerRef.current?.setActiveTool(tool);
  }, []);
  
  const handleColorChange = useCallback((color: string) => {
    setToolbarState(prev => ({ ...prev, activeColor: color }));
    
    // Update selected drawing if any
    if (toolbarState.activeTool === 'cursor' && drawings.length > 0) {
      // Would need to track selected drawing separately
    }
  }, [drawings, toolbarState.activeTool]);
  
  const handleWidthChange = useCallback((width: number) => {
    setToolbarState(prev => ({ ...prev, activeWidth: width }));
  }, []);
  
  const handleClearAll = useCallback(() => {
    drawingManagerRef.current?.clearAll();
  }, []);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if chart is focused
      if (!containerRef.current?.contains(document.activeElement)) return;
      
      // Tool shortcuts
      switch (e.key) {
        case 'Escape':
          handleToolSelect('cursor');
          break;
        case 't':
        case 'T':
          if (e.altKey) handleToolSelect('trend_line');
          break;
        case 'h':
        case 'H':
          if (e.altKey) handleToolSelect('horizontal_line');
          break;
        case 'v':
        case 'V':
          if (e.altKey) handleToolSelect('vertical_line');
          break;
        case 'm':
        case 'M':
          if (e.altKey) handleToolSelect('measure');
          break;
        case 'x':
        case 'X':
          if (e.altKey) handleToolSelect('text');
          break;
        case 'r':
        case 'R':
          if (e.altKey) handleToolSelect('rectangle');
          break;
        case 'Delete':
        case 'Backspace':
          // Delete selected drawing handled by DrawingManager
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToolSelect]);
  
  // Export/Import drawings
  const exportDrawings = useCallback((): string => {
    return drawingManagerRef.current?.exportDrawings() || '[]';
  }, []);
  
  const importDrawings = useCallback((json: string): void => {
    drawingManagerRef.current?.importDrawings(json);
  }, []);
  
  return (
    <div 
      ref={containerRef} 
      className={`chart-container ${className}`}
      style={{ 
        position: 'relative', 
        height,
        background: '#0f1118',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <DrawingToolbar
        activeTool={toolbarState.activeTool}
        onToolSelect={handleToolSelect}
        activeColor={toolbarState.activeColor}
        onColorChange={handleColorChange}
        activeWidth={toolbarState.activeWidth}
        onWidthChange={handleWidthChange}
        onClearAll={handleClearAll}
        isExpanded={isToolbarExpanded}
        onExpandToggle={() => setIsToolbarExpanded(!isToolbarExpanded)}
      />
      
      {/* Chart will be rendered here by Lightweight Charts */}
      
      {/* Chart Info Overlay */}
      <div style={{
        position: 'absolute',
        top: 8,
        left: isToolbarExpanded ? 208 : 56,
        right: 8,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        pointerEvents: 'none',
        zIndex: 50,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#fff',
          }}>
            {symbol}
          </span>
          <span style={{
            fontSize: 12,
            color: '#787b86',
            background: '#1e222d',
            padding: '2px 8px',
            borderRadius: 4,
          }}>
            {timeframe}
          </span>
        </div>
        
        {/* Drawing count */}
        {drawings.length > 0 && (
          <span style={{
            fontSize: 11,
            color: '#787b86',
            background: '#1e222d',
            padding: '2px 8px',
            borderRadius: 4,
          }}>
            📐 {drawings.length} рисунков
          </span>
        )}
      </div>
      
      {/* Loading State */}
      {data.length === 0 && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: isToolbarExpanded ? 208 : 56,
          right: 8,
          transform: 'translateY(-50%)',
          textAlign: 'center',
          color: '#787b86',
        }}>
          Загрузка данных...
        </div>
      )}
    </div>
  );
};

export default ChartWithToolbar;

// ==================== UTILITY EXPORTS ====================

export { DrawingToolbar } from './toolbar/DrawingToolbar';
export { DrawingCanvasOverlay } from '@/lib/chart/drawing-manager';
export * from '../drawing-tools/types';
