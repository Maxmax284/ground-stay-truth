import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DRSOverview from "../DRSOverview";

vi.mock("@/hooks/useRecoveryAuditLog", () => ({
  useRecoveryAuditLog: () => ({
    logs: [],
    isLoading: false,
    logAction: { mutateAsync: vi.fn() },
  }),
}));

describe("DRSOverview", () => {
  it("renders all four health check cards", () => {
    render(<DRSOverview />);
    expect(screen.getByText("Authentication")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getByText("Source Control")).toBeInTheDocument();
    expect(screen.getByText("Edge Functions")).toBeInTheDocument();
  });

  it("shows Operational badge for each health check", () => {
    render(<DRSOverview />);
    const badges = screen.getAllByText("Operational");
    expect(badges).toHaveLength(4);
  });

  it("shows empty state when no recovery actions exist", () => {
    render(<DRSOverview />);
    expect(screen.getByText("No recovery actions recorded.")).toBeInTheDocument();
  });

  it("renders Recovery Status heading", () => {
    render(<DRSOverview />);
    expect(screen.getByText("Recovery Status")).toBeInTheDocument();
  });
});

describe("DRSOverview with logs", () => {
  it("displays the last recovery action when logs exist", () => {
    vi.doMock("@/hooks/useRecoveryAuditLog", () => ({
      useRecoveryAuditLog: () => ({
        logs: [
          {
            id: "1",
            created_at: "2026-04-04T10:00:00Z",
            action: "Validation suite executed: 7 passed, 0 failed",
            category: "validation",
            outcome: "success",
            user_id: null,
            user_role: "admin",
            details: {},
            failure_reason: null,
          },
        ],
        isLoading: false,
        logAction: { mutateAsync: vi.fn() },
      }),
    }));
  });
});
