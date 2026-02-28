'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, TrendingUp, TrendingDown, Minus, Newspaper, BarChart3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFinanceClient, type StockQuote, type FinancialMetrics, type MarketNews } from '@/lib/skills/finance-client';

interface FinancePanelProps {
  defaultSymbol?: string;
  onSymbolSelect?: (symbol: string) => void;
}

export function FinancePanel({ defaultSymbol = 'BTCUSDT', onSymbolSelect }: FinancePanelProps) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [timeframe, setTimeframe] = useState('1h');
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [news, setNews] = useState<MarketNews[]>([]);
  const [technical, setTechnical] = useState<any>(null);
  const { toast } = useToast();

  const financeClient = getFinanceClient();

  const fetchAllData = useCallback(async () => {
    if (!symbol) return;
    
    setLoading(true);
    try {
      const [quoteData, metricsData, newsData, techData] = await Promise.all([
        financeClient.getQuote(symbol),
        financeClient.getFinancialMetrics(symbol),
        financeClient.getNews(symbol),
        financeClient.getTechnicalAnalysis(symbol, timeframe),
      ]);
      
      setQuote(quoteData);
      setMetrics(metricsData);
      setNews(newsData);
      setTechnical(techData);
      
      onSymbolSelect?.(symbol);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Ошибка загрузки данных',
        description: error instanceof Error ? error.message : 'Неизвестная ошибка',
      });
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, financeClient, toast, onSymbolSelect]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAllData();
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (change < 0) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-500" />;
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Finance Analytics
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <Input
            placeholder="Symbol (e.g., BTCUSDT, AAPL)"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="flex-1"
          />
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1m">1m</SelectItem>
              <SelectItem value="5m">5m</SelectItem>
              <SelectItem value="15m">15m</SelectItem>
              <SelectItem value="1h">1h</SelectItem>
              <SelectItem value="4h">4h</SelectItem>
              <SelectItem value="1d">1d</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" size="icon" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </form>

        <Tabs defaultValue="quote" className="w-full">
          <TabsList className="grid grid-cols-4">
            <TabsTrigger value="quote">Quote</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="news">News</TabsTrigger>
            <TabsTrigger value="technical">Technical</TabsTrigger>
          </TabsList>

          {/* Quote Tab */}
          <TabsContent value="quote" className="mt-4">
            {quote ? (
              <div className="space-y-4">
                <div className="flex items-baseline gap-4">
                  <span className="text-3xl font-bold">${quote.price.toLocaleString()}</span>
                  <div className={`flex items-center gap-1 ${quote.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {getChangeIcon(quote.change)}
                    <span className="font-medium">{quote.changePercent.toFixed(2)}%</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Volume: </span>
                    <span className="font-medium">{quote.volume?.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Market Cap: </span>
                    <span className="font-medium">{quote.marketCap ? `$${(quote.marketCap / 1e9).toFixed(2)}B` : 'N/A'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                {loading ? 'Loading...' : 'Enter symbol to view quote'}
              </div>
            )}
          </TabsContent>

          {/* Metrics Tab */}
          <TabsContent value="metrics" className="mt-4">
            {metrics ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                {metrics.peRatio && (
                  <div>
                    <span className="text-muted-foreground">P/E Ratio: </span>
                    <span className="font-medium">{metrics.peRatio.toFixed(2)}</span>
                  </div>
                )}
                {metrics.eps && (
                  <div>
                    <span className="text-muted-foreground">EPS: </span>
                    <span className="font-medium">${metrics.eps.toFixed(2)}</span>
                  </div>
                )}
                {metrics.roe && (
                  <div>
                    <span className="text-muted-foreground">ROE: </span>
                    <span className="font-medium">{(metrics.roe * 100).toFixed(1)}%</span>
                  </div>
                )}
                {metrics.debtToEquity && (
                  <div>
                    <span className="text-muted-foreground">D/E: </span>
                    <span className="font-medium">{metrics.debtToEquity.toFixed(2)}</span>
                  </div>
                )}
                {metrics.dividendYield && (
                  <div>
                    <span className="text-muted-foreground">Div Yield: </span>
                    <span className="font-medium">{(metrics.dividendYield * 100).toFixed(2)}%</span>
                  </div>
                )}
                {metrics.beta && (
                  <div>
                    <span className="text-muted-foreground">Beta: </span>
                    <span className="font-medium">{metrics.beta.toFixed(2)}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                {loading ? 'Loading...' : 'No metrics available'}
              </div>
            )}
          </TabsContent>

          {/* News Tab */}
          <TabsContent value="news" className="mt-4">
            {news.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {news.map((item, idx) => (
                  <div key={idx} className="p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-sm line-clamp-2">{item.title}</h4>
                      {item.sentiment && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          item.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                          item.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {item.sentiment}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.summary}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span>{item.source}</span>
                      <span>•</span>
                      <span>{new Date(item.publishedAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8 flex flex-col items-center gap-2">
                <Newspaper className="w-8 h-8 opacity-50" />
                {loading ? 'Loading...' : 'No news available'}
              </div>
            )}
          </TabsContent>

          {/* Technical Tab */}
          <TabsContent value="technical" className="mt-4">
            {technical ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Trend: </span>
                  <span className={`font-medium capitalize ${
                    technical.trend === 'bullish' ? 'text-green-500' :
                    technical.trend === 'bearish' ? 'text-red-500' : 'text-gray-500'
                  }`}>
                    {technical.trend}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">RSI: </span>
                    <span className="font-medium">{technical.rsi?.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">MACD: </span>
                    <span className="font-medium">{technical.macd?.macd?.toFixed(4)}</span>
                  </div>
                </div>
                {technical.support?.length > 0 && (
                  <div>
                    <span className="text-muted-foreground text-sm">Support: </span>
                    <span className="font-medium">{technical.support.map((s: number) => `$${s.toLocaleString()}`).join(', ')}</span>
                  </div>
                )}
                {technical.resistance?.length > 0 && (
                  <div>
                    <span className="text-muted-foreground text-sm">Resistance: </span>
                    <span className="font-medium">{technical.resistance.map((r: number) => `$${r.toLocaleString()}`).join(', ')}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                {loading ? 'Loading...' : 'No technical data available'}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default FinancePanel;
