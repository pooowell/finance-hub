"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { signup, signin } from "@/lib/auth/actions";

interface AuthFormProps {
  onSuccess?: () => void;
}

export function AuthForm({ onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim() || !password.trim()) {
      setError("Please enter email and password");
      return;
    }

    startTransition(async () => {
      const result = mode === "signup"
        ? await signup(email.trim(), password.trim())
        : await signin(email.trim(), password.trim());

      if (result.error) {
        setError(result.error);
      } else if (result.success) {
        if (mode === "signup") {
          setSuccess("Account created! Signing you in...");
        }
        onSuccess?.();
        window.location.reload();
      }
    });
  };

  return (
    <div className="bg-card rounded-lg border border-border p-6 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-4">
        {mode === "signin" ? "Sign In" : "Create Account"}
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        Sign in to connect and track your financial accounts.
      </p>

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

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="auth-email" className="block text-sm font-medium mb-2">Email</label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isPending}
            aria-required="true"
            autoComplete="email"
          />
        </div>
        <div>
          <label htmlFor="auth-password" className="block text-sm font-medium mb-2">Password</label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isPending}
            aria-required="true"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        </div>
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending
            ? "Loading..."
            : mode === "signin"
            ? "Sign In"
            : "Create Account"}
        </Button>
      </form>

      <div className="mt-4 text-center text-sm">
        {mode === "signin" ? (
          <p className="text-muted-foreground">
            Don&apos;t have an account?{" "}
            <button
              onClick={() => setMode("signup")}
              className="text-primary hover:underline"
            >
              Sign up
            </button>
          </p>
        ) : (
          <p className="text-muted-foreground">
            Already have an account?{" "}
            <button
              onClick={() => setMode("signin")}
              className="text-primary hover:underline"
            >
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
