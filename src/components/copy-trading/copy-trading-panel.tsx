/**
 * Copy Trading Panel Component
 * 
 * UI for browsing and following master traders
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface MasterTrader {
  id: string;
  displayName: string;
  description?: string;
  avatar?: string;
  isVerified: boolean;
  stats: {
    totalFollowers: number;
    totalAUM: number;
    totalProfit: number;
    winRate: number;
    totalTrades: number;
    roi30d: number;
    roi90d: number;
    maxDrawdown: number;
    sharpeRatio: number;
  };
  settings: {
    profitSharePercent: number;
    minFollowAmount: number;
    maxFollowers: number;
  };
  recentTrades: Array<{
    symbol: string;
    direction: string;
    pnl: number;
    pnlPercent: number;
    status: string;
    openedAt: string;
  }>;
}

interface CopyTradingPanelProps {
  userId?: string;
}

export function CopyTradingPanel({ userId }: CopyTradingPanelProps) {
  const [masters, setMasters] = useState<MasterTrader[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMaster, setSelectedMaster] = useState<MasterTrader | null>(null);
  const [followDialogOpen, setFollowDialogOpen] = useState(false);
  const [copyRatio, setCopyRatio] = useState(1.0);
  const [maxFollowAmount, setMaxFollowAmount] = useState(1000);
  
  // Load masters
  useEffect(() => {
    loadMasters();
  }, []);
  
  async function loadMasters() {
    try {
      const response = await fetch('/api/copy-trading/masters?limit=20&sortBy=roi30d');
      const data = await response.json();
      
      if (data.success) {
        setMasters(data.masters);
      }
    } catch (error) {
      console.error('Failed to load masters:', error);
    } finally {
      setLoading(false);
    }
  }
  
  async function handleFollow() {
    if (!userId || !selectedMaster) return;
    
    try {
      const response = await fetch('/api/copy-trading/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          masterId: selectedMaster.id,
          copyRatio,
          maxFollowAmount,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(`Now following ${selectedMaster.displayName}!`);
        setFollowDialogOpen(false);
        setSelectedMaster(null);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to follow:', error);
      alert('Failed to follow master trader');
    }
  }
  
  function formatPnL(pnl: number) {
    const color = pnl >= 0 ? 'text-green-500' : 'text-red-500';
    const sign = pnl >= 0 ? '+' : '';
    return <span className={color}>{sign}{pnl.toFixed(2)} USDT</span>;
  }
  
  function formatPercent(value: number) {
    const color = value >= 0 ? 'text-green-500' : 'text-red-500';
    const sign = value >= 0 ? '+' : '';
    return <span className={color}>{sign}{value.toFixed(2)}%</span>;
  }
  
  if (loading) {
    return <div className="p-4 text-center">Loading master traders...</div>;
  }
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">🏆 Master Traders</h2>
        <div className="text-sm text-muted-foreground">
          {masters.length} active masters
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {masters.map(master => (
          <Card key={master.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {master.avatar && (
                      <img
                        src={master.avatar}
                        alt={master.displayName}
                        className="w-8 h-8 rounded-full"
                      />
                    )}
                    {master.displayName}
                    {master.isVerified && (
                      <Badge variant="default" className="text-xs">✓</Badge>
                    )}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {master.description || 'Professional trader'}
                  </p>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Followers</div>
                  <div className="font-semibold">{master.stats.totalFollowers}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">AUM</div>
                  <div className="font-semibold">{master.stats.totalAUM.toFixed(0)} USDT</div>
                </div>
                <div>
                  <div className="text-muted-foreground">ROI 30d</div>
                  <div className="font-semibold">{formatPercent(master.stats.roi30d)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Win Rate</div>
                  <div className="font-semibold">{formatPercent(master.stats.winRate)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Total Profit</div>
                  <div className="font-semibold">{formatPnL(master.stats.totalProfit)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Max DD</div>
                  <div className="font-semibold text-red-500">
                    {master.stats.maxDrawdown.toFixed(2)}%
                  </div>
                </div>
              </div>
              
              {/* Settings */}
              <div className="text-xs text-muted-foreground border-t pt-2">
                <div className="flex justify-between">
                  <span>Profit Share:</span>
                  <span>{master.settings.profitSharePercent}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Min Follow:</span>
                  <span>{master.settings.minFollowAmount} USDT</span>
                </div>
              </div>
              
              {/* Recent Trades */}
              {master.recentTrades.length > 0 && (
                <div className="border-t pt-2">
                  <div className="text-xs text-muted-foreground mb-1">Recent Trades</div>
                  <div className="space-y-1">
                    {master.recentTrades.slice(0, 3).map((trade, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span>{trade.symbol} {trade.direction}</span>
                        <span>{formatPnL(trade.pnl)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Follow Button */}
              <Dialog open={followDialogOpen && selectedMaster?.id === master.id} onOpenChange={setFollowDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setSelectedMaster(master);
                      setFollowDialogOpen(true);
                    }}
                  >
                    Follow Trader
                  </Button>
                </DialogTrigger>
                
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Follow {master.displayName}</DialogTitle>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>Copy Ratio (%)</Label>
                      <div className="text-sm text-muted-foreground">
                        How much to copy from each trade
                      </div>
                      <Input
                        type="number"
                        min="0.1"
                        max="1"
                        step="0.1"
                        value={copyRatio}
                        onChange={(e) => setCopyRatio(parseFloat(e.target.value))}
                        className="mt-1"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        {copyRatio * 100}% of each trade will be copied
                      </div>
                    </div>
                    
                    <div>
                      <Label>Maximum Amount (USDT)</Label>
                      <div className="text-sm text-muted-foreground">
                        Maximum total amount to invest
                      </div>
                      <Input
                        type="number"
                        min={master.settings.minFollowAmount}
                        value={maxFollowAmount}
                        onChange={(e) => setMaxFollowAmount(parseFloat(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                    
                    <div className="border-t pt-4 text-sm">
                      <div className="flex justify-between">
                        <span>Profit Share:</span>
                        <span className="font-semibold">{master.settings.profitSharePercent}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Minimum:</span>
                        <span className="font-semibold">{master.settings.minFollowAmount} USDT</span>
                      </div>
                    </div>
                    
                    <Button className="w-full" onClick={handleFollow}>
                      Confirm Follow
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {masters.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No master traders available yet
        </div>
      )}
    </div>
  );
}
