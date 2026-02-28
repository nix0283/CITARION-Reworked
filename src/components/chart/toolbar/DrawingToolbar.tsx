/**
 * Drawing Toolbar Component
 * 
 * TradingView-style sidebar toolbar for chart drawing tools
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  DrawingToolType,
  DRAWING_TOOLS,
  ToolbarState,
  DEFAULT_TOOLBAR_STATE,
} from '@/components/chart/drawing-tools/types';

// ==================== STYLES ====================

const toolbarStyles = `
  .drawing-toolbar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 48px;
    background: #1e222d;
    border-right: 1px solid #2a2e39;
    display: flex;
    flex-direction: column;
    z-index: 100;
    transition: width 0.2s ease;
  }
  
  .drawing-toolbar.expanded {
    width: 200px;
  }
  
  .toolbar-toggle {
    position: absolute;
    right: -20px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 40px;
    background: #1e222d;
    border: 1px solid #2a2e39;
    border-left: none;
    border-radius: 0 4px 4px 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #787b86;
    transition: color 0.2s;
  }
  
  .toolbar-toggle:hover {
    color: #fff;
  }
  
  .toolbar-categories {
    padding: 8px 0;
    border-bottom: 1px solid #2a2e39;
  }
  
  .category-btn {
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: #787b86;
    text-align: left;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background 0.2s, color 0.2s;
  }
  
  .category-btn:hover,
  .category-btn.active {
    background: #2a2e39;
    color: #fff;
  }
  
  .category-btn.active {
    border-left: 2px solid #2962FF;
  }
  
  .toolbar-tools {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }
  
  .tool-group {
    padding: 4px 0;
    border-bottom: 1px solid #2a2e39;
  }
  
  .tool-group:last-child {
    border-bottom: none;
  }
  
  .tool-group-title {
    padding: 8px 12px;
    font-size: 10px;
    color: #787b86;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .tool-btn {
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: #787b86;
    text-align: left;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background 0.2s, color 0.2s;
  }
  
  .tool-btn:hover {
    background: #2a2e39;
    color: #fff;
  }
  
  .tool-btn.active {
    background: #2962FF;
    color: #fff;
  }
  
  .tool-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .tool-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  
  .tool-icon svg {
    width: 100%;
    height: 100%;
    fill: currentColor;
  }
  
  .tool-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .tool-shortcut {
    font-size: 10px;
    color: #4a4e59;
    background: #2a2e39;
    padding: 2px 4px;
    border-radius: 2px;
  }
  
  .toolbar-color-picker {
    padding: 8px 12px;
    border-top: 1px solid #2a2e39;
  }
  
  .color-row {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
  }
  
  .color-btn {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: border-color 0.2s, transform 0.2s;
  }
  
  .color-btn:hover {
    transform: scale(1.1);
  }
  
  .color-btn.active {
    border-color: #fff;
  }
  
  .width-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .width-btn {
    width: 24px;
    height: 24px;
    border: 1px solid #2a2e39;
    border-radius: 4px;
    background: #2a2e39;
    color: #787b86;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    transition: background 0.2s, color 0.2s;
  }
  
  .width-btn:hover,
  .width-btn.active {
    background: #2962FF;
    color: #fff;
    border-color: #2962FF;
  }
  
  .toolbar-actions {
    padding: 8px;
    border-top: 1px solid #2a2e39;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .action-btn {
    width: 100%;
    padding: 8px;
    background: #2a2e39;
    border: none;
    border-radius: 4px;
    color: #787b86;
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: background 0.2s, color 0.2s;
  }
  
  .action-btn:hover {
    background: #363a45;
    color: #fff;
  }
  
  .action-btn.danger:hover {
    background: #ff4444;
  }
  
  /* Scrollbar */
  .toolbar-tools::-webkit-scrollbar {
    width: 4px;
  }
  
  .toolbar-tools::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .toolbar-tools::-webkit-scrollbar-thumb {
    background: #363a45;
    border-radius: 2px;
  }
  
  .toolbar-tools::-webkit-scrollbar-thumb:hover {
    background: #4a4e59;
  }
`;

// ==================== ICONS ====================

const ToolIcons: Record<string, React.ReactNode> = {
  cursor: (
    <svg viewBox="0 0 16 16">
      <path d="M4 2l8 6-4 1 2 5-2 1-2-5-4 2V2z"/>
    </svg>
  ),
  crosshair: (
    <svg viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1"/>
      <line x1="8" y1="0" x2="8" y2="5"/>
      <line x1="8" y1="11" x2="8" y2="16"/>
      <line x1="0" y1="8" x2="5" y2="8"/>
      <line x1="11" y1="8" x2="16" y2="8"/>
    </svg>
  ),
  'trend-line': (
    <svg viewBox="0 0 16 16">
      <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  'horizontal-line': (
    <svg viewBox="0 0 16 16">
      <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  'vertical-line': (
    <svg viewBox="0 0 16 16">
      <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  ray: (
    <svg viewBox="0 0 16 16">
      <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" strokeWidth="2"/>
      <polygon points="14,2 12,4 14,6"/>
    </svg>
  ),
  'fib-retrace': (
    <svg viewBox="0 0 16 16">
      <line x1="3" y1="2" x2="3" y2="14" stroke="currentColor" strokeWidth="1"/>
      <line x1="3" y1="2" x2="13" y2="14" stroke="currentColor" strokeWidth="2"/>
      <line x1="3" y1="5" x2="13" y2="5" stroke="currentColor" strokeWidth="0.5" opacity="0.5"/>
      <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="0.5" opacity="0.5"/>
      <line x1="3" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="0.5" opacity="0.5"/>
    </svg>
  ),
  'fib-extend': (
    <svg viewBox="0 0 16 16">
      <line x1="3" y1="14" x2="3" y2="2" stroke="currentColor" strokeWidth="1"/>
      <line x1="3" y1="14" x2="13" y2="2" stroke="currentColor" strokeWidth="2"/>
      <line x1="3" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="0.5" opacity="0.5"/>
      <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="0.5" opacity="0.5"/>
      <line x1="3" y1="5" x2="13" y2="5" stroke="currentColor" strokeWidth="0.5" opacity="0.5"/>
    </svg>
  ),
  rectangle: (
    <svg viewBox="0 0 16 16">
      <rect x="3" y="4" width="10" height="8" fill="none" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  ellipse: (
    <svg viewBox="0 0 16 16">
      <ellipse cx="8" cy="8" rx="5" ry="4" fill="none" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  text: (
    <svg viewBox="0 0 16 16">
      <text x="2" y="12" fontSize="10" fill="currentColor">T</text>
    </svg>
  ),
  'arrow-up': (
    <svg viewBox="0 0 16 16">
      <polygon points="8,2 4,10 6,10 6,14 10,14 10,10 12,10"/>
    </svg>
  ),
  'arrow-down': (
    <svg viewBox="0 0 16 16">
      <polygon points="8,14 4,6 6,6 6,2 10,2 10,6 12,6"/>
    </svg>
  ),
  channel: (
    <svg viewBox="0 0 16 16">
      <line x1="2" y1="14" x2="14" y2="4" stroke="currentColor" strokeWidth="1"/>
      <line x1="2" y1="10" x2="14" y2="0" stroke="currentColor" strokeWidth="1"/>
      <line x1="2" y1="14" x2="2" y2="10" stroke="currentColor" strokeWidth="1"/>
      <line x1="14" y1="4" x2="14" y2="0" stroke="currentColor" strokeWidth="1"/>
    </svg>
  ),
  pitchfork: (
    <svg viewBox="0 0 16 16">
      <line x1="2" y1="14" x2="8" y2="8" stroke="currentColor" strokeWidth="1"/>
      <line x1="8" y1="8" x2="14" y2="2" stroke="currentColor" strokeWidth="1"/>
      <line x1="2" y1="10" x2="14" y2="6" stroke="currentColor" strokeWidth="1"/>
      <line x1="2" y1="6" x2="14" y2="10" stroke="currentColor" strokeWidth="1"/>
    </svg>
  ),
  measure: (
    <svg viewBox="0 0 16 16">
      <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="2"/>
      <line x1="3" y1="11" x2="5" y2="13" stroke="currentColor" strokeWidth="1"/>
      <line x1="3" y1="15" x2="5" y2="13" stroke="currentColor" strokeWidth="1"/>
      <line x1="11" y1="1" x2="13" y2="3" stroke="currentColor" strokeWidth="1"/>
      <line x1="13" y1="1" x2="13" y2="3" stroke="currentColor" strokeWidth="1"/>
      <text x="7" y="9" fontSize="6" fill="currentColor">↔</text>
    </svg>
  ),
  eraser: (
    <svg viewBox="0 0 16 16">
      <path d="M2 10l6-6 6 6-4 4H6L2 10z" fill="none" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 16 16">
      <path d="M3 4h10M6 2h4l1 2H5l1-2zM4 4l1 10h6l1-10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
};

// ==================== COLOR PALETTE ====================

const COLOR_PALETTE = [
  '#2962FF', '#00897B', '#1E88E5', '#43A047',
  '#6D4C41', '#8E24AA', '#D81B60', '#E53935',
  '#FB8C00', '#FDD835', '#FFEB3B', '#FFFFFF',
];

// ==================== COMPONENT ====================

interface DrawingToolbarProps {
  activeTool: DrawingToolType | null;
  onToolSelect: (tool: DrawingToolType | null) => void;
  activeColor: string;
  onColorChange: (color: string) => void;
  activeWidth: number;
  onWidthChange: (width: number) => void;
  onClearAll: () => void;
  isExpanded?: boolean;
  onExpandToggle?: () => void;
}

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  activeTool,
  onToolSelect,
  activeColor,
  onColorChange,
  activeWidth,
  onWidthChange,
  onClearAll,
  isExpanded = true,
  onExpandToggle,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('lines');
  
  // Group tools by category
  const toolsByCategory = useMemo(() => {
    const grouped: Record<string, typeof DRAWING_TOOLS> = {};
    
    for (const tool of DRAWING_TOOLS) {
      if (!grouped[tool.category]) {
        grouped[tool.category] = [];
      }
      grouped[tool.category].push(tool);
    }
    
    return grouped;
  }, []);
  
  const categories = useMemo(() => 
    Object.keys(toolsByCategory), 
    [toolsByCategory]
  );
  
  const handleToolClick = useCallback((toolId: DrawingToolType) => {
    if (activeTool === toolId) {
      onToolSelect(null); // Deselect if already active
    } else {
      onToolSelect(toolId);
    }
  }, [activeTool, onToolSelect]);
  
  const handleClearAll = useCallback(() => {
    if (window.confirm('Удалить все рисунки?')) {
      onClearAll();
    }
  }, [onClearAll]);
  
  return (
    <>
      <style>{toolbarStyles}</style>
      
      <div className={`drawing-toolbar ${isExpanded ? 'expanded' : ''}`}>
        {/* Toggle button */}
        {onExpandToggle && (
          <button 
            className="toolbar-toggle"
            onClick={onExpandToggle}
            title={isExpanded ? 'Свернуть' : 'Развернуть'}
          >
            {isExpanded ? '◀' : '▶'}
          </button>
        )}
        
        {/* Categories (only in expanded mode) */}
        {isExpanded && (
          <div className="toolbar-categories">
            {categories.map(category => (
              <button
                key={category}
                className={`category-btn ${activeCategory === category ? 'active' : ''}`}
                onClick={() => setActiveCategory(category)}
              >
                {category === 'lines' && '📏'}
                {category === 'shapes' && '◻️'}
                {category === 'fibonacci' && '📐'}
                {category === 'annotations' && '📝'}
                {category === 'tools' && '🔧'}
                <span>{category}</span>
              </button>
            ))}
          </div>
        )}
        
        {/* Tools */}
        <div className="toolbar-tools">
          {categories.map(category => {
            if (isExpanded && activeCategory !== category) return null;
            
            return (
              <div key={category} className="tool-group">
                {!isExpanded && (
                  <div className="tool-group-title">{category.charAt(0).toUpperCase()}</div>
                )}
                
                {toolsByCategory[category].map(tool => {
                  const isActive = activeTool === tool.id;
                  const showInCollapsed = !isExpanded && ['cursor', 'trend_line', 'horizontal_line', 'fib-retrace', 'eraser'].includes(tool.id);
                  
                  if (!isExpanded && !showInCollapsed) return null;
                  
                  return (
                    <button
                      key={tool.id}
                      className={`tool-btn ${isActive ? 'active' : ''}`}
                      onClick={() => handleToolClick(tool.id)}
                      title={`${tool.name}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
                    >
                      <span className="tool-icon">
                        {ToolIcons[tool.icon] || ToolIcons.cursor}
                      </span>
                      {isExpanded && (
                        <>
                          <span className="tool-name">{tool.name}</span>
                          {tool.shortcut && (
                            <span className="tool-shortcut">{tool.shortcut}</span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        
        {/* Color & Width Pickers (expanded only) */}
        {isExpanded && (
          <>
            <div className="toolbar-color-picker">
              <div className="color-row">
                {COLOR_PALETTE.map(color => (
                  <button
                    key={color}
                    className={`color-btn ${activeColor === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => onColorChange(color)}
                    title={color}
                  />
                ))}
              </div>
              <div className="width-row">
                {[1, 2, 3, 4].map(width => (
                  <button
                    key={width}
                    className={`width-btn ${activeWidth === width ? 'active' : ''}`}
                    onClick={() => onWidthChange(width)}
                    title={`Толщина: ${width}px`}
                  >
                    <div style={{
                      width: `${width * 2}px`,
                      height: '12px',
                      backgroundColor: 'currentColor',
                      borderRadius: '1px',
                    }} />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        
        {/* Actions */}
        <div className="toolbar-actions">
          <button 
            className="action-btn"
            onClick={() => onToolSelect('cursor')}
            title="Выбор (Esc)"
          >
            🔍 Выбрать
          </button>
          <button 
            className="action-btn danger"
            onClick={handleClearAll}
            title="Удалить все рисунки"
          >
            🗑️ Очистить всё
          </button>
        </div>
      </div>
    </>
  );
};

export default DrawingToolbar;
