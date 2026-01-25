import { Lucia } from "lucia";
import { BetterSqlite3Adapter } from "@lucia-auth/adapter-sqlite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const getDatabasePath = () => {
  const dbPath = process.env.DATABASE_PATH || "./data/finance-hub.db";
  const absolutePath = path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);

  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return absolutePath;
};

// Create a separate database connection for Lucia
// (Using the same pattern as the main db)
const sqlite = new Database(getDatabasePath());
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const adapter = new BetterSqlite3Adapter(sqlite, {
  user: "users",
  session: "sessions",
});

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    expires: false,
    attributes: {
      secure: process.env.NODE_ENV === "production",
    },
  },
  getUserAttributes: (attributes) => {
    return {
      email: attributes.email,
      fullName: attributes.full_name,
      avatarUrl: attributes.avatar_url,
    };
  },
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: DatabaseUserAttributes;
  }
}

interface DatabaseUserAttributes {
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}
