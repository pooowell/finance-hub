/**
 * SimpleFIN Bridge API Types
 * https://www.simplefin.org/protocol.html
 */

export interface SimpleFINOrganization {
  domain: string;
  name: string;
  sfin_url?: string;
}

export interface SimpleFINAccount {
  org: SimpleFINOrganization;
  id: string;
  name: string;
  currency: string;
  balance: string;
  "available-balance"?: string;
  "balance-date": number; // Unix timestamp
  transactions?: SimpleFINTransaction[];
  holdings?: SimpleFINHolding[];
}

export interface SimpleFINTransaction {
  id: string;
  posted: number; // Unix timestamp
  amount: string;
  description: string;
  payee?: string;
  memo?: string;
  pending?: boolean;
}

export interface SimpleFINHolding {
  id: string;
  "cost-basis"?: string;
  market_value?: string;
  purchase_price?: string;
  shares?: string;
  symbol?: string;
}

export interface SimpleFINAccountSet {
  errors: string[];
  accounts: SimpleFINAccount[];
}

export interface SimpleFINAccessURL {
  url: string;
  scheme: string;
  username: string;
  password: string;
  host: string;
  path: string;
}

export interface SimpleFINCredentials {
  accessUrl: string;
}

export type SimpleFINAccountType =
  | "checking"
  | "savings"
  | "credit"
  | "investment"
  | "crypto"
  | "other";

/**
 * Maps SimpleFIN organization domains to account types
 */
export const INSTITUTION_TYPE_MAP: Record<string, SimpleFINAccountType> = {
  "chase.com": "checking",
  "capitalone.com": "checking",
  "robinhood.com": "investment",
  "schwab.com": "investment",
  "coinbase.com": "crypto",
};

/**
 * Determines account type based on organization and account name
 */
export function inferAccountType(
  org: SimpleFINOrganization,
  accountName: string
): SimpleFINAccountType {
  const lowerName = accountName.toLowerCase();

  // Check institution mapping first
  const domainType = INSTITUTION_TYPE_MAP[org.domain];
  if (domainType) return domainType;

  // Infer from account name
  if (lowerName.includes("checking")) return "checking";
  if (lowerName.includes("savings")) return "savings";
  if (lowerName.includes("credit") || lowerName.includes("card")) return "credit";
  if (lowerName.includes("investment") || lowerName.includes("brokerage") || lowerName.includes("ira") || lowerName.includes("401k")) return "investment";
  if (lowerName.includes("crypto") || lowerName.includes("bitcoin") || lowerName.includes("ethereum")) return "crypto";

  return "other";
}
