// preview-confirmation-samples
// -----------------------------------------------------------------------------
// Renders a LIVE preview of the Booking Confirmation PDF + confirmation email
// using the CURRENT saved policy_settings and a synthetic sample booking.
// No booking is written, no email is sent. Staff-only.
//
// Returns:
//   { pdf_base64: string, email_html: string, email_subject: string,
//     sample: {...}, policy: {...} }
// -----------------------------------------------------------------------------
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import QRCode from "https://esm.sh/qrcode@1.5.3";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://lmtcampstay.com",
  "https://lmtcampstay.com",
  "https://www.lmtcampstay.com",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];
function isAllowedOrigin(o: string) {
  if (ALLOWED_ORIGINS.includes(o)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(o)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(o)) return true;
  if (/^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/.test(o)) return true;
  return false;
}
function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(o) ? o : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}
function j(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}
async function pol(admin: any, key: string, fallback = "") {
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
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return j(req, { error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return j(req, { error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isStaff = (roles ?? []).some((r: any) =>
      ["admin", "manager", "front_desk_supervisor", "front_desk"].includes(r.role));
    if (!isStaff) return j(req, { error: "Forbidden" }, 403);

    // Load current saved values
    const [
      currency, symbol, checkinTime, checkoutTime,
      companyName, companyAddress, companyPhone, contactEmail, siteUrl,
    ] = await Promise.all([
      pol(admin, "currency_code", "THB"),
      pol(admin, "currency_symbol", "฿"),
      pol(admin, "earliest_checkin_time", "14:00"),
      pol(admin, "checkout_time", "12:00"),
      pol(admin, "company_legal_name", "Lamai Muay Thai Fight Camp"),
      pol(admin, "company_address", "Koh Samui, Thailand"),
      pol(admin, "company_phone", ""),
      pol(admin, "contact_email", "info@lmtcampstay.com"),
      pol(admin, "site_url", "https://lmtcampstay.com"),
    ]);

    // Synthetic sample booking
    const today = new Date();
    const inDate = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
    const outDate = new Date(today.getTime() + 19 * 86400000).toISOString().slice(0, 10);
    const sample = {
      confirmation_number: "LMT-CS-PREVIEW-000000",
      guest_name: "Sample Guest",
      guest_email: "sample.guest@example.com",
      unit_name: "Sea View Villa (Sample)",
      check_in: inDate,
      check_out: outDate,
      nights: 5,
      num_guests: 2,
      total: 12500,
      paid: 3125,
    };
    const balance = Math.max(0, sample.total - sample.paid);

    // ---- Build PDF ----
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const { width, height } = page.getSize();
    const ink = rgb(0.07, 0.07, 0.07);
    const muted = rgb(0.4, 0.4, 0.4);
    const accent = rgb(0.72, 0.11, 0.11);

    let y = 800;
    page.drawText("BOOKING CONFIRMATION (PREVIEW)", { x: 50, y, size: 18, font: bold, color: ink });
    page.drawText("Accommodation reservation — LMT CampStay", { x: 50, y: y - 20, size: 10, font, color: muted });
    page.drawText(`Ref: ${sample.confirmation_number}`, { x: width - 230, y, size: 11, font: bold, color: accent });
    page.drawText(`Issued: ${new Date().toISOString().slice(0, 10)}`, { x: width - 230, y: y - 16, size: 9, font, color: muted });

    y -= 70;
    page.drawText("Guest", { x: 50, y, size: 10, font: bold, color: ink });
    page.drawText(sample.guest_name, { x: 50, y: y - 14, size: 11, font, color: ink });
    page.drawText(sample.guest_email, { x: 50, y: y - 28, size: 9, font, color: muted });

    page.drawText("Host", { x: 320, y, size: 10, font: bold, color: ink });
    page.drawText(companyName, { x: 320, y: y - 14, size: 11, font, color: ink });
    if (companyAddress) page.drawText(companyAddress, { x: 320, y: y - 28, size: 9, font, color: muted });
    if (companyPhone) page.drawText(companyPhone, { x: 320, y: y - 40, size: 9, font, color: muted });

    y -= 80;
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: muted });

    y -= 26;
    page.drawText("Accommodation", { x: 50, y, size: 10, font: bold, color: ink });
    page.drawText(sample.unit_name, { x: 50, y: y - 16, size: 14, font: bold, color: ink });

    y -= 46;
    const cellW = (width - 100) / 2;
    page.drawText("Check-in", { x: 50, y, size: 9, font, color: muted });
    page.drawText(sample.check_in, { x: 50, y: y - 14, size: 12, font: bold, color: ink });
    page.drawText(`from ${checkinTime}`, { x: 50, y: y - 30, size: 9, font, color: muted });

    page.drawText("Check-out", { x: 50 + cellW, y, size: 9, font, color: muted });
    page.drawText(sample.check_out, { x: 50 + cellW, y: y - 14, size: 12, font: bold, color: ink });
    page.drawText(`by ${checkoutTime}`, { x: 50 + cellW, y: y - 30, size: 9, font, color: muted });

    y -= 60;
    page.drawText("Nights", { x: 50, y, size: 9, font, color: muted });
    page.drawText(String(sample.nights), { x: 50, y: y - 14, size: 12, font: bold, color: ink });
    page.drawText("Guests", { x: 50 + cellW, y, size: 9, font, color: muted });
    page.drawText(String(sample.num_guests), { x: 50 + cellW, y: y - 14, size: 12, font: bold, color: ink });

    y -= 50;
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: muted });
    y -= 24;
    page.drawText("Total accommodation cost", { x: 50, y, size: 10, font, color: ink });
    page.drawText(`${symbol}${fmtMoney(sample.total)} ${currency}`, { x: width - 200, y, size: 11, font: bold, color: ink });
    y -= 16;
    page.drawText("Paid to date", { x: 50, y, size: 10, font, color: muted });
    page.drawText(`${symbol}${fmtMoney(sample.paid)} ${currency}`, { x: width - 200, y, size: 10, font, color: muted });
    y -= 16;
    page.drawText("Balance due", { x: 50, y, size: 10, font, color: muted });
    page.drawText(`${symbol}${fmtMoney(balance)} ${currency}`, { x: width - 200, y, size: 10, font, color: muted });

    y -= 50;
    page.drawText("Status", { x: 50, y, size: 10, font, color: muted });
    page.drawText("CONFIRMED (SAMPLE)", { x: 120, y, size: 10, font: bold, color: accent });

    // QR
    try {
      const qrTarget = `${siteUrl.replace(/\/$/, "")}/guest?ref=${encodeURIComponent(sample.confirmation_number)}`;
      const qrDataUrl: string = await QRCode.toDataURL(qrTarget, {
        margin: 1, width: 240, color: { dark: "#111111", light: "#ffffff" },
      });
      const qrPngBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), (c) => c.charCodeAt(0));
      const qrImg = await pdf.embedPng(qrPngBytes);
      const qrSize = 96;
      const qrX = width - 50 - qrSize;
      page.drawImage(qrImg, { x: qrX, y: 50, width: qrSize, height: qrSize });
      page.drawText("Scan to open your booking", { x: qrX, y: 40, size: 7, font, color: muted });
    } catch (_) {}

    page.drawText("This document confirms an accommodation booking. It is not a payment receipt.",
      { x: 50, y: 110, size: 8, font, color: muted });
    page.drawText(`Request Thai VAT invoice: ${contactEmail}`,
      { x: 50, y: 96, size: 9, font: bold, color: accent });
    page.drawText(`Include reference ${sample.confirmation_number} in your email.`,
      { x: 50, y: 82, size: 8, font, color: muted });
    page.drawText(`Generated ${new Date().toISOString()} — ${companyName}. LIVE PREVIEW.`,
      { x: 50, y: 66, size: 7, font, color: muted });

    const bytes = await pdf.save();
    // base64 encode
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const pdf_base64 = btoa(bin);

    // ---- Email HTML preview (mirrors booking_confirmed / en template) ----
    const qrTarget = `${siteUrl.replace(/\/$/, "")}/guest?ref=${encodeURIComponent(sample.confirmation_number)}`;
    const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(qrTarget)}`;
    const vatMailto = `mailto:${contactEmail}?subject=${encodeURIComponent(`VAT invoice request — ${sample.confirmation_number}`)}`;
    const total_formatted = `${symbol}${fmtMoney(sample.total)} ${currency}`;
    const email_subject = "Booking Confirmed ✅ — LMT CampStay";
    const email_html = `<!doctype html><html><body style="margin:0;background:#f2f2f2;padding:20px">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#fff;border-radius:12px">
        <div style="background:#fff3cd;color:#856404;font-size:12px;padding:6px 10px;border-radius:6px;margin-bottom:16px;text-align:center">LIVE PREVIEW — sample values, not sent</div>
        <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">Booking Confirmed</h1>
        <p style="color:#666;margin-bottom:24px">Sawadee ${sample.guest_name}! Your stay is confirmed.</p>
        <p style="color:#333;font-size:13px;margin:-12px 0 20px 0"><strong>Confirmation #</strong> ${sample.confirmation_number}</p>
        <div style="background:#f8f8f8;border-radius:12px;padding:20px;margin-bottom:20px">
          <h2 style="font-size:18px;margin:0 0 16px 0">${sample.unit_name}</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#666;width:40%">Check-in</td><td style="padding:8px 0;font-weight:600">${sample.check_in} from ${checkinTime}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Check-out</td><td style="padding:8px 0;font-weight:600">${sample.check_out} by ${checkoutTime}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Guests</td><td style="padding:8px 0;font-weight:600">${sample.num_guests}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Total</td><td style="padding:8px 0;font-weight:600">${total_formatted}</td></tr>
          </table>
        </div>
        <p style="text-align:center;margin:24px 0">
          <a href="#" style="background:#b81c1c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">Download Booking Confirmation (PDF)</a>
        </p>
        <p style="color:#888;font-size:12px;text-align:center;margin-top:-8px">The PDF is also attached. Show it to immigration, airlines, or your employer.</p>
        <div style="text-align:center;margin:24px 0;padding:16px;background:#fafafa;border-radius:12px">
          <img src="${qrImg}" alt="Booking QR code" width="140" height="140" style="display:block;margin:0 auto 8px auto;border-radius:6px" />
          <p style="margin:0;color:#666;font-size:12px">Scan to open your booking or share your reference</p>
        </div>
        <p style="text-align:center;margin:20px 0 8px 0;color:#666;font-size:13px">
          Need a Thai VAT invoice? <a href="${vatMailto}" style="color:#b81c1c;font-weight:600;text-decoration:none">Request Thai VAT invoice</a>
        </p>
        <p style="color:#666;font-size:14px;margin-top:24px">Upload your ID document through the Guest Portal before check-in.</p>
        <hr style="border:0;border-top:1px solid #eee;margin:24px 0"/>
        <p style="color:#999;font-size:12px;margin:0">${companyName}${companyAddress ? ` · ${companyAddress}` : ""}${companyPhone ? ` · ${companyPhone}` : ""}</p>
        <p style="color:#999;font-size:12px;margin:4px 0 0 0">Contact: ${contactEmail}</p>
      </div></body></html>`;

    return j(req, {
      pdf_base64,
      email_html,
      email_subject,
      sample,
      policy: {
        currency, symbol, checkinTime, checkoutTime,
        companyName, companyAddress, companyPhone, contactEmail, siteUrl,
      },
    });
  } catch (e: any) {
    console.error("preview-confirmation-samples failed:", e?.stack || e);
    return j(req, {
      error: e?.message || "preview failed",
      hint: "Preview could not be generated. Nothing was booked, charged, or emailed.",
      where: e?.name || "unknown",
    }, 500);
  }
});
