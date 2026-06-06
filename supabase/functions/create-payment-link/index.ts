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
    const collect = String(body.collect || "deposit") as
      | "deposit"
      | "balance"
      | "full"
      | "security_deposit";
    const overrideAmount = Number(body.amount ?? 0);

    if (!bookingId) return jsonResponse(req, { error: "booking_id required" }, 400);

    const expiresInHours = Math.min(
      Math.max(Number.isFinite(expiresInHoursRaw) ? expiresInHoursRaw : DEFAULT_EXPIRY_HOURS, MIN_EXPIRY_HOURS),
      MAX_EXPIRY_HOURS,
    );

    // Fetch the booking + guest profile (for email auto-send) + unit name
    const { data: booking } = await adminClient
      .from("bookings")
      .select("id, state, total_price, check_in, check_out, num_guests, unit_id, guest_id, units(name), profiles:guest_id(full_name, email, preferred_language)")
      .eq("id", bookingId)
      .single();

    if (!booking) return jsonResponse(req, { error: "Booking not found" }, 404);

    // What's payable depends on what we're collecting.
    // - deposit: only pre-arrival states (soft_hold | pending_approval | pending_deposit)
    // - balance | full | security_deposit: also allowed after the room is confirmed or the guest is checked in
    // Inquiry is allowed for deposit collection — we'll auto-advance it through
    // the workflow to pending_deposit so staff can collect upfront from a fresh inquiry.
    const DEPOSIT_STATES = ["inquiry", "soft_hold", "pending_approval", "pending_deposit"];
    const POST_DEPOSIT_STATES = ["pending_deposit", "confirmed", "checked_in"];
    const collectKind = String(body.collect || "deposit");
    const allowedStates = collectKind === "deposit" ? DEPOSIT_STATES : POST_DEPOSIT_STATES;
    if (!allowedStates.includes(booking.state)) {
      return jsonResponse(req, {
        error: "Booking is not in a payable state for this collection type",
        booking_state: booking.state,
        collect: collectKind,
      }, 400);
    }
    // Only auto-advance to pending_deposit for an actual deposit collection
    if (collectKind === "deposit" && booking.state !== "pending_deposit") {
      const { error: advErr } = await adminClient
        .from("bookings")
        .update({ state: "pending_deposit", updated_at: new Date().toISOString() })
        .eq("id", bookingId)
        .in("state", ["inquiry", "soft_hold", "pending_approval"]);
      if (advErr) {
        console.error("[create-payment-link] state advance failed:", advErr);
        return jsonResponse(req, { error: "Could not move booking to pending_deposit" }, 500);
      }
      booking.state = "pending_deposit";
    }

    // Policies
    const { data: policies } = await adminClient
      .from("policy_settings")
      .select("key, value")
      .in("key", ["deposit_percentage", "currency_code", "security_deposit_amount"]);
    const policyMap = new Map(
      (policies ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]),
    );
    const depositPercentage = Number(policyMap.get("deposit_percentage") || "20");
    const currencyCode = (policyMap.get("currency_code") || "THB").toLowerCase();
    const total = Number(booking.total_price || 0);
    const depositAmount = Math.round((total * depositPercentage) / 100);

    // Compute what we're actually collecting
    let amount = 0;
    let paymentTypeForRecord: string = "deposit";
    let collectLabel = "Deposit";

    if (overrideAmount > 0) {
      amount = Math.round(overrideAmount);
      paymentTypeForRecord = collect === "security_deposit" ? "security_deposit" :
                             collect === "balance" ? "balance" :
                             collect === "full" ? "balance" : "deposit";
      collectLabel = collect === "security_deposit" ? "Security deposit" :
                     collect === "balance" ? "Remaining balance" :
                     collect === "full" ? "Full payment" : "Deposit";
    } else if (collect === "balance") {
      // total - already-paid online deposits
      const { data: paidRows } = await adminClient
        .from("payments")
        .select("amount, payment_type, status, provider")
        .eq("booking_id", bookingId)
        .eq("status", "recorded");
      const paidSum = (paidRows ?? [])
        .filter((p: any) => p.payment_type !== "security_deposit")
        .reduce((s: number, p: any) => s + Number(p.amount), 0);
      amount = Math.max(0, Math.round(total - paidSum));
      paymentTypeForRecord = "balance";
      collectLabel = "Remaining balance";
    } else if (collect === "full") {
      amount = Math.round(total);
      paymentTypeForRecord = "balance";
      collectLabel = "Full payment";
    } else if (collect === "security_deposit") {
      amount = Math.round(Number(policyMap.get("security_deposit_amount") || "0"));
      paymentTypeForRecord = "security_deposit";
      collectLabel = "Security deposit";
    } else {
      amount = depositAmount;
      paymentTypeForRecord = "deposit";
      collectLabel = `Deposit (${depositPercentage}%)`;
    }

    if (amount <= 0) {
      return jsonResponse(req, { error: "Invalid amount for this collection type" }, 400);
    }


    // Only block when we're trying to collect a deposit that's already settled online.
    if (collect === "deposit") {
      const { data: paid } = await adminClient
        .from("payments")
        .select("id")
        .eq("booking_id", bookingId)
        .eq("status", "recorded")
        .eq("payment_type", "deposit")
        .in("provider", ["stripe", "paddle"])
        .limit(1);
      if (paid && paid.length > 0) {
        return jsonResponse(req, { error: "Deposit already paid online" }, 409);
      }
    }

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
        metadata: { created_via: "create-payment-link", role: callerRole, collect, payment_type: paymentTypeForRecord, label: collectLabel },
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

    // ── Auto-send: email + guest portal notification (WhatsApp/LINE stay human-gated) ──
    const guest: any = (booking as any).profiles ?? {};
    const unitName = (booking as any).units?.name ?? "Your stay";
    let emailSent = false;
    let notificationCreated = false;

    if (guest.email) {
      try {
        const amountFormatted = `${currencyCode.toUpperCase()} ${amount.toLocaleString()}`;
        const expiresHuman = `in ${expiresInHours}h`;
        const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            apikey: serviceRoleKey,
          },
          body: JSON.stringify({
            template_key: "payment_link_sent",
            recipient_email: guest.email,
            booking_id: bookingId,
            language: guest.preferred_language || "en",
            idempotency_key: `paylink-${link.id}`,
            data: {
              guest_name: guest.full_name || "",
              unit_name: unitName,
              payment_label: collectLabel,
              amount_formatted: amountFormatted,
              check_in: booking.check_in,
              check_out: booking.check_out,
              payment_url: url,
              expires_at_human: expiresHuman,
            },
          }),
        });
        emailSent = emailResp.ok;
      } catch (e) {
        console.error("[create-payment-link] email send failed:", e);
      }
    }

    if (booking.guest_id) {
      try {
        await adminClient.from("notifications").insert({
          user_id: booking.guest_id,
          type: "payment_link",
          reference_id: bookingId,
          message: `Your ${collectLabel.toLowerCase()} link is ready — tap to pay securely.`,
        });
        notificationCreated = true;
      } catch (e) {
        console.error("[create-payment-link] notification insert failed:", e);
      }
    }

    await adminClient.from("payment_link_events").insert({
      payment_link_id: link.id,
      booking_id: bookingId,
      event_type: "auto_dispatched",
      actor_id: user.id,
      actor_role: callerRole,
      context: { email_sent: emailSent, notification_created: notificationCreated, channel: "email+portal" },
    });

    return jsonResponse(req, {
      token: rawToken,
      url,
      expires_at: expiresAt,
      payment_link_id: link.id,
      amount,
      currency: currencyCode,
      collect,
      payment_type: paymentTypeForRecord,
      label: collectLabel,
      email_sent: emailSent,
      notification_created: notificationCreated,
    });

  } catch (err) {
    console.error("[create-payment-link] error:", err);
    return jsonResponse(req, {
      error: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});
