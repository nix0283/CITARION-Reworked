/**
 * Lightweight Charts Drawing Manager
 * 
 * Handles drawing tools integration with Lightweight Charts
 * Provides TradingView-style drawing functionality
 */

import {
  IChartApi,
  ISeriesApi,
  IPriceScaleApi,
  ITimeScaleApi,
  MouseEventParams,
  SeriesMarker,
  LineStyle,
} from 'lightweight-charts';
import {
  DrawingToolType,
  DrawingObject,
  DrawingPoint,
  DrawingProperties,
  DrawingEvent,
  ToolbarState,
  generateDrawingId,
  DEFAULT_DRAWING_PROPERTIES,
} from './types';

// ==================== CANVAS OVERLAY MANAGER ====================

export class DrawingCanvasOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private chart: IChartApi;
  private drawings: Map<string, DrawingObject> = new Map();
  private selectedDrawingId: string | null = null;
  private isDrawing: boolean = false;
  private currentDrawing: DrawingObject | null = null;
  private activeTool: DrawingToolType | null = null;
  
  // Event handlers
  private onDrawingChange?: (event: DrawingEvent) => void;
  
  constructor(chart: IChartApi, container: HTMLElement) {
    this.chart = chart;
    
    // Create canvas overlay
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none'; // Let chart events pass through
    this.canvas.style.zIndex = '10';
    
    this.ctx = this.canvas.getContext('2d')!;
    container.appendChild(this.canvas);
    
    // Setup resize observer
    this.setupResizeObserver(container);
    
    // Setup chart event listeners
    this.setupChartListeners();
  }
  
  private setupResizeObserver(container: HTMLElement): void {
    const resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
      this.render();
    });
    resizeObserver.observe(container);
  }
  
  private resizeCanvas(): void {
    const rect = this.chart.chartElement().getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    
    this.ctx.scale(dpr, dpr);
  }
  
  private setupChartListeners(): void {
    this.chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (this.isDrawing && this.currentDrawing) {
        this.handleMouseMove(param);
      }
    });
    
    this.chart.subscribeClick((param: MouseEventParams) => {
      this.handleClick(param);
    });
    
    // Handle tool changes
    window.addEventListener('keydown', (e) => this.handleKeyboard(e));
  }
  
  // ==================== TOOL MANAGEMENT ====================
  
  setActiveTool(tool: DrawingToolType | null): void {
    this.activeTool = tool;
    this.isDrawing = false;
    this.currentDrawing = null;
    
    // Update cursor style
    this.updateCursorStyle(tool);
    
    // Notify change
    this.onDrawingChange?.({
      type: 'select',
      drawingId: '',
      data: { tool },
    });
  }
  
  private updateCursorStyle(tool: DrawingToolType | null): void {
    const chartElement = this.chart.chartElement();
    
    switch (tool) {
      case 'cursor':
        chartElement.style.cursor = 'default';
        this.canvas.style.pointerEvents = 'auto';
        break;
      case 'crosshair':
        chartElement.style.cursor = 'crosshair';
        this.canvas.style.pointerEvents = 'none';
        break;
      case 'trend_line':
      case 'horizontal_line':
      case 'vertical_line':
      case 'ray_line':
        chartElement.style.cursor = 'crosshair';
        this.canvas.style.pointerEvents = 'none';
        break;
      case 'rectangle':
      case 'ellipse':
        chartElement.style.cursor = 'crosshair';
        this.canvas.style.pointerEvents = 'none';
        break;
      case 'text':
        chartElement.style.cursor = 'text';
        this.canvas.style.pointerEvents = 'auto';
        break;
      case 'eraser':
        chartElement.style.cursor = 'not-allowed';
        this.canvas.style.pointerEvents = 'auto';
        break;
      default:
        chartElement.style.cursor = 'default';
        this.canvas.style.pointerEvents = 'none';
    }
  }
  
  // ==================== DRAWING HANDLERS ====================
  
  private handleClick(param: MouseEventParams): void {
    if (!param.time || param.price === undefined) return;
    
    const point: DrawingPoint = {
      time: param.time as unknown as number,
      price: param.price,
    };
    
    if (this.activeTool === 'eraser') {
      this.handleErase(point);
      return;
    }
    
    if (this.activeTool && !this.isDrawing) {
      // Start new drawing
      this.startDrawing(this.activeTool, point);
    } else if (this.isDrawing && this.currentDrawing) {
      // Continue or finish drawing
      this.continueDrawing(point);
    } else if (this.activeTool === 'cursor') {
      // Select existing drawing
      this.handleSelect(point);
    }
  }
  
  private handleMouseMove(param: MouseEventParams): void {
    if (!this.isDrawing || !this.currentDrawing || !param.time || param.price === undefined) return;
    
    const point: DrawingPoint = {
      time: param.time as unknown as number,
      price: param.price,
    };
    
    // Update current drawing preview
    this.currentDrawing.points[this.currentDrawing.points.length - 1] = point;
    this.render();
  }
  
  private handleKeyboard(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      // Cancel current drawing
      if (this.isDrawing) {
        this.isDrawing = false;
        this.currentDrawing = null;
        this.render();
      }
      this.setActiveTool('cursor');
    }
    
    if (e.key === 'Delete' && this.selectedDrawingId) {
      this.deleteDrawing(this.selectedDrawingId);
    }
  }
  
  // ==================== DRAWING LOGIC ====================
  
  private startDrawing(tool: DrawingToolType, startPoint: DrawingPoint): void {
    this.isDrawing = true;
    
    const properties: DrawingProperties = {
      ...DEFAULT_DRAWING_PROPERTIES,
    };
    
    this.currentDrawing = {
      id: generateDrawingId(),
      type: tool,
      points: [startPoint],
      properties,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      visible: true,
      locked: false,
      zIndex: 1,
    };
    
    // Add second point for two-point tools
    if (this.requiresTwoPoints(tool)) {
      this.currentDrawing.points.push({ ...startPoint });
    }
    
    this.onDrawingChange?.({
      type: 'draw_start',
      drawingId: this.currentDrawing.id,
      data: { tool, startPoint },
    });
  }
  
  private continueDrawing(point: DrawingPoint): void {
    if (!this.currentDrawing) return;
    
    const tool = this.currentDrawing.type;
    
    if (this.requiresTwoPoints(tool) && this.currentDrawing.points.length === 2) {
      // Finish two-point drawing
      this.finishDrawing();
    } else if (!this.requiresTwoPoints(tool)) {
      // Single-point tools finish immediately
      this.finishDrawing();
    }
  }
  
  private finishDrawing(): void {
    if (!this.currentDrawing) return;
    
    // Add to drawings collection
    this.drawings.set(this.currentDrawing.id, this.currentDrawing);
    
    // Notify
    this.onDrawingChange?.({
      type: 'draw_end',
      drawingId: this.currentDrawing.id,
      data: { drawing: this.currentDrawing },
    });
    
    // Reset
    this.isDrawing = false;
    this.currentDrawing = null;
    
    // Re-render
    this.render();
    
    // Switch back to cursor for most tools
    if (this.activeTool !== 'cursor' && this.activeTool !== 'crosshair') {
      this.setActiveTool('cursor');
    }
  }
  
  private requiresTwoPoints(tool: DrawingToolType): boolean {
    return [
      'trend_line',
      'fibonacci_retracement',
      'fibonacci_extension',
      'rectangle',
      'ellipse',
      'parallel_channel',
      'pitchfork',
      'measure',
      'ray_line',
    ].includes(tool);
  }
  
  // ==================== RENDERING ====================
  
  render(): void {
    const ctx = this.ctx;
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Render all drawings
    for (const drawing of this.drawings.values()) {
      if (!drawing.visible) continue;
      this.renderDrawing(ctx, drawing, width, height);
    }
    
    // Render current drawing preview
    if (this.currentDrawing) {
      this.renderDrawing(ctx, this.currentDrawing, width, height, true);
    }
    
    // Render selection handles
    if (this.selectedDrawingId) {
      const drawing = this.drawings.get(this.selectedDrawingId);
      if (drawing) {
        this.renderSelectionHandles(ctx, drawing, width, height);
      }
    }
  }
  
  private renderDrawing(
    ctx: CanvasRenderingContext2D,
    drawing: DrawingObject,
    width: number,
    height: number,
    isPreview: boolean = false
  ): void {
    const { type, points, properties } = drawing;
    
    ctx.save();
    ctx.strokeStyle = properties.color;
    ctx.lineWidth = properties.width;
    ctx.globalAlpha = isPreview ? properties.opacity * 0.7 : properties.opacity;
    ctx.setLineDash(this.getDashStyle(properties.lineStyle));
    
    // Convert logical coordinates to pixel coordinates
    const pixelPoints = points.map(p => this.logicalToPixel(p, width, height));
    
    switch (type) {
      case 'trend_line':
      case 'ray_line':
        this.renderLine(ctx, pixelPoints, type === 'ray_line');
        break;
        
      case 'horizontal_line':
        this.renderHorizontalLine(ctx, pixelPoints[0], width);
        break;
        
      case 'vertical_line':
        this.renderVerticalLine(ctx, pixelPoints[0], height);
        break;
        
      case 'rectangle':
        this.renderRectangle(ctx, pixelPoints, properties);
        break;
        
      case 'ellipse':
        this.renderEllipse(ctx, pixelPoints, properties);
        break;
        
      case 'fibonacci_retracement':
        this.renderFibonacci(ctx, pixelPoints, properties, false);
        break;
        
      case 'fibonacci_extension':
        this.renderFibonacci(ctx, pixelPoints, properties, true);
        break;
        
      case 'text':
        this.renderText(ctx, pixelPoints[0], properties);
        break;
        
      case 'arrow_up':
      case 'arrow_down':
        this.renderArrow(ctx, pixelPoints[0], type, properties);
        break;
        
      case 'measure':
        this.renderMeasure(ctx, pixelPoints, properties);
        break;
    }
    
    ctx.restore();
  }
  
  private logicalToPixel(point: DrawingPoint, width: number, height: number): { x: number; y: number } {
    // Get price scale and time scale
    const priceScale = this.chart.priceScale();
    const timeScale = this.chart.timeScale();
    
    // Convert time to x coordinate
    const timeScaleOptions = timeScale.options();
    const visibleRange = timeScale.getVisibleRange();
    
    if (!visibleRange) return { x: 0, y: 0 };
    
    const timePixelsPerUnit = width / (visibleRange.to - visibleRange.from);
    const x = (point.time - visibleRange.from) * timePixelsPerUnit;
    
    // Convert price to y coordinate
    const priceScaleOptions = priceScale.options();
    const priceRange = priceScale.getVisiblePriceRange();
    
    if (!priceRange) return { x: 0, y: 0 };
    
    const pricePixelsPerUnit = height / (priceRange.to - priceRange.from);
    const y = height - (point.price - priceRange.from) * pricePixelsPerUnit;
    
    return { x, y };
  }
  
  private renderLine(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>, isRay: boolean): void {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    
    if (isRay) {
      // Extend ray infinitely
      const dx = points[1].x - points[0].x;
      const dy = points[1].y - points[0].y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const extendFactor = 100;
      
      ctx.lineTo(
        points[0].x + (dx / length) * length * extendFactor,
        points[0].y + (dy / length) * length * extendFactor
      );
    } else {
      ctx.lineTo(points[1].x, points[1].y);
    }
    
    ctx.stroke();
  }
  
  private renderHorizontalLine(ctx: CanvasRenderingContext2D, point: { x: number; y: number }, width: number): void {
    ctx.beginPath();
    ctx.moveTo(0, point.y);
    ctx.lineTo(width, point.y);
    ctx.stroke();
  }
  
  private renderVerticalLine(ctx: CanvasRenderingContext2D, point: { x: number; y: number }, height: number): void {
    ctx.beginPath();
    ctx.moveTo(point.x, 0);
    ctx.lineTo(point.x, height);
    ctx.stroke();
  }
  
  private renderRectangle(
    ctx: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    properties: DrawingProperties
  ): void {
    const x = Math.min(points[0].x, points[1].x);
    const y = Math.min(points[0].y, points[1].y);
    const width = Math.abs(points[1].x - points[0].x);
    const height = Math.abs(points[1].y - points[0].y);
    
    if (properties.fillColor) {
      ctx.fillStyle = properties.fillColor;
      ctx.globalAlpha = properties.fillOpacity || 0.1;
      ctx.fillRect(x, y, width, height);
      ctx.globalAlpha = properties.opacity;
    }
    
    ctx.strokeRect(x, y, width, height);
  }
  
  private renderEllipse(
    ctx: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    properties: DrawingProperties
  ): void {
    const centerX = (points[0].x + points[1].x) / 2;
    const centerY = (points[0].y + points[1].y) / 2;
    const radiusX = Math.abs(points[1].x - points[0].x) / 2;
    const radiusY = Math.abs(points[1].y - points[0].y) / 2;
    
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    
    if (properties.fillColor) {
      ctx.fillStyle = properties.fillColor;
      ctx.globalAlpha = properties.fillOpacity || 0.1;
      ctx.fill();
      ctx.globalAlpha = properties.opacity;
    }
    
    ctx.stroke();
  }
  
  private renderFibonacci(
    ctx: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    properties: DrawingProperties,
    isExtension: boolean
  ): void {
    const [start, end] = points;
    const priceDiff = end.y - start.y;
    
    const levels = properties.levels || [];
    
    for (const level of levels) {
      if (!level.visible) continue;
      
      const levelPrice = start.y + priceDiff * level.level;
      
      ctx.beginPath();
      ctx.strokeStyle = level.color;
      ctx.moveTo(0, levelPrice);
      ctx.lineTo(ctx.canvas.width, levelPrice);
      ctx.stroke();
      
      // Draw level label
      if (level.showPercent) {
        ctx.fillStyle = level.color;
        ctx.font = '10px Arial';
        ctx.fillText(`${(level.level * 100).toFixed(1)}%`, start.x + 5, levelPrice - 3);
      }
    }
  }
  
  private renderText(
    ctx: CanvasRenderingContext2D,
    point: { x: number; y: number },
    properties: DrawingProperties
  ): void {
    ctx.fillStyle = properties.color;
    ctx.font = `${properties.fontSize}px ${properties.fontFamily}`;
    ctx.textAlign = properties.textAlign;
    ctx.fillText(properties.text || '', point.x, point.y);
  }
  
  private renderArrow(
    ctx: CanvasRenderingContext2D,
    point: { x: number; y: number },
    type: 'arrow_up' | 'arrow_down',
    properties: DrawingProperties
  ): void {
    const size = properties.arrowSize || 10;
    
    ctx.fillStyle = properties.color;
    ctx.beginPath();
    
    if (type === 'arrow_up') {
      ctx.moveTo(point.x, point.y - size);
      ctx.lineTo(point.x - size, point.y + size);
      ctx.lineTo(point.x + size, point.y + size);
    } else {
      ctx.moveTo(point.x, point.y + size);
      ctx.lineTo(point.x - size, point.y - size);
      ctx.lineTo(point.x + size, point.y - size);
    }
    
    ctx.closePath();
    ctx.fill();
  }
  
  private renderMeasure(
    ctx: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    properties: DrawingProperties
  ): void {
    // Draw line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
    
    // Draw measurement info
    const midX = (points[0].x + points[1].x) / 2;
    const midY = (points[0].y + points[1].y) / 2;
    
    ctx.fillStyle = properties.color;
    ctx.font = '11px Arial';
    
    const info: string[] = [];
    if (properties.showPriceDiff) {
      // Would need actual price values here
      info.push('ΔP: --');
    }
    if (properties.showPercentDiff) {
      info.push('Δ%: --');
    }
    if (properties.showTimeDiff) {
      info.push('ΔT: --');
    }
    
    ctx.fillText(info.join(' | '), midX + 10, midY);
  }
  
  private renderSelectionHandles(
    ctx: CanvasRenderingContext2D,
    drawing: DrawingObject,
    width: number,
    height: number
  ): void {
    ctx.save();
    ctx.strokeStyle = '#FF6B6B';
    ctx.fillStyle = '#FF6B6B';
    ctx.lineWidth = 1;
    
    const handleSize = 6;
    
    for (const point of drawing.points) {
      const pixel = this.logicalToPixel(point, width, height);
      
      ctx.beginPath();
      ctx.rect(
        pixel.x - handleSize / 2,
        pixel.y - handleSize / 2,
        handleSize,
        handleSize
      );
      ctx.stroke();
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  private getDashStyle(style: 'solid' | 'dotted' | 'dashed'): number[] {
    switch (style) {
      case 'dotted': return [2, 4];
      case 'dashed': return [8, 4];
      default: return [];
    }
  }
  
  // ==================== DRAWING MANAGEMENT ====================
  
  private handleSelect(point: DrawingPoint): void {
    // Find drawing under cursor
    for (const [id, drawing] of this.drawings.entries()) {
      if (this.isPointInDrawing(point, drawing)) {
        this.selectedDrawingId = id;
        this.render();
        
        this.onDrawingChange?.({
          type: 'select',
          drawingId: id,
          data: { drawing },
        });
        return;
      }
    }
    
    // Deselect if clicked on empty space
    if (this.selectedDrawingId) {
      this.selectedDrawingId = null;
      this.render();
      
      this.onDrawingChange?.({
        type: 'deselect',
        drawingId: '',
      });
    }
  }
  
  private handleErase(point: DrawingPoint): void {
    for (const [id, drawing] of this.drawings.entries()) {
      if (this.isPointInDrawing(point, drawing)) {
        this.deleteDrawing(id);
        return;
      }
    }
  }
  
  private isPointInDrawing(point: DrawingPoint, drawing: DrawingObject): boolean {
    // Simplified hit detection - check distance to points
    const tolerance = 10; // pixels
    
    for (const dp of drawing.points) {
      const pixel = this.logicalToPixel(dp, 
        this.canvas.width / (window.devicePixelRatio || 1),
        this.canvas.height / (window.devicePixelRatio || 1)
      );
      const pointPixel = this.logicalToPixel(point,
        this.canvas.width / (window.devicePixelRatio || 1),
        this.canvas.height / (window.devicePixelRatio || 1)
      );
      
      const distance = Math.sqrt(
        Math.pow(pixel.x - pointPixel.x, 2) + 
        Math.pow(pixel.y - pointPixel.y, 2)
      );
      
      if (distance <= tolerance) return true;
    }
    
    return false;
  }
  
  deleteDrawing(id: string): void {
    if (this.drawings.delete(id)) {
      if (this.selectedDrawingId === id) {
        this.selectedDrawingId = null;
      }
      
      this.onDrawingChange?.({
        type: 'delete',
        drawingId: id,
      });
      
      this.render();
    }
  }
  
  clearAll(): void {
    this.drawings.clear();
    this.selectedDrawingId = null;
    this.onDrawingChange?.({
      type: 'delete',
      drawingId: 'all',
    });
    this.render();
  }
  
  // ==================== PUBLIC API ====================
  
  setOnDrawingChange(callback: (event: DrawingEvent) => void): void {
    this.onDrawingChange = callback;
  }
  
  getDrawings(): DrawingObject[] {
    return Array.from(this.drawings.values());
  }
  
  setDrawings(drawings: DrawingObject[]): void {
    this.drawings = new Map(drawings.map(d => [d.id, d]));
    this.render();
  }
  
  updateDrawingProperties(id: string, properties: Partial<DrawingProperties>): void {
    const drawing = this.drawings.get(id);
    if (drawing) {
      drawing.properties = { ...drawing.properties, ...properties };
      drawing.updatedAt = Date.now();
      this.render();
      
      this.onDrawingChange?.({
        type: 'update',
        drawingId: id,
        data: { properties },
      });
    }
  }
  
  setDrawingVisibility(id: string, visible: boolean): void {
    const drawing = this.drawings.get(id);
    if (drawing) {
      drawing.visible = visible;
      this.render();
    }
  }
  
  setDrawingLock(id: string, locked: boolean): void {
    const drawing = this.drawings.get(id);
    if (drawing) {
      drawing.locked = locked;
    }
  }
  
  exportDrawings(): string {
    return JSON.stringify(Array.from(this.drawings.values()));
  }
  
  importDrawings(json: string): void {
    try {
      const drawings = JSON.parse(json) as DrawingObject[];
      this.setDrawings(drawings);
    } catch (e) {
      console.error('Failed to import drawings:', e);
    }
  }
  
  destroy(): void {
    this.canvas.remove();
  }
}

// ==================== EXPORTS ====================

export default DrawingCanvasOverlay;
