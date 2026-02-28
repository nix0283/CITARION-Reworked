'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar
} from 'recharts';
import { 
  Activity, Server, Database, Zap, AlertTriangle, CheckCircle,
  RefreshCw, TrendingUp, Clock, HardDrive, Cpu
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SystemHealth {
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  uptime: number;
  lastCheck: string;
}

interface APIMetrics {
  endpoint: string;
  avgResponseTime: number;
  requestsPerMinute: number;
  errorRate: number;
  successRate: number;
}

interface ResourceUsage {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
}

export default function MonitoringPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [apiMetrics, setApiMetrics] = useState<APIMetrics[]>([]);
  const [resources, setResources] = useState<ResourceUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000); // 5s
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const [healthRes, metricsRes, resourcesRes] = await Promise.all([
        fetch('/api/monitoring/health'),
        fetch('/api/monitoring/metrics'),
        fetch('/api/metrics'),
      ]);

      const healthData = await healthRes.json();
      const metricsData = await metricsRes.json();
      const resourcesData = await resourcesRes.json();

      if (healthData.success) setHealth(healthData.data);
      if (metricsData.success) setApiMetrics(metricsData.data);
      if (resourcesData.success) setResources(resourcesData.data);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'HEALTHY': return 'bg-green-500';
      case 'WARNING': return 'bg-yellow-500';
      case 'CRITICAL': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getUptimeFormatted = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const responseTimeData = apiMetrics.map(m => ({
    endpoint: m.endpoint.replace('/api/', ''),
    time: m.avgResponseTime,
  }));

  const requestRateData = apiMetrics.map(m => ({
    endpoint: m.endpoint.replace('/api/', ''),
    requests: m.requestsPerMinute,
  }));

  const resourceData = resources ? [
    { name: 'CPU', value: resources.cpu, color: '#8884d8' },
    { name: 'Memory', value: resources.memory, color: '#82ca9d' },
    { name: 'Disk', value: resources.disk, color: '#ffc658' },
    { name: 'Network', value: resources.network, color: '#ff8042' },
  ] : [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="w-8 h-8" />
            System Monitoring
          </h1>
          <p className="text-muted-foreground">
            Real-time system health and performance metrics
          </p>
        </div>
        <Button onClick={fetchMetrics} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* System Status */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            {health?.status === 'HEALTHY' ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : health?.status === 'WARNING' ? (
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${health ? getStatusColor(health.status) : 'bg-gray-300'}`} />
              <span className="text-2xl font-bold">{health?.status || 'Unknown'}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Last check: {health?.lastCheck ? new Date(health.lastCheck).toLocaleTimeString() : 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getUptimeFormatted(health?.uptime || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Since last restart
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Endpoints</CardTitle>
            <Server className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{apiMetrics.length}</div>
            <p className="text-xs text-muted-foreground">
              Active endpoints
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Success Rate</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {apiMetrics.length > 0 
                ? (apiMetrics.reduce((sum, m) => sum + m.successRate, 0) / apiMetrics.length).toFixed(1)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Across all endpoints
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Resource Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="w-5 h-5" />
              Resource Usage
            </CardTitle>
            <CardDescription>Current system resource utilization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {resources ? (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>CPU Usage</span>
                    <span className="font-medium">{resources.cpu.toFixed(1)}%</span>
                  </div>
                  <Progress value={resources.cpu} className={resources.cpu > 80 ? 'bg-red-200' : ''} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Memory Usage</span>
                    <span className="font-medium">{resources.memory.toFixed(1)}%</span>
                  </div>
                  <Progress value={resources.memory} className={resources.memory > 80 ? 'bg-red-200' : ''} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Disk Usage</span>
                    <span className="font-medium">{resources.disk.toFixed(1)}%</span>
                  </div>
                  <Progress value={resources.disk} className={resources.disk > 80 ? 'bg-red-200' : ''} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Network I/O</span>
                    <span className="font-medium">{resources.network.toFixed(1)}%</span>
                  </div>
                  <Progress value={resources.network} />
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Loading resource metrics...
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Response Times */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              API Response Times
            </CardTitle>
            <CardDescription>Average response time by endpoint (ms)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={responseTimeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="endpoint" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="time" fill="#8884d8" name="Response Time (ms)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="endpoints" className="space-y-4">
        <TabsList>
          <TabsTrigger value="endpoints">API Endpoints</TabsTrigger>
          <TabsTrigger value="requests">Request Rate</TabsTrigger>
          <TabsTrigger value="errors">Error Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="endpoints" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Endpoint Performance</CardTitle>
              <CardDescription>Detailed metrics for each API endpoint</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {apiMetrics.map((metric) => (
                  <div key={metric.endpoint} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold">{metric.endpoint}</h3>
                        <p className="text-sm text-muted-foreground">
                          {metric.requestsPerMinute} req/min
                        </p>
                      </div>
                      <Badge variant={metric.successRate >= 99 ? 'default' : 'destructive'}>
                        {metric.successRate.toFixed(1)}% success
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Avg Response:</span>
                        <p className="font-medium">{metric.avgResponseTime.toFixed(0)}ms</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Error Rate:</span>
                        <p className="font-medium">{metric.errorRate.toFixed(2)}%</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Requests:</span>
                        <p className="font-medium">{metric.requestsPerMinute}/min</p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span>Health</span>
                        <span>{metric.successRate >= 99 ? 'Excellent' : metric.successRate >= 95 ? 'Good' : 'Poor'}</span>
                      </div>
                      <Progress value={metric.successRate} className={metric.successRate < 95 ? 'bg-red-200' : ''} />
                    </div>
                  </div>
                ))}

                {apiMetrics.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No API metrics available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Request Rate by Endpoint</CardTitle>
              <CardDescription>Requests per minute across endpoints</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={requestRateData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="endpoint" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="requests" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Error Analysis</CardTitle>
              <CardDescription>Endpoints with highest error rates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {apiMetrics
                  .filter(m => m.errorRate > 0)
                  .sort((a, b) => b.errorRate - a.errorRate)
                  .map((metric) => (
                    <div key={metric.endpoint} className="flex items-center justify-between border rounded-lg p-4">
                      <div>
                        <h3 className="font-semibold">{metric.endpoint}</h3>
                        <p className="text-sm text-muted-foreground">
                          {metric.requestsPerMinute} req/min
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-red-500">{metric.errorRate.toFixed(2)}%</p>
                        <p className="text-xs text-muted-foreground">error rate</p>
                      </div>
                    </div>
                  ))}

                {apiMetrics.filter(m => m.errorRate > 0).length === 0 && (
                  <div className="text-center py-8 text-green-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-2" />
                    <p className="font-semibold">No Errors Detected</p>
                    <p className="text-sm text-muted-foreground">All endpoints operating normally</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
