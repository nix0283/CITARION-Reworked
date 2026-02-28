/**
 * Backtesting Dashboard Page
 * 
 * Comprehensive backtesting interface:
 * - Strategy configuration
 * - Historical testing
 * - Performance metrics
 * - Equity curve visualization
 * - Walk-forward analysis
 * - Monte Carlo simulation
 * 
 * @page /backtest
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Play, 
  StopCircle, 
  Download, 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Activity,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ==================== TYPES ====================

interface BacktestConfig {
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  commission: number;
  slippage: number;
  strategy: string;
  parameters: Record<string, any>;
}

interface BacktestResult {
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  equityCurve: Array<{ date: string; equity: number }>;
  trades: Array<{
    date: string;
    symbol: string;
    side: string;
    quantity: number;
    entryPrice: number;
    exitPrice: number;
    pnl: number;
  }>;
}

interface WalkForwardResult {
  recommendation: 'APPROVED' | 'CAUTION' | 'REJECTED';
  stabilityScore: number;
  avgDegradation: number;
  windows: Array<{
    windowId: number;
    inSampleReturn: number;
    outOfSampleReturn: number;
    passed: boolean;
  }>;
}

// ==================== BACKTESTING DASHBOARD PAGE ====================

export default function BacktestDashboard() {
  const [running, setRunning] = useState(false);
  const [config, setConfig] = useState<BacktestConfig>({
    symbol: 'BTCUSDT',
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    initialCapital: 10000,
    commission: 0.04,
    slippage: 0.05,
    strategy: 'MACrossover',
    parameters: {
      fastPeriod: 12,
      slowPeriod: 26,
      stopLoss: 2,
      takeProfit: 4,
    },
  });
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [walkForward, setWalkForward] = useState<WalkForwardResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRunBacktest = async () => {
    setRunning(true);
    setLoading(true);
    try {
      const response = await fetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await response.json();
      setResult(data.result);
    } catch (error) {
      console.error('Backtest failed:', error);
    } finally {
      setRunning(false);
      setLoading(false);
    }
  };

  const handleWalkForward = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/backtest/walk-forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: config.symbol }),
      });
      const data = await response.json();
      setWalkForward(data.result);
    } catch (error) {
      console.error('Walk-forward failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest-${config.symbol}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Backtesting Dashboard</h1>
          <p className="text-muted-foreground">
            Test and validate trading strategies
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRunBacktest}
            disabled={running || loading}
          >
            {running ? (
              <StopCircle className="h-4 w-4 mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {running ? 'Running...' : 'Run Backtest'}
          </Button>
          <Button
            variant="outline"
            onClick={handleWalkForward}
            disabled={loading}
          >
            <Activity className="h-4 w-4 mr-2" />
            Walk-Forward
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={!result}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Strategy Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Symbol</Label>
              <Select
                value={config.symbol}
                onValueChange={(value) => setConfig({ ...config, symbol: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BTCUSDT">BTCUSDT</SelectItem>
                  <SelectItem value="ETHUSDT">ETHUSDT</SelectItem>
                  <SelectItem value="SOLUSDT">SOLUSDT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={config.startDate}
                onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
              />
            </div>

            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={config.endDate}
                onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
              />
            </div>

            <div>
              <Label>Initial Capital ($)</Label>
              <Input
                type="number"
                value={config.initialCapital}
                onChange={(e) => setConfig({ ...config, initialCapital: parseFloat(e.target.value) })}
              />
            </div>

            <div>
              <Label>Commission (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={config.commission}
                onChange={(e) => setConfig({ ...config, commission: parseFloat(e.target.value) })}
              />
            </div>

            <div>
              <Label>Slippage (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={config.slippage}
                onChange={(e) => setConfig({ ...config, slippage: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="results" className="space-y-4">
        <TabsList>
          <TabsTrigger value="results">
            <BarChart3 className="h-4 w-4 mr-2" />
            Results
          </TabsTrigger>
          <TabsTrigger value="equity">
            <TrendingUp className="h-4 w-4 mr-2" />
            Equity Curve
          </TabsTrigger>
          <TabsTrigger value="trades">
            <Activity className="h-4 w-4 mr-2" />
            Trades
          </TabsTrigger>
          <TabsTrigger value="walkforward">
            <Target className="h-4 w-4 mr-2" />
            Walk-Forward
          </TabsTrigger>
        </TabsList>

        {/* Results Tab */}
        <TabsContent value="results" className="space-y-4">
          {!result ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Run a backtest to see results</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Return
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={cn(
                    'text-2xl font-bold',
                    result.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'
                  )}>
                    {result.totalReturn >= 0 ? '+' : ''}{(result.totalReturn * 100).toFixed(2)}%
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Sharpe Ratio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={cn(
                    'text-2xl font-bold',
                    result.sharpeRatio >= 1 ? 'text-green-500' : 'text-yellow-500'
                  )}>
                    {result.sharpeRatio.toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Max Drawdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={cn(
                    'text-2xl font-bold',
                    result.maxDrawdown < 0.2 ? 'text-green-500' : 'text-red-500'
                  )}>
                    {(result.maxDrawdown * 100).toFixed(2)}%
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Win Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={cn(
                    'text-2xl font-bold',
                    result.winRate >= 0.55 ? 'text-green-500' : 'text-yellow-500'
                  )}>
                    {(result.winRate * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {result.winningTrades}W / {result.losingTrades}L
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Profit Factor
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={cn(
                    'text-2xl font-bold',
                    result.profitFactor >= 1.5 ? 'text-green-500' : 'text-yellow-500'
                  )}>
                    {result.profitFactor.toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Trades
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{result.totalTrades}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Avg Win
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-500">
                    ${result.avgWin.toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Avg Loss
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-500">
                    ${Math.abs(result.avgLoss).toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Equity Curve Tab */}
        <TabsContent value="equity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Equity Curve</CardTitle>
            </CardHeader>
            <CardContent>
              {!result?.equityCurve ? (
                <p className="text-muted-foreground text-center py-12">
                  Run a backtest to see equity curve
                </p>
              ) : (
                <div className="h-96 flex items-end gap-1">
                  {result.equityCurve.map((point, index) => {
                    const minEquity = Math.min(...result.equityCurve.map(e => e.equity));
                    const maxEquity = Math.max(...result.equityCurve.map(e => e.equity));
                    const height = ((point.equity - minEquity) / (maxEquity - minEquity)) * 100;
                    return (
                      <div
                        key={index}
                        className="flex-1 bg-blue-500 rounded-t"
                        style={{ height: `${height}%` }}
                        title={`${point.date}: $${point.equity.toFixed(2)}`}
                      />
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trades Tab */}
        <TabsContent value="trades" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trade History</CardTitle>
            </CardHeader>
            <CardContent>
              {!result?.trades || result.trades.length === 0 ? (
                <p className="text-muted-foreground text-center py-12">
                  No trades executed
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {result.trades.map((trade, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant={trade.side === 'BUY' ? 'default' : 'destructive'}>
                          {trade.side}
                        </Badge>
                        <span className="font-medium">{trade.symbol}</span>
                        <span className="text-sm text-muted-foreground">
                          {trade.quantity} @ ${trade.entryPrice.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className={cn(
                          'font-medium',
                          trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'
                        )}>
                          {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(trade.date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Walk-Forward Tab */}
        <TabsContent value="walkforward" className="space-y-4">
          {!walkForward ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Run walk-forward analysis to validate strategy robustness</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Walk-Forward Analysis
                    <Badge
                      variant={
                        walkForward.recommendation === 'APPROVED' ? 'default' :
                        walkForward.recommendation === 'CAUTION' ? 'secondary' : 'destructive'
                      }
                    >
                      {walkForward.recommendation}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Stability Score</div>
                      <div className={cn(
                        'text-2xl font-bold',
                        walkForward.stabilityScore >= 0.7 ? 'text-green-500' :
                        walkForward.stabilityScore >= 0.5 ? 'text-yellow-500' : 'text-red-500'
                      )}>
                        {(walkForward.stabilityScore * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Avg Degradation</div>
                      <div className={cn(
                        'text-2xl font-bold',
                        walkForward.avgDegradation < 0.3 ? 'text-green-500' :
                        walkForward.avgDegradation < 0.5 ? 'text-yellow-500' : 'text-red-500'
                      )}>
                        {(walkForward.avgDegradation * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Windows Passed</div>
                      <div className="text-2xl font-bold">
                        {walkForward.windows.filter(w => w.passed).length} / {walkForward.windows.length}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Window Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {walkForward.windows.map((window) => (
                      <div
                        key={window.windowId}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium">Window {window.windowId}</span>
                          {window.passed ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">In-Sample</div>
                            <div className={cn(
                              'font-medium',
                              window.inSampleReturn >= 0 ? 'text-green-500' : 'text-red-500'
                            )}>
                              {(window.inSampleReturn * 100).toFixed(1)}%
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">Out-of-Sample</div>
                            <div className={cn(
                              'font-medium',
                              window.outOfSampleReturn >= 0 ? 'text-green-500' : 'text-red-500'
                            )}>
                              {(window.outOfSampleReturn * 100).toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
