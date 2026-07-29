// generate-booking-confirmation
// -----------------------------------------------------------------------------
// Produces a downloadable Booking Confirmation PDF a guest can show to
// immigration, airlines, or their employer. This is NOT a Stripe receipt and
// NOT a Thai tax invoice — it proves the accommodation is booked.
//
// Phase 3 upgrades:
//   • Persistent human-readable confirmation number `LMT-CS-YYYY-XXXXXX`,
//     stored on `bookings.confirmation_number` on first generation.
//   • Every generation logged to `booking_confirmation_log` for audit.
//   • Multi-language header/label strings (en, th, fr, de, es, ru, zh, ja, ko).
//   • Optional `mode: "pending"` renders a pre-confirmation summary PDF
//     watermarked "PENDING — NOT CONFIRMED" for staff or the guest to preview.
//   • Optional `return_base64: true` returns the raw PDF bytes so internal
//     callers (e.g. send-booking-confirmation) can attach it to email.
//   • Internal calls signed with the service-role bearer skip user checks.
// -----------------------------------------------------------------------------
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb, degrees } from "https://esm.sh/pdf-lib@1.17.1";
import QRCode from "https://esm.sh/qrcode@1.5.3";

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

// Minimal per-language label pack. pdf-lib uses WinAnsi so Thai/Chinese/etc
// glyphs won't render — for those we fall back to English labels but keep
// the locale on record. English remains the canonical legal document.
type Labels = {
  title: string; sub: string; ref: string; issued: string;
  guest: string; host: string; accommodation: string;
  checkin: string; checkout: string; from: string; by: string;
  nights: string; guests: string; total: string; paid: string; balance: string;
  status: string; footer1: string; footer2: string; pending: string;
  vat_request: string; scan_qr: string;
};
const LABELS_EN: Labels = {
  title: "BOOKING CONFIRMATION",
  sub: "Accommodation reservation — LMT CampStay",
  ref: "Ref", issued: "Issued",
  guest: "Guest", host: "Host", accommodation: "Accommodation",
  checkin: "Check-in", checkout: "Check-out", from: "from", by: "by",
  nights: "Nights", guests: "Guests",
  total: "Total accommodation cost", paid: "Paid to date", balance: "Balance due",
  status: "Status",
  footer1: "This document confirms an accommodation booking. It is not a payment receipt.",
  footer2: "For a Thai tax invoice (VAT) please request one from the host.",
  pending: "PENDING — NOT CONFIRMED",
  vat_request: "Request Thai VAT invoice",
  scan_qr: "Scan to open your booking",
};
const LABEL_PACK: Record<string, Partial<Labels>> = {
  fr: { guest: "Client", host: "Hôte", accommodation: "Hébergement", checkin: "Arrivée", checkout: "Départ", nights: "Nuits", guests: "Personnes", total: "Coût total de l’hébergement", paid: "Payé à ce jour", balance: "Solde dû", status: "Statut", sub: "Réservation d’hébergement — LMT CampStay" },
  de: { guest: "Gast", host: "Gastgeber", accommodation: "Unterkunft", checkin: "Anreise", checkout: "Abreise", nights: "Nächte", guests: "Gäste", total: "Gesamtkosten Unterkunft", paid: "Bisher bezahlt", balance: "Restbetrag", status: "Status", sub: "Unterkunftsreservierung — LMT CampStay" },
  es: { guest: "Huésped", host: "Anfitrión", accommodation: "Alojamiento", checkin: "Entrada", checkout: "Salida", nights: "Noches", guests: "Huéspedes", total: "Coste total del alojamiento", paid: "Pagado hasta la fecha", balance: "Saldo pendiente", status: "Estado", sub: "Reserva de alojamiento — LMT CampStay" },
  ru: { sub: "Бронирование размещения — LMT CampStay" }, // labels stay EN (Cyrillic not in WinAnsi)
};

function labelsFor(lang: string): Labels {
  return { ...LABELS_EN, ...(LABEL_PACK[lang] || {}) };
}

function makeConfirmationNumber(bookingId: string, createdAt: string | null): string {
  const year = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  const suffix = bookingId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `LMT-CS-${year}-${suffix}`;
}

/**
 * pdf-lib's standard fonts are WinAnsi-encoded: any glyph outside Latin-1
 * (the Thai baht sign, Thai/Chinese names, smart quotes) makes drawText THROW,
 * which killed every PDF generation. Sanitize before drawing.
 */
function wa(input: unknown): string {
  let t = String(input ?? "");
  t = t.replace(/\u0e3f/g, "");                      // ฿ -> dropped (currency code is printed)
  t = t.replace(/[\u2018\u2019]/g, "'")
       .replace(/[\u201c\u201d]/g, '"')
       .replace(/[\u2013\u2014]/g, "-")
       .replace(/\u2026/g, "...");
  t = t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
  return t.replace(/\s+/g, " ").trim();
}

/** Draw WinAnsi-safe text; silently skips when nothing renderable is left. */
function drawSafe(page: any, text: unknown, opts: any) {
  const t = wa(text);
  if (!t) return;
  page.drawText(t, opts);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const bearer = authHeader.slice(7);
    const isInternal = bearer === serviceRoleKey;

    let userId: string | null = null;
    let userEmail: string | null = null;
    if (!isInternal) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userErr } = await userClient.auth.getUser();
      if (userErr || !user) return json(req, { error: "Unauthorized" }, 401);
      userId = user.id;
      userEmail = user.email ?? null;
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const {
      booking_id,
      language = "en",
      mode = "confirmed",
      channel = "download",
      return_base64 = false,
    } = body ?? {};
    if (!booking_id || typeof booking_id !== "string") {
      return json(req, { error: "booking_id required" }, 400);
    }
    const lang = String(language || "en").toLowerCase().slice(0, 5);
    const pendingMode = mode === "pending";

    // Load booking with unit + guest profile
    const { data: booking, error: bErr } = await admin
      .from("bookings")
      .select("*, units(name, capacity), profiles!bookings_guest_id_profiles_fkey(full_name, email)")
      .eq("id", booking_id)
      .maybeSingle();
    if (bErr || !booking) return json(req, { error: "Booking not found" }, 404);

    // Authorization
    let actorRole = "internal";
    if (!isInternal) {
      const isOwner = booking.guest_id === userId;
      let isStaff = false;
      if (!isOwner) {
        const { data: roleRows } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId!);
        isStaff = (roleRows ?? []).some((r: any) =>
          ["admin", "manager", "front_desk_supervisor", "front_desk"].includes(r.role));
      }
      if (!isOwner && !isStaff) return json(req, { error: "Forbidden" }, 403);
      actorRole = isStaff ? "staff" : "guest";

      // Pending-mode is staff-only from the outside
      if (pendingMode && !isStaff) {
        return json(req, { error: "Pending summary is staff-only" }, 403);
      }
    }

    // Gate: confirmed mode requires state >= confirmed. Pending mode allows
    // any pre-confirmation state; blocks cancelled/no_show/completed.
    const confirmedOk = ["confirmed", "checked_in", "completed"];
    const pendingOk = ["inquiry", "soft_hold", "pending_approval", "pending_deposit"];
    if (pendingMode) {
      if (!pendingOk.includes(booking.state)) {
        return json(req, { error: "Booking is not in a pre-confirmation state", state: booking.state }, 409);
      }
    } else {
      if (!confirmedOk.includes(booking.state)) {
        return json(req, { error: "Booking not confirmed yet", state: booking.state }, 409);
      }
    }
    if (["cancelled", "no_show"].includes(booking.state)) {
      return json(req, { error: "Booking is closed", state: booking.state }, 410);
    }

    // Persistent confirmation number
    let confirmationNumber: string | null = (booking as any).confirmation_number ?? null;
    if (!confirmationNumber && !pendingMode) {
      confirmationNumber = makeConfirmationNumber(booking.id, booking.created_at);
      await admin.from("bookings").update({
        confirmation_number: confirmationNumber,
        confirmation_first_generated_at: new Date().toISOString(),
      }).eq("id", booking.id).is("confirmation_number", null);
    }
    // For pending mode, show a preview ref without persisting
    const displayRef = confirmationNumber || makeConfirmationNumber(booking.id, booking.created_at) + "-P";

    const L = labelsFor(lang);
    const guestName = (booking as any).profiles?.full_name || "Guest";
    const guestEmail = (booking as any).profiles?.email || "";
    const unitName = (booking as any).units?.name || "Accommodation";

    const currency = await getPolicy(admin, "currency_code", "THB");
    const symbol = await getPolicy(admin, "currency_symbol", "฿");
    const checkinTime = await getPolicy(admin, "earliest_checkin_time", "14:00");
    const checkoutTime = await getPolicy(admin, "checkout_time", "12:00");
    const companyName = await getPolicy(admin, "company_legal_name", "Lamai Muay Thai Fight Camp");
    const companyAddress = await getPolicy(admin, "company_address", "Koh Samui, Thailand");
    const companyPhone = await getPolicy(admin, "company_phone", "");
    const contactEmail = await getPolicy(admin, "contact_email", "info@lmtcampstay.com");
    const siteUrl = await getPolicy(admin, "site_url", "https://lmtcampstay.com");

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
    const { width, height } = page.getSize();
    const ink = rgb(0.07, 0.07, 0.07);
    const muted = rgb(0.4, 0.4, 0.4);
    const accent = rgb(0.72, 0.11, 0.11);

    // Pending watermark, drawn behind content
    if (pendingMode) {
      drawSafe(page, L.pending, {
        x: 60, y: height / 2,
        size: 56, font: bold,
        color: rgb(0.95, 0.55, 0.15),
        opacity: 0.18,
        rotate: degrees(30),
      });
    }

    // ---- Branded masthead -------------------------------------------------
    // Logo is best-effort: if the fetch fails we fall back to a drawn
    // "LMT CAMPSTAY" wordmark so the document is never unbranded.
    const headerTop = height - 40;
    let logoDrawn = false;
    try {
      const logoUrl = `${siteUrl.replace(/\/$/, "")}/__l5e/assets-v1/7581ceff-4953-4770-ad23-8e581a21c2e4/lamai-camp-logo.jpg`;
      const resp = await fetch(logoUrl);
      if (resp.ok) {
        const logoBytes = new Uint8Array(await resp.arrayBuffer());
        const img = await pdf.embedJpg(logoBytes);
        const h = 46;
        const w = (img.width / img.height) * h;
        page.drawImage(img, { x: 50, y: headerTop - h, width: Math.min(w, 110), height: h });
        logoDrawn = true;
      }
    } catch (e) {
      console.warn("logo embed failed, using wordmark:", e);
    }
    if (!logoDrawn) {
      drawSafe(page, "LMT", { x: 50, y: headerTop - 22, size: 20, font: bold, color: accent });
      drawSafe(page, "CAMPSTAY", { x: 50, y: headerTop - 40, size: 13, font: bold, color: ink });
      drawSafe(page, "LAMAI MUAY THAI CAMP", { x: 50, y: headerTop - 50, size: 5, font, color: muted });
    }

    const titleX = 175;
    drawSafe(page, pendingMode ? `${L.title} (PREVIEW)` : L.title,
      { x: titleX, y: headerTop - 18, size: 17, font: bold, color: ink });
    drawSafe(page, L.sub, { x: titleX, y: headerTop - 32, size: 8, font, color: muted });
    drawSafe(page, `${L.ref}: ${displayRef}`,
      { x: titleX, y: headerTop - 46, size: 8, font: bold, color: accent });
    drawSafe(page, `${L.issued}: ${new Date().toISOString().slice(0, 10)}`,
      { x: width - 150, y: headerTop - 46, size: 8, font, color: muted });

    // Red rule under the masthead
    let y = headerTop - 60;
    page.drawRectangle({ x: 50, y, width: width - 100, height: 2, color: accent });

    // ---- Guest / host -----------------------------------------------------
    y -= 30;
    drawSafe(page, L.guest.toUpperCase(), { x: 50, y, size: 8, font: bold, color: accent });
    drawSafe(page, guestName, { x: 50, y: y - 16, size: 11, font: bold, color: ink });
    if (guestEmail) drawSafe(page, guestEmail, { x: 50, y: y - 30, size: 9, font, color: muted });

    drawSafe(page, L.host.toUpperCase(), { x: 320, y, size: 8, font: bold, color: accent });
    drawSafe(page, companyName, { x: 320, y: y - 16, size: 11, font: bold, color: ink });
    if (companyAddress) drawSafe(page, companyAddress, { x: 320, y: y - 30, size: 9, font, color: muted });
    if (companyPhone) drawSafe(page, companyPhone, { x: 320, y: y - 42, size: 9, font, color: muted });

    y -= 66;
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: muted });

    // ---- Accommodation ----------------------------------------------------
    y -= 26;
    drawSafe(page, L.accommodation.toUpperCase(), { x: 50, y, size: 8, font: bold, color: accent });
    drawSafe(page, unitName, { x: 50, y: y - 18, size: 14, font: bold, color: ink });

    y -= 52;
    drawSafe(page, "STAY DATES", { x: 50, y, size: 8, font: bold, color: accent });
    y -= 22;
    const cellW = (width - 100) / 2;

    drawSafe(page, L.checkin, { x: 50, y, size: 9, font, color: muted });
    drawSafe(page, `${booking.check_in}`, { x: 50, y: y - 14, size: 12, font: bold, color: ink });
    drawSafe(page, `${L.from} ${checkinTime}`, { x: 50, y: y - 30, size: 9, font, color: muted });

    drawSafe(page, L.checkout, { x: 50 + cellW, y, size: 9, font, color: muted });
    drawSafe(page, `${booking.check_out}`, { x: 50 + cellW, y: y - 14, size: 12, font: bold, color: ink });
    drawSafe(page, `${L.by} ${checkoutTime}`, { x: 50 + cellW, y: y - 30, size: 9, font, color: muted });

    y -= 60;
    const nights = Math.round(
      (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / 86400000
    );
    drawSafe(page, L.nights, { x: 50, y, size: 9, font, color: muted });
    drawSafe(page, String(nights), { x: 50, y: y - 14, size: 12, font: bold, color: ink });

    drawSafe(page, L.guests, { x: 50 + cellW, y, size: 9, font, color: muted });
    drawSafe(page, String(booking.num_guests), { x: 50 + cellW, y: y - 14, size: 12, font: bold, color: ink });

    y -= 50;
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: muted });
    y -= 24;
    drawSafe(page, L.total, { x: 50, y, size: 10, font, color: ink });
    drawSafe(page, `${symbol}${fmtMoney(Number(booking.total_price || 0))} ${currency}`,
      { x: width - 200, y, size: 11, font: bold, color: ink });
    y -= 16;
    drawSafe(page, L.paid, { x: 50, y, size: 10, font, color: muted });
    drawSafe(page, `${symbol}${fmtMoney(paid)} ${currency}`,
      { x: width - 200, y, size: 10, font, color: muted });
    y -= 16;
    const balance = Math.max(0, Number(booking.total_price || 0) - paid);
    drawSafe(page, L.balance, { x: 50, y, size: 10, font, color: muted });
    drawSafe(page, `${symbol}${fmtMoney(balance)} ${currency}`,
      { x: width - 200, y, size: 10, font, color: muted });

    y -= 50;
    drawSafe(page, L.status, { x: 50, y, size: 10, font, color: muted });
    const statusText = pendingMode
      ? "PENDING (NOT YET CONFIRMED)"
      : String(booking.state).replace(/_/g, " ").toUpperCase();
    drawSafe(page, statusText, { x: 120, y, size: 10, font: bold, color: accent });

    // QR code (bottom-right) — deep link to guest booking view
    const qrTarget = `${siteUrl.replace(/\/$/, "")}/guest?ref=${encodeURIComponent(displayRef)}`;
    try {
      const qrDataUrl: string = await QRCode.toDataURL(qrTarget, {
        margin: 1, width: 240, color: { dark: "#111111", light: "#ffffff" },
      });
      const qrPngBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), (c) => c.charCodeAt(0));
      const qrImg = await pdf.embedPng(qrPngBytes);
      const qrSize = 96;
      const qrX = width - 50 - qrSize;
      const qrY = 50;
      page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize });
      drawSafe(page, L.scan_qr, { x: qrX, y: qrY - 10, size: 7, font, color: muted });
    } catch (e) {
      console.warn("QR generation failed:", e);
    }

    // VAT invoice request — email address in the footer for copy/tap
    drawSafe(page, L.footer1, { x: 50, y: 110, size: 8, font, color: muted });
    drawSafe(page, `${L.vat_request}: ${contactEmail}`, { x: 50, y: 96, size: 9, font: bold, color: accent });
    drawSafe(page, `Include reference ${displayRef} in your email.`,
      { x: 50, y: 82, size: 8, font, color: muted });
    drawSafe(page, `Generated ${new Date().toISOString()} — ${companyName}.`,
      { x: 50, y: 66, size: 7, font, color: muted });
    if (pendingMode) {
      drawSafe(page, "Not a confirmation. Booking is not yet finalised.",
        { x: 50, y: 54, size: 8, font: bold, color: accent });
    }

    const bytes = await pdf.save();
    const year = new Date().getFullYear();
    const subdir = pendingMode ? "pending" : String(year);
    const path = `${subdir}/${booking_id}.pdf`;

    const { error: upErr } = await admin.storage
      .from("booking-confirmations")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) return json(req, { error: `Upload failed: ${upErr.message}` }, 500);

    const { data: signed } = await admin.storage
      .from("booking-confirmations")
      .createSignedUrl(path, 60 * 60);

    // Track regen counter + last-sent timestamp on the booking itself.
    if (!pendingMode) {
      await admin
        .from("bookings")
        .update({
          confirmation_regeneration_count: ((booking as any).confirmation_regeneration_count ?? 0) + 1,
          ...(channel === "email" ? { confirmation_last_sent_at: new Date().toISOString() } : {}),
        })
        .eq("id", booking.id);
    }


    await admin.from("booking_confirmation_log").insert({
      booking_id: booking.id,
      confirmation_number: pendingMode ? null : confirmationNumber,
      mode: pendingMode ? "pending" : "confirmed",
      language: lang,
      actor_id: userId,
      actor_role: actorRole,
      channel,
      path,
    });

    try {
      await admin.from("staff_audit_events").insert({
        event_type: "booking_confirmation_generated",
        severity: "info",
        actor_id: userId,
        actor_email: userEmail,
        metadata: { booking_id, path, mode: pendingMode ? "pending" : "confirmed", language: lang, channel, confirmation_number: confirmationNumber },
      });
    } catch (_) { /* non-critical */ }

    const responseBody: Record<string, unknown> = {
      success: true,
      signed_url: signed?.signedUrl ?? null,
      path,
      booking_id,
      confirmation_number: pendingMode ? null : confirmationNumber,
      mode: pendingMode ? "pending" : "confirmed",
      language: lang,
      expires_in_seconds: 3600,
    };
    if (return_base64 && isInternal) {
      // btoa on Deno handles up to a few MB — confirmation PDFs are <100KB
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      responseBody.pdf_base64 = btoa(binary);
    }
    return json(req, responseBody);
  } catch (e: any) {
    console.error("[generate-booking-confirmation] error", e);
    return json(req, { error: e?.message ?? "Internal error" }, 500);
  }
});
