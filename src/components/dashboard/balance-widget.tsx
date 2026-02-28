"use client";

import { useCryptoStore } from "@/stores/crypto-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Bitcoin,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber, formatPercent } from "@/lib/format";

export function BalanceWidget() {
  const { account, trades, positions, resetDemoBalance } = useCryptoStore();
  const isDemo = account?.accountType === "DEMO";
  const balance = account?.virtualBalance || { USDT: 0, BTC: 0, ETH: 0 };

  // Calculate total PnL from trades
  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const totalPnlPercent =
    trades.length > 0
      ? (totalPnl / (balance.USDT - totalPnl || 10000)) * 100
      : 0;

  // Calculate unrealized PnL from positions
  const unrealizedPnl = positions.reduce(
    (sum, pos) => sum + pos.unrealizedPnl,
    0
  );

  // Calculate total balance including unrealized PnL
  const totalBalance = balance.USDT + unrealizedPnl;

  // Win rate calculation
  const winningTrades = trades.filter((t) => t.pnl > 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-5 w-5 text-primary" />
            Баланс {isDemo && <span className="text-amber-500">[DEMO]</span>}
          </CardTitle>
          {isDemo && (
            <Badge variant="outline" className="demo-badge text-xs">
              Виртуальный счёт
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Balance */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Общий баланс</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">
              ${formatNumber(totalBalance, 2)}
            </span>
            <span className="text-sm text-muted-foreground">USDT</span>
          </div>
        </div>

        {/* PnL Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-secondary/50 p-3">
            <div className="flex items-center gap-1.5">
              {totalPnl >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span className="text-xs text-muted-foreground">Реализованный P&L</span>
            </div>
            <p
              className={cn(
                "mt-1 text-lg font-semibold tabular-nums",
                totalPnl >= 0 ? "text-green-500" : "text-red-500"
              )}
            >
              {totalPnl >= 0 ? "+" : ""}
              {formatNumber(totalPnl, 2)}
              <span className="text-xs ml-1">
                ({formatPercent(totalPnlPercent, 2)})
              </span>
            </p>
          </div>

          <div className="rounded-lg bg-secondary/50 p-3">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Нереализованный P&L</span>
            </div>
            <p
              className={cn(
                "mt-1 text-lg font-semibold tabular-nums",
                unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"
              )}
            >
              {unrealizedPnl >= 0 ? "+" : ""}
              {formatNumber(unrealizedPnl, 2)}
            </p>
          </div>
        </div>

        {/* Asset Breakdown */}
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Активы</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20">
                  <DollarSign className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">USDT</p>
                  <p className="text-xs text-muted-foreground">Tether USD</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium tabular-nums">
                  {formatNumber(balance.USDT, 2)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {totalBalance > 0 ? ((balance.USDT / totalBalance) * 100).toFixed(1) : "0.0"}%
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/20">
                  <Bitcoin className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">BTC</p>
                  <p className="text-xs text-muted-foreground">Bitcoin</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium tabular-nums">
                  {balance.BTC.toFixed(8)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {((balance.BTC / (totalBalance || 1)) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground">Всего сделок</p>
            <p className="text-lg font-semibold">{trades.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold">{winRate.toFixed(1)}%</p>
              <Progress value={winRate} className="h-2 flex-1" />
            </div>
          </div>
        </div>

        {/* Reset Button (Demo only) */}
        {isDemo && (
          <Button
            variant="outline"
            className="w-full mt-2"
            onClick={resetDemoBalance}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Сбросить демо-счёт
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
