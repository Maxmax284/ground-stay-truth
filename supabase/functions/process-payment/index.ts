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
  adminClient: any
): Promise<ProviderAdapter> {
  switch (providerName) {
    case "stripe": {
      // Read secret from integration_secrets (not policy_settings)
      const { data: secretRow } = await adminClient
        .from("integration_secrets")
        .select("encrypted_value")
        .eq("secret_key", "stripe_secret_key")
        .maybeSingle();
      const secretKey = secretRow?.encrypted_value;
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

    // Check for existing successful payment
    const { data: existingPayments } = await adminClient
      .from("payments")
      .select("id, status")
      .eq("booking_id", booking_id)
      .eq("status", "recorded");
    if (existingPayments && existingPayments.length > 0) {
      return new Response(
        JSON.stringify({ error: "Payment already recorded" }),
        {
          status: 409,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    // Check for existing pending session (don't create duplicate checkout sessions)
    const { data: pendingPayments } = await adminClient
      .from("payments")
      .select("id, provider_session_id, expires_at")
      .eq("booking_id", booking_id)
      .eq("status", "pending");

    if (pendingPayments && pendingPayments.length > 0) {
      const pending = pendingPayments[0];
      // If not expired, reuse the existing session — but we don't have the URL stored
      // Mark old pending as cancelled and create fresh
      for (const p of pendingPayments) {
        await adminClient
          .from("payments")
          .update({ status: "cancelled" })
          .eq("id", p.id);
      }
    }

    // Get non-secret policy settings
    const { data: policies } = await adminClient
      .from("policy_settings")
      .select("key, value")
      .in("key", [
        "payment_provider",
        "deposit_percentage",
        "currency_code",
      ]);

    const policyMap = new Map(
      (policies ?? []).map((p: any) => [
        p.key,
        String(p.value).replace(/^"|"$/g, ""),
      ])
    );
    const providerName = policyMap.get("payment_provider") || "manual";

    // Resolve the provider adapter
    let adapter: ProviderAdapter;
    try {
      adapter = await resolveProvider(providerName, adminClient);
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
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
