"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { login } from "@/lib/auth/actions";

interface AuthFormProps {
  onSuccess?: () => void;
}

export function AuthForm({ onSuccess }: AuthFormProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError("Please enter the password");
      return;
    }

    startTransition(async () => {
      const result = await login(password.trim());

      if (result.error) {
        setError(result.error);
      } else if (result.success) {
        onSuccess?.();
        window.location.reload();
      }
    });
  };

  return (
    <div className="bg-card rounded-lg border border-border p-6 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-4">Sign In</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Enter the password to access your financial dashboard.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="auth-password" className="block text-sm font-medium mb-2">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isPending}
            aria-required="true"
            autoComplete="current-password"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Signing in..." : "Sign In"}
        </Button>
      </form>
    </div>
  );
}
