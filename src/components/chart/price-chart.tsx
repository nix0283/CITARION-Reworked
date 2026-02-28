"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  RotateCcw,
  BarChart3,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  LineData,
  ColorType,
  CrosshairMode,
  Time,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  MouseEventHandler,
} from "lightweight-charts";
import { IndicatorsPanel } from "@/components/indicators/indicators-panel";
import { calculateIndicator, type Candle } from "@/lib/indicators/calculator";
import type { BuiltInIndicator } from "@/lib/indicators/builtin";

// Timeframes
const TIMEFRAMES = [
  { id: "1m", label: "1m", seconds: 60 },
  { id: "5m", label: "5m", seconds: 300 },
  { id: "15m", label: "15m", seconds: 900 },
  { id: "1h", label: "1H", seconds: 3600 },
  { id: "4h", label: "4H", seconds: 14400 },
  { id: "1d", label: "1D", seconds: 86400 },
];

// Popular symbols
const SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT",
];

// Base prices for different symbols
const BASE_PRICES: Record<string, number> = {
  BTCUSDT: 97000,
  ETHUSDT: 3200,
  SOLUSDT: 180,
  BNBUSDT: 650,
  XRPUSDT: 2.5,
  DOGEUSDT: 0.35,
  ADAUSDT: 0.8,
  AVAXUSDT: 35,
  DOTUSDT: 6,
  LINKUSDT: 18,
};

interface ChartCandle {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Indicator configuration
interface IndicatorConfig {
  id: string;
  indicator: BuiltInIndicator;
  inputs: Record<string, number | string | boolean>;
  visible: boolean;
}

// Tooltip data
interface TooltipData {
  time: Time | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  indicators: Array<{ name: string; value: number | null; color: string }>;
}

// Generate synthetic OHLCV data
function generateOHLCV(
  basePrice: number,
  candles: number = 500,
  volatility: number = 0.02
): ChartCandle[] {
  const data: ChartCandle[] = [];
  let price = basePrice;
  const now = Math.floor(Date.now() / 1000);
  const interval = 3600; // 1h

  for (let i = candles; i >= 0; i--) {
    const time = now - i * interval;
    const change = (Math.random() - 0.5) * 2 * volatility * price;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    const volume = 1000 + Math.random() * 10000;

    data.push({
      time: time as Time,
      open,
      high,
      low,
      close,
      volume,
    });
    price = close;
  }

  return data;
}

// Validate candle data
function isValidCandle(d: ChartCandle): boolean {
  return (
    typeof d.time === 'number' &&
    typeof d.open === 'number' && !isNaN(d.open) &&
    typeof d.high === 'number' && !isNaN(d.high) &&
    typeof d.low === 'number' && !isNaN(d.low) &&
    typeof d.close === 'number' && !isNaN(d.close) &&
    typeof d.volume === 'number' && !isNaN(d.volume) &&
    d.high >= d.low &&
    d.high >= Math.max(d.open, d.close) &&
    d.low <= Math.min(d.open, d.close)
  );
}

// Convert candles to volume histogram data with colors
function toVolumeData(data: ChartCandle[]): HistogramData<Time>[] {
  return data
    .filter(isValidCandle)
    .map((d) => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? "rgba(38, 166, 154, 0.5)" : "rgba(239, 83, 80, 0.5)",
    }));
}

// Convert candles to candlestick data
function toCandlestickData(data: ChartCandle[]): CandlestickData<Time>[] {
  return data
    .filter(isValidCandle)
    .map((d) => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
}

// Format time to readable string
function formatTime(time: Time | null): string {
  if (!time) return '-';
  const date = new Date((time as number) * 1000);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PriceChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  
  // Store for indicator series - now includes pane index
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<"Line" | "Histogram">[]>>(new Map());
  const paneSeriesRef = useRef<Map<string, ISeriesApi<"Line" | "Histogram">[]>>(new Map());
  // Store price lines for indicators (for RSI levels 70/30)
  const priceLinesRef = useRef<Map<string, any[]>>(new Map());

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [isLoading, setIsLoading] = useState(true);
  const [isChartReady, setIsChartReady] = useState(false);
  const [candles, setCandles] = useState<ChartCandle[]>([]);
  const [showVolume, setShowVolume] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [activeIndicators, setActiveIndicators] = useState<IndicatorConfig[]>([]);
  const [showIndicatorsPanel, setShowIndicatorsPanel] = useState(true);
  
  // Tooltip state
  const [tooltip, setTooltip] = useState<TooltipData>({
    time: null,
    open: null,
    high: null,
    low: null,
    close: null,
    volume: null,
    indicators: [],
  });
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Split indicators into overlay and pane
  const { overlayIndicators, paneIndicators } = useMemo(() => {
    const overlay: IndicatorConfig[] = [];
    const pane: IndicatorConfig[] = [];
    
    activeIndicators.filter(i => i.visible).forEach(config => {
      if (config.indicator.overlay) {
        overlay.push(config);
      } else {
        pane.push(config);
      }
    });
    
    return { overlayIndicators: overlay, paneIndicators: pane };
  }, [activeIndicators]);

  const hasPaneIndicators = paneIndicators.length > 0;

  // Initialize chart with panes support
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const initChart = () => {
      if (!chartContainerRef.current) return;
      
      const container = chartContainerRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      if (width === 0 || height === 0) {
        requestAnimationFrame(initChart);
        return;
      }

      // Create chart with panes configuration
      const chart = createChart(container, {
        width,
        height,
        layout: {
          background: { type: ColorType.Solid, color: "#131722" },
          textColor: "#4c525e",
        },
        grid: {
          vertLines: { color: "#1e222d" },
          horzLines: { color: "#1e222d" },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: '#758696',
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: '#1e222d',
          },
          horzLine: {
            color: '#758696',
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: '#1e222d',
          },
        },
        rightPriceScale: {
          borderColor: "#2a2e39",
        },
        timeScale: {
          borderColor: "#2a2e39",
          timeVisible: true,
        },
        // Configure panes - pane 0 is main (price), pane 1 is for oscillators
        panes: hasPaneIndicators ? [
          { height: 0.7 },  // 70% for price chart
          { height: 0.3 },  // 30% for oscillator
        ] : [
          { height: 1.0 },  // 100% when no pane indicators
        ],
        // Pane separator styling
        paneSeparator: {
          color: "#2a2e39",
          hoverColor: "#4c525e",
          width: 2,
        },
        handleScale: {
          mouseWheel: true,
          pinch: true,
          axisPressedMouseMove: true,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
      } as any);

      chartRef.current = chart;

      // Create candlestick series in pane 0 (default)
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderDownColor: "#ef5350",
        borderUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        wickUpColor: "#26a69a",
      });
      candleSeriesRef.current = candleSeries;

      // Create volume series in pane 0 with its own price scale
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: {
          type: "volume",
        },
        priceScaleId: "volume-scale",
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });
      volumeSeriesRef.current = volumeSeries;
      
      // Subscribe to crosshair move for tooltip
      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.point) {
          setShowTooltip(false);
          return;
        }

        const candleData = param.seriesData.get(candleSeriesRef.current!);
        const volumeData = param.seriesData.get(volumeSeriesRef.current!);

        if (candleData && 'open' in candleData) {
          const indicators: TooltipData['indicators'] = [];
          
          // Get indicator values at current time
          overlaySeriesRef.current.forEach((seriesArr, id) => {
            seriesArr.forEach((s) => {
              const data = param.seriesData.get(s);
              if (data && 'value' in data) {
                const config = activeIndicators.find(i => i.id === id);
                if (config) {
                  indicators.push({
                    name: config.indicator.name,
                    value: data.value,
                    color: config.indicator.outputConfig[0]?.color || '#fff',
                  });
                }
              }
            });
          });
          
          paneSeriesRef.current.forEach((seriesArr, id) => {
            seriesArr.forEach((s, idx) => {
              const data = param.seriesData.get(s);
              if (data && 'value' in data) {
                const config = activeIndicators.find(i => i.id === id);
                if (config && config.indicator.outputConfig[idx]) {
                  indicators.push({
                    name: `${config.indicator.name} (${config.indicator.outputConfig[idx].name})`,
                    value: data.value,
                    color: config.indicator.outputConfig[idx].color,
                  });
                }
              }
            });
          });

          setTooltip({
            time: param.time,
            open: candleData.open,
            high: candleData.high,
            low: candleData.low,
            close: candleData.close,
            volume: volumeData && 'value' in volumeData ? volumeData.value : null,
            indicators,
          });
          setTooltipPosition({ x: param.point.x, y: param.point.y });
          setShowTooltip(true);
        }
      });
      
      // Chart is ready
      setIsChartReady(true);
    };

    requestAnimationFrame(initChart);

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    
    const resizeObserver = new ResizeObserver(handleResize);
    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [hasPaneIndicators, activeIndicators]);

  // Update panes configuration when indicators change
  // Note: 'panes' option may not be available in current lightweight-charts version
  // useEffect(() => {
  //   if (!chartRef.current || !isChartReady) return;

  //   chartRef.current.applyOptions({
  //     panes: hasPaneIndicators ? [
  //       { height: 0.7 },
  //       { height: 0.3 },
  //     ] : [
  //       { height: 1.0 },
  //     ],
  //   });
  // }, [hasPaneIndicators, isChartReady]);

  // Fetch data on mount and when symbol/timeframe changes
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/ohlcv?symbol=${symbol}&interval=${timeframe}&limit=500`
        );

        if (response.ok) {
          const data = await response.json();

          if (data.success && data.ohlcv && data.ohlcv.length > 0) {
            const ohlcv: ChartCandle[] = data.ohlcv.map((c: number[]) => ({
              time: Math.floor(c[0] / 1000) as Time,
              open: c[1],
              high: c[2],
              low: c[3],
              close: c[4],
              volume: c[5],
            }));

            if (!cancelled) {
              setCandles(ohlcv);
              const lastCandle = ohlcv[ohlcv.length - 1];
              setCurrentPrice(lastCandle.close);
              setPriceChange(
                ((lastCandle.close - ohlcv[0].open) / ohlcv[0].open) * 100
              );
            }
            return;
          }
        }

        const basePrice = BASE_PRICES[symbol] || 1000;
        const syntheticData = generateOHLCV(basePrice, 500, 0.02);

        if (!cancelled) {
          setCandles(syntheticData);
          const lastCandle = syntheticData[syntheticData.length - 1];
          setCurrentPrice(lastCandle.close);
          setPriceChange(
            ((lastCandle.close - syntheticData[0].open) / syntheticData[0].open) * 100
          );
        }
      } catch (error) {
        console.error("Failed to fetch chart data:", error);

        if (!cancelled) {
          const basePrice = BASE_PRICES[symbol] || 1000;
          const syntheticData = generateOHLCV(basePrice, 500, 0.02);

          setCandles(syntheticData);
          const lastCandle = syntheticData[syntheticData.length - 1];
          setCurrentPrice(lastCandle.close);
          setPriceChange(
            ((lastCandle.close - syntheticData[0].open) / syntheticData[0].open) * 100
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe]);

  // Update chart data
  useEffect(() => {
    if (!chartRef.current || !isChartReady || candles.length === 0) return;

    const candleData = toCandlestickData(candles);
    const volumeData = toVolumeData(candles);
    
    if (candleData.length === 0) return;

    // Update candlestick data
    if (candleSeriesRef.current) {
      try {
        candleSeriesRef.current.setData(candleData);
      } catch (e) {
        console.error('Error setting candlestick data:', e);
      }
    }

    // Update volume data
    if (volumeSeriesRef.current) {
      try {
        if (showVolume) {
          volumeSeriesRef.current.setData(volumeData);
        } else {
          volumeSeriesRef.current.setData([]);
        }
      } catch (e) {
        console.error('Error setting volume data:', e);
      }
    }

    // Fit content
    try {
      chartRef.current.timeScale().fitContent();
    } catch (e) {
      console.error('Error fitting content:', e);
    }
  }, [candles, showVolume, isChartReady]);

  // Render overlay indicators on main chart (pane 0)
  useEffect(() => {
    if (!chartRef.current || !isChartReady || candles.length === 0) return;

    const chart = chartRef.current;

    // Remove old indicator series
    overlaySeriesRef.current.forEach((series) => {
      series.forEach((s) => {
        try {
          chart.removeSeries(s);
        } catch (e) {}
      });
    });
    overlaySeriesRef.current.clear();

    // Add new indicator series
    overlayIndicators.forEach((config) => {
      let result;
      try {
        result = calculateIndicator(config.indicator, candles, config.inputs);
      } catch (e) {
        console.error('Error calculating indicator:', e);
        return;
      }
      if (!result) return;

      const series: ISeriesApi<"Line" | "Histogram">[] = [];

      result.lines.forEach((line) => {
        if (line.data.length === 0) return;
        try {
          const lineSeries = chart.addSeries(LineSeries, {
            color: line.color,
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          }, 0); // pane 0 - main chart
          lineSeries.setData(line.data as LineData<Time>[]);
          series.push(lineSeries);
        } catch (e) {
          console.error('Error adding line series:', e);
        }
      });

      result.histograms.forEach((hist) => {
        if (hist.data.length === 0) return;
        try {
          const histSeries = chart.addSeries(HistogramSeries, {
            priceLineVisible: false,
            lastValueVisible: false,
          }, 0); // pane 0 - main chart
          histSeries.setData(hist.data as HistogramData<Time>[]);
          series.push(histSeries);
        } catch (e) {
          console.error('Error adding histogram series:', e);
        }
      });

      if (series.length > 0) {
        overlaySeriesRef.current.set(config.id, series);
      }
    });

    return () => {
      overlaySeriesRef.current.forEach((series) => {
        series.forEach((s) => {
          try {
            chart.removeSeries(s);
          } catch (e) {}
        });
      });
      overlaySeriesRef.current.clear();
    };
  }, [candles, overlayIndicators, isChartReady]);

  // Render pane indicators (oscillators) in pane 1 with price levels
  useEffect(() => {
    if (!chartRef.current || !isChartReady || candles.length === 0 || !hasPaneIndicators) return;

    const chart = chartRef.current;

    // Remove old price lines
    priceLinesRef.current.forEach((lines) => {
      lines.forEach((line) => {
        try {
          line.remove();
        } catch (e) {}
      });
    });
    priceLinesRef.current.clear();

    // Remove old pane indicator series
    paneSeriesRef.current.forEach((series) => {
      series.forEach((s) => {
        try {
          chart.removeSeries(s);
        } catch (e) {}
      });
    });
    paneSeriesRef.current.clear();

    // Add new indicator series in pane 1
    paneIndicators.forEach((config) => {
      let result;
      try {
        result = calculateIndicator(config.indicator, candles, config.inputs);
      } catch (e) {
        console.error('Error calculating pane indicator:', e);
        return;
      }
      if (!result) return;

      const series: ISeriesApi<"Line" | "Histogram">[] = [];
      const paneIndex = 1; // All pane indicators go to pane 1
      const priceScaleId = `pane-scale-${config.id}`;

      result.lines.forEach((line, idx) => {
        if (line.data.length === 0) return;
        try {
          const lineSeries = chart.addSeries(LineSeries, {
            color: line.color,
            lineWidth: 1,
            priceLineVisible: true,
            lastValueVisible: true,
            priceScaleId: priceScaleId,
          }, paneIndex);
          lineSeries.setData(line.data as LineData<Time>[]);
          series.push(lineSeries);
        } catch (e) {
          console.error('Error adding pane line series:', e);
        }
      });

      result.histograms.forEach((hist) => {
        if (hist.data.length === 0) return;
        try {
          const histSeries = chart.addSeries(HistogramSeries, {
            priceLineVisible: false,
            lastValueVisible: false,
            priceScaleId: priceScaleId,
          }, paneIndex);
          histSeries.setData(hist.data as HistogramData<Time>[]);
          series.push(histSeries);
        } catch (e) {
          console.error('Error adding pane histogram series:', e);
        }
      });

      if (series.length > 0) {
        paneSeriesRef.current.set(config.id, series);

        // Configure price scale for specific indicators
        if (config.indicator.id === 'rsi') {
          // Fixed scale 0-100 for RSI
          chart.priceScale(priceScaleId).applyOptions({
            autoScale: false,
            scaleMargins: { top: 0.1, bottom: 0.1 },
          });

          // Add horizontal lines at 70 and 30 for RSI
          const priceLines: any[] = [];
          const mainSeries = series[0]; // First line series
          
          if (mainSeries && 'createPriceLine' in mainSeries) {
            // Overbought level (70)
            const overboughtLine = mainSeries.createPriceLine({
              price: 70,
              color: 'rgba(239, 83, 80, 0.5)',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'Overbought',
            });
            priceLines.push(overboughtLine);

            // Oversold level (30)
            const oversoldLine = mainSeries.createPriceLine({
              price: 30,
              color: 'rgba(38, 166, 154, 0.5)',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'Oversold',
            });
            priceLines.push(oversoldLine);

            // Middle level (50)
            const middleLine = mainSeries.createPriceLine({
              price: 50,
              color: 'rgba(255, 255, 255, 0.2)',
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: false,
              title: '',
            });
            priceLines.push(middleLine);
          }

          priceLinesRef.current.set(config.id, priceLines);
        }
        
        // MACD zero line
        if (config.indicator.id === 'macd') {
          const mainSeries = series[0];
          if (mainSeries && 'createPriceLine' in mainSeries) {
            const zeroLine = mainSeries.createPriceLine({
              price: 0,
              color: 'rgba(255, 255, 255, 0.3)',
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: false,
              title: '',
            });
            priceLinesRef.current.set(config.id, [zeroLine]);
          }
        }
      }
    });

    return () => {
      // Remove price lines
      priceLinesRef.current.forEach((lines) => {
        lines.forEach((line) => {
          try {
            line.remove();
          } catch (e) {}
        });
      });
      priceLinesRef.current.clear();

      // Remove series
      paneSeriesRef.current.forEach((series) => {
        series.forEach((s) => {
          try {
            chart.removeSeries(s);
          } catch (e) {}
        });
      });
      paneSeriesRef.current.clear();
    };
  }, [candles, paneIndicators, hasPaneIndicators, isChartReady]);

  const formatPrice = (price: number) => {
    if (price >= 1000) {
      return `$${price.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    return `$${price.toFixed(4)}`;
  };

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    const basePrice = BASE_PRICES[symbol] || 1000;
    const syntheticData = generateOHLCV(basePrice, 500, 0.02);
    setCandles(syntheticData);

    const lastCandle = syntheticData[syntheticData.length - 1];
    setCurrentPrice(lastCandle.close);
    setPriceChange(
      ((lastCandle.close - syntheticData[0].open) / syntheticData[0].open) * 100
    );
    setIsLoading(false);
  }, [symbol]);

  const handleIndicatorsChange = useCallback((indicators: IndicatorConfig[]) => {
    setActiveIndicators(indicators);
  }, []);

  // Build legend items
  const legendItems = useMemo(() => {
    const items: Array<{ color: string; label: string }> = [];
    
    if (showVolume) {
      items.push({ color: '#26a69a', label: 'Volume' });
    }
    
    activeIndicators.filter(i => i.visible).forEach(config => {
      config.indicator.outputConfig.forEach(output => {
        items.push({ color: output.color, label: `${config.indicator.name} (${output.name})` });
      });
    });
    
    return items;
  }, [activeIndicators, showVolume]);

  return (
    <div className="h-full flex">
      {/* Main Chart Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-3 border-b border-border bg-card/50">
          <div className="flex items-center gap-3">
            {/* Symbol Selector */}
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYMBOLS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace("USDT", "/USDT")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Timeframe Selector */}
            <div className="flex items-center gap-1">
              {TIMEFRAMES.map((tf) => (
                <Button
                  key={tf.id}
                  variant={timeframe === tf.id ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setTimeframe(tf.id)}
                >
                  {tf.label}
                </Button>
              ))}
            </div>

            {/* Volume Toggle */}
            <Button
              variant={showVolume ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowVolume(!showVolume)}
            >
              <BarChart3 className="h-3 w-3 mr-1" />
              Vol
            </Button>
          </div>

          <div className="flex items-center gap-3">
            {/* Current Price */}
            {currentPrice && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {formatPrice(currentPrice)}
                </span>
                <Badge
                  className={cn(
                    "text-xs",
                    priceChange >= 0
                      ? "bg-green-500/10 text-green-500"
                      : "bg-red-500/10 text-red-500"
                  )}
                >
                  {priceChange >= 0 ? (
                    <TrendingUp className="h-3 w-3 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-1" />
                  )}
                  {priceChange >= 0 ? "+" : ""}
                  {priceChange.toFixed(2)}%
                </Badge>
              </div>
            )}

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RotateCcw
                className={cn("h-4 w-4", isLoading && "animate-spin")}
              />
            </Button>

            {/* Toggle Indicators Panel */}
            <Button
              variant={showIndicatorsPanel ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => setShowIndicatorsPanel(!showIndicatorsPanel)}
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Chart Container - Single chart with panes */}
        <div
          ref={chartContainerRef}
          className={cn(
            "relative flex-1 hide-tv-logo min-h-[400px]",
            (isLoading || !isChartReady || candles.length === 0) && "pointer-events-none"
          )}
        >
          {(isLoading || !isChartReady || candles.length === 0) && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#131722] z-10">
              {isLoading || !isChartReady ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2">Загрузка данных...</span>
                </>
              ) : (
                <span className="text-muted-foreground">Нет данных</span>
              )}
            </div>
          )}
          
          {/* Tooltip */}
          {showTooltip && tooltip.time && (
            <div
              className="absolute z-20 pointer-events-none bg-[#1e222d]/95 border border-[#2a2e39] rounded-md p-3 text-xs shadow-lg"
              style={{
                left: Math.min(tooltipPosition.x + 15, (chartContainerRef.current?.clientWidth || 400) - 200),
                top: Math.max(tooltipPosition.y - 100, 10),
              }}
            >
              <div className="text-muted-foreground mb-2 font-medium">
                {formatTime(tooltip.time)}
              </div>
              
              {/* OHLCV */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Open:</span>
                  <span className="ml-2">{tooltip.open?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">High:</span>
                  <span className="ml-2 text-green-400">{tooltip.high?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Low:</span>
                  <span className="ml-2 text-red-400">{tooltip.low?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Close:</span>
                  <span className={cn("ml-2", tooltip.close! >= tooltip.open! ? "text-green-400" : "text-red-400")}>
                    {tooltip.close?.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span className="text-muted-foreground">Volume:</span>
                  <span className="ml-2">{tooltip.volume?.toLocaleString()}</span>
                </div>
              </div>
              
              {/* Indicators */}
              {tooltip.indicators.length > 0 && (
                <div className="border-t border-[#2a2e39] pt-2 mt-1">
                  <div className="text-muted-foreground mb-1 font-medium">Индикаторы:</div>
                  {tooltip.indicators.map((ind, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ind.color }} />
                        {ind.name}:
                      </span>
                      <span className="ml-2">{ind.value?.toFixed(2) || '-'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 p-2 border-t border-border bg-card/50 text-xs flex-wrap">
          {legendItems.map((item, index) => (
            <div key={index} className="flex items-center gap-1">
              <div
                className="w-3 h-0.5"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Indicators Panel Sidebar */}
      {showIndicatorsPanel && (
        <div className="w-[280px] border-l border-border bg-card/30 flex flex-col">
          <div className="p-3 border-b border-border">
            <h3 className="text-sm font-medium">Индикаторы</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <IndicatorsPanel onIndicatorsChange={handleIndicatorsChange} />
          </div>
        </div>
      )}

    </div>
  );
}
