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
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
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
        Relationships: [
          {
            foreignKeyName: "accounts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
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
        Relationships: [
          {
            foreignKeyName: "snapshots_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      provider_type: ProviderType;
      account_type: AccountType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
