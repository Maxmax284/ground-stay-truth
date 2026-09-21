import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * End-to-end-ish coverage of the reset page against every link shape Supabase
 * can hand us, plus the expired/used failure path.
 */

const setSession = vi.fn();
const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
const getSession = vi.fn();
const getAuthenticatorAssuranceLevel = vi.fn();
const listFactors = vi.fn();
const challengeAndVerify = vi.fn();
const consumeRecoveryPayload = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      setSession: (...a: unknown[]) => setSession(...a),
      exchangeCodeForSession: (...a: unknown[]) => exchangeCodeForSession(...a),
      verifyOtp: (...a: unknown[]) => verifyOtp(...a),
      getSession: (...a: unknown[]) => getSession(...a),
      refreshSession: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: (...a: unknown[]) => getAuthenticatorAssuranceLevel(...a),
        listFactors: (...a: unknown[]) => listFactors(...a),
        challengeAndVerify: (...a: unknown[]) => challengeAndVerify(...a),
      },
    },
    functions: { invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }) },
  },
}));

vi.mock("@/lib/recoveryLink", () => ({
  consumeRecoveryPayload: () => consumeRecoveryPayload(),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import ResetPassword from "../ResetPassword";
import { HelmetProvider } from "react-helmet-async";

const renderPage = () =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={["/reset-password"]}>
        <ResetPassword />
      </MemoryRouter>
    </HelmetProvider>,
  );


const expectReadyForm = async () => {
  await waitFor(() => expect(screen.getByLabelText(/new password/i)).toBeInTheDocument());
  expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
};

describe("ResetPassword link handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession.mockResolvedValue({ error: null });
    exchangeCodeForSession.mockResolvedValue({ error: null });
    verifyOtp.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: null } });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    challengeAndVerify.mockResolvedValue({ error: null });
  });

  it("accepts implicit hash tokens via setSession", async () => {
    consumeRecoveryPayload.mockReturnValue({ access_token: "a", refresh_token: "r" });
    renderPage();
    await expectReadyForm();
    expect(setSession).toHaveBeenCalledWith({ access_token: "a", refresh_token: "r" });
  });

  it("accepts a PKCE code via exchangeCodeForSession", async () => {
    consumeRecoveryPayload.mockReturnValue({ code: "pkce" });
    renderPage();
    await expectReadyForm();
    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce");
  });

  it("accepts a token_hash via verifyOtp", async () => {
    consumeRecoveryPayload.mockReturnValue({ token_hash: "hash" });
    renderPage();
    await expectReadyForm();
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "hash" });
  });

  it("accepts an already-established recovery session with no token in the URL", async () => {
    consumeRecoveryPayload.mockReturnValue(null);
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    renderPage();
    await expectReadyForm();
  });

  it("requires an authenticator code before changing an MFA-enabled account password", async () => {
    consumeRecoveryPayload.mockReturnValue({ token_hash: "hash" });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    listFactors.mockResolvedValue({
      data: { totp: [{ id: "factor-1", status: "verified" }] },
      error: null,
    });
    renderPage();

    const codeInput = await screen.findByLabelText(/6-digit authenticator code/i);
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));

    await expectReadyForm();
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: "factor-1", code: "123456" });
  });

  it("shows the resend form for an expired link", async () => {
    consumeRecoveryPayload.mockReturnValue({ error: "otp_expired" });
    renderPage();
    await waitFor(() => expect(screen.getByText(/expired or was already used/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /send me a new reset link/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  });

  it("shows the resend form when a used token fails verification", async () => {
    consumeRecoveryPayload.mockReturnValue({ token_hash: "used" });
    verifyOtp.mockResolvedValue({ error: new Error("Token has expired or is invalid") });
    renderPage();
    await waitFor(() => expect(screen.getByText(/expired or was already used/i)).toBeInTheDocument());
  });

  it("shows a helpful message when no reset link is present at all", async () => {
    consumeRecoveryPayload.mockReturnValue(null);
    renderPage();
    await waitFor(() => expect(screen.getByText(/no reset link detected/i)).toBeInTheDocument());
  });
});
