import { cookies } from "next/headers";
import { cache } from "react";
import crypto from "crypto";

// Single hardcoded user ID - all data belongs to this "user"
export const DEFAULT_USER_ID = "default";

// Internal bypass for API routes that handle their own auth
let _internalBypass = false;
export function setInternalBypass(value: boolean) { _internalBypass = value; }

// Session cookie name and secret for signing
const SESSION_COOKIE = "finance_hub_session";
const getSecret = () => process.env.AUTH_PASSWORD || "changeme";

// Create a signed session token
export function createSessionToken(): string {
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac("sha256", getSecret());
  hmac.update(timestamp);
  const signature = hmac.digest("hex");
  return `${timestamp}.${signature}`;
}

// Verify a session token
export function verifySessionToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  
  const [timestamp, signature] = parts;
  
  // Check if token is expired (30 days)
  const age = Date.now() - parseInt(timestamp, 10);
  if (age > 30 * 24 * 60 * 60 * 1000) return false;
  
  // Verify signature
  const hmac = crypto.createHmac("sha256", getSecret());
  hmac.update(timestamp);
  const expectedSignature = hmac.digest("hex");
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}

// Validate the current request
export const validateRequest = cache(
  async (): Promise<{ user: { id: string } | null }> => {
    // Allow internal API routes to bypass cookie check
    if (_internalBypass) {
      return { user: { id: DEFAULT_USER_ID } };
    }

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
    
    if (!sessionToken || !verifySessionToken(sessionToken)) {
      return { user: null };
    }
    
    return { user: { id: DEFAULT_USER_ID } };
  }
);

// Set session cookie
export async function setSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  const token = createSessionToken();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
  });
}

// Clear session cookie
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
