"use client";

import { useState, useTransition } from "react";
import { Wallet, Building2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { connectSolanaWallet } from "@/app/actions/solana";
import { connectSimpleFIN } from "@/app/actions/simplefin";

interface ConnectAccountProps {
  onSuccess?: () => void;
}

export function ConnectAccount({ onSuccess }: ConnectAccountProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"solana" | "simplefin">("solana");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [solanaAddress, setSolanaAddress] = useState("");
  const [simplefinToken, setSimplefinToken] = useState("");

  const handleConnectSolana = () => {
    setError(null);
    setSuccess(null);

    if (!solanaAddress.trim()) {
      setError("Please enter a wallet address");
      return;
    }

    startTransition(async () => {
      const result = await connectSolanaWallet(solanaAddress.trim());

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(`Connected! Total value: $${result.totalValueUsd?.toFixed(2)}`);
        setSolanaAddress("");
        onSuccess?.();
        setTimeout(() => {
          setIsOpen(false);
          setSuccess(null);
        }, 2000);
      }
    });
  };

  const handleConnectSimpleFIN = () => {
    setError(null);
    setSuccess(null);

    if (!simplefinToken.trim()) {
      setError("Please enter a setup token");
      return;
    }

    startTransition(async () => {
      const result = await connectSimpleFIN(simplefinToken.trim());

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(`Connected ${result.accountCount} accounts!`);
        setSimplefinToken("");
        onSuccess?.();
        setTimeout(() => {
          setIsOpen(false);
          setSuccess(null);
        }, 2000);
      }
    });
  };

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} className="gap-2">
        <Plus className="h-4 w-4" />
        Connect Account
      </Button>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Connect Account</h3>
        <button
          onClick={() => {
            setIsOpen(false);
            setError(null);
            setSuccess(null);
          }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6" role="tablist">
        <button
          onClick={() => {
            setActiveTab("solana");
            setError(null);
          }}
          role="tab"
          aria-selected={activeTab === "solana"}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
            activeTab === "solana"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          <Wallet className="h-4 w-4" />
          Solana Wallet
        </button>
        <button
          onClick={() => {
            setActiveTab("simplefin");
            setError(null);
          }}
          role="tab"
          aria-selected={activeTab === "simplefin"}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
            activeTab === "simplefin"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          <Building2 className="h-4 w-4" />
          Bank (SimpleFIN)
        </button>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 text-green-500 text-sm">
          {success}
        </div>
      )}

      {/* Solana Form */}
      {activeTab === "solana" && (
        <div className="space-y-4">
          <div>
            <label htmlFor="solana-address" className="block text-sm font-medium mb-2">
              Wallet Address
            </label>
            <input
              id="solana-address"
              type="text"
              value={solanaAddress}
              onChange={(e) => setSolanaAddress(e.target.value)}
              placeholder="Enter Solana wallet address..."
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isPending}
              aria-describedby="solana-address-help"
            />
            <p id="solana-address-help" className="mt-2 text-xs text-muted-foreground">
              Enter any Solana wallet address to track its SOL and token balances.
            </p>
          </div>
          <Button
            onClick={handleConnectSolana}
            disabled={isPending || !solanaAddress.trim()}
            className="w-full"
          >
            {isPending ? "Connecting..." : "Connect Wallet"}
          </Button>
        </div>
      )}

      {/* SimpleFIN Form */}
      {activeTab === "simplefin" && (
        <div className="space-y-4">
          <div>
            <label htmlFor="simplefin-token" className="block text-sm font-medium mb-2">
              Setup Token
            </label>
            <input
              id="simplefin-token"
              type="text"
              value={simplefinToken}
              onChange={(e) => setSimplefinToken(e.target.value)}
              placeholder="Paste your SimpleFIN setup token..."
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isPending}
              aria-describedby="simplefin-token-help"
            />
            <p id="simplefin-token-help" className="mt-2 text-xs text-muted-foreground">
              Get a setup token from{" "}
              <a
                href="https://beta-bridge.simplefin.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                SimpleFIN Bridge
              </a>
              {" "}to connect your bank accounts.
            </p>
          </div>
          <Button
            onClick={handleConnectSimpleFIN}
            disabled={isPending || !simplefinToken.trim()}
            className="w-full"
          >
            {isPending ? "Connecting..." : "Connect Bank"}
          </Button>
        </div>
      )}
    </div>
  );
}
