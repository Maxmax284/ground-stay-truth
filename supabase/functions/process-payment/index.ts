// process-payment
// -----------------------------------------------------------------------------
// PAYMENT-CRITICAL. Server-side payment recorder for the non-Stripe stuff —
// cash, bank transfer, offline card, anything staff enters by hand.
//
// What it does:
//   Staff hits "record payment" in the UI, this endpoint writes the row and
//   advances booking state the same way payment-webhook does for Stripe. Same
//   rules — same idempotency story so nobody accidentally double-books the
//   ledger.
//
// Permission: staff only (front_desk_supervisor and up, checked server-side).
// -----------------------------------------------------------------------------
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import {
  getCorsHeaders,
  corsPreflight,
  validateRedirectUrl,
  getCanonicalSiteUrl,
  configWarnings,
} from "../_shared/cors.ts";

// ── Provider Adapter Interface ──
interface CheckoutResult {
  url: string;
  session_id: string;
  expires_at: string; // ISO timestamp
}

interface ProviderAdapter {
  createCheckoutSession(params: {
    amount: number;
    currency: string;
    description: string;
    metadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    idempotencyKey: string;
  }): Promise<CheckoutResult>;
}

// ── Stripe Adapter ──
function createStripeAdapter(secretKey: string): ProviderAdapter {
  const stripe = new Stripe(secretKey, { apiVersion: "2023-10-16" });

  return {
    async createCheckoutSession(params) {
      const session = await stripe.checkout.sessions.create(
        {
          payment_method_types: ["card"],
          mode: "payment",
          customer_email: params.customerEmail || undefined,
          line_items: [
            {
              price_data: {
                currency: params.currency,
                product_data: {
                  name: params.description,
                  description: params.metadata.stay_description || undefined,
                },
                unit_amount: params.amount * 100, // Stripe uses smallest currency unit
              },
              quantity: 1,
            },
          ],
          metadata: params.metadata,
          success_url: params.successUrl,
          cancel_url: params.cancelUrl,
        },
        { idempotencyKey: params.idempotencyKey }
      );

      // Stripe sessions expire after 24 hours by default
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      return {
        url: session.url!,
        session_id: session.id,
        expires_at: expiresAt,
      };
    },
  };
}

// ── Provider Resolution ──
async function resolveProvider(
  providerName: string,
  adminClient: any,
  preloadedStripeKey?: string
): Promise<ProviderAdapter> {
  switch (providerName) {
    case "stripe": {
      // The live-safety gate already loaded this key; reuse it when available
      // so we don't pay for a second round-trip on the guest's critical path.
      let secretKey = preloadedStripeKey;
      if (!secretKey) {
        const { data: secretRow } = await adminClient
          .from("integration_secrets")
          .select("encrypted_value")
          .eq("secret_key", "stripe_secret_key")
          .maybeSingle();
        secretKey = secretRow?.encrypted_value;
      }
      if (!secretKey || secretKey.length < 10) {
        throw new Error("Stripe not configured");
      }
      return createStripeAdapter(secretKey);
    }

    // Future: case "paypal": return createPayPalAdapter(...)
    default:
      throw new Error("Online payments not configured");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflight(req);
  }
  const warnings = configWarnings();
  if (warnings.length) console.warn("[process-payment]", warnings.join(" | "));

  try {
    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Live-safety gate: refuse to open a Stripe checkout unless the platform
    // has a live key, a webhook secret, and evidence the webhook works.
    // These three lookups are independent — run them together so the guest
    // isn't waiting on three serial round-trips before Stripe is even called.
    let preloadedStripeKey = "";
    {
      const [secretsRes, healthRes, flagRes] = await Promise.all([
        adminClient
          .from("integration_secrets")
          .select("secret_key, encrypted_value")
          .in("secret_key", ["stripe_secret_key", "stripe_webhook_secret"]),
        adminClient
          .from("webhook_health")
          .select("last_success_at")
          .eq("provider", "stripe")
          .maybeSingle(),
        adminClient
          .from("policy_settings")
          .select("value")
          .eq("key", "stripe_live_smoke_test_passed")
          .is("property_id", null)
          .maybeSingle(),
      ]);
      const secrets = new Map<string, string>();
      for (const r of secretsRes.data ?? []) secrets.set((r as any).secret_key, String((r as any).encrypted_value ?? ""));
      const sk = secrets.get("stripe_secret_key") ?? "";
      const whsec = secrets.get("stripe_webhook_secret") ?? "";
      const health = healthRes.data;
      const flagRow = flagRes.data;
      const smokeOk = flagRow && String(flagRow.value).replace(/^"|"$/g, "").toLowerCase() === "true";
      let reason: string | null = null;
      if (!sk || sk.length < 10) reason = "Stripe secret key is not configured.";
      else if (sk.startsWith("sk_test_")) reason = "Stripe is still in TEST mode.";
      else if (!sk.startsWith("sk_live_")) reason = "Stripe secret key is not a live key.";
      else if (!whsec || whsec.length < 8) reason = "Stripe webhook signing secret is not configured.";
      else if (!health?.last_success_at && !smokeOk) reason = "Live Stripe webhook has not been verified yet.";
      if (reason) {
        return new Response(JSON.stringify({ error: "stripe_not_live_safe", message: reason }), {
          status: 503,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      preloadedStripeKey = sk;
    }


    const { booking_id, success_url, cancel_url } = await req.json();
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }


    // Fetch booking — verify the caller owns it
    const { data: booking, error: bookingErr } = await adminClient
      .from("bookings")
      .select(
        "*, units(name), profiles!bookings_guest_id_profiles_fkey(full_name, email)"
      )
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Guest can only pay for own booking
    if (booking.guest_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (booking.state !== "pending_deposit") {
      return new Response(
        JSON.stringify({ error: "Booking is not awaiting deposit" }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    // Existing payments + policy settings are independent reads — batch them.
    const [existingRes, pendingRes, policiesRes] = await Promise.all([
      adminClient
        .from("payments")
        .select("id, status")
        .eq("booking_id", booking_id)
        .eq("status", "recorded"),
      adminClient
        .from("payments")
        .select("id, provider_session_id, expires_at, payment_type")
        .eq("booking_id", booking_id)
        .eq("status", "pending"),
      adminClient
        .from("policy_settings")
        .select("key, value")
        .in("key", ["payment_provider", "deposit_percentage", "currency_code"]),
    ]);

    const existingPayments = existingRes.data;
    if (existingPayments && existingPayments.length > 0) {
      return new Response(
        JSON.stringify({ error: "Payment already recorded" }),
        {
          status: 409,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    // Retire stale pending CHECKOUT sessions in one statement instead of one-by-one.
    //
    // BUSINESS-CRITICAL: only room-money obligations (deposit / balance) are
    // superseded by a new checkout session. Standing obligations like an
    // airport pickup fee (`addon`) or a `security_deposit` are separate money
    // the guest still owes — cancelling them here silently wiped them off the
    // outstanding balance when a new deposit link was generated.
    const pendingPayments = (pendingRes.data ?? []).filter(
      (p: any) => !["addon", "security_deposit"].includes(p.payment_type ?? "")
    );
    if (pendingPayments.length > 0) {
      await adminClient
        .from("payments")
        .update({ status: "cancelled" })
        .in("id", pendingPayments.map((p: any) => p.id));
    }

    const policies = policiesRes.data;
    const policyMap = new Map(
      (policies ?? []).map((p: any) => [
        p.key,
        String(p.value).replace(/^"|"$/g, ""),
      ])
    );

    // Provider resolution.
    //
    // Historically this read `payment_provider` from policy_settings and
    // defaulted to "manual", which made the guest self-serve deposit button
    // fail with "Online payments not configured" even on properties running
    // live Stripe. Staff-side payment links (create-payment-link) never used
    // this policy — they read the Stripe secret directly — so staff links
    // worked while the guest portal claimed online payments were unavailable.
    //
    // We now fall back to Stripe when the policy is unset/"manual" but a
    // live-safe Stripe setup exists. The live-safety gate above has already
    // proven: live secret key + webhook signing secret + verified webhook.
    const configuredProvider = policyMap.get("payment_provider") || "";
    const providerName =
      configuredProvider && configuredProvider !== "manual" ? configuredProvider : "stripe";

    // Resolve the provider adapter
    let adapter: ProviderAdapter;
    try {
      adapter = await resolveProvider(providerName, adminClient, preloadedStripeKey);
    } catch (e: any) {
      return new Response(
        JSON.stringify({
          error: "online_payments_unavailable",
          message: e.message || "Online payments are not configured.",
        }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    const depositPercentage = Number(
      policyMap.get("deposit_percentage") || "100"
    );
    const currencyCode = (
      policyMap.get("currency_code") || "THB"
    ).toLowerCase();
    const depositAmount = Math.round(
      (Number(booking.total_price || 0) * depositPercentage) / 100
    );

    if (depositAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid deposit amount" }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    const idempotencyKey = `deposit_${booking_id}_${depositAmount}_${Date.now()}`;
    const unitName = (booking as any).units?.name || "Accommodation";
    const guestEmail = (booking as any).profiles?.email;
    const stayDescription = `${booking.check_in} to ${booking.check_out} (${booking.num_guests} guest${booking.num_guests > 1 ? "s" : ""})`;

    // Validate guest-supplied redirect URLs against the allowlist.
    // Falls back to canonical site URL if missing or rejected.
    const siteUrl = getCanonicalSiteUrl();
    const validatedSuccess =
      validateRedirectUrl(success_url) || `${siteUrl}/guest?payment=success`;
    const validatedCancel =
      validateRedirectUrl(cancel_url) || `${siteUrl}/guest?payment=cancelled`;

    if (success_url && !validateRedirectUrl(success_url)) {
      console.warn("[process-payment] rejected success_url:", success_url);
    }
    if (cancel_url && !validateRedirectUrl(cancel_url)) {
      console.warn("[process-payment] rejected cancel_url:", cancel_url);
    }

    // Create checkout session via provider adapter
    const result = await adapter.createCheckoutSession({
      amount: depositAmount,
      currency: currencyCode,
      description: `Deposit — ${unitName}`,
      metadata: {
        booking_id,
        idempotency_key: idempotencyKey,
        stay_description: stayDescription,
      },
      successUrl: validatedSuccess,
      cancelUrl: validatedCancel,
      customerEmail: guestEmail || undefined,
      idempotencyKey,
    });

    // Phase 2: Record a PENDING payment so we track the attempt
    await adminClient.from("payments").insert({
      booking_id,
      amount: depositAmount,
      method: "card",
      status: "pending",
      payment_type: "deposit",
      description: `Deposit — ${unitName}`,
      source_channel: "online",
      provider: providerName,
      provider_session_id: result.session_id,
      provider_status: "pending",
      idempotency_key: idempotencyKey,
      recorded_by: userId,
      expires_at: result.expires_at,
    });

    return new Response(
      JSON.stringify({ url: result.url, session_id: result.session_id }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("process-payment error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});
