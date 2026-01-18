import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wallet, Building2, TrendingUp } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold mb-4">Finance Hub</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Centralized aggregator for traditional and on-chain financial data
        </p>

        <Link href="/dashboard">
          <Button size="lg" className="mb-12">
            Go to Dashboard
          </Button>
        </Link>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="bg-card rounded-lg border border-border p-6">
            <Wallet className="h-8 w-8 mb-4 text-primary" />
            <h3 className="font-semibold mb-2">Solana Wallets</h3>
            <p className="text-sm text-muted-foreground">
              Track SOL and SPL token balances with real-time USD conversion via Jupiter.
            </p>
          </div>

          <div className="bg-card rounded-lg border border-border p-6">
            <Building2 className="h-8 w-8 mb-4 text-primary" />
            <h3 className="font-semibold mb-2">Bank Accounts</h3>
            <p className="text-sm text-muted-foreground">
              Connect Chase, Capital One, Robinhood, Schwab, and more via SimpleFIN.
            </p>
          </div>

          <div className="bg-card rounded-lg border border-border p-6">
            <TrendingUp className="h-8 w-8 mb-4 text-primary" />
            <h3 className="font-semibold mb-2">Portfolio Charts</h3>
            <p className="text-sm text-muted-foreground">
              Visualize your net worth over time with 1H, 1D, 1W, and 1M views.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
