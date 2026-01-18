export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProviderType = "SimpleFIN" | "Solana";
export type AccountType = "checking" | "savings" | "credit" | "investment" | "crypto" | "other";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          provider: ProviderType;
          name: string;
          type: AccountType;
          balance_usd: number | null;
          external_id: string | null;
          metadata: Json;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: ProviderType;
          name: string;
          type?: AccountType;
          balance_usd?: number | null;
          external_id?: string | null;
          metadata?: Json;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: ProviderType;
          name?: string;
          type?: AccountType;
          balance_usd?: number | null;
          external_id?: string | null;
          metadata?: Json;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      snapshots: {
        Row: {
          id: string;
          account_id: string;
          timestamp: string;
          value_usd: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          timestamp?: string;
          value_usd: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          timestamp?: string;
          value_usd?: number;
          created_at?: string;
        };
      };
    };
    Enums: {
      provider_type: ProviderType;
      account_type: AccountType;
    };
  };
}
