import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { booking_id, success_url, cancel_url } = await req.json();
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch booking — verify the caller owns it
    const { data: booking, error: bookingErr } = await adminClient
      .from("bookings")
      .select("*, units(name), profiles!bookings_guest_id_profiles_fkey(full_name, email)")
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guest can only pay for own booking
    if (booking.guest_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.state !== "pending_deposit") {
      return new Response(JSON.stringify({ error: "Booking is not awaiting deposit" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for existing payment
    const { data: existingPayments } = await adminClient
      .from("payments")
      .select("id")
      .eq("booking_id", booking_id)
      .eq("status", "recorded");
    if (existingPayments && existingPayments.length > 0) {
      return new Response(JSON.stringify({ error: "Payment already recorded" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get provider settings
    const { data: policies } = await adminClient
      .from("policy_settings")
      .select("key, value")
      .in("key", [
        "payment_provider",
        "stripe_secret_key",
        "stripe_publishable_key",
        "deposit_percentage",
        "currency_code",
      ]);

    const policyMap = new Map((policies ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]));
    const provider = policyMap.get("payment_provider") || "manual";

    if (provider !== "stripe") {
      return new Response(JSON.stringify({ error: "Online payments not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeSecretKey = policyMap.get("stripe_secret_key");
    if (!stripeSecretKey || stripeSecretKey.length < 10) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const depositPercentage = Number(policyMap.get("deposit_percentage") || "100");
    const currencyCode = (policyMap.get("currency_code") || "THB").toLowerCase();
    const depositAmount = Math.round((Number(booking.total_price || 0) * depositPercentage) / 100);

    if (depositAmount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid deposit amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate idempotency key
    const idempotencyKey = `deposit_${booking_id}_${depositAmount}`;

    // Create Stripe checkout session
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    const unitName = (booking as any).units?.name || "Accommodation";
    const guestEmail = (booking as any).profiles?.email;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: guestEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: currencyCode,
            product_data: {
              name: `Deposit — ${unitName}`,
              description: `${booking.check_in} to ${booking.check_out} (${booking.num_guests} guest${booking.num_guests > 1 ? "s" : ""})`,
            },
            unit_amount: depositAmount * 100, // Stripe uses smallest currency unit
          },
          quantity: 1,
        },
      ],
      metadata: {
        booking_id: booking_id,
        idempotency_key: idempotencyKey,
      },
      success_url: success_url || `${req.headers.get("origin")}/guest?payment=success`,
      cancel_url: cancel_url || `${req.headers.get("origin")}/guest?payment=cancelled`,
    }, {
      idempotencyKey: idempotencyKey,
    });

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("process-payment error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
