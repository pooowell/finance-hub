import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabNavigation, type TabType } from "./tab-navigation";

describe("TabNavigation", () => {
  const defaultProps = {
    activeTab: "dashboard" as TabType,
    onTabChange: vi.fn(),
  };

  it("renders all four tabs", () => {
    render(<TabNavigation {...defaultProps} />);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Accounts")).toBeInTheDocument();
    expect(screen.getByText("Transactions")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("highlights the active tab with primary styling", () => {
    render(<TabNavigation {...defaultProps} activeTab="accounts" />);

    const accountsTab = screen.getByText("Accounts").closest("button")!;
    expect(accountsTab.className).toContain("bg-primary");

    const dashboardTab = screen.getByText("Dashboard").closest("button")!;
    expect(dashboardTab.className).not.toContain("bg-primary");
  });

  it("calls onTabChange with the correct tab id when a tab is clicked", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<TabNavigation activeTab="dashboard" onTabChange={onTabChange} />);

    await user.click(screen.getByText("Transactions"));
    expect(onTabChange).toHaveBeenCalledWith("transactions");
  });

  it("calls onTabChange for each different tab", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<TabNavigation activeTab="dashboard" onTabChange={onTabChange} />);

    await user.click(screen.getByText("Accounts"));
    expect(onTabChange).toHaveBeenCalledWith("accounts");

    await user.click(screen.getByText("Settings"));
    expect(onTabChange).toHaveBeenCalledWith("settings");

    await user.click(screen.getByText("Dashboard"));
    expect(onTabChange).toHaveBeenCalledWith("dashboard");
  });

  it("renders each tab as a button element", () => {
    render(<TabNavigation {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(4);
  });

  it("applies muted styling to inactive tabs", () => {
    render(<TabNavigation {...defaultProps} activeTab="settings" />);

    const dashboardTab = screen.getByText("Dashboard").closest("button")!;
    expect(dashboardTab.className).toContain("bg-muted");

    const settingsTab = screen.getByText("Settings").closest("button")!;
    expect(settingsTab.className).not.toContain("bg-muted");
  });
});
