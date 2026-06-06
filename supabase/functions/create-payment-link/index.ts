// create-payment-link
// Admin / manager / front-desk endpoint that mints a single-use, time-bound
// payment link for a specific booking deposit. Returns the RAW token exactly
// once. Only the SHA-256 hash is stored in the database.
//
// POST { booking_id: string, expires_in_hours?: number, regenerate?: boolean }
// Auth: required, role >= front_desk
// Response: { token, url, expires_at, payment_link_id, amount, currency }
//
// Audit: writes payment_link_events.generated (or .regenerated when revoking
// an existing active link in the same call).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsPreflight,
  jsonResponse,
  getCanonicalSiteUrl,
} from "../_shared/cors.ts";

const DEFAULT_EXPIRY_HOURS = 72;
const MIN_EXPIRY_HOURS = 1;
const MAX_EXPIRY_HOURS = 24 * 14; // 2 weeks max

function generateToken(): string {
  // 32 random bytes -> base64url (43 chars). Cryptographically strong.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashToken(raw: string): Promise<string> {
  const enc = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(req, { error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return jsonResponse(req, { error: "Unauthorized" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify the caller has at least front_desk role.
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    const allowedRoles = ["admin", "manager", "front_desk_supervisor", "front_desk"];
    const callerRole = allowedRoles.find((r) => roleSet.has(r));
    if (!callerRole) return jsonResponse(req, { error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const bookingId = String(body.booking_id || "").trim();
    const expiresInHoursRaw = Number(body.expires_in_hours ?? DEFAULT_EXPIRY_HOURS);
    const regenerate = Boolean(body.regenerate);

    if (!bookingId) return jsonResponse(req, { error: "booking_id required" }, 400);

    const expiresInHours = Math.min(
      Math.max(Number.isFinite(expiresInHoursRaw) ? expiresInHoursRaw : DEFAULT_EXPIRY_HOURS, MIN_EXPIRY_HOURS),
      MAX_EXPIRY_HOURS,
    );

    // Fetch the booking + verify it's in a payable state
    const { data: booking } = await adminClient
      .from("bookings")
      .select("id, state, total_price, check_in, check_out, num_guests, unit_id")
      .eq("id", bookingId)
      .single();

    if (!booking) return jsonResponse(req, { error: "Booking not found" }, 404);

    // Allow link generation for any pre-confirmed payable state.
    // If the booking is still upstream of pending_deposit, auto-advance it so
    // operators don't have to click through soft_hold → pending_approval → pending_deposit
    // just to send a deposit link.
    const PAYABLE_PRE_STATES = ["soft_hold", "pending_approval", "pending_deposit"];
    if (!PAYABLE_PRE_STATES.includes(booking.state)) {
      return jsonResponse(req, {
        error: "Booking is not awaiting deposit",
        booking_state: booking.state,
      }, 400);
    }
    if (booking.state !== "pending_deposit") {
      const { error: advErr } = await adminClient
        .from("bookings")
        .update({ state: "pending_deposit", updated_at: new Date().toISOString() })
        .eq("id", bookingId)
        .in("state", ["soft_hold", "pending_approval"]);
      if (advErr) {
        console.error("[create-payment-link] state advance failed:", advErr);
        return jsonResponse(req, { error: "Could not move booking to pending_deposit" }, 500);
      }
      booking.state = "pending_deposit";
    }

    // Compute deposit amount the same way process-payment does.
    const { data: policies } = await adminClient
      .from("policy_settings")
      .select("key, value")
      .in("key", ["deposit_percentage", "currency_code"]);
    const policyMap = new Map(
      (policies ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]),
    );
    const depositPercentage = Number(policyMap.get("deposit_percentage") || "100");
    const currencyCode = (policyMap.get("currency_code") || "THB").toLowerCase();
    const amount = Math.round((Number(booking.total_price || 0) * depositPercentage) / 100);

    if (amount <= 0) {
      return jsonResponse(req, { error: "Invalid deposit amount" }, 400);
    }

    // Confirm there's no already-completed payment.
    const { data: paid } = await adminClient
      .from("payments")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("status", "recorded")
      .limit(1);
    if (paid && paid.length > 0) {
      return jsonResponse(req, { error: "Booking already paid" }, 409);
    }

    // Revoke any active link if regenerating.
    if (regenerate) {
      await adminClient
        .from("payment_links")
        .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
        .eq("booking_id", bookingId)
        .is("used_at", null)
        .is("revoked_at", null);
    }

    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();

    const { data: link, error: insertErr } = await adminClient
      .from("payment_links")
      .insert({
        booking_id: bookingId,
        token_hash: tokenHash,
        amount,
        currency: currencyCode,
        expires_at: expiresAt,
        created_by: user.id,
        metadata: { created_via: "create-payment-link", role: callerRole },
      })
      .select()
      .single();

    if (insertErr || !link) {
      console.error("[create-payment-link] insert failed:", insertErr);
      return jsonResponse(req, { error: "Failed to create link" }, 500);
    }

    await adminClient.from("payment_link_events").insert({
      payment_link_id: link.id,
      booking_id: bookingId,
      event_type: regenerate ? "regenerated" : "generated",
      actor_id: user.id,
      actor_role: callerRole,
      context: { expires_in_hours: expiresInHours, amount, currency: currencyCode },
    });

    const url = `${getCanonicalSiteUrl()}/pay/${rawToken}`;

    return jsonResponse(req, {
      token: rawToken,
      url,
      expires_at: expiresAt,
      payment_link_id: link.id,
      amount,
      currency: currencyCode,
    });
  } catch (err) {
    console.error("[create-payment-link] error:", err);
    return jsonResponse(req, {
      error: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});
