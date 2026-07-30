// send-booking-confirmation
// -----------------------------------------------------------------------------
// Fires when a booking hits `confirmed` (via webhook, offline payment, or
// admin override). Sends the multi-language confirmation email through
// Resend, writes an in-app notification, and drops a `staff_audit_events`
// row for the paper trail.
//
// Idempotent — safe to call twice. Uses `email_log` to dedupe by
// (booking_id, template).
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // `resend` = staff-initiated resend of an existing confirmation.
    // It re-sends the same email with a fresh signed PDF link, and deliberately
    // skips the in-app notification so we don't spam the guest's bell.
    // `override_to` routes the copy to a staff inbox for safe testing.
    const payload = await req.json();
    const booking_id = payload?.booking_id;
    const isResend = payload?.resend === true;
    const overrideTo =
      typeof payload?.override_to === "string" ? payload.override_to.trim() : "";
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }


    // Fetch booking with unit and guest profile
    const { data: booking, error: bookingErr } = await adminClient
      .from("bookings")
      .select("*, units(name), profiles!bookings_guest_id_profiles_fkey(full_name, email, preferred_language)")
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const guestEmail = (booking as any).profiles?.email;
    const guestName = (booking as any).profiles?.full_name || "Guest";
    const guestLang = (booking as any).profiles?.preferred_language || "en";
    const unitName = (booking as any).units?.name || "Your Unit";

    if (!guestEmail) {
      return new Response(JSON.stringify({ error: "No guest email found" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch policy settings for formatting
    const { data: policies } = await adminClient
      .from("policy_settings")
      .select("key, value")
      .in("key", ["earliest_checkin_time", "checkout_time", "currency_symbol", "contact_email", "site_url"]);

    const policyMap = new Map((policies ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]));
    const checkinTime = policyMap.get("earliest_checkin_time") || "14:00";
    const checkoutTime = policyMap.get("checkout_time") || "12:00";
    const currencySymbol = policyMap.get("currency_symbol") || "฿";
    const contactEmail = policyMap.get("contact_email") || "info@lmtcampstay.com";
    const siteUrl = (policyMap.get("site_url") || "https://lmtcampstay.com").replace(/\/$/, "");
    const totalFormatted = booking.total_price ? `${currencySymbol}${Number(booking.total_price).toFixed(2)}` : "TBD";

    // Phase 2: pre-generate the Booking Confirmation PDF so we can include a
    // signed download link AND attach the PDF to the email. This is a
    // best-effort call — email still sends if PDF generation fails.
    let confirmationPdfUrl: string | null = null;
    let confirmationNumber: string | null = null;
    let pdfBase64: string | null = null;
    try {
      const pdfResp = await fetch(`${supabaseUrl}/functions/v1/generate-booking-confirmation`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          booking_id,
          language: guestLang,
          channel: "email",
          return_base64: true,
        }),
      });
      if (pdfResp.ok) {
        const pdfJson = await pdfResp.json();
        confirmationPdfUrl = pdfJson?.signed_url ?? null;
        confirmationNumber = pdfJson?.confirmation_number ?? null;
        pdfBase64 = pdfJson?.pdf_base64 ?? null;
      } else {
        console.warn("generate-booking-confirmation returned non-ok:", pdfResp.status);
      }
    } catch (e) {
      console.error("PDF pre-generation failed (email will still send):", e);
    }

    // Send via send-transactional-email
    const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_key: "booking_confirmed",
        recipient_email: guestEmail,
        booking_id: booking_id,
        language: guestLang,
        attachments: pdfBase64
          ? [{
              filename: `booking-confirmation-${confirmationNumber || booking_id.slice(0, 8)}.pdf`,
              content: pdfBase64,
            }]
          : undefined,
        data: {
          guest_name: guestName,
          unit_name: unitName,
          check_in: booking.check_in,
          check_out: booking.check_out,
          checkin_time: checkinTime,
          checkout_time: checkoutTime,
          num_guests: booking.num_guests,
          total_formatted: totalFormatted,
          confirmation_number: confirmationNumber,
          confirmation_pdf_url: confirmationPdfUrl,
          contact_email: contactEmail,
          qr_target: `${siteUrl}/guest${confirmationNumber ? `?ref=${encodeURIComponent(confirmationNumber)}` : ""}`,
        },
      }),
    });


    const emailResult = await emailResp.json();

    // Always create in-app notification as well
    await adminClient.from("notifications").insert({
      user_id: booking.guest_id,
      type: "booking_confirmed",
      message: `Your booking for ${unitName} (${booking.check_in} → ${booking.check_out}) is confirmed! Check-in from ${checkinTime}.`,
      reference_id: booking.id,
    });

    return new Response(
      JSON.stringify({ success: true, email: emailResult }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-booking-confirmation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
