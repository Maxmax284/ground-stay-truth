// Generate a Thai-compliant VAT tax invoice PDF for a recorded payment.
// Numbering: INV-YYYY-NNNNNN. Stored in private 'tax-invoices' bucket.
// Admin only. Idempotent per payment_id (UNIQUE constraint).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
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

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function nextInvoiceNumber(admin: any): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const { data, error } = await admin
    .from("tax_invoices")
    .select("invoice_number")
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1);
  if (error) throw error;
  let next = 1;
  if (data && data[0]) {
    const tail = data[0].invoice_number.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(6, "0")}`;
}

async function getPolicy(admin: any, key: string, fallback = ""): Promise<string> {
  const { data } = await admin.from("policy_settings").select("value").eq("key", key).maybeSingle();
  if (!data) return fallback;
  const v: any = data.value;
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "value" in v) return String(v.value ?? fallback);
  return fallback;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse(req, { error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse(req, { error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: adminRole } = await admin
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!adminRole) return jsonResponse(req, { error: "Forbidden — admin only" }, 403);

    const { payment_id } = await req.json().catch(() => ({}));
    if (!payment_id || typeof payment_id !== "string") {
      return jsonResponse(req, { error: "payment_id required" }, 400);
    }

    // Idempotency: return existing invoice if already issued
    const { data: existing } = await admin
      .from("tax_invoices").select("*").eq("payment_id", payment_id).maybeSingle();
    if (existing) {
      const { data: signed } = await admin.storage
        .from("tax-invoices").createSignedUrl(existing.pdf_storage_path, 60 * 60);
      return jsonResponse(req, { invoice: existing, signed_url: signed?.signedUrl ?? null, reused: true });
    }

    // Load payment + booking + guest
    const { data: payment, error: payErr } = await admin
      .from("payments")
      .select("id, booking_id, amount, status, provider, provider_transaction_id, payment_type, created_at")
      .eq("id", payment_id).maybeSingle();
    if (payErr || !payment) return jsonResponse(req, { error: "Payment not found" }, 404);
    if (!["recorded", "partially_refunded"].includes(payment.status)) {
      return jsonResponse(req, { error: `Cannot invoice payment in status '${payment.status}'` }, 400);
    }

    let buyerName = "", buyerEmail = "", buyerTaxId = "";
    let bookingId: string | null = payment.booking_id;
    if (bookingId) {
      const { data: bk } = await admin
        .from("bookings").select("id, guest_id, guest_tax_id").eq("id", bookingId).maybeSingle();
      if (bk?.guest_tax_id) buyerTaxId = bk.guest_tax_id;
      if (bk?.guest_id) {
        const { data: prof } = await admin
          .from("profiles").select("full_name, email").eq("user_id", bk.guest_id).maybeSingle();
        buyerName = prof?.full_name || "";
        buyerEmail = prof?.email || "";
      }
    }

    // VAT math (assume tax-included totals per project default; configurable)
    const taxRateStr = await getPolicy(admin, "tax_rate", "7");
    const taxIncludedStr = await getPolicy(admin, "tax_included", "true");
    const taxRate = Number(taxRateStr) || 7;
    const taxIncluded = String(taxIncludedStr).toLowerCase() !== "false";
    const gross = Number(payment.amount);
    const net = taxIncluded ? +(gross / (1 + taxRate / 100)).toFixed(2) : gross;
    const vat = +(gross - net).toFixed(2);
    const adjGross = taxIncluded ? gross : +(gross + vat).toFixed(2);

    const sellerName = await getPolicy(admin, "company_legal_name", "Ground Stay Co., Ltd.");
    const sellerAddress = await getPolicy(admin, "company_address", "");
    const sellerTaxId = await getPolicy(admin, "company_tax_id", "");
    const sellerBranch = await getPolicy(admin, "company_branch_code", "00000");
    const currency = await getPolicy(admin, "currency_code", "THB");

    const invoiceNumber = await nextInvoiceNumber(admin);
    const issuedAt = new Date();

    // ---- Build PDF ----
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const { width } = page.getSize();
    const ink = rgb(0.07, 0.07, 0.07);
    const muted = rgb(0.4, 0.4, 0.4);
    let y = 800;

    page.drawText("TAX INVOICE / RECEIPT", { x: 50, y, size: 18, font: bold, color: ink });
    page.drawText("ใบกำกับภาษี / ใบเสร็จรับเงิน", { x: 50, y: y - 18, size: 10, font, color: muted });
    page.drawText(`No. ${invoiceNumber}`, { x: width - 200, y, size: 11, font: bold, color: ink });
    page.drawText(`Issued: ${issuedAt.toISOString().slice(0, 10)}`, { x: width - 200, y: y - 16, size: 9, font, color: muted });

    y -= 60;
    page.drawText("Seller", { x: 50, y, size: 10, font: bold, color: ink });
    page.drawText(sellerName, { x: 50, y: y - 14, size: 10, font, color: ink });
    if (sellerAddress) {
      const lines = sellerAddress.match(/.{1,60}/g) || [];
      lines.slice(0, 3).forEach((ln, i) => page.drawText(ln, { x: 50, y: y - 28 - i * 12, size: 9, font, color: muted }));
    }
    page.drawText(`Tax ID: ${sellerTaxId || "—"}`, { x: 50, y: y - 70, size: 9, font, color: muted });
    page.drawText(`Branch: ${sellerBranch}`, { x: 50, y: y - 82, size: 9, font, color: muted });

    page.drawText("Buyer", { x: 320, y, size: 10, font: bold, color: ink });
    page.drawText(buyerName || "Guest", { x: 320, y: y - 14, size: 10, font, color: ink });
    if (buyerEmail) page.drawText(buyerEmail, { x: 320, y: y - 28, size: 9, font, color: muted });
    if (buyerTaxId) page.drawText(`Tax ID: ${buyerTaxId}`, { x: 320, y: y - 42, size: 9, font, color: muted });

    y -= 130;
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: muted });
    y -= 24;
    page.drawText("Description", { x: 50, y, size: 10, font: bold, color: ink });
    page.drawText("Amount", { x: width - 130, y, size: 10, font: bold, color: ink });
    y -= 18;
    const desc = `${payment.payment_type === "deposit" ? "Booking deposit" : payment.payment_type === "balance" ? "Balance payment" : payment.payment_type} — Booking ${bookingId?.slice(0, 8) ?? "—"}`;
    page.drawText(desc, { x: 50, y, size: 10, font, color: ink });
    page.drawText(`${fmtMoney(net)} ${currency}`, { x: width - 130, y, size: 10, font, color: ink });

    y -= 36;
    page.drawLine({ start: { x: 320, y: y + 10 }, end: { x: width - 50, y: y + 10 }, thickness: 0.5, color: muted });
    page.drawText("Subtotal (excl. VAT)", { x: 320, y, size: 10, font, color: ink });
    page.drawText(`${fmtMoney(net)} ${currency}`, { x: width - 130, y, size: 10, font, color: ink });
    y -= 16;
    page.drawText(`VAT (${taxRate}%)`, { x: 320, y, size: 10, font, color: ink });
    page.drawText(`${fmtMoney(vat)} ${currency}`, { x: width - 130, y, size: 10, font, color: ink });
    y -= 18;
    page.drawText("Total", { x: 320, y, size: 11, font: bold, color: ink });
    page.drawText(`${fmtMoney(adjGross)} ${currency}`, { x: width - 130, y, size: 11, font: bold, color: ink });

    y -= 60;
    page.drawText(`Payment method: ${payment.provider}${payment.provider_transaction_id ? ` (ref ${payment.provider_transaction_id})` : ""}`, { x: 50, y, size: 9, font, color: muted });
    page.drawText(`Status: ${payment.status}`, { x: 50, y: y - 12, size: 9, font, color: muted });

    page.drawText("This document serves as a Thai tax invoice (ใบกำกับภาษี) issued under the Revenue Code.",
      { x: 50, y: 80, size: 8, font, color: muted });
    page.drawText("Please retain for your records.", { x: 50, y: 68, size: 8, font, color: muted });

    const bytes = await pdf.save();
    const path = `${new Date().getFullYear()}/${invoiceNumber}.pdf`;
    const { error: upErr } = await admin.storage
      .from("tax-invoices").upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) return jsonResponse(req, { error: `Upload failed: ${upErr.message}` }, 500);

    const sellerSnapshot = {
      legal_name: sellerName, address: sellerAddress, tax_id: sellerTaxId, branch_code: sellerBranch,
    };

    const { data: inv, error: insErr } = await admin
      .from("tax_invoices").insert({
        payment_id: payment.id,
        booking_id: bookingId,
        invoice_number: invoiceNumber,
        net_amount: net,
        vat_amount: vat,
        gross_amount: adjGross,
        tax_rate: taxRate,
        currency_code: currency,
        pdf_storage_path: path,
        buyer_name: buyerName || null,
        buyer_email: buyerEmail || null,
        buyer_tax_id: buyerTaxId || null,
        seller_snapshot: sellerSnapshot,
        issued_by: user.id,
      }).select().single();
    if (insErr) {
      // Cleanup orphan PDF
      await admin.storage.from("tax-invoices").remove([path]);
      return jsonResponse(req, { error: `Insert failed: ${insErr.message}` }, 500);
    }

    const { data: signed } = await admin.storage
      .from("tax-invoices").createSignedUrl(path, 60 * 60);

    return jsonResponse(req, { invoice: inv, signed_url: signed?.signedUrl ?? null, reused: false });
  } catch (e: any) {
    console.error("[generate-tax-invoice] error", e);
    return jsonResponse(req, { error: e?.message ?? "Internal error" }, 500);
  }
});
