/**
 * Analytics Dashboard Page
 * 
 * Comprehensive analytics and performance metrics:
 * - Performance overview
 * - Trade analysis
 * - Pattern recognition
 * - Risk metrics
 * - Recommendations
 * 
 * @page /analytics
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  DollarSign, 
  PieChart, 
  AlertTriangle,
  RefreshCw,
  Download,
  BarChart3,
  Target,
  Shield,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ==================== TYPES ====================

interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  bestSymbol: string;
  worstSymbol: string;
}

interface Recommendation {
  id: string;
  type: 'INFO' | 'WARNING' | 'SUCCESS';
  message: string;
  priority: number;
}

interface Pattern {
  name: string;
  winRate: number;
  occurrenceCount: number;
  profitable: boolean;
}

// ==================== ANALYTICS DASHBOARD PAGE ====================

export default function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState('ALL');

  useEffect(() => {
    loadAnalytics();
  }, [selectedSymbol]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Fetch performance metrics
      const metricsResponse = await fetch(`/api/analytics/performance?symbol=${selectedSymbol}`);
      const metricsData = await metricsResponse.json();
      setMetrics(metricsData.metrics);

      // Fetch recommendations
      const recResponse = await fetch('/api/analytics/recommendations');
      const recData = await recResponse.json();
      setRecommendations(recData.recommendations);

      // Fetch patterns
      const patternsResponse = await fetch('/api/analytics/patterns');
      const patternsData = await patternsResponse.json();
      setPatterns(patternsData.patterns);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    // Export analytics data
    const data = {
      metrics,
      recommendations,
      patterns,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Performance metrics, patterns, and recommendations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadAnalytics}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Symbol Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Symbol:</span>
        <select
          value={selectedSymbol}
          onChange={(e) => setSelectedSymbol(e.target.value)}
          className="px-3 py-1 border rounded-md text-sm"
        >
          <option value="ALL">All Symbols</option>
          <option value="BTCUSDT">BTCUSDT</option>
          <option value="ETHUSDT">ETHUSDT</option>
          <option value="SOLUSDT">SOLUSDT</option>
        </select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">
            <Activity className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="performance">
            <BarChart3 className="h-4 w-4 mr-2" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="patterns">
            <Target className="h-4 w-4 mr-2" />
            Patterns
          </TabsTrigger>
          <TabsTrigger value="risk">
            <Shield className="h-4 w-4 mr-2" />
            Risk
          </TabsTrigger>
          <TabsTrigger value="recommendations">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Recommendations
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total PnL */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  Total PnL
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn(
                  'text-2xl font-bold',
                  metrics && metrics.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'
                )}>
                  {metrics ? `${metrics.totalPnl >= 0 ? '+' : ''}$${metrics.totalPnl.toFixed(2)}` : '-'}
                </div>
              </CardContent>
            </Card>

            {/* Win Rate */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Target className="h-4 w-4" />
                  Win Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics ? `${(metrics.winRate * 100).toFixed(1)}%` : '-'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {metrics ? `${metrics.winningTrades}W / ${metrics.losingTrades}L` : '-'}
                </div>
              </CardContent>
            </Card>

            {/* Profit Factor */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  Profit Factor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn(
                  'text-2xl font-bold',
                  metrics && metrics.profitFactor >= 1.5 ? 'text-green-500' : 'text-yellow-500'
                )}>
                  {metrics ? metrics.profitFactor.toFixed(2) : '-'}
                </div>
              </CardContent>
            </Card>

            {/* Sharpe Ratio */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  Sharpe Ratio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn(
                  'text-2xl font-bold',
                  metrics && metrics.sharpeRatio >= 1 ? 'text-green-500' : 'text-yellow-500'
                )}>
                  {metrics ? metrics.sharpeRatio.toFixed(2) : '-'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Best Symbol</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-semibold text-green-500">
                  {metrics?.bestSymbol || '-'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Worst Symbol</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-semibold text-red-500">
                  {metrics?.worstSymbol || '-'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Max Drawdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn(
                  'text-lg font-semibold',
                  metrics && metrics.maxDrawdown < 0.2 ? 'text-green-500' : 'text-red-500'
                )}>
                  {metrics ? `${(metrics.maxDrawdown * 100).toFixed(1)}%` : '-'}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Total Trades</div>
                    <div className="text-2xl font-bold">{metrics?.totalTrades || 0}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Avg Win</div>
                    <div className="text-2xl font-bold text-green-500">
                      ${metrics?.avgWin.toFixed(2) || '0.00'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Avg Loss</div>
                    <div className="text-2xl font-bold text-red-500">
                      ${Math.abs(metrics?.avgLoss || 0).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Win/Loss Ratio</div>
                    <div className="text-2xl font-bold">
                      {metrics && metrics.avgLoss !== 0 
                        ? (Math.abs(metrics.avgWin / metrics.avgLoss)).toFixed(2)
                        : '0.00'
                      }
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Patterns Tab */}
        <TabsContent value="patterns" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recognized Patterns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {patterns.length === 0 ? (
                  <p className="text-muted-foreground">No patterns recognized yet</p>
                ) : (
                  patterns.map((pattern, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <div className="font-medium">{pattern.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {pattern.occurrenceCount} occurrences
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge
                          variant={pattern.profitable ? 'default' : 'destructive'}
                          className={cn(
                            pattern.profitable && 'bg-green-500/10 text-green-500 border-green-500/20'
                          )}
                        >
                          {(pattern.winRate * 100).toFixed(1)}% Win Rate
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Risk Tab */}
        <TabsContent value="risk" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Risk Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Max Drawdown</div>
                  <div className={cn(
                    'text-2xl font-bold',
                    metrics && metrics.maxDrawdown < 0.2 ? 'text-green-500' : 'text-red-500'
                  )}>
                    {metrics ? `${(metrics.maxDrawdown * 100).toFixed(1)}%` : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Sharpe Ratio</div>
                  <div className={cn(
                    'text-2xl font-bold',
                    metrics && metrics.sharpeRatio >= 1 ? 'text-green-500' : 'text-yellow-500'
                  )}>
                    {metrics ? metrics.sharpeRatio.toFixed(2) : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Profit Factor</div>
                  <div className={cn(
                    'text-2xl font-bold',
                    metrics && metrics.profitFactor >= 1.5 ? 'text-green-500' : 'text-yellow-500'
                  )}>
                    {metrics ? metrics.profitFactor.toFixed(2) : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Trades</div>
                  <div className="text-2xl font-bold">{metrics?.totalTrades || 0}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recommendations.length === 0 ? (
                  <p className="text-muted-foreground">No recommendations at this time</p>
                ) : (
                  recommendations.map((rec) => (
                    <div
                      key={rec.id}
                      className={cn(
                        'p-3 border rounded-lg flex items-start gap-3',
                        rec.type === 'SUCCESS' && 'border-green-500/20 bg-green-500/5',
                        rec.type === 'WARNING' && 'border-yellow-500/20 bg-yellow-500/5',
                        rec.type === 'INFO' && 'border-blue-500/20 bg-blue-500/5'
                      )}
                    >
                      {rec.type === 'SUCCESS' && (
                        <TrendingUp className="h-5 w-5 text-green-500 mt-0.5" />
                      )}
                      {rec.type === 'WARNING' && (
                        <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                      )}
                      {rec.type === 'INFO' && (
                        <Activity className="h-5 w-5 text-blue-500 mt-0.5" />
                      )}
                      <div>
                        <div className="font-medium">{rec.message}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
