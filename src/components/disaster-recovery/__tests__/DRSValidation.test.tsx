import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DRSValidation from "../DRSValidation";

vi.mock("@/hooks/useRecoveryAuditLog", () => ({
  useRecoveryAuditLog: () => ({
    logs: [],
    isLoading: false,
    logAction: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: () => ({
      select: () => ({
        limit: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
    storage: {
      from: () => ({
        list: () => Promise.resolve({ data: [], error: null }),
      }),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

describe("DRSValidation", () => {
  it("renders validation heading and description", () => {
    render(<DRSValidation />);
    expect(screen.getByText("Validation Layer")).toBeInTheDocument();
    expect(screen.getByText("Post-recovery automated checks.")).toBeInTheDocument();
  });

  it("renders all 7 validation checks", () => {
    render(<DRSValidation />);
    expect(screen.getByText("Authentication")).toBeInTheDocument();
    expect(screen.getByText("Database Read")).toBeInTheDocument();
    expect(screen.getByText("Profiles Access")).toBeInTheDocument();
    expect(screen.getByText("Bookings Access")).toBeInTheDocument();
    expect(screen.getByText("Payments Access")).toBeInTheDocument();
    expect(screen.getByText("Role System")).toBeInTheDocument();
    expect(screen.getByText("Storage Buckets")).toBeInTheDocument();
  });

  it("shows all checks as Pending initially", () => {
    render(<DRSValidation />);
    const pendingBadges = screen.getAllByText("Pending");
    expect(pendingBadges).toHaveLength(7);
  });

  it("renders Run All Checks button", () => {
    render(<DRSValidation />);
    expect(screen.getByText("Run All Checks")).toBeInTheDocument();
  });
});
