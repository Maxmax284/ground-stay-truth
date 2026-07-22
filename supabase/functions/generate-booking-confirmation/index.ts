// generate-booking-confirmation
// -----------------------------------------------------------------------------
// Produces a downloadable Booking Confirmation PDF a guest can show to
// immigration, airlines, or their employer. This is NOT a Stripe receipt and
// NOT a Thai tax invoice — it proves the accommodation is booked.
//
// - Gated on `bookings.state = 'confirmed'` (with any recorded payment) OR
//   admin/manager/front_desk role for staff-side reprints.
// - Stored in the private `booking-confirmations` bucket, path
//   `<year>/<booking_id>.pdf`.
// - Idempotent: regenerates on demand (overwrites) so a re-issue always
//   reflects the current booking data.
// - Returns a short-lived signed URL.
// -----------------------------------------------------------------------------
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://lmtcampstay.com",
  "https://lmtcampstay.com",
  "https://www.lmtcampstay.com",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  if (/^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

async function getPolicy(admin: any, key: string, fallback = ""): Promise<string> {
  const { data } = await admin.from("policy_settings").select("value").eq("key", key).limit(1).maybeSingle();
  if (!data) return fallback;
  const v: any = data.value;
  if (typeof v === "string") return v.replace(/^"|"$/g, "");
  if (v == null) return fallback;
  return String(v).replace(/^"|"$/g, "");
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json(req, { error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { booking_id } = await req.json().catch(() => ({}));
    if (!booking_id || typeof booking_id !== "string") {
      return json(req, { error: "booking_id required" }, 400);
    }

    // Load booking with unit + guest profile
    const { data: booking, error: bErr } = await admin
      .from("bookings")
      .select("*, units(name, capacity), profiles!bookings_guest_id_profiles_fkey(full_name, email)")
      .eq("id", booking_id)
      .maybeSingle();
    if (bErr || !booking) return json(req, { error: "Booking not found" }, 404);

    // Authorization: guest owns booking OR staff role
    const isOwner = booking.guest_id === user.id;
    let isStaff = false;
    if (!isOwner) {
      const { data: roleRows } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      isStaff = (roleRows ?? []).some((r: any) =>
        ["admin", "manager", "front_desk_supervisor", "front_desk"].includes(r.role));
    }
    if (!isOwner && !isStaff) return json(req, { error: "Forbidden" }, 403);

    // Gate: booking must be confirmed (or later). Guests can only download
    // once the state machine has cleared the deposit.
    const okStates = ["confirmed", "checked_in", "completed"];
    if (!okStates.includes(booking.state)) {
      return json(req, {
        error: "Booking not confirmed yet",
        state: booking.state,
      }, 409);
    }

    const guestName = (booking as any).profiles?.full_name || "Guest";
    const guestEmail = (booking as any).profiles?.email || "";
    const unitName = (booking as any).units?.name || "Accommodation";

    const currency = await getPolicy(admin, "currency_code", "THB");
    const symbol = await getPolicy(admin, "currency_symbol", "฿");
    const checkinTime = await getPolicy(admin, "earliest_checkin_time", "16:00");
    const checkoutTime = await getPolicy(admin, "checkout_time", "11:00");
    const companyName = await getPolicy(admin, "company_legal_name", "Lamai Muay Thai Fight Camp");
    const companyAddress = await getPolicy(admin, "company_address", "Koh Samui, Thailand");
    const companyPhone = await getPolicy(admin, "company_phone", "");

    // Payment total recorded so far (informational)
    const { data: pays } = await admin
      .from("payments")
      .select("amount, status")
      .eq("booking_id", booking_id);
    const paid = (pays ?? [])
      .filter((p: any) => ["recorded", "partially_refunded"].includes(p.status))
      .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

    // ---- Build PDF ----
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const { width } = page.getSize();
    const ink = rgb(0.07, 0.07, 0.07);
    const muted = rgb(0.4, 0.4, 0.4);
    const accent = rgb(0.72, 0.11, 0.11);

    let y = 800;
    page.drawText("BOOKING CONFIRMATION", { x: 50, y, size: 20, font: bold, color: ink });
    page.drawText("Accommodation reservation — LMT CampStay", { x: 50, y: y - 20, size: 10, font, color: muted });
    page.drawText(`Ref: ${booking_id.slice(0, 8).toUpperCase()}`, { x: width - 180, y, size: 11, font: bold, color: accent });
    page.drawText(`Issued: ${new Date().toISOString().slice(0, 10)}`, { x: width - 180, y: y - 16, size: 9, font, color: muted });

    y -= 70;
    page.drawText("Guest", { x: 50, y, size: 10, font: bold, color: ink });
    page.drawText(guestName, { x: 50, y: y - 14, size: 11, font, color: ink });
    if (guestEmail) page.drawText(guestEmail, { x: 50, y: y - 28, size: 9, font, color: muted });

    page.drawText("Host", { x: 320, y, size: 10, font: bold, color: ink });
    page.drawText(companyName, { x: 320, y: y - 14, size: 11, font, color: ink });
    if (companyAddress) page.drawText(companyAddress, { x: 320, y: y - 28, size: 9, font, color: muted });
    if (companyPhone) page.drawText(companyPhone, { x: 320, y: y - 40, size: 9, font, color: muted });

    y -= 80;
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: muted });

    y -= 26;
    page.drawText("Accommodation", { x: 50, y, size: 10, font: bold, color: ink });
    page.drawText(unitName, { x: 50, y: y - 16, size: 14, font: bold, color: ink });

    y -= 46;
    const cellW = (width - 100) / 2;
    page.drawText("Check-in", { x: 50, y, size: 9, font, color: muted });
    page.drawText(`${booking.check_in}`, { x: 50, y: y - 14, size: 12, font: bold, color: ink });
    page.drawText(`from ${checkinTime}`, { x: 50, y: y - 30, size: 9, font, color: muted });

    page.drawText("Check-out", { x: 50 + cellW, y, size: 9, font, color: muted });
    page.drawText(`${booking.check_out}`, { x: 50 + cellW, y: y - 14, size: 12, font: bold, color: ink });
    page.drawText(`by ${checkoutTime}`, { x: 50 + cellW, y: y - 30, size: 9, font, color: muted });

    y -= 60;
    const nights = Math.round(
      (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / 86400000
    );
    page.drawText("Nights", { x: 50, y, size: 9, font, color: muted });
    page.drawText(String(nights), { x: 50, y: y - 14, size: 12, font: bold, color: ink });

    page.drawText("Guests", { x: 50 + cellW, y, size: 9, font, color: muted });
    page.drawText(String(booking.num_guests), { x: 50 + cellW, y: y - 14, size: 12, font: bold, color: ink });

    y -= 50;
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: muted });
    y -= 24;
    page.drawText("Total accommodation cost", { x: 50, y, size: 10, font, color: ink });
    page.drawText(`${symbol}${fmtMoney(Number(booking.total_price || 0))} ${currency}`,
      { x: width - 200, y, size: 11, font: bold, color: ink });
    y -= 16;
    page.drawText("Paid to date", { x: 50, y, size: 10, font, color: muted });
    page.drawText(`${symbol}${fmtMoney(paid)} ${currency}`,
      { x: width - 200, y, size: 10, font, color: muted });
    y -= 16;
    const balance = Math.max(0, Number(booking.total_price || 0) - paid);
    page.drawText("Balance due", { x: 50, y, size: 10, font, color: muted });
    page.drawText(`${symbol}${fmtMoney(balance)} ${currency}`,
      { x: width - 200, y, size: 10, font, color: muted });

    y -= 50;
    page.drawText("Status", { x: 50, y, size: 10, font, color: muted });
    page.drawText(String(booking.state).replace("_", " ").toUpperCase(),
      { x: 120, y, size: 10, font: bold, color: accent });

    // Footer / disclaimers
    page.drawText("This document confirms an accommodation booking. It is not a payment receipt.",
      { x: 50, y: 90, size: 8, font, color: muted });
    page.drawText("For a Thai tax invoice (ใบกำกับภาษี) please request one from the host.",
      { x: 50, y: 78, size: 8, font, color: muted });
    page.drawText(`Generated ${new Date().toISOString()} — verify at ${companyName}.`,
      { x: 50, y: 66, size: 7, font, color: muted });

    const bytes = await pdf.save();
    const year = new Date().getFullYear();
    const path = `${year}/${booking_id}.pdf`;

    const { error: upErr } = await admin.storage
      .from("booking-confirmations")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) return json(req, { error: `Upload failed: ${upErr.message}` }, 500);

    const { data: signed } = await admin.storage
      .from("booking-confirmations")
      .createSignedUrl(path, 60 * 60);

    // Best-effort audit trail
    try {
      await admin.from("staff_audit_events").insert({
        event_type: "booking_confirmation_generated",
        severity: "info",
        actor_id: user.id,
        actor_email: user.email ?? null,
        metadata: { booking_id, path, requested_by: isStaff ? "staff" : "guest" },
      });
    } catch (_) { /* non-critical */ }

    return json(req, {
      success: true,
      signed_url: signed?.signedUrl ?? null,
      path,
      booking_id,
      expires_in_seconds: 3600,
    });
  } catch (e: any) {
    console.error("[generate-booking-confirmation] error", e);
    return json(req, { error: e?.message ?? "Internal error" }, 500);
  }
});
