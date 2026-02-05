import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectAccount } from "./connect-account";

// Mock server actions
vi.mock("@/app/actions/solana", () => ({
  connectSolanaWallet: vi.fn(),
}));

vi.mock("@/app/actions/simplefin", () => ({
  connectSimpleFIN: vi.fn(),
}));

import { connectSolanaWallet } from "@/app/actions/solana";
import { connectSimpleFIN } from "@/app/actions/simplefin";

const mockConnectSolanaWallet = vi.mocked(connectSolanaWallet);
const mockConnectSimpleFIN = vi.mocked(connectSimpleFIN);

describe("ConnectAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("collapsed state", () => {
    it("renders only the Connect Account button when collapsed", () => {
      render(<ConnectAccount />);
      expect(screen.getByRole("button", { name: /connect account/i })).toBeInTheDocument();
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    });
  });

  describe("opening the form", () => {
    it("opens the form when Connect Account button is clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConnectAccount />);

      await user.click(screen.getByRole("button", { name: /connect account/i }));

      expect(screen.getByRole("tablist")).toBeInTheDocument();
      expect(screen.getByLabelText("Wallet Address")).toBeInTheDocument();
    });
  });

  describe("tab switching", () => {
    it("defaults to Solana tab and shows wallet address input", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConnectAccount />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));

      const solanaTab = screen.getByRole("tab", { name: /solana wallet/i });
      expect(solanaTab).toHaveAttribute("aria-selected", "true");
      expect(screen.getByLabelText("Wallet Address")).toBeInTheDocument();
    });

    it("switches to SimpleFIN tab and shows setup token input", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConnectAccount />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));

      await user.click(screen.getByRole("tab", { name: /bank.*simplefin/i }));

      const simplefinTab = screen.getByRole("tab", { name: /bank.*simplefin/i });
      expect(simplefinTab).toHaveAttribute("aria-selected", "true");
      expect(screen.getByLabelText("Setup Token")).toBeInTheDocument();
    });

    it("switches back to Solana tab from SimpleFIN", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConnectAccount />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));

      await user.click(screen.getByRole("tab", { name: /bank.*simplefin/i }));
      await user.click(screen.getByRole("tab", { name: /solana wallet/i }));

      expect(screen.getByRole("tab", { name: /solana wallet/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByLabelText("Wallet Address")).toBeInTheDocument();
    });
  });

  describe("empty input validation", () => {
    it("disables Connect Wallet button when address is empty", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConnectAccount />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));

      const submitBtn = screen.getByRole("button", { name: /connect wallet/i });
      expect(submitBtn).toBeDisabled();
      expect(mockConnectSolanaWallet).not.toHaveBeenCalled();
    });

    it("disables Connect Wallet button when address is only whitespace", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConnectAccount />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));

      await user.type(screen.getByLabelText("Wallet Address"), "   ");
      const submitBtn = screen.getByRole("button", { name: /connect wallet/i });
      expect(submitBtn).toBeDisabled();
    });

    it("disables Connect Bank button when token is empty", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConnectAccount />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));
      await user.click(screen.getByRole("tab", { name: /bank.*simplefin/i }));

      const submitBtn = screen.getByRole("button", { name: /connect bank/i });
      expect(submitBtn).toBeDisabled();
      expect(mockConnectSimpleFIN).not.toHaveBeenCalled();
    });

    it("enables Connect Wallet button when address has content", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockConnectSolanaWallet.mockResolvedValue({ success: true, totalValueUsd: 0, tokenCount: 0 });
      render(<ConnectAccount />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));

      await user.type(screen.getByLabelText("Wallet Address"), "abc");
      const submitBtn = screen.getByRole("button", { name: /connect wallet/i });
      expect(submitBtn).not.toBeDisabled();
    });
  });

  describe("successful Solana wallet connection", () => {
    it("calls connectSolanaWallet and shows success message", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockConnectSolanaWallet.mockResolvedValue({ success: true, totalValueUsd: 1234.56, tokenCount: 0 });

      render(<ConnectAccount />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));
      await user.type(screen.getByLabelText("Wallet Address"), "So1anaAddr3ss");
      await user.click(screen.getByRole("button", { name: /connect wallet/i }));

      await waitFor(() => {
        expect(screen.getByText("Connected! Total value: $1234.56")).toBeInTheDocument();
      });
      expect(mockConnectSolanaWallet).toHaveBeenCalledWith("So1anaAddr3ss");
    });
  });

  describe("successful SimpleFIN connection", () => {
    it("calls connectSimpleFIN and shows success message", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockConnectSimpleFIN.mockResolvedValue({ success: true, accountCount: 3 });

      render(<ConnectAccount />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));
      await user.click(screen.getByRole("tab", { name: /bank.*simplefin/i }));
      await user.type(screen.getByLabelText("Setup Token"), "my-setup-token");
      await user.click(screen.getByRole("button", { name: /connect bank/i }));

      await waitFor(() => {
        expect(screen.getByText("Connected 3 accounts!")).toBeInTheDocument();
      });
      expect(mockConnectSimpleFIN).toHaveBeenCalledWith("my-setup-token");
    });
  });

  describe("server action error", () => {
    it("shows error message when Solana connection fails", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockConnectSolanaWallet.mockResolvedValue({ error: "Invalid wallet address" });

      render(<ConnectAccount />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));
      await user.type(screen.getByLabelText("Wallet Address"), "bad-address");
      await user.click(screen.getByRole("button", { name: /connect wallet/i }));

      await waitFor(() => {
        expect(screen.getByText("Invalid wallet address")).toBeInTheDocument();
      });
    });

    it("shows error message when SimpleFIN connection fails", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockConnectSimpleFIN.mockResolvedValue({ error: "Token expired" });

      render(<ConnectAccount />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));
      await user.click(screen.getByRole("tab", { name: /bank.*simplefin/i }));
      await user.type(screen.getByLabelText("Setup Token"), "expired-token");
      await user.click(screen.getByRole("button", { name: /connect bank/i }));

      await waitFor(() => {
        expect(screen.getByText("Token expired")).toBeInTheDocument();
      });
    });
  });

  describe("close button", () => {
    it("closes form and resets state when close button is clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockConnectSolanaWallet.mockResolvedValue({ error: "Some error" });

      render(<ConnectAccount />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));

      // Trigger an error so we have state to reset
      await user.type(screen.getByLabelText("Wallet Address"), "bad");
      await user.click(screen.getByRole("button", { name: /connect wallet/i }));
      await waitFor(() => {
        expect(screen.getByText("Some error")).toBeInTheDocument();
      });

      // Close
      await user.click(screen.getByRole("button", { name: /close/i }));

      // Should be back to collapsed state
      expect(screen.getByRole("button", { name: /connect account/i })).toBeInTheDocument();
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
      expect(screen.queryByText("Some error")).not.toBeInTheDocument();
    });
  });

  describe("onSuccess callback", () => {
    it("calls onSuccess after successful Solana connection", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onSuccess = vi.fn();
      mockConnectSolanaWallet.mockResolvedValue({ success: true, totalValueUsd: 100, tokenCount: 0 });

      render(<ConnectAccount onSuccess={onSuccess} />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));
      await user.type(screen.getByLabelText("Wallet Address"), "valid-addr");
      await user.click(screen.getByRole("button", { name: /connect wallet/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledTimes(1);
      });
    });

    it("calls onSuccess after successful SimpleFIN connection", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onSuccess = vi.fn();
      mockConnectSimpleFIN.mockResolvedValue({ success: true, accountCount: 2 });

      render(<ConnectAccount onSuccess={onSuccess} />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));
      await user.click(screen.getByRole("tab", { name: /bank.*simplefin/i }));
      await user.type(screen.getByLabelText("Setup Token"), "token-123");
      await user.click(screen.getByRole("button", { name: /connect bank/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledTimes(1);
      });
    });

    it("does not call onSuccess when connection fails", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onSuccess = vi.fn();
      mockConnectSolanaWallet.mockResolvedValue({ error: "Failed" });

      render(<ConnectAccount onSuccess={onSuccess} />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));
      await user.type(screen.getByLabelText("Wallet Address"), "addr");
      await user.click(screen.getByRole("button", { name: /connect wallet/i }));

      await waitFor(() => {
        expect(screen.getByText("Failed")).toBeInTheDocument();
      });
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe("success auto-close", () => {
    it("auto-closes form after successful connection", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockConnectSolanaWallet.mockResolvedValue({ success: true, totalValueUsd: 500, tokenCount: 0 });

      render(<ConnectAccount />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));
      await user.type(screen.getByLabelText("Wallet Address"), "wallet-addr");
      await user.click(screen.getByRole("button", { name: /connect wallet/i }));

      // Success message appears
      await waitFor(() => {
        expect(screen.getByText("Connected! Total value: $500.00")).toBeInTheDocument();
      });

      // After 2s timeout, form auto-closes
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByRole("button", { name: /connect account/i })).toBeInTheDocument();
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    });
  });

  describe("clearing errors on tab switch", () => {
    it("clears server error when switching tabs", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockConnectSolanaWallet.mockResolvedValue({ error: "Invalid address format" });

      render(<ConnectAccount />);
      await user.click(screen.getByRole("button", { name: /connect account/i }));

      // Trigger a server error on Solana tab
      await user.type(screen.getByLabelText("Wallet Address"), "bad-addr");
      await user.click(screen.getByRole("button", { name: /connect wallet/i }));

      await waitFor(() => {
        expect(screen.getByText("Invalid address format")).toBeInTheDocument();
      });

      // Switch to SimpleFIN tab — error should clear
      await user.click(screen.getByRole("tab", { name: /bank.*simplefin/i }));
      expect(screen.queryByText("Invalid address format")).not.toBeInTheDocument();
    });
  });
});
