'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { 
  Target, Zap, TrendingUp, Play, StopCircle, Download, Upload,
  Settings, RefreshCw, CheckCircle, AlertTriangle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface OptimizationJob {
  id: string;
  botType: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'QUEUED';
  progress: number;
  method: 'PSO' | 'GA' | 'HYBRID';
  generation: number;
  bestFitness: number;
  parameters: Record<string, number>;
  startTime: string;
  endTime?: string;
}

export default function OptimizationPage() {
  const [jobs, setJobs] = useState<OptimizationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState({
    botType: 'GRID',
    method: 'PSO',
    populationSize: 30,
    generations: 50,
    backtestDays: 90,
    fitnessFunction: 'SHARPE',
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/optimization');
      const data = await response.json();
      if (data.success) {
        setJobs(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch optimization jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const startOptimization = async () => {
    try {
      const response = await fetch('/api/optimization/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Optimization Started',
          description: `Started ${config.method} optimization for ${config.botType}`,
        });
        fetchJobs();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start optimization',
        variant: 'destructive',
      });
    }
  };

  const stopOptimization = async (jobId: string) => {
    try {
      const response = await fetch('/api/optimization/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Optimization Stopped',
          description: `Job ${jobId} stopped`,
        });
        fetchJobs();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to stop optimization',
        variant: 'destructive',
      });
    }
  };

  const deployStrategy = async (jobId: string) => {
    try {
      const response = await fetch('/api/optimization/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Strategy Deployed',
          description: 'Best parameters deployed to bot',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to deploy strategy',
        variant: 'destructive',
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING': return 'bg-green-500';
      case 'COMPLETED': return 'bg-blue-500';
      case 'FAILED': return 'bg-red-500';
      case 'QUEUED': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const fitnessHistoryData = jobs
    .filter(j => j.status === 'RUNNING' || j.status === 'COMPLETED')
    .map(j => ({
      generation: j.generation,
      fitness: j.bestFitness,
      botType: j.botType,
    }));

  const parameterData = jobs
    .filter(j => j.status === 'COMPLETED')
    .slice(-1)
    .map(j => Object.entries(j.parameters).map(([name, value]) => ({
      parameter: name,
      value,
      fullMark: 100,
    })))
    .flat();

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Target className="w-8 h-8" />
            Strategy Optimization
          </h1>
          <p className="text-muted-foreground">
            Optimize bot parameters using evolutionary algorithms
          </p>
        </div>
        <Button onClick={fetchJobs} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Configuration Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Optimization Config
            </CardTitle>
            <CardDescription>Configure optimization parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Bot Type</Label>
              <Select value={config.botType} onValueChange={(v) => setConfig({...config, botType: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GRID">GRID Bot</SelectItem>
                  <SelectItem value="DCA">DCA Bot</SelectItem>
                  <SelectItem value="BB">BB Bot</SelectItem>
                  <SelectItem value="ARGUS">ARGUS Bot</SelectItem>
                  <SelectItem value="VISION">VISION Bot</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Optimization Method</Label>
              <Select value={config.method} onValueChange={(v) => setConfig({...config, method: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PSO">PSO (Fast)</SelectItem>
                  <SelectItem value="GA">Genetic Algorithm</SelectItem>
                  <SelectItem value="HYBRID">Hybrid (PSO+GA)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Population Size: {config.populationSize}</Label>
              <Slider
                value={[config.populationSize]}
                onValueChange={(v) => setConfig({...config, populationSize: v[0]})}
                min={10}
                max={100}
                step={5}
              />
            </div>

            <div className="space-y-2">
              <Label>Generations: {config.generations}</Label>
              <Slider
                value={[config.generations]}
                onValueChange={(v) => setConfig({...config, generations: v[0]})}
                min={10}
                max={200}
                step={10}
              />
            </div>

            <div className="space-y-2">
              <Label>Backtest Days: {config.backtestDays}</Label>
              <Slider
                value={[config.backtestDays]}
                onValueChange={(v) => setConfig({...config, backtestDays: v[0]})}
                min={30}
                max={365}
                step={30}
              />
            </div>

            <div className="space-y-2">
              <Label>Fitness Function</Label>
              <Select value={config.fitnessFunction} onValueChange={(v) => setConfig({...config, fitnessFunction: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SHARPE">Sharpe Ratio</SelectItem>
                  <SelectItem value="SORTINO">Sortino Ratio</SelectItem>
                  <SelectItem value="PROFIT">Total Profit</SelectItem>
                  <SelectItem value="CUSTOM">Custom (Profit+Sharpe)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={startOptimization} className="w-full">
              <Play className="w-4 h-4 mr-2" />
              Start Optimization
            </Button>
          </CardContent>
        </Card>

        {/* Active Jobs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Active Jobs
            </CardTitle>
            <CardDescription>Current and recent optimization jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {jobs.map((job) => (
                <div key={job.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(job.status)}`} />
                      <div>
                        <h3 className="font-semibold">{job.botType} - {job.method}</h3>
                        <p className="text-sm text-muted-foreground">ID: {job.id}</p>
                      </div>
                    </div>
                    <Badge>{job.status}</Badge>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Progress</span>
                      <span>{job.progress.toFixed(1)}%</span>
                    </div>
                    <Progress value={job.progress} />
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Generation:</span>
                      <span className="ml-2 font-medium">{job.generation}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Best Fitness:</span>
                      <span className="ml-2 font-medium">{(job.bestFitness * 100).toFixed(1)}%</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {job.status === 'RUNNING' && (
                      <Button size="sm" variant="destructive" onClick={() => stopOptimization(job.id)}>
                        <StopCircle className="w-4 h-4" />
                      </Button>
                    )}
                    {job.status === 'COMPLETED' && (
                      <Button size="sm" onClick={() => deployStrategy(job.id)}>
                        <Download className="w-4 h-4" />
                        Deploy
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {jobs.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No optimization jobs. Start a new optimization.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="history" className="space-y-4">
        <TabsList>
          <TabsTrigger value="history">Fitness History</TabsTrigger>
          <TabsTrigger value="parameters">Best Parameters</TabsTrigger>
          <TabsTrigger value="comparison">Method Comparison</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fitness Over Generations</CardTitle>
              <CardDescription>Best fitness score across generations</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={fitnessHistoryData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="generation" />
                  <YAxis domain={[0, 1]} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="fitness" stroke="#8884d8" name="Best Fitness" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parameters" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Optimized Parameters</CardTitle>
              <CardDescription>Best parameters from last completed optimization</CardDescription>
            </CardHeader>
            <CardContent>
              {parameterData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={parameterData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="parameter" />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} />
                    <Radar name="Value" dataKey="value" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No completed optimizations yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparison" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Method Performance</CardTitle>
              <CardDescription>Comparison of optimization methods</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { name: 'PSO', speed: 'Fast', quality: 'Good', best: 'Continuous params' },
                  { name: 'GA', speed: 'Medium', quality: 'Very Good', best: 'Complex strategies' },
                  { name: 'HYBRID', speed: 'Slow', quality: 'Excellent', best: 'Best of both' },
                ].map((method) => (
                  <Card key={method.name}>
                    <CardHeader>
                      <CardTitle className="text-lg">{method.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Speed:</span>
                        <Badge variant="outline">{method.speed}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Quality:</span>
                        <Badge variant="outline">{method.quality}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Best for: {method.best}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
