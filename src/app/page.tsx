"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { BalanceWidget } from "@/components/dashboard/balance-widget";
import { MarketOverview } from "@/components/dashboard/market-overview";
import { PositionsTable } from "@/components/dashboard/positions-table";
import { TradesHistory } from "@/components/dashboard/trades-history";
import { TradingForm } from "@/components/trading/trading-form";
import { SignalFeed } from "@/components/dashboard/signal-feed";
import { BotConfigForm } from "@/components/bot/bot-config-form";
import { ExchangeSelector } from "@/components/exchanges/exchange-selector";
import { ConnectedAccounts } from "@/components/exchanges/connected-accounts";
import { ChatBot } from "@/components/chat/chat-bot";
import { PnLAnalytics } from "@/components/analytics/pnl-analytics";
import { GridBotManager } from "@/components/bots/grid-bot-manager";
import { DcaBotManager } from "@/components/bots/dca-bot-manager";
import { BBBotManager } from "@/components/bots/bb-bot-manager";
import { ArgusBotManager } from "@/components/bots/argus-bot-manager";
import { VisionBotManager } from "@/components/bots/vision-bot-manager";
import { ActiveGridBots } from "@/components/dashboard/active-grid-bots";
import { ActiveDcaBots } from "@/components/dashboard/active-dca-bots";
import { ActiveBBBots } from "@/components/dashboard/active-bb-bots";
import { ActiveArgusBots } from "@/components/dashboard/active-argus-bots";
import { MarketForecastWidget } from "@/components/dashboard/market-forecast-widget";
import { FundingRateWidget } from "@/components/dashboard/funding-rate-widget";
import { NotificationsPanel } from "@/components/notifications/notifications-panel";
import { TelegramSettings } from "@/components/telegram/telegram-settings";
import { PriceChart } from "@/components/chart/price-chart";
import { CopyTradingPanel } from "@/components/copy-trading/copy-trading-panel";
import { MasterTraderPanel } from "@/components/copy-trading/master-trader-panel";
import { StrategyLab } from "@/components/strategy-lab/strategy-lab";
import { cn } from "@/lib/utils";
import { HelpCircle, Building2 } from "lucide-react";
import { useCryptoStore } from "@/stores/crypto-store";
import { 
  PriceProvider, 
  usePriceContext, 
  ConnectionStatusIndicator,
} from "@/components/providers/price-provider";
import { useRealtimePrice, useAllRealtimePrices } from "@/hooks/use-realtime-prices";



function DashboardContent() {
  const { activeTab, sidebarOpen, account } = useCryptoStore();
  const { connectionStatus, lastUpdated, statuses, connectedCount, exchangeNames } = usePriceContext();
  const isDemo = account?.accountType === "DEMO";

  // Get real-time prices for status display
  const btcPrice = useRealtimePrice("BTCUSDT");
  const prices = useAllRealtimePrices();

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <div className="space-y-6">
            {/* Row 1: Balance, Trading, Positions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-6">
                <BalanceWidget />
                <TradingForm />
              </div>
              <div className="space-y-6">
                <PositionsTable />
                <SignalFeed />
              </div>
              <div className="space-y-6">
                <MarketOverview />
                <MarketForecastWidget />
                <FundingRateWidget />
              </div>
            </div>
            {/* Row 2: Active Bots Widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <ActiveGridBots />
              <ActiveDcaBots />
              <ActiveBBBots />
              <ActiveArgusBots />
            </div>
          </div>
        );

      case "chart":
        return (
          <div className="flex-1 flex flex-col min-h-0 rounded-lg border border-border bg-card overflow-hidden">
            <PriceChart />
          </div>
        );

      case "trading":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <TradingForm />
              <PositionsTable />
            </div>
            <div className="space-y-6">
              <MarketOverview />
              <MarketForecastWidget />
            </div>
          </div>
        );

      case "chat":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChatBot />
            <div className="space-y-6">
              <SignalFeed />
            </div>
          </div>
        );

      case "strategy-lab":
        return <StrategyLab />;

      case "exchanges":
        return (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ExchangeSelector />
              <ConnectedAccounts />
            </div>
            <div className="grid grid-cols-1 gap-6 mt-6">
              <div className="p-6 rounded-lg border border-border bg-card">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Поддерживаемые биржи
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <h4 className="font-medium text-sm mb-2">Spot Биржи</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Binance</li>
                      <li>• Bybit</li>
                      <li>• OKX</li>
                      <li>• Bitget</li>
                      <li>• KuCoin</li>
                      <li>• BingX</li>
                      <li>• Coinbase</li>
                      <li>• Huobi</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm mb-2">Futures Биржи</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Binance</li>
                      <li>• Bybit</li>
                      <li>• OKX</li>
                      <li>• Bitget</li>
                      <li>• KuCoin</li>
                      <li>• BingX</li>
                      <li>• HyperLiquid</li>
                      <li>• BloFin</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm mb-2">Inverse Биржи</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Binance</li>
                      <li>• Bybit</li>
                      <li>• OKX</li>
                      <li>• Bitget</li>
                      <li>• BitMEX</li>
                      <li>• BloFin</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      case "bots":
        return <BotConfigForm />;
      
      case "grid-bot":
        return <GridBotManager />;
      
      case "dca-bot":
        return <DcaBotManager />;

      case "bb-bot":
        return <BBBotManager />;

      case "argus-bot":
        return <ArgusBotManager />;

      case "vision-bot":
        return <VisionBotManager />;

      case "copy-trading":
        return <CopyTradingPanel />;

      case "master-trading":
        return <MasterTraderPanel />;

      case "analytics":
        return <PnLAnalytics />;

      case "history":
        return <TradesHistory />;

      case "wallet":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BalanceWidget />
            <MarketOverview />
          </div>
        );

      case "settings":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ExchangeSelector />
            <ConnectedAccounts />
          </div>
        );

      case "notifications":
        return <NotificationsPanel />;

      case "telegram":
        return <TelegramSettings />;

      case "help":
        return (
          <div className="p-6 rounded-lg border border-border bg-card">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Справка
            </h3>
            <div className="space-y-4 text-muted-foreground">
              <p>
                <strong className="text-primary">CITARION</strong> - продвинутая платформа автоматической торговли криптовалютой.
              </p>
              <h4 className="text-foreground font-medium">Основные функции:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Демо-торговля с виртуальным балансом 10,000 USDT</li>
                <li>Парсинг сигналов из Telegram, Discord, TradingView</li>
                <li>AI-ассистент для управления торговлей</li>
                <li>Grid Bot - автоматическая сеточная торговля</li>
                <li>DCA Bot - стратегия усреднения позиции</li>
                <li>Argus Bot - детекция pump/dump движений</li>
                <li>Vision - прогнозирование рынка</li>
                <li>Поддержка Market и Limit ордеров</li>
                <li>Trailing Stop и Take Profit</li>
                <li>Реалистичный учёт комиссий биржи</li>
              </ul>
              <h4 className="text-foreground font-medium mt-4">Режимы работы:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>DEMO</strong> - виртуальная торговля без риска</li>
                <li><strong>REAL</strong> - торговля на реальной бирже (требует API ключи)</li>
              </ul>
              <h4 className="text-foreground font-medium mt-4">Поддерживаемые биржи:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Binance, Bybit, OKX, Bitget, KuCoin, BingX</li>
                <li>HyperLiquid, Aster DEX</li>
              </ul>
            </div>
          </div>
        );

      default:
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
              <BalanceWidget />
              <TradingForm />
            </div>
            <div className="space-y-6">
              <PositionsTable />
              <SignalFeed />
            </div>
            <div className="space-y-6">
              <MarketOverview />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div
        className={cn(
          "relative z-10 transition-all duration-300 min-h-screen flex flex-col",
          sidebarOpen ? "ml-64" : "ml-16"
        )}
      >
        {/* Header */}
        <Header />

        {/* Connection Status Bar */}
        <div className="px-6 py-2 border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Multi-Exchange Status */}
              <div className="flex items-center gap-2">
                <ConnectionStatusIndicator showLabel showMultiExchange />
                {connectionStatus === "connected" && (
                  <span className="text-xs text-muted-foreground">
                    {Object.keys(prices).length} pairs
                  </span>
                )}
              </div>
              
              {/* BTC Price Quick View */}
              {btcPrice && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-muted/50">
                  <span className="text-xs font-medium text-foreground">BTC</span>
                  <span className="text-sm font-semibold text-foreground">
                    ${btcPrice.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className={cn(
                    "text-xs font-medium",
                    btcPrice.change24h >= 0 ? "text-green-500" : "text-red-500"
                  )}>
                    {btcPrice.change24h >= 0 ? "+" : ""}{btcPrice.change24h.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>

            {/* Right side: Exchange indicators + Last Update */}
            <div className="flex items-center gap-4">
              {/* Connected Exchanges */}
              <div className="flex items-center gap-1">
                {Object.entries(statuses).map(([source, status]) => (
                  <span
                    key={source}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded",
                      status === "connected" 
                        ? "bg-green-500/10 text-green-500" 
                        : status === "connecting"
                        ? "bg-yellow-500/10 text-yellow-500"
                        : "bg-gray-500/10 text-gray-500"
                    )}
                    title={`${exchangeNames[source as keyof typeof exchangeNames]}: ${status}`}
                  >
                    {exchangeNames[source as keyof typeof exchangeNames]}
                  </span>
                ))}
              </div>
              
              {/* Last Update Time */}
              <div className="text-xs text-muted-foreground">
                {lastUpdated && (
                  <span>
                    {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <main className="p-6 flex-1 flex flex-col min-h-0">
          {renderContent()}
        </main>

        {/* Footer */}
        <footer className="border-t border-border py-4 px-6 text-center text-xs text-muted-foreground mt-auto">
          <div className="flex items-center justify-center gap-2">
            <span className="font-semibold text-primary">CITARION</span>
            <span>© 2025</span>
            <span>•</span>
            <span>Версия 1.2.0</span>
            {isDemo && (
              <>
                <span>•</span>
                <span className="text-amber-500">DEMO РЕЖИМ</span>
              </>
            )}
            <span>•</span>
            <span className="flex items-center gap-1">
              <ConnectionStatusIndicator />
              <span>Real-time prices</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <PriceProvider>
      <DashboardContent />
    </PriceProvider>
  );
}
