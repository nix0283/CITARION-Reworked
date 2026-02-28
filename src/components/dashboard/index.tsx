'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  Flag,
  GitBranch,
  RefreshCw,
  Settings,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DashboardOverview {
  summary: {
    featureFlags: { enabled: number; total: number; rolloutProgress: number };
    correlation: {
      totalExposure: number;
      concentrationRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      alertCount: number;
      diversificationScore: number;
    };
    experiments: { registered: number; running: number };
    recalibration: { scheduled: number; lastRun: string | null };
  };
  health: {
    status: 'healthy' | 'degraded' | 'down';
    lastUpdate: string;
    latency: Record<string, string>;
  };
  timestamp: string;
}

interface FeatureFlag {
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  targetSymbols?: string[];
  excludeSymbols?: string[];
  targetUsers?: string[];
  abTestGroup?: 'control' | 'treatment';
  metadata?: Record<string, any>;
}

interface CorrelationMetrics {
  totalExposure: number;
  netExposure: number;
  grossExposure: number;
  leverageRatio: number;
  avgCorrelation: number;
  maxCorrelation: number;
  concentrationRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  diversificationScore: number;
  symbolExposure: Array<{
    symbol: string;
    totalNotional: number;
    concentrationPct: number;
    botCount: number;
  }>;
}

interface Alert {
  type: 'CONCENTRATION' | 'CORRELATION' | 'LEVERAGE';
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  symbol?: string;
  value: number;
  threshold: number;
}

export function Dashboard() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [correlationMetrics, setCorrelationMetrics] = useState<CorrelationMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch overview
      const overviewRes = await fetch('/api/dashboard');
      const overviewData = await overviewRes.json();
      setOverview(overviewData);

      // Fetch feature flags
      const flagsRes = await fetch('/api/dashboard?section=feature-flags');
      const flagsData = await flagsRes.json();
      setFeatureFlags(flagsData.flags || []);

      // Fetch correlation metrics
      const corrRes = await fetch('/api/dashboard?section=correlation');
      const corrData = await corrRes.json();
      setCorrelationMetrics(corrData.metrics);
      setAlerts(corrData.alerts || []);

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to load dashboard',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'bg-green-100 text-green-800';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
      case 'HIGH': return 'bg-orange-100 text-orange-800';
      case 'CRITICAL': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAlertIcon = (severity: string) => {
    return severity === 'CRITICAL' 
      ? <XCircle className="w-4 h-4 text-red-500" />
      : <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  };

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Infrastructure Dashboard</h1>
          <p className="text-muted-foreground">
            Real-time monitoring of feature flags, correlation risk, and experiments
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>Updated: {lastRefresh.toLocaleTimeString()}</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Health Status */}
      {overview?.health && (
        <Card className={overview.health.status === 'healthy' ? 'border-green-200' : 'border-yellow-200'}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {overview.health.status === 'healthy' 
                ? <CheckCircle className="w-5 h-5 text-green-500" />
                : <AlertTriangle className="w-5 h-5 text-yellow-500" />
              }
              <div>
                <span className="font-medium capitalize">{overview.health.status}</span>
                <span className="text-muted-foreground ml-2">
                  Last update: {new Date(overview.health.lastUpdate).toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {overview?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Feature Flags */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Flag className="w-4 h-4" />
                Feature Flags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {overview.summary.featureFlags.enabled}/{overview.summary.featureFlags.total}
              </div>
              <Progress 
                value={overview.summary.featureFlags.rolloutProgress} 
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {overview.summary.featureFlags.rolloutProgress}% rollout progress
              </p>
            </CardContent>
          </Card>

          {/* Correlation Risk */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                Correlation Risk
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge className={getRiskColor(overview.summary.correlation.concentrationRisk)}>
                {overview.summary.correlation.concentrationRisk}
              </Badge>
              <p className="text-xs text-muted-foreground mt-2">
                Diversification: {(overview.summary.correlation.diversificationScore * 100).toFixed(0)}%
              </p>
              {overview.summary.correlation.alertCount > 0 && (
                <p className="text-xs text-red-600 mt-1">
                  ⚠️ {overview.summary.correlation.alertCount} active alerts
                </p>
              )}
            </CardContent>
          </Card>

          {/* Experiments */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                A/B Experiments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {overview.summary.experiments.registered}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {overview.summary.experiments.running} currently running
              </p>
            </CardContent>
          </Card>

          {/* Recalibration */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Auto-Recalibration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {overview.summary.recalibration.scheduled}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                scheduled jobs
              </p>
              {overview.summary.recalibration.lastRun && (
                <p className="text-xs text-muted-foreground">
                  Last run: {new Date(overview.summary.recalibration.lastRun).toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="flags" className="w-full">
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="flags">Feature Flags</TabsTrigger>
          <TabsTrigger value="correlation">Correlation</TabsTrigger>
          <TabsTrigger value="experiments">Experiments</TabsTrigger>
          <TabsTrigger value="recalibration">Recalibration</TabsTrigger>
        </TabsList>

        {/* Feature Flags Tab */}
        <TabsContent value="flags" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flag className="w-5 h-5" />
                Feature Flag Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flag Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rollout %</TableHead>
                      <TableHead>Targeting</TableHead>
                      <TableHead>A/B Group</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {featureFlags.map((flag) => (
                      <TableRow key={flag.name}>
                        <TableCell className="font-medium">{flag.name}</TableCell>
                        <TableCell>
                          <Badge variant={flag.enabled ? 'default' : 'secondary'}>
                            {flag.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={flag.rolloutPercentage} className="w-16" />
                            <span className="text-xs">{flag.rolloutPercentage}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {flag.targetSymbols?.length 
                            ? `Symbols: ${flag.targetSymbols.slice(0, 2).join(', ')}${flag.targetSymbols.length > 2 ? '...' : ''}`
                            : flag.excludeSymbols?.length
                            ? `Excluding: ${flag.excludeSymbols.slice(0, 2).join(', ')}...`
                            : 'All'
                          }
                        </TableCell>
                        <TableCell>
                          {flag.abTestGroup && (
                            <Badge variant="outline" className="text-xs">
                              {flag.abTestGroup}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Correlation Tab */}
        <TabsContent value="correlation" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Portfolio Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {correlationMetrics && (
                  <>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total Exposure: </span>
                        <span className="font-medium">${correlationMetrics.totalExposure.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Net Exposure: </span>
                        <span className={`font-medium ${correlationMetrics.netExposure >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${correlationMetrics.netExposure.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Leverage Ratio: </span>
                        <span className="font-medium">{correlationMetrics.leverageRatio.toFixed(2)}x</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Avg Correlation: </span>
                        <span className="font-medium">{(correlationMetrics.avgCorrelation * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t">
                      <h4 className="font-medium mb-2">Symbol Concentration</h4>
                      <ScrollArea className="h-40">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Symbol</TableHead>
                              <TableHead className="text-right">Concentration</TableHead>
                              <TableHead className="text-right">Bots</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {correlationMetrics.symbolExposure
                              .sort((a, b) => b.concentrationPct - a.concentrationPct)
                              .slice(0, 10)
                              .map((exp) => (
                                <TableRow key={exp.symbol}>
                                  <TableCell className="font-medium">{exp.symbol}</TableCell>
                                  <TableCell className="text-right">
                                    {(exp.concentrationPct * 100).toFixed(1)}%
                                  </TableCell>
                                  <TableCell className="text-right">{exp.botCount}</TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Alerts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Active Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  {alerts.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No active alerts</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {alerts.map((alert, idx) => (
                        <div 
                          key={idx}
                          className={`p-3 border rounded-lg ${
                            alert.severity === 'CRITICAL' ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {getAlertIcon(alert.severity)}
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <Badge variant={alert.severity === 'CRITICAL' ? 'destructive' : 'warning'} className="text-xs">
                                  {alert.severity}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{alert.type}</span>
                              </div>
                              <p className="text-sm mt-1">{alert.message}</p>
                              {alert.symbol && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Symbol: {alert.symbol} | Value: {alert.value.toFixed(2)} | Threshold: {alert.threshold.toFixed(2)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Experiments Tab */}
        <TabsContent value="experiments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                A/B Experiments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-8">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Experiment management coming soon</p>
                <p className="text-xs mt-1">Register experiments via API or admin panel</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recalibration Tab */}
        <TabsContent value="recalibration" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Auto-Recalibration Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-8">
                <RefreshCw className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Recalibration management coming soon</p>
                <p className="text-xs mt-1">Configure schedules via API or admin panel</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Dashboard;
