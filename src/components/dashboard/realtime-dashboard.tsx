/**
 * Real-time Dashboard Component
 * 
 * Live dashboard with WebSocket updates:
 * - Real-time PnL
 * - Active positions
 * - Recent trades
 * - Portfolio value
 * - Market data
 * 
 * @component dashboard/realtime-dashboard
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, Activity, DollarSign, PieChart, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

// ==================== TYPES ====================

interface Position {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  leverage: number;
}

interface Trade {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  pnl?: number;
  status: 'OPEN' | 'CLOSED';
  timestamp: Date;
}

interface DashboardData {
  totalBalance: number;
  totalPnl: number;
  totalPnlPercent: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positions: Position[];
  trades: Trade[];
}

interface WSMessage {
  type: 'POSITION_UPDATE' | 'TRADE_EXECUTED' | 'PRICE_UPDATE' | 'NOTIFICATION' | 'DASHBOARD_DATA';
  payload: any;
  timestamp: Date;
}

// ==================== CONSTANTS ====================

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
const RECONNECT_INTERVAL = 5000; // 5 seconds
const MAX_TRADES_DISPLAY = 20;

// ==================== REALTIME DASHBOARD COMPONENT ====================

export function RealtimeDashboard() {
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState<DashboardData>({
    totalBalance: 0,
    totalPnl: 0,
    totalPnlPercent: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    positions: [],
    trades: [],
  });
  const [stats, setStats] = useState({
    winRate: 0,
    totalTrades: 0,
    avgWin: 0,
    avgLoss: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ==================== WEBSOCKET CONNECTION ====================

  useEffect(() => {
    connectWebSocket();

    return () => {
      disconnectWebSocket();
    };
  }, []);

  const connectWebSocket = () => {
    try {
      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onopen = () => {
        logger('WebSocket connected');
        setConnected(true);

        // Subscribe to channels
        sendMessage({
          type: 'SUBSCRIBE',
          payload: { channel: 'positions' },
        });
        sendMessage({
          type: 'SUBSCRIBE',
          payload: { channel: 'trades' },
        });
        sendMessage({
          type: 'SUBSCRIBE',
          payload: { channel: 'prices' },
        });
      };

      wsRef.current.onmessage = (event: MessageEvent) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onclose = () => {
        logger('WebSocket disconnected');
        setConnected(false);

        // Attempt reconnect
        reconnectTimeoutRef.current = setTimeout(() => {
          logger('Attempting to reconnect...');
          connectWebSocket();
        }, RECONNECT_INTERVAL);
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setConnected(false);
    }
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const sendMessage = (message: WSMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  // ==================== MESSAGE HANDLER ====================

  const handleMessage = (message: WSMessage) => {
    switch (message.type) {
      case 'DASHBOARD_DATA':
        setData(message.payload);
        break;

      case 'POSITION_UPDATE':
        updatePosition(message.payload);
        break;

      case 'TRADE_EXECUTED':
        addTrade(message.payload);
        break;

      case 'PRICE_UPDATE':
        updatePrices(message.payload);
        break;

      case 'NOTIFICATION':
        // Handle notification
        console.log('Notification:', message.payload);
        break;
    }
  };

  const updatePosition = (position: Position) => {
    setData(prev => ({
      ...prev,
      positions: prev.positions.map(p =>
        p.id === position.id ? position : p
      ),
    }));
  };

  const addTrade = (trade: Trade) => {
    setData(prev => ({
      ...prev,
      trades: [trade, ...prev.trades].slice(0, MAX_TRADES_DISPLAY),
    }));
  };

  const updatePrices = (priceUpdates: Array<{ symbol: string; price: number }>) => {
    setData(prev => {
      const updatedPositions = prev.positions.map(position => {
        const priceUpdate = priceUpdates.find(p => p.symbol === position.symbol);
        if (!priceUpdate) return position;

        const currentPrice = priceUpdate.price;
        const priceDiff = position.direction === 'LONG'
          ? currentPrice - position.entryPrice
          : position.entryPrice - currentPrice;

        const unrealizedPnl = priceDiff * position.quantity;
        const unrealizedPnlPercent = (priceDiff / position.entryPrice) * 100;

        return {
          ...position,
          currentPrice,
          unrealizedPnl,
          unrealizedPnlPercent,
        };
      });

      const unrealizedPnl = updatedPositions.reduce(
        (sum, p) => sum + p.unrealizedPnl,
        0
      );

      return {
        ...prev,
        positions: updatedPositions,
        unrealizedPnl,
        totalPnl: prev.realizedPnl + unrealizedPnl,
      };
    });
  };

  // ==================== LOGGER ====================

  const logger = (message: string, data?: any) => {
    console.log(`[Dashboard] ${message}`, data || '');
  };

  // ==================== RENDER ====================

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Connection Status */}
      <Card className="col-span-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5" />
              Real-time Dashboard
            </CardTitle>
            <Badge
              variant={connected ? 'default' : 'destructive'}
              className={cn(
                'text-xs',
                connected ? 'bg-green-500/10 text-green-500 border-green-500/20' : ''
              )}
            >
              {connected ? '● Connected' : '○ Disconnected'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Total Balance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            Total Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            ${data.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </CardContent>
      </Card>

      {/* Total PnL */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {data.totalPnl >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
            Total PnL
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={cn(
            'text-2xl font-bold',
            data.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'
          )}>
            {data.totalPnl >= 0 ? '+' : ''}${data.totalPnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className={cn(
            'text-xs mt-1',
            data.totalPnlPercent >= 0 ? 'text-green-500' : 'text-red-500'
          )}>
            {data.totalPnlPercent >= 0 ? '+' : ''}{data.totalPnlPercent.toFixed(2)}%
          </div>
        </CardContent>
      </Card>

      {/* Realized PnL */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            Realized PnL
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={cn(
            'text-2xl font-bold',
            data.realizedPnl >= 0 ? 'text-green-500' : 'text-red-500'
          )}>
            {data.realizedPnl >= 0 ? '+' : ''}${data.realizedPnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </CardContent>
      </Card>

      {/* Unrealized PnL */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <PieChart className="h-4 w-4" />
            Unrealized PnL
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={cn(
            'text-2xl font-bold',
            data.unrealizedPnl >= 0 ? 'text-green-500' : 'text-red-500'
          )}>
            {data.unrealizedPnl >= 0 ? '+' : ''}${data.unrealizedPnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </CardContent>
      </Card>

      {/* Active Positions */}
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Active Positions ({data.positions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            <div className="space-y-2">
              {data.positions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No active positions
                </p>
              ) : (
                data.positions.map(position => (
                  <div
                    key={position.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          position.direction === 'LONG'
                            ? 'bg-green-500/10 text-green-500 border-green-500/20'
                            : 'bg-red-500/10 text-red-500 border-red-500/20'
                        )}
                      >
                        {position.direction}
                      </Badge>
                      <span className="font-medium text-sm">{position.symbol}</span>
                      <span className="text-xs text-muted-foreground">
                        {position.quantity} @ ${position.entryPrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className={cn(
                        'text-sm font-medium',
                        position.unrealizedPnl >= 0 ? 'text-green-500' : 'text-red-500'
                      )}>
                        {position.unrealizedPnl >= 0 ? '+' : ''}${position.unrealizedPnl.toFixed(2)}
                      </div>
                      <div className={cn(
                        'text-xs',
                        position.unrealizedPnlPercent >= 0 ? 'text-green-500' : 'text-red-500'
                      )}>
                        {position.unrealizedPnlPercent >= 0 ? '+' : ''}{position.unrealizedPnlPercent.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Recent Trades */}
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent Trades ({data.trades.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            <div className="space-y-2">
              {data.trades.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No recent trades
                </p>
              ) : (
                data.trades.map(trade => (
                  <div
                    key={trade.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          trade.direction === 'LONG'
                            ? 'bg-green-500/10 text-green-500 border-green-500/20'
                            : 'bg-red-500/10 text-red-500 border-red-500/20'
                        )}
                      >
                        {trade.direction}
                      </Badge>
                      <span className="font-medium text-sm">{trade.symbol}</span>
                      <span className="text-xs text-muted-foreground">
                        {trade.side} {trade.quantity}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">${trade.price.toLocaleString()}</div>
                      {trade.pnl !== undefined && (
                        <div className={cn(
                          'text-xs',
                          trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'
                        )}>
                          {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export default RealtimeDashboard;
