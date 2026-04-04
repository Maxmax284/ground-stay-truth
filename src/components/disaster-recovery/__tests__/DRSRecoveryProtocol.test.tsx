import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DRSRecoveryProtocol from "../DRSRecoveryProtocol";

vi.mock("@/hooks/useRecoveryAuditLog", () => ({
  useRecoveryAuditLog: () => ({
    logs: [],
    isLoading: false,
    logAction: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("DRSRecoveryProtocol", () => {
  it("renders all 10 protocol steps", () => {
    render(<DRSRecoveryProtocol />);
    expect(screen.getByText("Clone the repository")).toBeInTheDocument();
    expect(screen.getByText("Install dependencies")).toBeInTheDocument();
    expect(screen.getByText("Configure environment variables")).toBeInTheDocument();
    expect(screen.getByText("Restore the database")).toBeInTheDocument();
    expect(screen.getByText("Deploy edge functions")).toBeInTheDocument();
    expect(screen.getByText("Configure external integrations")).toBeInTheDocument();
    expect(screen.getByText("Build the application")).toBeInTheDocument();
    expect(screen.getByText("Deploy to hosting")).toBeInTheDocument();
    expect(screen.getByText("Run validation checks")).toBeInTheDocument();
    expect(screen.getByText("Verify realtime connections")).toBeInTheDocument();
  });

  it("shows critical badge on critical steps", () => {
    render(<DRSRecoveryProtocol />);
    const criticalBadges = screen.getAllByText("Critical");
    expect(criticalBadges.length).toBeGreaterThan(0);
  });

  it("shows deployment blocked warning when critical steps incomplete", () => {
    render(<DRSRecoveryProtocol />);
    expect(
      screen.getByText(/Critical steps incomplete. Deployment is blocked/)
    ).toBeInTheDocument();
  });

  it("toggles step completion on click", () => {
    render(<DRSRecoveryProtocol />);
    const step = screen.getByText("Clone the repository").closest("[class*='cursor-pointer']");
    expect(step).toBeTruthy();
    fireEvent.click(step!);
    expect(step!.className).toContain("bg-green");
  });

  it("renders Log Protocol Status button", () => {
    render(<DRSRecoveryProtocol />);
    expect(screen.getByText("Log Protocol Status")).toBeInTheDocument();
  });

  it("displays terminal commands for steps that have them", () => {
    render(<DRSRecoveryProtocol />);
    expect(screen.getByText("git clone <repo-url> && cd groundstay")).toBeInTheDocument();
    expect(screen.getByText("bun install")).toBeInTheDocument();
  });
});
