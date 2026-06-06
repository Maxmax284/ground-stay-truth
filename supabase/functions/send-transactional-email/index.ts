import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

// Template definitions (English + Thai)
const templates: Record<string, Record<string, { subject: string; html: (data: any) => string }>> = {
  booking_confirmed: {
    en: {
      subject: "Booking Confirmed ✅",
      html: (d) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">Booking Confirmed</h1>
          <p style="color:#666;margin-bottom:24px">Sawadee ${d.guest_name}! Your stay is confirmed.</p>
          <div style="background:#f8f8f8;border-radius:12px;padding:20px;margin-bottom:20px">
            <h2 style="font-size:18px;margin:0 0 16px 0">${d.unit_name}</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px 0;color:#666;width:40%">Check-in</td><td style="padding:8px 0;font-weight:600">${d.check_in} from ${d.checkin_time}</td></tr>
              <tr><td style="padding:8px 0;color:#666">Check-out</td><td style="padding:8px 0;font-weight:600">${d.check_out} by ${d.checkout_time}</td></tr>
              <tr><td style="padding:8px 0;color:#666">Guests</td><td style="padding:8px 0;font-weight:600">${d.num_guests}</td></tr>
              <tr><td style="padding:8px 0;color:#666">Total</td><td style="padding:8px 0;font-weight:600">${d.total_formatted}</td></tr>
            </table>
          </div>
          <p style="color:#666;font-size:14px">Upload your ID document through the Guest Portal before check-in.</p>
          <p style="color:#999;font-size:12px;margin-top:24px">Ground Stay — Lamai Muay Thai Fight Camp</p>
        </div>`,
    },
    th: {
      subject: "ยืนยันการจอง ✅",
      html: (d) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">ยืนยันการจองแล้ว</h1>
          <p style="color:#666;margin-bottom:24px">สวัสดีครับ/ค่ะ ${d.guest_name}! การเข้าพักของคุณได้รับการยืนยันแล้ว</p>
          <div style="background:#f8f8f8;border-radius:12px;padding:20px;margin-bottom:20px">
            <h2 style="font-size:18px;margin:0 0 16px 0">${d.unit_name}</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px 0;color:#666;width:40%">เช็คอิน</td><td style="padding:8px 0;font-weight:600">${d.check_in} ตั้งแต่ ${d.checkin_time}</td></tr>
              <tr><td style="padding:8px 0;color:#666">เช็คเอาท์</td><td style="padding:8px 0;font-weight:600">${d.check_out} ภายใน ${d.checkout_time}</td></tr>
              <tr><td style="padding:8px 0;color:#666">จำนวนผู้เข้าพัก</td><td style="padding:8px 0;font-weight:600">${d.num_guests}</td></tr>
              <tr><td style="padding:8px 0;color:#666">ราคารวม</td><td style="padding:8px 0;font-weight:600">${d.total_formatted}</td></tr>
            </table>
          </div>
          <p style="color:#666;font-size:14px">กรุณาอัพโหลดเอกสารประจำตัวผ่าน Guest Portal ก่อนเช็คอิน</p>
          <p style="color:#999;font-size:12px;margin-top:24px">Ground Stay — Lamai Muay Thai Fight Camp</p>
        </div>`,
    },
  },
  deposit_reminder: {
    en: {
      subject: "Deposit Reminder — Complete Your Booking",
      html: (d) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">Deposit Reminder</h1>
          <p style="color:#666;margin-bottom:24px">${d.guest_name}, your booking for ${d.unit_name} is awaiting deposit.</p>
          <div style="background:#fff3cd;border-radius:8px;padding:16px;margin-bottom:20px">
            <p style="margin:0;font-size:14px;color:#856404">
              <strong>Amount due:</strong> ${d.deposit_amount}<br/>
              <strong>Dates:</strong> ${d.check_in} — ${d.check_out}
            </p>
          </div>
          <p style="color:#666;font-size:14px">Log in to your Guest Portal to complete payment.</p>
          <p style="color:#999;font-size:12px;margin-top:24px">Ground Stay — Lamai Muay Thai Fight Camp</p>
        </div>`,
    },
    th: {
      subject: "แจ้งเตือนมัดจำ — ชำระเงินเพื่อยืนยันการจอง",
      html: (d) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">แจ้งเตือนมัดจำ</h1>
          <p style="color:#666;margin-bottom:24px">${d.guest_name} การจอง ${d.unit_name} ของคุณรอการชำระมัดจำ</p>
          <div style="background:#fff3cd;border-radius:8px;padding:16px;margin-bottom:20px">
            <p style="margin:0;font-size:14px;color:#856404">
              <strong>จำนวนเงิน:</strong> ${d.deposit_amount}<br/>
              <strong>วันที่:</strong> ${d.check_in} — ${d.check_out}
            </p>
          </div>
          <p style="color:#666;font-size:14px">เข้าสู่ระบบ Guest Portal เพื่อชำระเงิน</p>
          <p style="color:#999;font-size:12px;margin-top:24px">Ground Stay — Lamai Muay Thai Fight Camp</p>
        </div>`,
    },
  },
  payment_link_sent: {
    en: {
      subject: "Your payment link is ready",
      html: (d) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">Time to lock it in</h1>
          <p style="color:#444;margin-bottom:20px">${d.guest_name || "Hey"} — here's the secure link to pay your ${d.payment_label || "deposit"} for <strong>${d.unit_name || "your stay"}</strong>.</p>
          <div style="background:#f8f8f8;border-radius:12px;padding:20px;margin-bottom:20px">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:6px 0;color:#666;width:45%">${d.payment_label || "Amount"}</td><td style="padding:6px 0;font-weight:600">${d.amount_formatted}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Dates</td><td style="padding:6px 0;font-weight:600">${d.check_in} → ${d.check_out}</td></tr>
            </table>
          </div>
          <p style="text-align:center;margin:28px 0">
            <a href="${d.payment_url}" style="background:#1a1a1a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;display:inline-block">Pay securely now</a>
          </p>
          <p style="color:#666;font-size:13px">Link expires ${d.expires_at_human || "soon"}. Card is processed by Stripe — we never see your details.</p>
          <p style="color:#999;font-size:12px;margin-top:24px;word-break:break-all">If the button doesn't work, paste this into your browser:<br/>${d.payment_url}</p>
          <p style="color:#999;font-size:12px;margin-top:24px">Ground Stay — Lamai Muay Thai Fight Camp</p>
        </div>`,
    },
    th: {
      subject: "ลิงก์ชำระเงินของคุณพร้อมแล้ว",
      html: (d) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">ชำระเงินเพื่อยืนยันการจอง</h1>
          <p style="color:#444;margin-bottom:20px">${d.guest_name || "สวัสดี"} — นี่คือลิงก์ชำระ ${d.payment_label || "มัดจำ"} สำหรับ <strong>${d.unit_name || "การเข้าพักของคุณ"}</strong></p>
          <div style="background:#f8f8f8;border-radius:12px;padding:20px;margin-bottom:20px">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:6px 0;color:#666;width:45%">จำนวนเงิน</td><td style="padding:6px 0;font-weight:600">${d.amount_formatted}</td></tr>
              <tr><td style="padding:6px 0;color:#666">วันที่</td><td style="padding:6px 0;font-weight:600">${d.check_in} → ${d.check_out}</td></tr>
            </table>
          </div>
          <p style="text-align:center;margin:28px 0">
            <a href="${d.payment_url}" style="background:#1a1a1a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;display:inline-block">ชำระเงินอย่างปลอดภัย</a>
          </p>
          <p style="color:#999;font-size:12px;word-break:break-all">${d.payment_url}</p>
        </div>`,
    },
  },
  pre_arrival_reminder: {
    en: {
      subject: "Arriving Soon — Pre-Arrival Checklist",
      html: (d) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">See You Soon!</h1>
          <p style="color:#666;margin-bottom:24px">${d.guest_name}, your stay at ${d.unit_name} starts on ${d.check_in}.</p>
          <div style="background:#f0f9ff;border-radius:8px;padding:16px;margin-bottom:20px">
            <p style="margin:0;font-size:14px;color:#1e40af">
              <strong>Check-in:</strong> ${d.check_in} from ${d.checkin_time}<br/>
              <strong>Please complete:</strong> ID upload and pre-arrival checklist in your Guest Portal
            </p>
          </div>
          <p style="color:#999;font-size:12px;margin-top:24px">Ground Stay — Lamai Muay Thai Fight Camp</p>
        </div>`,
    },
    th: {
      subject: "ใกล้ถึงวันเข้าพัก — เตรียมตัวก่อนเดินทาง",
      html: (d) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">เจอกันเร็วๆ นี้!</h1>
          <p style="color:#666;margin-bottom:24px">${d.guest_name} การเข้าพักของคุณที่ ${d.unit_name} เริ่มวันที่ ${d.check_in}</p>
          <div style="background:#f0f9ff;border-radius:8px;padding:16px;margin-bottom:20px">
            <p style="margin:0;font-size:14px;color:#1e40af">
              <strong>เช็คอิน:</strong> ${d.check_in} ตั้งแต่ ${d.checkin_time}<br/>
              <strong>กรุณา:</strong> อัพโหลดบัตรประชาชนและกรอก checklist ใน Guest Portal
            </p>
          </div>
          <p style="color:#999;font-size:12px;margin-top:24px">Ground Stay — Lamai Muay Thai Fight Camp</p>
        </div>`,
    },
  },
  checkout_followup: {
    en: {
      subject: "Thank You For Your Stay!",
      html: (d) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">Thank You!</h1>
          <p style="color:#666;margin-bottom:24px">${d.guest_name}, we hope you enjoyed your stay at ${d.unit_name}.</p>
          <p style="color:#666;font-size:14px">We'd love to hear about your experience. Leave a review in your Guest Portal!</p>
          <p style="color:#999;font-size:12px;margin-top:24px">Ground Stay — Lamai Muay Thai Fight Camp</p>
        </div>`,
    },
    th: {
      subject: "ขอบคุณสำหรับการเข้าพัก!",
      html: (d) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">ขอบคุณครับ/ค่ะ!</h1>
          <p style="color:#666;margin-bottom:24px">${d.guest_name} หวังว่าจะสนุกกับการเข้าพักที่ ${d.unit_name}</p>
          <p style="color:#666;font-size:14px">รบกวนรีวิวประสบการณ์ของคุณใน Guest Portal!</p>
          <p style="color:#999;font-size:12px;margin-top:24px">Ground Stay — Lamai Muay Thai Fight Camp</p>
        </div>`,
    },
  },
  review_request: {
    en: {
      subject: "How Was Your Stay?",
      html: (d) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">Your Feedback Matters</h1>
          <p style="color:#666;margin-bottom:24px">${d.guest_name}, how was your stay at ${d.unit_name}?</p>
          <p style="color:#666;font-size:14px">Take a moment to share your experience — it helps future guests and helps us improve.</p>
          <p style="color:#999;font-size:12px;margin-top:24px">Ground Stay — Lamai Muay Thai Fight Camp</p>
        </div>`,
    },
    th: {
      subject: "การเข้าพักเป็นอย่างไรบ้าง?",
      html: (d) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">ความคิดเห็นของคุณมีค่า</h1>
          <p style="color:#666;margin-bottom:24px">${d.guest_name} การเข้าพักที่ ${d.unit_name} เป็นอย่างไรบ้าง?</p>
          <p style="color:#666;font-size:14px">แบ่งปันประสบการณ์ของคุณ — ช่วยให้แขกในอนาคตและช่วยให้เราปรับปรุงบริการ</p>
          <p style="color:#999;font-size:12px;margin-top:24px">Ground Stay — Lamai Muay Thai Fight Camp</p>
        </div>`,
    },
  },
  welcome_checkin: {
    en: {
      subject: "Welcome to Your Stay! 🏠",
      html: (d) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">Welcome, ${d.guest_name}!</h1>
          <p style="color:#666;margin-bottom:24px">Today's the day — your stay at <strong>${d.unit_name}</strong> begins. Here's everything you need.</p>

          <div style="background:#f0fdf4;border-radius:12px;padding:20px;margin-bottom:20px">
            <h2 style="font-size:16px;margin:0 0 12px 0;color:#166534">📶 WiFi</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:4px 0;color:#666;width:40%">Network</td><td style="padding:4px 0;font-weight:600">${d.wifi_network || "—"}</td></tr>
              <tr><td style="padding:4px 0;color:#666">Password</td><td style="padding:4px 0;font-weight:600;font-family:monospace">${d.wifi_password || "—"}</td></tr>
            </table>
          </div>

          <div style="background:#f8f8f8;border-radius:12px;padding:20px;margin-bottom:20px">
            <h2 style="font-size:16px;margin:0 0 12px 0;color:#1a1a1a">📋 House Rules</h2>
            <p style="color:#666;font-size:14px;line-height:1.6;margin:0;white-space:pre-line">${d.house_rules || "Please ask at front desk."}</p>
          </div>

          <div style="background:#f8f8f8;border-radius:12px;padding:20px;margin-bottom:20px">
            <h2 style="font-size:16px;margin:0 0 12px 0;color:#1a1a1a">⏰ Check-in / Check-out</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:4px 0;color:#666;width:40%">Check-in from</td><td style="padding:4px 0;font-weight:600">${d.checkin_time}</td></tr>
              <tr><td style="padding:4px 0;color:#666">Check-out by</td><td style="padding:4px 0;font-weight:600">${d.checkout_time || "11:00"}</td></tr>
              <tr><td style="padding:4px 0;color:#666">Your dates</td><td style="padding:4px 0;font-weight:600">${d.check_in} → ${d.check_out}</td></tr>
            </table>
          </div>

          <div style="background:#fef2f2;border-radius:12px;padding:20px;margin-bottom:20px">
            <h2 style="font-size:16px;margin:0 0 12px 0;color:#991b1b">🚨 Emergency Contact</h2>
            <p style="color:#666;font-size:14px;margin:0"><strong>${d.emergency_name || "Front Desk"}</strong><br/>${d.emergency_phone || "See Guest Portal"}</p>
          </div>

          <p style="color:#666;font-size:14px">Need anything? Message us through the Guest Portal anytime.</p>
          <p style="color:#999;font-size:12px;margin-top:24px">Ground Stay — Lamai Muay Thai Fight Camp</p>
        </div>`,
    },
    th: {
      subject: "ยินดีต้อนรับ! 🏠",
      html: (d) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px">ยินดีต้อนรับ ${d.guest_name}!</h1>
          <p style="color:#666;margin-bottom:24px">วันนี้เป็นวันเช็คอินของคุณที่ <strong>${d.unit_name}</strong> นี่คือข้อมูลที่จำเป็น</p>

          <div style="background:#f0fdf4;border-radius:12px;padding:20px;margin-bottom:20px">
            <h2 style="font-size:16px;margin:0 0 12px 0;color:#166534">📶 WiFi</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:4px 0;color:#666;width:40%">ชื่อเครือข่าย</td><td style="padding:4px 0;font-weight:600">${d.wifi_network || "—"}</td></tr>
              <tr><td style="padding:4px 0;color:#666">รหัสผ่าน</td><td style="padding:4px 0;font-weight:600;font-family:monospace">${d.wifi_password || "—"}</td></tr>
            </table>
          </div>

          <div style="background:#f8f8f8;border-radius:12px;padding:20px;margin-bottom:20px">
            <h2 style="font-size:16px;margin:0 0 12px 0;color:#1a1a1a">📋 กฎบ้าน</h2>
            <p style="color:#666;font-size:14px;line-height:1.6;margin:0;white-space:pre-line">${d.house_rules || "กรุณาสอบถามที่แผนกต้อนรับ"}</p>
          </div>

          <div style="background:#f8f8f8;border-radius:12px;padding:20px;margin-bottom:20px">
            <h2 style="font-size:16px;margin:0 0 12px 0;color:#1a1a1a">⏰ เช็คอิน / เช็คเอาท์</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:4px 0;color:#666;width:40%">เช็คอินตั้งแต่</td><td style="padding:4px 0;font-weight:600">${d.checkin_time}</td></tr>
              <tr><td style="padding:4px 0;color:#666">เช็คเอาท์ภายใน</td><td style="padding:4px 0;font-weight:600">${d.checkout_time || "11:00"}</td></tr>
              <tr><td style="padding:4px 0;color:#666">วันที่</td><td style="padding:4px 0;font-weight:600">${d.check_in} → ${d.check_out}</td></tr>
            </table>
          </div>

          <div style="background:#fef2f2;border-radius:12px;padding:20px;margin-bottom:20px">
            <h2 style="font-size:16px;margin:0 0 12px 0;color:#991b1b">🚨 ติดต่อฉุกเฉิน</h2>
            <p style="color:#666;font-size:14px;margin:0"><strong>${d.emergency_name || "แผนกต้อนรับ"}</strong><br/>${d.emergency_phone || "ดูใน Guest Portal"}</p>
          </div>

          <p style="color:#666;font-size:14px">ต้องการอะไรเพิ่มเติม? ส่งข้อความผ่าน Guest Portal ได้ตลอดเวลา</p>
          <p style="color:#999;font-size:12px;margin-top:24px">Ground Stay — Lamai Muay Thai Fight Camp</p>
        </div>`,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ─── AUTH: Only allow internal calls with service role key ────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized — internal use only" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { template_key, recipient_email, data, booking_id, language } = await req.json();

    if (!template_key || !recipient_email) {
      return new Response(JSON.stringify({ error: "template_key and recipient_email required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check idempotency via email_log
    if (booking_id) {
      const { data: existing } = await adminClient
        .from("email_log")
        .select("id")
        .eq("booking_id", booking_id)
        .eq("template_key", template_key)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ skipped: true, reason: "Already sent" }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    // Get Resend API key from integration_secrets (secure)
    const { data: resendSecretRow } = await adminClient
      .from("integration_secrets")
      .select("encrypted_value")
      .eq("secret_key", "resend_api_key")
      .maybeSingle();
    const resendApiKey = resendSecretRow?.encrypted_value;

    // Get from email from policy_settings (non-secret)
    const { data: fromPolicies } = await adminClient
      .from("policy_settings")
      .select("key, value")
      .in("key", ["resend_from_email"]);
    const fromPolicyMap = new Map((fromPolicies ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]));
    const fromEmail = fromPolicyMap.get("resend_from_email") || "noreply@groundstay.app";

    if (!resendApiKey || resendApiKey.length < 5) {
      console.log("Resend API key not configured, logging email as pending");
      // Still log it but mark as pending
      if (booking_id) {
        await adminClient.from("email_log").insert({
          booking_id,
          template_key,
          recipient_email,
          status: "no_provider",
        });
      }
      return new Response(JSON.stringify({ sent: false, reason: "Email provider not configured" }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Select template + language
    const lang = language || "en";
    const templateSet = templates[template_key];
    if (!templateSet) {
      return new Response(JSON.stringify({ error: `Unknown template: ${template_key}` }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const template = templateSet[lang] || templateSet.en;

    // Send via Resend
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient_email],
        subject: template.subject,
        html: template.html(data || {}),
      }),
    });

    const resendData = await resendResp.json();

    if (!resendResp.ok) {
      console.error("Resend API error:", resendData);
      if (booking_id) {
        await adminClient.from("email_log").insert({
          booking_id,
          template_key,
          recipient_email,
          status: "failed",
        });
      }
      return new Response(JSON.stringify({ sent: false, error: resendData }), {
        status: 502,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Log successful send
    if (booking_id) {
      await adminClient.from("email_log").insert({
        booking_id,
        template_key,
        recipient_email,
        provider_message_id: resendData.id || null,
        status: "sent",
      });
    }

    return new Response(JSON.stringify({ sent: true, message_id: resendData.id }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-transactional-email error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
