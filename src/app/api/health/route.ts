import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

const startTime = Date.now();

// Read version once at module load
const version = process.env.npm_package_version ?? require("../../../../package.json").version ?? "unknown";

export async function GET() {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const timestamp = new Date().toISOString();

  try {
    const db = getDb();
    db.run(sql`SELECT 1`);

    return NextResponse.json(
      {
        status: "healthy",
        uptime: uptimeSeconds,
        database: "connected",
        version,
        timestamp,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        status: "unhealthy",
        uptime: uptimeSeconds,
        database: "disconnected",
        version,
        timestamp,
      },
      { status: 503 }
    );
  }
}
