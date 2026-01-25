// Re-export types from Drizzle schema
export type {
  User,
  NewUser,
  Session,
  NewSession,
  Account,
  NewAccount,
  Snapshot,
  NewSnapshot,
  Transaction,
  NewTransaction,
  TransactionLabel,
  NewTransactionLabel,
  LabelRule,
  NewLabelRule,
  Credential,
  NewCredential,
} from "@/lib/db/schema";

// Legacy type aliases for compatibility
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProviderType = "SimpleFIN" | "Solana";
export type AccountType = "checking" | "savings" | "credit" | "investment" | "crypto" | "other";
export type AccountCategory = "savings" | "retirement" | "assets" | "credit_cards" | "checking" | "crypto";
