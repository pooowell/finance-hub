import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("should load the home page", async ({ page }) => {
    await page.goto("/");

    // Check that the page title contains Finance Hub
    await expect(page).toHaveTitle(/Finance Hub/);

    // Check for main heading
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("Finance Hub");
  });

  test("should navigate to dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    // Check for dashboard heading
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("Dashboard");
  });

  test("should display portfolio summary on dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    // Wait for the dashboard to load
    await page.waitForSelector("text=Total Portfolio Value", { timeout: 10000 });

    // Check for portfolio summary elements
    await expect(page.getByText("Total Portfolio Value")).toBeVisible();
    await expect(page.getByText("Connected Accounts")).toBeVisible();
    await expect(page.getByText("Last Synced")).toBeVisible();
  });

  test("should have sync button on dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    // Wait for dashboard to load
    await page.waitForSelector("text=Total Portfolio Value", { timeout: 10000 });

    // Check for sync button
    const syncButton = page.getByRole("button", { name: /sync/i });
    await expect(syncButton).toBeVisible();
  });

  test("should display chart with timeframe toggles", async ({ page }) => {
    await page.goto("/dashboard");

    // Wait for dashboard to load
    await page.waitForSelector("text=Total Portfolio Value", { timeout: 10000 });

    // Check for timeframe toggle buttons
    await expect(page.getByRole("button", { name: "1H" })).toBeVisible();
    await expect(page.getByRole("button", { name: "1D" })).toBeVisible();
    await expect(page.getByRole("button", { name: "1W" })).toBeVisible();
    await expect(page.getByRole("button", { name: "1M" })).toBeVisible();
  });

  test("should display accounts list section", async ({ page }) => {
    await page.goto("/dashboard");

    // Wait for dashboard to load
    await page.waitForSelector("text=Total Portfolio Value", { timeout: 10000 });

    // Check for accounts section - either with accounts or empty state
    const hasAccounts = await page.getByText("Connected Accounts").isVisible();
    const hasEmptyState = await page.getByText("No accounts connected").isVisible();

    expect(hasAccounts || hasEmptyState).toBe(true);
  });
});

test.describe("Navigation", () => {
  test("should have responsive layout", async ({ page }) => {
    await page.goto("/");

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator("body")).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator("body")).toBeVisible();
  });
});
