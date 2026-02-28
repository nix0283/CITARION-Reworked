"use client";

import { useCryptoStore, TradingMode } from "@/stores/crypto-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Moon, Sun, User, LogOut, RefreshCw } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function Header() {
  const { account, setTradingMode, resetDemoBalance } = useCryptoStore();
  const { theme, setTheme } = useTheme();
  
  const isDemo = account?.accountType === "DEMO";

  const handleModeSwitch = (mode: TradingMode) => {
    setTradingMode(mode);
  };

  const handleResetBalance = async () => {
    try {
      const response = await fetch("/api/account/reset-balance", {
        method: "POST",
      });
      if (response.ok) {
        resetDemoBalance();
      }
    } catch (error) {
      console.error("Failed to reset balance:", error);
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <header className="sticky top-0 z-30 h-14 md:h-16 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="flex h-full items-center justify-between px-3 md:px-6">
        {/* Left side - Page Title */}
        <div className="flex items-center gap-2 md:gap-4">
          <h2 className="text-sm md:text-lg font-semibold text-foreground truncate">
            Панель управления
          </h2>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] md:text-xs font-medium",
              isDemo ? "demo-badge" : "real-badge"
            )}
          >
            {isDemo ? "[DEMO]" : "[REAL]"}
          </Badge>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Trading Mode Switch - Hidden on mobile */}
          <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
            <Label
              htmlFor="mode-switch"
              className={cn(
                "text-xs font-medium cursor-pointer",
                !isDemo ? "text-green-500" : "text-muted-foreground"
              )}
            >
              REAL
            </Label>
            <Switch
              id="mode-switch"
              checked={isDemo}
              onCheckedChange={(checked) =>
                handleModeSwitch(checked ? "DEMO" : "REAL")
              }
              className="data-[state=checked]:bg-amber-500 data-[state=unchecked]:bg-green-500"
            />
            <Label
              htmlFor="mode-switch"
              className={cn(
                "text-xs font-medium cursor-pointer",
                isDemo ? "text-amber-500" : "text-muted-foreground"
              )}
            >
              DEMO
            </Label>
          </div>

          {/* Reset Balance (Demo only) - Hidden on mobile */}
          {isDemo && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetBalance}
              className="hidden md:flex h-8"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Сбросить
            </Button>
          )}

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8"
            suppressHydrationWarning
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src="/avatar.png" alt="User" />
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">
                    TR
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">Trader</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                <span>Профиль</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Выйти</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
