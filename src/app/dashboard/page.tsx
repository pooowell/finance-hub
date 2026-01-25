import { Suspense } from "react";
import { validateRequest } from "@/lib/auth";
import { DashboardContent } from "./dashboard-content";
import { AuthForm } from "@/components/auth";

export const metadata = {
  title: "Dashboard | Finance Hub",
  description: "View your portfolio and connected accounts",
};

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary Skeleton */}
      <div className="bg-card rounded-lg border border-border p-6 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded mb-2" />
        <div className="h-10 w-48 bg-muted rounded mb-4" />
        <div className="h-4 w-24 bg-muted rounded" />
      </div>

      {/* Chart Skeleton */}
      <div className="bg-card rounded-lg border border-border p-4 animate-pulse">
        <div className="h-[300px] bg-muted rounded" />
      </div>

      {/* Accounts Skeleton */}
      <div className="bg-card rounded-lg border border-border animate-pulse">
        <div className="p-4 border-b border-border">
          <div className="h-5 w-40 bg-muted rounded" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 border-b border-border last:border-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted" />
              <div>
                <div className="h-4 w-32 bg-muted rounded mb-2" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const { user } = await validateRequest();

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      {user ? (
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent />
        </Suspense>
      ) : (
        <AuthForm />
      )}
    </main>
  );
}
