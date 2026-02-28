"use client";

import { useCryptoStore } from "@/stores/crypto-store";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  History,
  Settings,
  Bot,
  LineChart,
  Wallet,
  Bell,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Building2,
  MessageSquare,
  BarChart3,
  Grid3X3,
  Layers,
  Activity,
  Eye,
  Radar,
  CandlestickChart,
  Users,
  FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const menuItems = [
  { id: "dashboard", label: "Дашборд", icon: LayoutDashboard },
  { id: "chart", label: "График", icon: CandlestickChart },
  { id: "trading", label: "Торговля", icon: LineChart },
  { id: "strategy-lab", label: "Strategy Lab", icon: FlaskConical },
  { id: "chat", label: "Оракул", icon: MessageSquare },
  { id: "exchanges", label: "Биржи", icon: Building2 },
  { id: "bots", label: "Боты", icon: Bot },
  { id: "grid-bot", label: "Архитектор (GRD)", icon: Grid3X3, parent: "bots" },
  { id: "dca-bot", label: "Крон (DCA)", icon: Layers, parent: "bots" },
  { id: "bb-bot", label: "Рид (BBB)", icon: Activity, parent: "bots" },
  { id: "argus-bot", label: "Аргус (P&D)", icon: Radar, parent: "bots" },
  { id: "vision-bot", label: "Вижн (FCST)", icon: Eye, parent: "bots" },
  { id: "copy-trading", label: "Копитрейдинг", icon: Users },
  { id: "analytics", label: "Аналитика", icon: BarChart3 },
  { id: "history", label: "История", icon: History },
  { id: "wallet", label: "Кошелёк", icon: Wallet },
  { id: "settings", label: "Настройки", icon: Settings },
];

const bottomMenuItems = [
  { id: "notifications", label: "Уведомления", icon: Bell },
  { id: "telegram", label: "Telegram", icon: MessageSquare },
  { id: "help", label: "Помощь", icon: HelpCircle },
];

export function Sidebar() {
  const { activeTab, setActiveTab, sidebarOpen, setSidebarOpen, account } = useCryptoStore();
  const isDemo = account?.accountType === "DEMO";

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 h-screen border-r border-border bg-card transition-all duration-300 flex flex-col",
        sidebarOpen ? "w-64" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4 flex-shrink-0">
        {sidebarOpen ? (
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#F0B90B] to-[#D4A00A] shadow-lg shadow-primary/25">
              <span className="text-black font-bold text-sm tracking-tight">C</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">CITARION</h1>
            </div>
          </div>
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#F0B90B] to-[#D4A00A] shadow-lg shadow-primary/25 mx-auto">
            <span className="text-black font-bold text-sm tracking-tight">C</span>
          </div>
        )}
      </div>

      {/* Mode Badge */}
      {sidebarOpen && (
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
          <Badge
            variant="outline"
            className={cn(
              "w-full justify-center py-1.5 text-xs font-medium",
              isDemo ? "demo-badge" : "real-badge"
            )}
          >
            {isDemo ? "🔷 DEMO РЕЖИМ" : "🟢 REAL РЕЖИМ"}
          </Badge>
        </div>
      )}

      {/* Main Menu */}
      <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          
          // Skip sub-items when sidebar is closed
          if (item.parent && !sidebarOpen) return null;
          
          // Sub-items - show indented
          if (item.parent) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                  "hover:bg-accent active:scale-[0.98] cursor-pointer ml-4",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </button>
            );
          }
          
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                "hover:bg-accent active:scale-[0.98] cursor-pointer",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Bottom Menu */}
      <div className="border-t border-border px-2 py-4 flex-shrink-0">
        {bottomMenuItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                "hover:bg-accent active:scale-[0.98] cursor-pointer",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Collapse Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute -right-3 top-20 h-6 w-6 rounded-full border border-border bg-card shadow-sm cursor-pointer hover:bg-accent z-50"
      >
        {sidebarOpen ? (
          <ChevronLeft className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </Button>
    </aside>
  );
}
