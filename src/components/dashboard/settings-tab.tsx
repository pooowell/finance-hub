"use client";

import { Settings } from "lucide-react";
import { ConnectAccount } from "./connect-account";

interface SettingsTabProps {
  onAccountConnect?: () => void;
}

export function SettingsTab({ onAccountConnect }: SettingsTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Connect Accounts</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Link your bank accounts via SimpleFIN or add Solana wallets.
        </p>
        <ConnectAccount onSuccess={onAccountConnect} />
      </div>
    </div>
  );
}
