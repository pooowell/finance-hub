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
          is_hidden: boolean;
          include_in_net_worth: boolean;
          category: AccountCategory | null;
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
          is_hidden?: boolean;
          include_in_net_worth?: boolean;
          category?: AccountCategory | null;
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
          is_hidden?: boolean;
          include_in_net_worth?: boolean;
          category?: AccountCategory | null;
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
      transactions: {
        Row: {
          id: string;
          account_id: string;
          external_id: string;
          posted_at: string;
          amount: number;
          description: string;
          payee: string | null;
          memo: string | null;
          pending: boolean;
          label_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          external_id: string;
          posted_at: string;
          amount: number;
          description: string;
          payee?: string | null;
          memo?: string | null;
          pending?: boolean;
          label_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          external_id?: string;
          posted_at?: string;
          amount?: number;
          description?: string;
          payee?: string | null;
          memo?: string | null;
          pending?: boolean;
          label_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_label_id_fkey";
            columns: ["label_id"];
            isOneToOne: false;
            referencedRelation: "transaction_labels";
            referencedColumns: ["id"];
          }
        ];
      };
      transaction_labels: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          color?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          color?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_labels_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      label_rules: {
        Row: {
          id: string;
          user_id: string;
          label_id: string;
          match_field: string;
          match_pattern: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label_id: string;
          match_field?: string;
          match_pattern: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          label_id?: string;
          match_field?: string;
          match_pattern?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "label_rules_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "label_rules_label_id_fkey";
            columns: ["label_id"];
            isOneToOne: false;
            referencedRelation: "transaction_labels";
            referencedColumns: ["id"];
          }
        ];
      };
      credentials: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          access_token: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          access_token: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: string;
          access_token?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credentials_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
      account_category: AccountCategory;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
