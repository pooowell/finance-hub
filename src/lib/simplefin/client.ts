/**
 * SimpleFIN Bridge API Client
 * https://www.simplefin.org/protocol.html
 */

import type {
  SimpleFINAccessURL,
  SimpleFINAccountSet,
  SimpleFINCredentials,
} from "@/types/simplefin";

/**
 * Parses a SimpleFIN access URL into its components
 */
export function parseAccessUrl(accessUrl: string): SimpleFINAccessURL {
  const url = new URL(accessUrl);
  return {
    url: accessUrl,
    scheme: url.protocol.replace(":", ""),
    username: url.username,
    password: url.password,
    host: url.host,
    path: url.pathname,
  };
}

/**
 * Claims a SimpleFIN setup token and returns the access URL
 * This is called once when the user first connects their SimpleFIN account
 */
export async function claimSetupToken(setupToken: string): Promise<string> {
  // Decode the base64 setup token to get the claim URL
  const claimUrl = Buffer.from(setupToken, "base64").toString("utf-8");

  const response = await fetch(claimUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to claim setup token: ${response.statusText}`);
  }

  // The response body is the access URL
  const accessUrl = await response.text();
  return accessUrl.trim();
}

/**
 * Fetches account data from SimpleFIN using the access URL
 */
export async function fetchAccounts(
  credentials: SimpleFINCredentials,
  options?: {
    startDate?: Date;
    endDate?: Date;
    accountIds?: string[];
  }
): Promise<SimpleFINAccountSet> {
  const parsed = parseAccessUrl(credentials.accessUrl);

  // Build the accounts URL
  const accountsUrl = new URL(`${parsed.scheme}://${parsed.host}${parsed.path}`);
  accountsUrl.pathname = accountsUrl.pathname.replace(/\/$/, "") + "/accounts";

  // Add query parameters
  if (options?.startDate) {
    accountsUrl.searchParams.set(
      "start-date",
      Math.floor(options.startDate.getTime() / 1000).toString()
    );
  }
  if (options?.endDate) {
    accountsUrl.searchParams.set(
      "end-date",
      Math.floor(options.endDate.getTime() / 1000).toString()
    );
  }
  if (options?.accountIds?.length) {
    accountsUrl.searchParams.set("account", options.accountIds.join(","));
  }

  // Create auth header
  const authHeader = Buffer.from(
    `${parsed.username}:${parsed.password}`
  ).toString("base64");

  const response = await fetch(accountsUrl.toString(), {
    method: "GET",
    headers: {
      Authorization: `Basic ${authHeader}`,
      Accept: "application/json",
    },
    next: {
      revalidate: 300, // Cache for 5 minutes
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("SimpleFIN access denied. Please reconnect your account.");
    }
    throw new Error(`SimpleFIN API error: ${response.statusText}`);
  }

  const data: SimpleFINAccountSet = await response.json();
  return data;
}

/**
 * Validates that the access URL is still valid
 */
export async function validateAccessUrl(
  credentials: SimpleFINCredentials
): Promise<boolean> {
  try {
    await fetchAccounts(credentials);
    return true;
  } catch {
    return false;
  }
}
