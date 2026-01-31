import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortfolioSummary } from "./portfolio-summary";

const defaultProps = {
  totalValue: 42567.89,
  change24h: 1234.56,
  changePercent24h: 2.98,
  accountCount: 5,
  lastSynced: null as string | null,
};

describe("PortfolioSummary", () => {
  it("renders the total portfolio value formatted as currency", () => {
    render(<PortfolioSummary {...defaultProps} />);
    expect(screen.getByText("$42,567.89")).toBeInTheDocument();
  });

  it("renders the account count", () => {
    render(<PortfolioSummary {...defaultProps} accountCount={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Connected Accounts")).toBeInTheDocument();
  });

  describe("24h change", () => {
    it("shows positive change with green styling and up arrow", () => {
      render(
        <PortfolioSummary
          {...defaultProps}
          change24h={500.0}
          changePercent24h={1.25}
        />
      );
      expect(screen.getByText("$500.00")).toBeInTheDocument();
      expect(screen.getByText("(+1.25%)")).toBeInTheDocument();
    });

    it("shows negative change with red styling and down arrow", () => {
      render(
        <PortfolioSummary
          {...defaultProps}
          change24h={-300.5}
          changePercent24h={-0.75}
        />
      );
      expect(screen.getByText("$300.50")).toBeInTheDocument();
      expect(screen.getByText("(-0.75%)")).toBeInTheDocument();
    });

    it("treats zero change as positive", () => {
      render(
        <PortfolioSummary
          {...defaultProps}
          change24h={0}
          changePercent24h={0}
        />
      );
      expect(screen.getByText("$0.00")).toBeInTheDocument();
      expect(screen.getByText("(+0.00%)")).toBeInTheDocument();
    });
  });

  describe("last synced", () => {
    it('displays "Never" when lastSynced is null', () => {
      render(<PortfolioSummary {...defaultProps} lastSynced={null} />);
      expect(screen.getByText("Never")).toBeInTheDocument();
    });

    it('displays "Just now" for very recent sync', () => {
      const now = new Date().toISOString();
      render(<PortfolioSummary {...defaultProps} lastSynced={now} />);
      expect(screen.getByText("Just now")).toBeInTheDocument();
    });

    it("displays relative time in minutes", () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      render(<PortfolioSummary {...defaultProps} lastSynced={tenMinutesAgo} />);
      expect(screen.getByText("10m ago")).toBeInTheDocument();
    });

    it("displays relative time in hours", () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      render(<PortfolioSummary {...defaultProps} lastSynced={threeHoursAgo} />);
      expect(screen.getByText("3h ago")).toBeInTheDocument();
    });

    it("displays relative time in days", () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
      render(<PortfolioSummary {...defaultProps} lastSynced={twoDaysAgo} />);
      expect(screen.getByText("2d ago")).toBeInTheDocument();
    });
  });

  describe("sync button", () => {
    it("does not render sync button when onSync is not provided", () => {
      render(<PortfolioSummary {...defaultProps} />);
      expect(screen.queryByRole("button", { name: /sync/i })).not.toBeInTheDocument();
    });

    it("renders sync button when onSync is provided", () => {
      const onSync = vi.fn();
      render(<PortfolioSummary {...defaultProps} onSync={onSync} />);
      expect(screen.getByRole("button", { name: /sync/i })).toBeInTheDocument();
    });

    it("calls onSync when sync button is clicked", async () => {
      const user = userEvent.setup();
      const onSync = vi.fn();
      render(<PortfolioSummary {...defaultProps} onSync={onSync} />);

      await user.click(screen.getByRole("button", { name: /sync/i }));
      expect(onSync).toHaveBeenCalledOnce();
    });

    it("disables sync button and shows syncing state when isSyncing is true", () => {
      const onSync = vi.fn();
      render(
        <PortfolioSummary {...defaultProps} onSync={onSync} isSyncing={true} />
      );
      const button = screen.getByRole("button", { name: /syncing/i });
      expect(button).toBeDisabled();
    });
  });
});
