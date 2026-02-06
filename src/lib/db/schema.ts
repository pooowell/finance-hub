import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// Default user ID for all data (single-user app)
export const DEFAULT_USER_ID = "default";

// Accounts table
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(DEFAULT_USER_ID),
  provider: text("provider").notNull(), // 'SimpleFIN' | 'Solana'
  name: text("name").notNull(),
  type: text("type").notNull().default("other"), // checking | savings | credit | investment | crypto | other
  balanceUsd: real("balance_usd"),
  externalId: text("external_id"),
  metadata: text("metadata").default("{}"), // JSON stored as text
  lastSyncedAt: text("last_synced_at"),
  isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(false),
  includeInNetWorth: integer("include_in_net_worth", { mode: "boolean" }).notNull().default(true),
  category: text("category"), // savings | retirement | assets | credit_cards | checking | crypto
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
  updatedAt: text("updated_at").notNull().default("(datetime('now'))"),
});

// Snapshots table (time-series account balances)
export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  timestamp: text("timestamp").notNull(),
  valueUsd: real("value_usd").notNull(),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

// Transaction labels table
export const transactionLabels = sqliteTable("transaction_labels", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(DEFAULT_USER_ID),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

// Transactions table
export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  postedAt: text("posted_at").notNull(),
  amount: real("amount").notNull(),
  description: text("description").notNull(),
  payee: text("payee"),
  memo: text("memo"),
  pending: integer("pending", { mode: "boolean" }).notNull().default(false),
  labelId: text("label_id").references(() => transactionLabels.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

// Label rules table
export const labelRules = sqliteTable("label_rules", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(DEFAULT_USER_ID),
  labelId: text("label_id")
    .notNull()
    .references(() => transactionLabels.id, { onDelete: "cascade" }),
  matchField: text("match_field").notNull().default("description"), // description | payee | both
  matchPattern: text("match_pattern").notNull(),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

// Credentials table (provider API tokens)
export const credentials = sqliteTable("credentials", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(DEFAULT_USER_ID),
  provider: text("provider").notNull(),
  accessToken: text("access_token").notNull(),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
  updatedAt: text("updated_at").notNull().default("(datetime('now'))"),
});

// Export type aliases for inference
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TransactionLabel = typeof transactionLabels.$inferSelect;
export type NewTransactionLabel = typeof transactionLabels.$inferInsert;
export type LabelRule = typeof labelRules.$inferSelect;
export type NewLabelRule = typeof labelRules.$inferInsert;
export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;
