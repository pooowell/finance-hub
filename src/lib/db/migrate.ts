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

const migrate = () => {
  const dbPath = getDatabasePath();
  console.log(`Migrating database at: ${dbPath}`);

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Create tables (no users/sessions - single-user app with password auth)
  sqlite.exec(`
    -- Accounts table
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other',
      balance_usd REAL,
      external_id TEXT,
      metadata TEXT DEFAULT '{}',
      last_synced_at TEXT,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      include_in_net_worth INTEGER NOT NULL DEFAULT 1,
      category TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Snapshots table (time-series account balances)
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      timestamp TEXT NOT NULL,
      value_usd REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Transaction labels table
    CREATE TABLE IF NOT EXISTS transaction_labels (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Transactions table
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      posted_at TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      payee TEXT,
      memo TEXT,
      pending INTEGER NOT NULL DEFAULT 0,
      label_id TEXT REFERENCES transaction_labels(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(account_id, external_id)
    );

    -- Label rules table
    CREATE TABLE IF NOT EXISTS label_rules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      label_id TEXT NOT NULL REFERENCES transaction_labels(id) ON DELETE CASCADE,
      match_field TEXT NOT NULL DEFAULT 'description',
      match_pattern TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Credentials table (provider API tokens)
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      provider TEXT NOT NULL,
      access_token TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, provider)
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_account_id ON snapshots(account_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON snapshots(timestamp);
    CREATE INDEX IF NOT EXISTS idx_snapshots_account_timestamp ON snapshots(account_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_posted_at ON transactions(posted_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_posted ON transactions(account_id, posted_at);
    CREATE INDEX IF NOT EXISTS idx_transaction_labels_user_id ON transaction_labels(user_id);
    CREATE INDEX IF NOT EXISTS idx_label_rules_user_id ON label_rules(user_id);
    CREATE INDEX IF NOT EXISTS idx_label_rules_label_id ON label_rules(label_id);
    CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);
  `);

  console.log("Migration completed successfully!");
  sqlite.close();
};

// Run migration if called directly
migrate();
