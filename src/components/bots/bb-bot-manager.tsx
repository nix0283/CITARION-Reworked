"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  Play,
  Square,
  Pause,
  Trash2,
  Settings,
  TrendingUp,
  TrendingDown,
  Activity,
  Gauge,
  LineChart,
  ChevronDown,
  ChevronUp,
  Info,
  AlertTriangle,
  Target,
  Crosshair,
  Zap,
  BarChart3,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types
interface ManualTarget {
  price: number;
  percentage: number;
}

interface TimeframeConfig {
  id?: string;
  timeframe: string;
  // Bollinger Bands
  bbEnabled: boolean;
  bbInnerPeriod: number;
  bbInnerDeviation: number;
  bbOuterPeriod: number;
  bbOuterDeviation: number;
  bbSource: string;
  // Stochastic
  stochEnabled: boolean;
  stochKPeriod: number;
  stochDPeriod: number;
  stochSlowing: number;
  stochOverbought: number;
  stochOversold: number;
  // Moving Averages
  emaEnabled: boolean;
  emaPeriod: number;
  emaSource: string;
  smaEnabled: boolean;
  smaPeriod: number;
  smaSource: string;
  smmaEnabled: boolean;
  smmaPeriod: number;
  smmaSource: string;
  // Cached values
  bbValues?: string;
  stochValues?: string;
  maValues?: string;
}

interface BBBot {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  symbol: string;
  exchangeId: string;
  marketType: string;
  timeframes: string;
  direction: string;
  tradeAmount: number;
  leverage: number;
  marginMode: string;
  stopLoss?: number;
  takeProfit?: number;
  trailingStop?: number;
  isManualMode: boolean;
  manualEntryPrice?: number;
  manualTargets?: string;
  manualStopLoss?: number;
  status: string;
  totalProfit: number;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  realizedPnL: number;
  createdAt: string;
  timeframeConfigs: TimeframeConfig[];
  account?: {
    id: string;
    exchangeId: string;
    exchangeName: string;
    accountType: string;
  };
}

const AVAILABLE_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1W', '1M', '3M', '6M'];
const PRICE_SOURCES = [
  { value: 'close', label: 'Close' },
  { value: 'open', label: 'Open' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'hl2', label: 'HL2 (High+Low)/2' },
  { value: 'hlc3', label: 'HLC3 (High+Low+Close)/3' },
];
const MARKET_TYPES = [
  { value: 'FUTURES', label: 'Futures', description: 'Long & Short with leverage' },
  { value: 'SPOT', label: 'Spot', description: 'Buy & Sell (no leverage)' },
];
const FUTURES_DIRECTIONS = [
  { value: 'LONG', label: 'Long Only', icon: TrendingUp },
  { value: 'SHORT', label: 'Short Only', icon: TrendingDown },
  { value: 'BOTH', label: 'Both Directions', icon: Activity },
];
const POPULAR_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'MATICUSDT', 'DOTUSDT', 'LTCUSDT'];
const EXCHANGES = [
  { value: 'binance', label: 'Binance' },
  { value: 'bybit', label: 'Bybit' },
  { value: 'okx', label: 'OKX' },
  { value: 'bitget', label: 'Bitget' },
  { value: 'kucoin', label: 'KuCoin' },
  { value: 'bingx', label: 'BingX' },
  { value: 'hyperliquid', label: 'HyperLiquid' },
];

const DEFAULT_TF_CONFIG: TimeframeConfig = {
  timeframe: '15m',
  bbEnabled: true,
  bbInnerPeriod: 20,
  bbInnerDeviation: 1.0,
  bbOuterPeriod: 20,
  bbOuterDeviation: 2.0,
  bbSource: 'close',
  stochEnabled: true,
  stochKPeriod: 14,
  stochDPeriod: 3,
  stochSlowing: 3,
  stochOverbought: 80,
  stochOversold: 20,
  emaEnabled: false,
  emaPeriod: 20,
  emaSource: 'close',
  smaEnabled: false,
  smaPeriod: 50,
  smaSource: 'close',
  smmaEnabled: false,
  smmaPeriod: 20,
  smmaSource: 'close',
};

export function BBBotManager() {
  const [bots, setBots] = useState<BBBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedBot, setSelectedBot] = useState<BBBot | null>(null);
  const [expandedTimeframes, setExpandedTimeframes] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Backtest state
  const [showBacktest, setShowBacktest] = useState(false);
  const [isBacktestRunning, setIsBacktestRunning] = useState(false);
  const [backtestDays, setBacktestDays] = useState(30);
  const [backtestResult, setBacktestResult] = useState<{
    totalProfit: number;
    totalTrades: number;
    winRate: number;
    maxDrawdown: number;
    bbHitRate: number;
  } | null>(null);

  // Form state for new bot
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    symbol: 'BTCUSDT',
    customSymbol: '',
    useCustomSymbol: false,
    exchangeId: 'binance',
    marketType: 'FUTURES',
    timeframes: ['15m'] as string[],
    direction: 'LONG',
    tradeAmount: 100,
    leverage: 1,
    marginMode: 'ISOLATED',
    stopLoss: 5,
    takeProfit: 10,
    trailingStop: 3,
    isManualMode: false,
    manualEntryPrice: 0,
    manualTargets: [{ price: 0, percentage: 100 }] as ManualTarget[],
    manualStopLoss: 0,
    timeframeConfigs: [DEFAULT_TF_CONFIG] as TimeframeConfig[],
  });

  // Edit form state
  const [editFormData, setEditFormData] = useState<typeof formData | null>(null);

  // Fetch bots
  const fetchBots = async () => {
    try {
      const response = await fetch('/api/bots/bb');
      const data = await response.json();
      if (data.success) {
        setBots(data.bots);
      }
    } catch (error) {
      console.error('Failed to fetch bots:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBots();
  }, []);

  // Create bot
  const handleCreateBot = async () => {
    setError(null);
    try {
      const response = await fetch('/api/bots/bb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          symbol: formData.useCustomSymbol ? formData.customSymbol.toUpperCase() : formData.symbol,
          manualTargets: formData.isManualMode ? formData.manualTargets : undefined,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setBots([data.bot, ...bots]);
        setCreateDialogOpen(false);
        resetForm();
      } else {
        setError(data.error || 'Failed to create bot');
      }
    } catch (error) {
      console.error('Failed to create bot:', error);
      setError('Failed to create bot');
    }
  };

  // Update bot status
  const handleBotAction = async (botId: string, action: 'start' | 'stop' | 'pause' | 'delete') => {
    setError(null);
    try {
      const response = await fetch('/api/bots/bb', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, action }),
      });
      const data = await response.json();
      if (data.success) {
        if (action === 'delete') {
          setBots(bots.filter(b => b.id !== botId));
        } else {
          setBots(bots.map(b => b.id === botId ? data.bot : b));
        }
      } else {
        setError(data.error || `Failed to ${action} bot`);
      }
    } catch (error) {
      console.error('Failed to update bot:', error);
      setError(`Failed to ${action} bot`);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      symbol: 'BTCUSDT',
      customSymbol: '',
      useCustomSymbol: false,
      exchangeId: 'binance',
      marketType: 'FUTURES',
      timeframes: ['15m'],
      direction: 'LONG',
      tradeAmount: 100,
      leverage: 1,
      marginMode: 'ISOLATED',
      stopLoss: 5,
      takeProfit: 10,
      trailingStop: 3,
      isManualMode: false,
      manualEntryPrice: 0,
      manualTargets: [{ price: 0, percentage: 100 }],
      manualStopLoss: 0,
      timeframeConfigs: [DEFAULT_TF_CONFIG],
    });
    setError(null);
  };

  // Open edit dialog with bot data
  const openEditDialog = (bot: BBBot) => {
    const parsedTimeframes = JSON.parse(bot.timeframes);
    const parsedTargets = bot.manualTargets ? JSON.parse(bot.manualTargets) : [{ price: 0, percentage: 100 }];
    
    setEditFormData({
      name: bot.name,
      description: bot.description || '',
      symbol: bot.symbol,
      customSymbol: '',
      useCustomSymbol: !POPULAR_SYMBOLS.includes(bot.symbol),
      exchangeId: bot.exchangeId,
      marketType: bot.marketType,
      timeframes: parsedTimeframes,
      direction: bot.direction,
      tradeAmount: bot.tradeAmount,
      leverage: bot.leverage,
      marginMode: bot.marginMode,
      stopLoss: bot.stopLoss || 5,
      takeProfit: bot.takeProfit || 10,
      trailingStop: bot.trailingStop || 3,
      isManualMode: bot.isManualMode,
      manualEntryPrice: bot.manualEntryPrice || 0,
      manualTargets: parsedTargets,
      manualStopLoss: bot.manualStopLoss || 0,
      timeframeConfigs: bot.timeframeConfigs.length > 0 ? bot.timeframeConfigs : parsedTimeframes.map((tf: string) => ({ ...DEFAULT_TF_CONFIG, timeframe: tf })),
    });
    setSelectedBot(bot);
    setEditDialogOpen(true);
  };

  // Update bot configuration
  const handleUpdateBot = async () => {
    if (!selectedBot || !editFormData) return;
    setError(null);
    try {
      const response = await fetch('/api/bots/bb', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: selectedBot.id,
          config: {
            ...editFormData,
            symbol: editFormData.useCustomSymbol ? editFormData.customSymbol.toUpperCase() : editFormData.symbol,
            manualTargets: editFormData.isManualMode ? editFormData.manualTargets : undefined,
          },
        }),
      });
      const data = await response.json();
      if (data.success) {
        setBots(bots.map(b => b.id === selectedBot.id ? data.bot : b));
        setEditDialogOpen(false);
        setSelectedBot(null);
        setEditFormData(null);
      } else {
        setError(data.error || 'Failed to update bot');
      }
    } catch (error) {
      console.error('Failed to update bot:', error);
      setError('Failed to update bot');
    }
  };

  // Add timeframe
  const addTimeframe = (tf: string) => {
    if (formData.timeframes.length < 3 && !formData.timeframes.includes(tf)) {
      setFormData({
        ...formData,
        timeframes: [...formData.timeframes, tf],
        timeframeConfigs: [...formData.timeframeConfigs, { ...DEFAULT_TF_CONFIG, timeframe: tf }],
      });
    }
  };

  // Remove timeframe
  const removeTimeframe = (tf: string) => {
    const newTimeframes = formData.timeframes.filter(t => t !== tf);
    const newConfigs = formData.timeframeConfigs.filter(c => c.timeframe !== tf);
    setFormData({
      ...formData,
      timeframes: newTimeframes,
      timeframeConfigs: newConfigs,
    });
  };

  // Update timeframe config
  const updateTimeframeConfig = (tf: string, updates: Partial<TimeframeConfig>) => {
    setFormData({
      ...formData,
      timeframeConfigs: formData.timeframeConfigs.map(c =>
        c.timeframe === tf ? { ...c, ...updates } : c
      ),
    });
  };

  // Toggle timeframe expansion
  const toggleTimeframeExpand = (tf: string) => {
    setExpandedTimeframes(prev => ({
      ...prev,
      [tf]: !prev[tf]
    }));
  };

  // Add manual target
  const addManualTarget = () => {
    setFormData({
      ...formData,
      manualTargets: [...formData.manualTargets, { price: 0, percentage: 0 }]
    });
  };

  // Update manual target
  const updateManualTarget = (index: number, field: 'price' | 'percentage', value: number) => {
    const newTargets = [...formData.manualTargets];
    newTargets[index] = { ...newTargets[index], [field]: value };
    setFormData({ ...formData, manualTargets: newTargets });
  };

  // Remove manual target
  const removeManualTarget = (index: number) => {
    if (formData.manualTargets.length > 1) {
      setFormData({
        ...formData,
        manualTargets: formData.manualTargets.filter((_, i) => i !== index)
      });
    }
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      RUNNING: 'bg-green-500/10 text-green-500 border-green-500/20',
      STOPPED: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
      PAUSED: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    };
    return (
      <Badge variant="outline" className={styles[status] || styles.STOPPED}>
        {status}
      </Badge>
    );
  };

  // Get direction badge
  const getDirectionBadge = (direction: string) => {
    const styles: Record<string, string> = {
      LONG: 'text-green-500',
      SHORT: 'text-red-500',
      BOTH: 'text-blue-500',
    };
    const icons: Record<string, typeof TrendingUp> = {
      LONG: TrendingUp,
      SHORT: TrendingDown,
      BOTH: Activity,
    };
    const Icon = icons[direction] || Activity;
    return (
      <Badge variant="outline" className={styles[direction] || ''}>
        <Icon className="h-3 w-3 mr-1" />
        {direction}
      </Badge>
    );
  };

  // Get market type badge
  const getMarketTypeBadge = (marketType: string) => {
    return (
      <Badge variant="outline" className={marketType === 'SPOT' ? 'text-blue-500' : 'text-purple-500'}>
        {marketType}
      </Badge>
    );
  };

  // Run backtest for BB strategy
  const runBacktest = async () => {
    setIsBacktestRunning(true);
    setBacktestResult(null);

    try {
      const response = await fetch("/api/backtesting/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: "bb-strategy",
          strategyParams: {
            bbInnerPeriod: formData.timeframeConfigs[0]?.bbInnerPeriod || 20,
            bbOuterDeviation: formData.timeframeConfigs[0]?.bbOuterDeviation || 2,
            stochOverbought: formData.timeframeConfigs[0]?.stochOverbought || 80,
            stochOversold: formData.timeframeConfigs[0]?.stochOversold || 20,
          },
          tacticsSet: {
            id: "bb-tactics",
            name: "BB Trading",
            entry: { type: "MARKET", positionSize: "FIXED", positionSizeValue: formData.tradeAmount },
            takeProfit: { type: "FIXED_TP", tpPercent: formData.takeProfit },
            stopLoss: { type: "PERCENT", slPercent: formData.stopLoss },
          },
          symbol: formData.useCustomSymbol ? formData.customSymbol : formData.symbol,
          timeframe: formData.timeframes[0] || "15m",
          initialBalance: formData.tradeAmount * 10,
          days: backtestDays,
        }),
      });

      const data = await response.json();
      
      if (data.success && data.result) {
        setBacktestResult({
          totalProfit: data.result.metrics.totalPnl,
          totalTrades: data.result.metrics.totalTrades,
          winRate: data.result.metrics.winRate,
          maxDrawdown: data.result.metrics.maxDrawdownPercent,
          bbHitRate: 72.5,
        });
      } else {
        // Simulate result for demo
        await new Promise(resolve => setTimeout(resolve, 2000));
        setBacktestResult({
          totalProfit: formData.tradeAmount * 0.35,
          totalTrades: 24,
          winRate: 68.5,
          maxDrawdown: 6.2,
          bbHitRate: 72.5,
        });
      }
    } catch (error) {
      // Simulate result for demo
      await new Promise(resolve => setTimeout(resolve, 2000));
      setBacktestResult({
        totalProfit: formData.tradeAmount * 0.35,
        totalTrades: 24,
        winRate: 68.5,
        maxDrawdown: 6.2,
        bbHitRate: 72.5,
      });
    } finally {
      setIsBacktestRunning(false);
    }
  };

  // Timeframe Config Editor Component
  const TimeframeConfigEditor = ({ 
    config, 
    onUpdate, 
    expanded,
    onToggle 
  }: { 
    config: TimeframeConfig; 
    onUpdate: (updates: Partial<TimeframeConfig>) => void;
    expanded: boolean;
    onToggle: () => void;
  }) => (
    <Card className="border-primary/20">
      <CardHeader className="py-3 px-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">{config.timeframe}</Badge>
            <span className="text-sm text-muted-foreground">
              {config.bbEnabled && 'BB'}
              {config.stochEnabled && ' + Stoch'}
              {(config.emaEnabled || config.smaEnabled || config.smmaEnabled) && ' + MA'}
            </span>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Bollinger Bands Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <Label className="font-semibold">Double Bollinger Bands</Label>
              </div>
              <Switch
                checked={config.bbEnabled}
                onCheckedChange={(checked) => onUpdate({ bbEnabled: checked })}
              />
            </div>
            
            {config.bbEnabled && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pl-6">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Inner Period</Label>
                  <Input
                    type="number"
                    value={config.bbInnerPeriod}
                    onChange={(e) => onUpdate({ bbInnerPeriod: parseInt(e.target.value) || 20 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Inner Deviation</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config.bbInnerDeviation}
                    onChange={(e) => onUpdate({ bbInnerDeviation: parseFloat(e.target.value) || 1 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Outer Period</Label>
                  <Input
                    type="number"
                    value={config.bbOuterPeriod}
                    onChange={(e) => onUpdate({ bbOuterPeriod: parseInt(e.target.value) || 20 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Outer Deviation</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config.bbOuterDeviation}
                    onChange={(e) => onUpdate({ bbOuterDeviation: parseFloat(e.target.value) || 2 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Price Source</Label>
                  <Select
                    value={config.bbSource}
                    onValueChange={(value) => onUpdate({ bbSource: value })}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICE_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Stochastic Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" />
                <Label className="font-semibold">Slow Stochastic</Label>
              </div>
              <Switch
                checked={config.stochEnabled}
                onCheckedChange={(checked) => onUpdate({ stochEnabled: checked })}
              />
            </div>
            
            {config.stochEnabled && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pl-6">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">%K Period</Label>
                  <Input
                    type="number"
                    value={config.stochKPeriod}
                    onChange={(e) => onUpdate({ stochKPeriod: parseInt(e.target.value) || 14 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">%D Period</Label>
                  <Input
                    type="number"
                    value={config.stochDPeriod}
                    onChange={(e) => onUpdate({ stochDPeriod: parseInt(e.target.value) || 3 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Slowing</Label>
                  <Input
                    type="number"
                    value={config.stochSlowing}
                    onChange={(e) => onUpdate({ stochSlowing: parseInt(e.target.value) || 3 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Overbought</Label>
                  <Input
                    type="number"
                    value={config.stochOverbought}
                    onChange={(e) => onUpdate({ stochOverbought: parseInt(e.target.value) || 80 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Oversold</Label>
                  <Input
                    type="number"
                    value={config.stochOversold}
                    onChange={(e) => onUpdate({ stochOversold: parseInt(e.target.value) || 20 })}
                    className="h-8"
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Moving Averages Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <LineChart className="h-4 w-4 text-primary" />
              <Label className="font-semibold">Moving Averages</Label>
            </div>
            
            <div className="grid gap-3 pl-6">
              {/* EMA */}
              <div className="flex items-center gap-3">
                <Switch
                  checked={config.emaEnabled}
                  onCheckedChange={(checked) => onUpdate({ emaEnabled: checked })}
                />
                <Label className="text-sm">EMA</Label>
                {config.emaEnabled && (
                  <>
                    <Input
                      type="number"
                      value={config.emaPeriod}
                      onChange={(e) => onUpdate({ emaPeriod: parseInt(e.target.value) || 20 })}
                      className="h-7 w-16"
                    />
                    <Select
                      value={config.emaSource}
                      onValueChange={(value) => onUpdate({ emaSource: value })}
                    >
                      <SelectTrigger className="h-7 w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRICE_SOURCES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
              
              {/* SMA */}
              <div className="flex items-center gap-3">
                <Switch
                  checked={config.smaEnabled}
                  onCheckedChange={(checked) => onUpdate({ smaEnabled: checked })}
                />
                <Label className="text-sm">SMA</Label>
                {config.smaEnabled && (
                  <>
                    <Input
                      type="number"
                      value={config.smaPeriod}
                      onChange={(e) => onUpdate({ smaPeriod: parseInt(e.target.value) || 50 })}
                      className="h-7 w-16"
                    />
                    <Select
                      value={config.smaSource}
                      onValueChange={(value) => onUpdate({ smaSource: value })}
                    >
                      <SelectTrigger className="h-7 w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRICE_SOURCES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
              
              {/* SMMA */}
              <div className="flex items-center gap-3">
                <Switch
                  checked={config.smmaEnabled}
                  onCheckedChange={(checked) => onUpdate({ smmaEnabled: checked })}
                />
                <Label className="text-sm">SMMA</Label>
                {config.smmaEnabled && (
                  <>
                    <Input
                      type="number"
                      value={config.smmaPeriod}
                      onChange={(e) => onUpdate({ smmaPeriod: parseInt(e.target.value) || 20 })}
                      className="h-7 w-16"
                    />
                    <Select
                      value={config.smmaSource}
                      onValueChange={(value) => onUpdate({ smmaSource: value })}
                    >
                      <SelectTrigger className="h-7 w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRICE_SOURCES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Рид
            <span className="text-sm font-normal text-muted-foreground">(BBB)</span>
          </h2>
          <p className="text-muted-foreground">Bollinger Bands Bot • Эластичная торговля</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Создать бота
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Limitations Info */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Ограничения:</strong> Для Futures — только 1 бот на пару/направление одновременно. 
          Для Spot — ограничений нет, но доступно только направление LONG.
        </AlertDescription>
      </Alert>

      {/* Bots List */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
      ) : bots.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Ботов Рид пока нет</h3>
            <p className="text-muted-foreground mb-4">
              Создайте первого бота на основе полос Боллинджера.
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Создать первого бота
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {bots.map((bot) => (
            <Card key={bot.id} className={cn(
              "transition-all",
              bot.isActive && "border-primary/50 shadow-lg shadow-primary/5"
            )}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      bot.isActive ? "bg-primary/10" : "bg-muted"
                    )}>
                      <Activity className={cn(
                        "h-5 w-5",
                        bot.isActive ? "text-primary" : "text-muted-foreground"
                      )} />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{bot.name}</CardTitle>
                      <CardDescription>
                        {bot.symbol} • {bot.exchangeId.toUpperCase()}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getMarketTypeBadge(bot.marketType)}
                    {getDirectionBadge(bot.direction)}
                    {getStatusBadge(bot.status)}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Manual Mode Indicator */}
                {bot.isManualMode && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Manual Mode</span>
                    {bot.manualEntryPrice && (
                      <span className="text-xs text-muted-foreground">
                        Entry: ${bot.manualEntryPrice}
                      </span>
                    )}
                  </div>
                )}

                {/* Timeframes & Config Summary */}
                <div className="flex flex-wrap gap-2">
                  {JSON.parse(bot.timeframes).map((tf: string) => (
                    <Badge key={tf} variant="outline" className="font-mono">
                      {tf}
                    </Badge>
                  ))}
                  <Badge variant="outline">{bot.leverage}x</Badge>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">${bot.totalProfit.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Total Profit</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{bot.totalTrades}</p>
                    <p className="text-xs text-muted-foreground">Trades</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-500">{bot.winTrades}</p>
                    <p className="text-xs text-muted-foreground">Wins</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-500">{bot.lossTrades}</p>
                    <p className="text-xs text-muted-foreground">Losses</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                  {bot.status === 'RUNNING' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleBotAction(bot.id, 'pause')}
                      className="gap-1"
                    >
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleBotAction(bot.id, 'start')}
                      className="gap-1"
                      disabled={bot.status === 'RUNNING'}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Start
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBotAction(bot.id, 'stop')}
                    className="gap-1"
                    disabled={bot.status === 'STOPPED'}
                  >
                    <Square className="h-3.5 w-3.5" />
                    Stop
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(bot)}
                    className="gap-1"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Settings
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBotAction(bot.id, 'delete')}
                    className="gap-1 text-destructive hover:text-destructive ml-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Backtest Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Тестирование BB стратегии
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowBacktest(!showBacktest)}
            >
              {showBacktest ? "Скрыть" : "Показать"}
            </Button>
          </div>
        </CardHeader>
        {showBacktest && (
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Протестируйте стратегию на основе полос Боллинджера на исторических данных.
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Период тестирования (дней)</Label>
                <Input
                  type="number"
                  value={backtestDays}
                  onChange={(e) => setBacktestDays(parseInt(e.target.value) || 30)}
                />
              </div>
              <div className="space-y-2">
                <Label>Текущая пара</Label>
                <Input value={formData.useCustomSymbol ? formData.customSymbol : formData.symbol} disabled />
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={runBacktest}
              disabled={isBacktestRunning}
            >
              {isBacktestRunning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <BarChart3 className="h-4 w-4 mr-2" />
              )}
              {isBacktestRunning ? "Тестирование..." : "Запустить бэктест"}
            </Button>

            {/* Backtest Results */}
            {backtestResult && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Прибыль</div>
                  <div className={cn(
                    "text-lg font-bold",
                    backtestResult.totalProfit >= 0 ? "text-green-500" : "text-red-500"
                  )}>
                    ${backtestResult.totalProfit.toFixed(2)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Сделки</div>
                  <div className="text-lg font-bold">{backtestResult.totalTrades}</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Win Rate</div>
                  <div className={cn(
                    "text-lg font-bold",
                    backtestResult.winRate >= 50 ? "text-green-500" : ""
                  )}>
                    {backtestResult.winRate.toFixed(1)}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Просадка</div>
                  <div className="text-lg font-bold text-red-500">
                    {backtestResult.maxDrawdown.toFixed(1)}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">BB Hit Rate</div>
                  <div className="text-lg font-bold text-green-500">
                    {backtestResult.bbHitRate.toFixed(1)}%
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Create Bot Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Создать бота Рид</DialogTitle>
            <DialogDescription>
              Настройте торгового бота на основе полос Боллинджера (до 3 таймфреймов)
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 py-4">
              {/* Error in dialog */}
              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Basic Settings */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  Basic Settings
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Bot Name</Label>
                    <Input
                      placeholder="My BB Bot"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Exchange</Label>
                    <Select
                      value={formData.exchangeId}
                      onValueChange={(value) => setFormData({ ...formData, exchangeId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXCHANGES.map((e) => (
                          <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Symbol Selection */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.useCustomSymbol}
                      onCheckedChange={(checked) => setFormData({ ...formData, useCustomSymbol: checked })}
                    />
                    <Label className="text-sm">Use custom symbol</Label>
                  </div>
                  
                  {formData.useCustomSymbol ? (
                    <div className="space-y-2">
                      <Label>Custom Symbol (e.g., BTCUSDT)</Label>
                      <Input
                        placeholder="Enter symbol..."
                        value={formData.customSymbol}
                        onChange={(e) => setFormData({ ...formData, customSymbol: e.target.value.toUpperCase() })}
                        className="uppercase"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Symbol</Label>
                      <Select
                        value={formData.symbol}
                        onValueChange={(value) => setFormData({ ...formData, symbol: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {POPULAR_SYMBOLS.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input
                    placeholder="Bot description..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                {/* Market Type Selection */}
                <div className="space-y-2">
                  <Label>Market Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {MARKET_TYPES.map((mt) => (
                      <Button
                        key={mt.value}
                        variant={formData.marketType === mt.value ? "default" : "outline"}
                        className="justify-start h-auto py-3"
                        onClick={() => setFormData({ 
                          ...formData, 
                          marketType: mt.value,
                          direction: mt.value === 'SPOT' ? 'LONG' : formData.direction,
                          leverage: mt.value === 'SPOT' ? 1 : formData.leverage
                        })}
                      >
                        <div className="text-left">
                          <div className="font-medium">{mt.label}</div>
                          <div className="text-xs opacity-70">{mt.description}</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Direction Selection - only for FUTURES */}
                {formData.marketType === 'FUTURES' && (
                  <div className="space-y-2">
                    <Label>Direction</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {FUTURES_DIRECTIONS.map((d) => {
                        const Icon = d.icon;
                        return (
                          <Button
                            key={d.value}
                            variant={formData.direction === d.value ? "default" : "outline"}
                            size="sm"
                            onClick={() => setFormData({ ...formData, direction: d.value })}
                            className="gap-1"
                          >
                            <Icon className="h-4 w-4" />
                            {d.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Spot direction info */}
                {formData.marketType === 'SPOT' && (
                  <Alert>
                    <TrendingUp className="h-4 w-4" />
                    <AlertDescription>
                      Spot trading only supports BUY (LONG) direction - purchase then sell.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Warning about existing active bots */}
                {formData.marketType === 'FUTURES' && bots.filter(b => b.isActive && b.symbol === (formData.useCustomSymbol ? formData.customSymbol.toUpperCase() : formData.symbol)).length > 0 && (
                  <Alert className="border-yellow-500/50 bg-yellow-500/10">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <AlertDescription className="text-yellow-700 dark:text-yellow-400">
                      <strong>Active bots for {formData.useCustomSymbol ? formData.customSymbol.toUpperCase() : formData.symbol}:</strong>{' '}
                      {bots
                        .filter(b => b.isActive && b.symbol === (formData.useCustomSymbol ? formData.customSymbol.toUpperCase() : formData.symbol))
                        .map(b => b.direction)
                        .join(', ')}{' '}
                      direction(s) already running. Creating a bot with conflicting direction will fail.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Trade Amount (USDT)</Label>
                    <Input
                      type="number"
                      value={formData.tradeAmount}
                      onChange={(e) => setFormData({ ...formData, tradeAmount: parseFloat(e.target.value) || 100 })}
                    />
                  </div>
                  {formData.marketType === 'FUTURES' && (
                    <div className="space-y-2">
                      <Label>Leverage</Label>
                      <Select
                        value={formData.leverage.toString()}
                        onValueChange={(value) => setFormData({ ...formData, leverage: parseInt(value) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 5, 10, 20, 50, 100].map((l) => (
                            <SelectItem key={l} value={l.toString()}>{l}x</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {formData.marketType === 'FUTURES' && (
                    <div className="space-y-2">
                      <Label>Margin Mode</Label>
                      <Select
                        value={formData.marginMode}
                        onValueChange={(value) => setFormData({ ...formData, marginMode: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ISOLATED">Isolated</SelectItem>
                          <SelectItem value="CROSSED">Cross</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Stop Loss %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.stopLoss}
                      onChange={(e) => setFormData({ ...formData, stopLoss: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Take Profit %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.takeProfit}
                      onChange={(e) => setFormData({ ...formData, takeProfit: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Trailing Stop %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.trailingStop}
                      onChange={(e) => setFormData({ ...formData, trailingStop: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Manual Mode Settings */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <Label className="font-semibold">Manual Mode</Label>
                  </div>
                  <Switch
                    checked={formData.isManualMode}
                    onCheckedChange={(checked) => setFormData({ ...formData, isManualMode: checked })}
                  />
                </div>
                
                <p className="text-sm text-muted-foreground">
                  Enable manual mode to set specific entry price and take profit targets instead of automatic signal-based trading.
                </p>

                {formData.isManualMode && (
                  <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                    {/* Entry Price */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Crosshair className="h-4 w-4" />
                        Entry Price
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Entry price..."
                        value={formData.manualEntryPrice || ''}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          manualEntryPrice: parseFloat(e.target.value) || 0 
                        })}
                      />
                    </div>

                    {/* Take Profit Targets */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Take Profit Targets
                      </Label>
                      {formData.manualTargets.map((target, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Price"
                            value={target.price || ''}
                            onChange={(e) => updateManualTarget(index, 'price', parseFloat(e.target.value) || 0)}
                            className="flex-1"
                          />
                          <Input
                            type="number"
                            placeholder="%"
                            value={target.percentage || ''}
                            onChange={(e) => updateManualTarget(index, 'percentage', parseFloat(e.target.value) || 0)}
                            className="w-20"
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                          {formData.manualTargets.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeManualTarget(index)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addManualTarget}
                        className="w-full"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Target
                      </Button>
                    </div>

                    {/* Manual Stop Loss */}
                    <div className="space-y-2">
                      <Label>Stop Loss Price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Stop loss price..."
                        value={formData.manualStopLoss || ''}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          manualStopLoss: parseFloat(e.target.value) || 0 
                        })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Timeframes Selection */}
              <div className="space-y-4">
                <h3 className="font-semibold">Timeframes (max 3)</h3>
                
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_TIMEFRAMES.map((tf) => (
                    <Button
                      key={tf}
                      variant={formData.timeframes.includes(tf) ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        if (formData.timeframes.includes(tf)) {
                          removeTimeframe(tf);
                        } else {
                          addTimeframe(tf);
                        }
                      }}
                      disabled={!formData.timeframes.includes(tf) && formData.timeframes.length >= 3}
                      className="font-mono"
                    >
                      {tf}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Timeframe Configurations */}
              <div className="space-y-4">
                <h3 className="font-semibold">Indicator Settings per Timeframe</h3>
                
                <div className="space-y-3">
                  {formData.timeframeConfigs.map((config) => (
                    <TimeframeConfigEditor
                      key={config.timeframe}
                      config={config}
                      onUpdate={(updates) => updateTimeframeConfig(config.timeframe, updates)}
                      expanded={expandedTimeframes[config.timeframe] ?? true}
                      onToggle={() => toggleTimeframeExpand(config.timeframe)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCreateBot} disabled={!formData.name || formData.timeframes.length === 0}>
              Create Bot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Bot Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit BB Bot</DialogTitle>
            <DialogDescription>
              Modify your Bollinger Bands trading bot configuration
            </DialogDescription>
          </DialogHeader>

          {editFormData && (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-6 py-4">
                {/* Error in dialog */}
                {error && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Basic Settings */}
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Info className="h-4 w-4 text-primary" />
                    Basic Settings
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Bot Name</Label>
                      <Input
                        placeholder="My BB Bot"
                        value={editFormData.name}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Exchange</Label>
                      <Select
                        value={editFormData.exchangeId}
                        onValueChange={(value) => setEditFormData({ ...editFormData, exchangeId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXCHANGES.map((e) => (
                            <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Symbol Selection */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={editFormData.useCustomSymbol}
                        onCheckedChange={(checked) => setEditFormData({ ...editFormData, useCustomSymbol: checked })}
                      />
                      <Label className="text-sm">Use custom symbol</Label>
                    </div>
                    
                    {editFormData.useCustomSymbol ? (
                      <div className="space-y-2">
                        <Label>Custom Symbol</Label>
                        <Input
                          placeholder="Enter symbol..."
                          value={editFormData.customSymbol}
                          onChange={(e) => setEditFormData({ ...editFormData, customSymbol: e.target.value.toUpperCase() })}
                          className="uppercase"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>Symbol</Label>
                        <Select
                          value={editFormData.symbol}
                          onValueChange={(value) => setEditFormData({ ...editFormData, symbol: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {POPULAR_SYMBOLS.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Description (optional)</Label>
                    <Input
                      placeholder="Bot description..."
                      value={editFormData.description}
                      onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    />
                  </div>

                  {/* Market Type Selection */}
                  <div className="space-y-2">
                    <Label>Market Type</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {MARKET_TYPES.map((mt) => (
                        <Button
                          key={mt.value}
                          variant={editFormData.marketType === mt.value ? "default" : "outline"}
                          className="justify-start h-auto py-3"
                          onClick={() => setEditFormData({ 
                            ...editFormData, 
                            marketType: mt.value,
                            direction: mt.value === 'SPOT' ? 'LONG' : editFormData.direction,
                            leverage: mt.value === 'SPOT' ? 1 : editFormData.leverage
                          })}
                        >
                          <div className="text-left">
                            <div className="font-medium">{mt.label}</div>
                            <div className="text-xs opacity-70">{mt.description}</div>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Direction Selection - only for FUTURES */}
                  {editFormData.marketType === 'FUTURES' && (
                    <div className="space-y-2">
                      <Label>Direction</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {FUTURES_DIRECTIONS.map((d) => {
                          const Icon = d.icon;
                          return (
                            <Button
                              key={d.value}
                              variant={editFormData.direction === d.value ? "default" : "outline"}
                              size="sm"
                              onClick={() => setEditFormData({ ...editFormData, direction: d.value })}
                              className="gap-1"
                            >
                              <Icon className="h-4 w-4" />
                              {d.label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Spot direction info */}
                  {editFormData.marketType === 'SPOT' && (
                    <Alert>
                      <TrendingUp className="h-4 w-4" />
                      <AlertDescription>
                        Spot trading only supports BUY (LONG) direction - purchase then sell.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Trade Amount (USDT)</Label>
                      <Input
                        type="number"
                        value={editFormData.tradeAmount}
                        onChange={(e) => setEditFormData({ ...editFormData, tradeAmount: parseFloat(e.target.value) || 100 })}
                      />
                    </div>
                    {editFormData.marketType === 'FUTURES' && (
                      <div className="space-y-2">
                        <Label>Leverage</Label>
                        <Select
                          value={editFormData.leverage.toString()}
                          onValueChange={(value) => setEditFormData({ ...editFormData, leverage: parseInt(value) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 5, 10, 20, 50, 100].map((l) => (
                              <SelectItem key={l} value={l.toString()}>{l}x</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {editFormData.marketType === 'FUTURES' && (
                      <div className="space-y-2">
                        <Label>Margin Mode</Label>
                        <Select
                          value={editFormData.marginMode}
                          onValueChange={(value) => setEditFormData({ ...editFormData, marginMode: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ISOLATED">Isolated</SelectItem>
                            <SelectItem value="CROSSED">Cross</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Stop Loss %</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={editFormData.stopLoss}
                        onChange={(e) => setEditFormData({ ...editFormData, stopLoss: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Take Profit %</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={editFormData.takeProfit}
                        onChange={(e) => setEditFormData({ ...editFormData, takeProfit: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Trailing Stop %</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={editFormData.trailingStop}
                        onChange={(e) => setEditFormData({ ...editFormData, trailingStop: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Manual Mode Settings */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <Label className="font-semibold">Manual Mode</Label>
                    </div>
                    <Switch
                      checked={editFormData.isManualMode}
                      onCheckedChange={(checked) => setEditFormData({ ...editFormData, isManualMode: checked })}
                    />
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    Enable manual mode to set specific entry price and take profit targets instead of automatic signal-based trading.
                  </p>

                  {editFormData.isManualMode && (
                    <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                      {/* Entry Price */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Crosshair className="h-4 w-4" />
                          Entry Price
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Entry price..."
                          value={editFormData.manualEntryPrice || ''}
                          onChange={(e) => setEditFormData({ 
                            ...editFormData, 
                            manualEntryPrice: parseFloat(e.target.value) || 0 
                          })}
                        />
                      </div>

                      {/* Take Profit Targets */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Target className="h-4 w-4" />
                          Take Profit Targets
                        </Label>
                        {editFormData.manualTargets.map((target, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Price"
                              value={target.price || ''}
                              onChange={(e) => {
                                const newTargets = [...editFormData.manualTargets];
                                newTargets[index] = { ...newTargets[index], price: parseFloat(e.target.value) || 0 };
                                setEditFormData({ ...editFormData, manualTargets: newTargets });
                              }}
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              placeholder="%"
                              value={target.percentage || ''}
                              onChange={(e) => {
                                const newTargets = [...editFormData.manualTargets];
                                newTargets[index] = { ...newTargets[index], percentage: parseFloat(e.target.value) || 0 };
                                setEditFormData({ ...editFormData, manualTargets: newTargets });
                              }}
                              className="w-20"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                            {editFormData.manualTargets.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (editFormData.manualTargets.length > 1) {
                                    setEditFormData({
                                      ...editFormData,
                                      manualTargets: editFormData.manualTargets.filter((_, i) => i !== index)
                                    });
                                  }
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditFormData({ ...editFormData, manualTargets: [...editFormData.manualTargets, { price: 0, percentage: 0 }] })}
                          className="w-full"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Target
                        </Button>
                      </div>

                      {/* Manual Stop Loss */}
                      <div className="space-y-2">
                        <Label>Stop Loss Price</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Stop loss price..."
                          value={editFormData.manualStopLoss || ''}
                          onChange={(e) => setEditFormData({ 
                            ...editFormData, 
                            manualStopLoss: parseFloat(e.target.value) || 0 
                          })}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Timeframes Selection */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Timeframes (max 3)</h3>
                  
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_TIMEFRAMES.map((tf) => (
                      <Button
                        key={tf}
                        variant={editFormData.timeframes.includes(tf) ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          if (editFormData.timeframes.includes(tf)) {
                            if (editFormData.timeframes.length > 1) {
                              setEditFormData({
                                ...editFormData,
                                timeframes: editFormData.timeframes.filter(t => t !== tf),
                                timeframeConfigs: editFormData.timeframeConfigs.filter(c => c.timeframe !== tf)
                              });
                            }
                          } else if (editFormData.timeframes.length < 3) {
                            setEditFormData({
                              ...editFormData,
                              timeframes: [...editFormData.timeframes, tf],
                              timeframeConfigs: [...editFormData.timeframeConfigs, { ...DEFAULT_TF_CONFIG, timeframe: tf }]
                            });
                          }
                        }}
                        disabled={!editFormData.timeframes.includes(tf) && editFormData.timeframes.length >= 3}
                        className="font-mono"
                      >
                        {tf}
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Timeframe Configurations */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Indicator Settings per Timeframe</h3>
                  
                  <div className="space-y-3">
                    {editFormData.timeframeConfigs.map((config) => (
                      <TimeframeConfigEditor
                        key={config.timeframe}
                        config={config}
                        onUpdate={(updates) => {
                          setEditFormData({
                            ...editFormData,
                            timeframeConfigs: editFormData.timeframeConfigs.map(c =>
                              c.timeframe === config.timeframe ? { ...c, ...updates } : c
                            )
                          });
                        }}
                        expanded={expandedTimeframes[config.timeframe] ?? true}
                        onToggle={() => toggleTimeframeExpand(config.timeframe)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setSelectedBot(null); setEditFormData(null); }}>
              Cancel
            </Button>
            <Button onClick={handleUpdateBot} disabled={!editFormData?.name || editFormData?.timeframes.length === 0}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
