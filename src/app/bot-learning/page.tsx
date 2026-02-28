'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import { 
  Brain, TrendingUp, Activity, CheckCircle, AlertCircle, 
  Play, Pause, RotateCcw, Settings, RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BotLearningState {
  botId: string;
  botType: string;
  currentPhase: string;
  phaseProgress: number;
  status: string;
  fitnessScore: number;
  generation: number;
  backtestMetrics: any;
  testnetMetrics: any;
  demoMetrics: any;
  liveMetrics: any;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function BotLearningPage() {
  const [bots, setBots] = useState<BotLearningState[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchBotLearningData();
    const interval = setInterval(fetchBotLearningData, 30000); // 30s
    return () => clearInterval(interval);
  }, []);

  const fetchBotLearningData = async () => {
    try {
      const response = await fetch('/api/bot-learning');
      const data = await response.json();
      if (data.success) {
        setBots(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch bot learning data:', error);
    } finally {
      setLoading(false);
    }
  };

  const startLearning = async (botId: string) => {
    try {
      const response = await fetch('/api/bot-learning/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId }),
      });
      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Learning Started',
          description: `Bot ${botId} learning started`,
        });
        fetchBotLearningData();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start learning',
        variant: 'destructive',
      });
    }
  };

  const pauseLearning = async (botId: string) => {
    try {
      const response = await fetch('/api/bot-learning', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, action: 'pause' }),
      });
      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Learning Paused',
          description: `Bot ${botId} learning paused`,
        });
        fetchBotLearningData();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to pause learning',
        variant: 'destructive',
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'LEARNING': return 'bg-green-500';
      case 'OPTIMIZING': return 'bg-blue-500';
      case 'READY': return 'bg-emerald-500';
      case 'DEGRADED': return 'bg-red-500';
      case 'PAUSED': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getPhaseIcon = (phase: string) => {
    switch (phase) {
      case 'BACKTEST': return '📊';
      case 'TESTNET': return '🧪';
      case 'DEMO': return '📝';
      case 'LIVE': return '🚀';
      default: return '⏳';
    }
  };

  const fitnessData = bots.map(bot => ({
    name: bot.botType,
    fitness: bot.fitnessScore,
    generation: bot.generation,
  }));

  const phaseData = bots.reduce((acc, bot) => {
    acc[bot.currentPhase] = (acc[bot.currentPhase] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const phaseChartData = Object.entries(phaseData).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="w-8 h-8" />
            Bot Learning Dashboard
          </h1>
          <p className="text-muted-foreground">
            Monitor and manage bot self-learning progress
          </p>
        </div>
        <Button onClick={fetchBotLearningData} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Bots</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bots.filter(b => b.status === 'LEARNING').length}</div>
            <p className="text-xs text-muted-foreground">
              {bots.length} total bots
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Fitness</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {bots.length > 0 
                ? (bots.reduce((sum, b) => sum + b.fitnessScore, 0) / bots.length * 100).toFixed(1)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Average score
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready Bots</CardTitle>
            <CheckCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bots.filter(b => b.status === 'READY').length}</div>
            <p className="text-xs text-muted-foreground">
              Production ready
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Issues</CardTitle>
            <AlertCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bots.filter(b => b.status === 'DEGRADED').length}</div>
            <p className="text-xs text-muted-foreground">
              Need attention
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bots">Bot Details</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Fitness Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Fitness Scores by Bot Type</CardTitle>
              <CardDescription>Current fitness scores across all bots</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={fitnessData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 1]} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="fitness" fill="#8884d8" name="Fitness Score" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Bot List */}
          <Card>
            <CardHeader>
              <CardTitle>All Bots</CardTitle>
              <CardDescription>Learning progress for each bot</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {bots.map((bot) => (
                  <div key={bot.botId} className="border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(bot.status)}`} />
                        <div>
                          <h3 className="font-semibold">{bot.botType} Bot</h3>
                          <p className="text-sm text-muted-foreground">ID: {bot.botId}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {bot.status === 'LEARNING' || bot.status === 'OPTIMIZING' ? (
                          <Button size="sm" variant="outline" onClick={() => pauseLearning(bot.botId)}>
                            <Pause className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => startLearning(bot.botId)}>
                            <Play className="w-4 h-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline">
                          <Settings className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Current Phase</p>
                        <p className="font-medium">
                          {getPhaseIcon(bot.currentPhase)} {bot.currentPhase}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Progress</p>
                        <Progress value={bot.phaseProgress} className="mt-1" />
                        <p className="text-xs text-muted-foreground mt-1">
                          {bot.phaseProgress.toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Fitness Score</p>
                        <p className="font-semibold">{(bot.fitnessScore * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Generation</p>
                        <p className="font-semibold">{bot.generation}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Status</p>
                        <Badge variant={bot.status === 'READY' ? 'default' : 'secondary'}>
                          {bot.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}

                {bots.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No bots configured. Start by creating a bot.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bots" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Phase Distribution</CardTitle>
              <CardDescription>Current distribution across learning phases</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={phaseChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {phaseChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Learning Analytics</CardTitle>
              <CardDescription>Detailed performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="font-semibold">Phase Success Rates</h3>
                  <div className="space-y-2">
                    {['BACKTEST', 'TESTNET', 'DEMO', 'LIVE'].map((phase) => {
                      const count = bots.filter(b => b.currentPhase === phase).length;
                      const ready = bots.filter(b => b.currentPhase === phase && b.status === 'READY').length;
                      const rate = count > 0 ? (ready / count * 100) : 0;
                      return (
                        <div key={phase} className="flex justify-between items-center">
                          <span className="text-sm">{phase}</span>
                          <div className="flex items-center gap-2">
                            <Progress value={rate} className="w-32" />
                            <span className="text-sm font-medium w-12 text-right">
                              {rate.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold">Quick Stats</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Total Generations</span>
                      <span className="font-medium">
                        {bots.reduce((sum, b) => sum + b.generation, 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Best Fitness</span>
                      <span className="font-medium">
                        {(Math.max(...bots.map(b => b.fitnessScore), 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Avg Progress</span>
                      <span className="font-medium">
                        {bots.length > 0 
                          ? (bots.reduce((sum, b) => sum + b.phaseProgress, 0) / bots.length).toFixed(1)
                          : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
