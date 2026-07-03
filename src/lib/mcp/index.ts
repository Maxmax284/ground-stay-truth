import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listBookingsTool from "./tools/list-bookings";
import listUnitsTool from "./tools/list-units";
import getExceptionsTool from "./tools/get-exceptions";
import searchGuestsTool from "./tools/search-guests";

// The OAuth issuer MUST be the direct Supabase host, not the Lovable Cloud proxy.
// Build it from the project ref that Vite inlines at build time so this module
// stays import-safe (no runtime env reads at module top level).
const projectRef =
  (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "ground-stay-mcp",
  title: "Ground Stay",
  version: "0.2.0",
  instructions:
    "Read-only operational access to Ground Stay. Inspect the signed-in user's identity/roles, list bookings and units, search guests (PII-masked), and pull the current operational exceptions (admin-only). Uses the caller's Supabase session, so RLS applies.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listBookingsTool, listUnitsTool, getExceptionsTool, searchGuestsTool],
});
