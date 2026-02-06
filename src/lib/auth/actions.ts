"use server";

import { redirect } from "next/navigation";
import { setSessionCookie, clearSessionCookie } from "./index";
import { signinLimiter } from "./rate-limit";

interface AuthResult {
  error?: string;
  success?: string;
}

export async function login(password: string): Promise<AuthResult> {
  // Validate input
  if (!password) {
    return { error: "Please enter the password" };
  }

  // Rate limit by IP (use a fixed key since we don't have users)
  const limit = signinLimiter.checkLimit("global", 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return { error: "Too many attempts. Please try again later." };
  }

  // Check password against env var
  const correctPassword = process.env.AUTH_PASSWORD;
  if (!correctPassword) {
    console.error("AUTH_PASSWORD environment variable not set");
    return { error: "Server configuration error" };
  }

  if (password !== correctPassword) {
    return { error: "Invalid password" };
  }

  // Set session cookie
  try {
    await setSessionCookie();
  } catch (e) {
    console.error("Login error:", e);
    return { error: "An error occurred during login" };
  }

  return { success: "Signed in successfully" };
}

export async function signout(): Promise<void> {
  await clearSessionCookie();
  redirect("/dashboard");
}
