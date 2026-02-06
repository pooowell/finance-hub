import { NextRequest, NextResponse } from "next/server";
import { setInternalBypass } from "@/lib/auth";
import { syncAllAccounts } from "@/app/actions/sync";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedPassword = process.env.AUTH_PASSWORD;

  if (!expectedPassword) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const token = authHeader?.replace("Bearer ", "");
  if (!token || token.length !== expectedPassword.length || !crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(expectedPassword)
  )) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Bypass cookie auth for internal API calls
    setInternalBypass(true);
    const result = await syncAllAccounts();
    setInternalBypass(false);
    
    return NextResponse.json({ ...result, timestamp: new Date().toISOString() });
  } catch (e: unknown) {
    setInternalBypass(false);
    const message = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
