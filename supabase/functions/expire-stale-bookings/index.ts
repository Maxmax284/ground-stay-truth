// expire-stale-bookings
// -----------------------------------------------------------------------------
// Cron janitor. Runs hourly. Cancels bookings that have been sitting in
// `soft_hold` or `pending_deposit` past their TTL so the calendar frees up
// again. Also revokes any unused payment links on those bookings.
//
// Business rule: TTL comes from `policy_settings` (property-scoped override
// allowed). If a booking has movement inside the TTL window — payment link
// opened, message from guest, etc. — leave it alone.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Lovable preview/dev origins
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  if (/^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ─── AUTH: Only allow internal/cron calls with service role key ───────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized — internal use only" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get policy settings
    const { data: policies } = await supabase
      .from("policy_settings")
      .select("key, value")
      .in("key", [
        "soft_hold_expiration_hours",
        "deposit_deadline_hours",
        "deposit_reminder_hours",
        "deposit_percentage",
        "currency_symbol",
      ]);

    const policyMap = new Map((policies ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]));
    const softHoldHours = Number(policyMap.get("soft_hold_expiration_hours") ?? 12);
    const depositHours = Number(policyMap.get("deposit_deadline_hours") ?? 24);
    const reminderHours = Number(policyMap.get("deposit_reminder_hours") ?? 12);
    const depositPercentage = Number(policyMap.get("deposit_percentage") ?? 100);
    const currencySymbol = policyMap.get("currency_symbol") || "฿";

    const now = new Date();
    let expired = 0;
    let reminders = 0;
    let expiredPayments = 0;

    // ── Helper: process items in batches of N concurrently ──
    async function batchProcess<T>(items: T[], batchSize: number, fn: (item: T) => Promise<void>) {
      for (let i = 0; i < items.length; i += batchSize) {
        await Promise.allSettled(items.slice(i, i + batchSize).map(fn));
      }
    }

    // 1. Expire soft holds
    const softHoldCutoff = new Date(
      now.getTime() - softHoldHours * 60 * 60 * 1000
    ).toISOString();

    const { data: staleSoftHolds } = await supabase
      .from("bookings")
      .select("id")
      .eq("state", "soft_hold")
      .lt("updated_at", softHoldCutoff);

    await batchProcess(staleSoftHolds ?? [], 10, async (booking) => {
      const { error } = await supabase
        .from("bookings")
        .update({ state: "cancelled" })
        .eq("id", booking.id)
        .eq("state", "soft_hold");

      if (!error) {
        await supabase.from("booking_state_log").insert({
          booking_id: booking.id,
          from_state: "soft_hold",
          to_state: "cancelled",
          changed_by: null,
          reason: `[SYSTEM] Soft hold expired after ${softHoldHours} hours`,
        });
        expired++;
      }
    });

    // 2. Send deposit reminders (before expiring)
    const reminderCutoff = new Date(
      now.getTime() - reminderHours * 60 * 60 * 1000
    ).toISOString();
    const depositCutoff = new Date(
      now.getTime() - depositHours * 60 * 60 * 1000
    ).toISOString();

    const { data: pendingDeposits } = await supabase
      .from("bookings")
      .select("id, guest_id, total_price, check_in, check_out, unit_id, units(name), profiles!bookings_guest_id_profiles_fkey(email, full_name, preferred_language)")
      .eq("state", "pending_deposit")
      .lt("updated_at", reminderCutoff)
      .gt("updated_at", depositCutoff);

    await batchProcess(pendingDeposits ?? [], 5, async (booking) => {
      const guestEmail = (booking as any).profiles?.email;
      const guestName = (booking as any).profiles?.full_name || "Guest";
      const guestLang = (booking as any).profiles?.preferred_language || "en";
      const unitName = (booking as any).units?.name || "Your Unit";

      if (!guestEmail) return;

      const depositAmount = Math.round((Number(booking.total_price || 0) * depositPercentage) / 100);
      const depositFormatted = `${currencySymbol}${depositAmount.toLocaleString()}`;

      try {
        await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            template_key: "deposit_reminder",
            recipient_email: guestEmail,
            booking_id: booking.id,
            language: guestLang,
            data: {
              guest_name: guestName,
              unit_name: unitName,
              check_in: booking.check_in,
              check_out: booking.check_out,
              deposit_amount: depositFormatted,
            },
          }),
        });
        reminders++;
      } catch (e) {
        console.error("Failed to send deposit reminder:", e);
      }
    });

    // 3. Expire pending deposits past deadline — batch fetch payments first
    const { data: staleDeposits } = await supabase
      .from("bookings")
      .select("id")
      .eq("state", "pending_deposit")
      .lt("updated_at", depositCutoff);

    const staleDepositIds = (staleDeposits ?? []).map((b: any) => b.id);

    // Pre-fetch all payments for stale deposits in one query (avoids N+1)
    let paidBookingIds = new Set<string>();
    if (staleDepositIds.length > 0) {
      const { data: existingPayments } = await supabase
        .from("payments")
        .select("booking_id")
        .in("booking_id", staleDepositIds)
        .in("status", ["recorded", "pending"]);
      paidBookingIds = new Set((existingPayments ?? []).map((p: any) => p.booking_id));
    }

    const unpaidStaleDeposits = (staleDeposits ?? []).filter((b: any) => !paidBookingIds.has(b.id));

    await batchProcess(unpaidStaleDeposits, 10, async (booking) => {
      const { error } = await supabase
        .from("bookings")
        .update({ state: "cancelled" })
        .eq("id", booking.id)
        .eq("state", "pending_deposit");

      if (!error) {
        await supabase.from("booking_state_log").insert({
          booking_id: booking.id,
          from_state: "pending_deposit",
          to_state: "cancelled",
          changed_by: null,
          reason: `[SYSTEM] Deposit deadline expired after ${depositHours} hours`,
        });
        expired++;
      }
    });

    // 4. Expire stale pending payments past expires_at
    const { data: stalePayments } = await supabase
      .from("payments")
      .select("id, booking_id, status, payment_type")
      .eq("status", "pending")
      .not("expires_at", "is", null)
      .lt("expires_at", now.toISOString());

    await batchProcess(stalePayments ?? [], 10, async (payment) => {
      const { error } = await supabase
        .from("payments")
        .update({ status: "cancelled", provider_status: "expired" })
        .eq("id", payment.id)
        .eq("status", "pending");

      if (!error) {
        expiredPayments++;

        if (payment.payment_type === "deposit") {
          const { data: otherPayments } = await supabase
            .from("payments")
            .select("id")
            .eq("booking_id", payment.booking_id)
            .in("status", ["recorded", "pending"])
            .neq("id", payment.id)
            .limit(1);

          if (!otherPayments || otherPayments.length === 0) {
            await supabase
              .from("bookings")
              .update({ state: "cancelled" })
              .eq("id", payment.booking_id)
              .eq("state", "pending_deposit");

            await supabase.from("booking_state_log").insert({
              booking_id: payment.booking_id,
              from_state: "pending_deposit",
              to_state: "cancelled",
              changed_by: null,
              reason: "[SYSTEM] Payment session expired — no successful payments on file",
            });
            expired++;
          }
        }
      }
    });

    return new Response(
      JSON.stringify({ success: true, expired, reminders, expiredPayments, timestamp: now.toISOString() }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
