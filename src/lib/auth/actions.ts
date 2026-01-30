"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { generateIdFromEntropySize } from "lucia";
import { lucia, validateRequest } from "./index";
import { hashPassword, verifyPassword } from "./password";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { signinLimiter, signupLimiter } from "./rate-limit";

interface AuthResult {
  error?: string;
  success?: string;
}

export async function signup(
  email: string,
  password: string
): Promise<AuthResult> {
  // Validate input
  if (!email || !email.includes("@")) {
    return { error: "Invalid email" };
  }
  if (!password || password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit
  const signupLimit = signupLimiter.checkLimit(normalizedEmail, 10, 60 * 60 * 1000);
  if (!signupLimit.allowed) {
    return { error: "Too many attempts. Please try again later." };
  }

  // Check if user already exists
  const existingUser = db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .get();

  if (existingUser) {
    return { error: "Email already in use" };
  }

  // Create user
  const userId = generateIdFromEntropySize(10);
  const hashedPassword = await hashPassword(password);

  try {
    db.insert(users)
      .values({
        id: userId,
        email: normalizedEmail,
        hashedPassword,
      })
      .run();

    // Create session
    const session = await lucia.createSession(userId, {});
    const sessionCookie = lucia.createSessionCookie(session.id);
    (await cookies()).set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    );
  } catch (e) {
    console.error("Signup error:", e);
    return { error: "An error occurred during signup" };
  }

  return { success: "Account created successfully" };
}

export async function signin(
  email: string,
  password: string
): Promise<AuthResult> {
  // Validate input
  if (!email || !password) {
    return { error: "Please enter email and password" };
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit
  const signinLimit = signinLimiter.checkLimit(normalizedEmail, 5, 15 * 60 * 1000);
  if (!signinLimit.allowed) {
    return { error: "Too many attempts. Please try again later." };
  }

  // Find user
  const user = db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .get();

  if (!user) {
    return { error: "Invalid email or password" };
  }

  // Verify password
  const validPassword = await verifyPassword(user.hashedPassword, password);
  if (!validPassword) {
    return { error: "Invalid email or password" };
  }

  // Create session
  try {
    const session = await lucia.createSession(user.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);
    (await cookies()).set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    );
  } catch (e) {
    console.error("Signin error:", e);
    return { error: "An error occurred during signin" };
  }

  return { success: "Signed in successfully" };
}

export async function signout(): Promise<void> {
  const { session } = await validateRequest();
  if (session) {
    await lucia.invalidateSession(session.id);
    const sessionCookie = lucia.createBlankSessionCookie();
    (await cookies()).set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    );
  }
  redirect("/dashboard");
}
