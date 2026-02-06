"use client";

import { LayoutDashboard, Wallet, ArrowRightLeft, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabType = "dashboard" | "accounts" | "transactions" | "settings";

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs = [
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { id: "accounts" as const, label: "Accounts", icon: Wallet },
  { id: "transactions" as const, label: "Transactions", icon: ArrowRightLeft },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <div className="flex gap-2 mb-6 overflow-x-auto flex-nowrap pb-2 -mb-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors flex-shrink-0",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline text-sm">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
