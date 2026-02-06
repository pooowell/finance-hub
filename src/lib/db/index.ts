import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const getDatabasePath = () => {
  const dbPath = process.env.DATABASE_PATH || "./data/finance-hub.db";
  // Resolve to absolute path
  const absolutePath = path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);

  // Ensure directory exists
  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return absolutePath;
};

// Create database connection with lazy initialization
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;

export const getDb = () => {
  if (!_db) {
    const dbPath = getDatabasePath();
    _sqlite = new Database(dbPath);
    _sqlite.pragma("journal_mode = WAL");
    _sqlite.pragma("foreign_keys = ON");
    _db = drizzle(_sqlite, { schema });
  }
  return _db;
};

// Export as db for convenience (lazy getter)
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    return getDb()[prop as keyof typeof _db];
  },
});

// Close the database connection (useful for tests/cleanup)
export const closeDb = () => {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
};

// Re-export schema for convenience
export * from "./schema";
