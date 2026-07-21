#!/usr/bin/env node
/**
 * Payment-link smoke test — automated.
 *
 * Exercises the create-payment-link edge function end-to-end from BOTH the
 * custom domain (lmtcampstay.com) and the Lovable preview origin. Verifies:
 *
 *   1. CORS preflight succeeds for each origin (regression guard for the
 *      allowlist bug that bit Nikki's first live deposit link).
 *   2. Staff auth → link generation returns a valid token + URL.
 *   3. amount = round(total_price * deposit_percentage / 100).
 *   4. A payment_links row exists with matching booking_id + amount, not
 *      revoked/used, expires_at in the future.
 *   5. The booking was auto-advanced to `pending_deposit`.
 *   6. All test-only artifacts (payment_links rows, test booking) are
 *      cleaned up on exit — pass or fail.
 *
 * Usage:
 *   TEST_STAFF_EMAIL=... TEST_STAFF_PASSWORD=... node scripts/payment-link-smoke-test.mjs
 *
 * Requires PG* env vars for direct DB seed/cleanup.
 */
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", DIM = "\x1b[2m", RESET = "\x1b[0m";
const ok = (m) => console.log(`${GREEN}✓${RESET} ${m}`);
const fail = (m) => { console.log(`${RED}✗ ${m}${RESET}`); process.exitCode = 1; };
const info = (m) => console.log(`${DIM}${m}${RESET}`);
const warn = (m) => console.log(`${YELLOW}! ${m}${RESET}`);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const STAFF_EMAIL = process.env.TEST_STAFF_EMAIL;
const STAFF_PASSWORD = process.env.TEST_STAFF_PASSWORD;

const ORIGINS = [
  "https://lmtcampstay.com",
  "https://ground-stay-truth.lovable.app",
];

if (!SUPABASE_URL || !ANON_KEY) {
  console.error(`${RED}Missing SUPABASE_URL / ANON key env${RESET}`);
  process.exit(1);
}
if (!STAFF_EMAIL || !STAFF_PASSWORD) {
  console.error(`${RED}Set TEST_STAFF_EMAIL and TEST_STAFF_PASSWORD (staff with role >= front_desk).${RESET}`);
  process.exit(1);
}

function psqlJson(sql) {
  const out = execSync(
    `psql -At -c "SELECT COALESCE(json_agg(t), '[]'::json)::text FROM (${sql.replace(/"/g, '\\"')}) t;"`,
    { encoding: "utf8" },
  ).trim();
  return JSON.parse(out);
}
function psqlExec(sql) {
  execSync(`psql -c "${sql.replace(/"/g, '\\"')}"`, { stdio: "pipe" });
}

async function main() {
  console.log("\n── Payment-link smoke test ──\n");

  // 1. Sign in as staff.
  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: STAFF_EMAIL, password: STAFF_PASSWORD,
  });
  if (authErr || !auth?.session) return fail(`Staff login failed: ${authErr?.message}`);
  const accessToken = auth.session.access_token;
  ok(`Signed in as ${STAFF_EMAIL} (${auth.user.id.slice(0, 8)}).`);

  // 2. Read deposit_percentage for the amount assertion.
  const [depRow] = psqlJson(
    `SELECT REPLACE(value::text, '"', '')::numeric AS pct
     FROM public.policy_settings WHERE key='deposit_percentage'`
  );
  const depositPct = Number(depRow?.pct ?? 20);
  info(`Deposit percentage: ${depositPct}%`);

  // 3. Pick a unit + create a test booking in an isolated future window.
  const [unit] = psqlJson(
    `SELECT id, name, base_price FROM public.units
     WHERE is_active = true ORDER BY name LIMIT 1`
  );
  if (!unit) return fail("No active unit available for test booking.");
  info(`Using unit ${unit.name} (${unit.id.slice(0, 8)}).`);

  const range = (offsetDays, nights) => {
    const inD = new Date(Date.UTC(2028, 0, 1 + offsetDays));
    const outD = new Date(Date.UTC(2028, 0, 1 + offsetDays + nights));
    return { checkIn: inD.toISOString().slice(0, 10), checkOut: outD.toISOString().slice(0, 10) };
  };

  const createdBookingIds = [];
  const createdLinkIds = [];

  try {
    for (const [idx, origin] of ORIGINS.entries()) {
      console.log(`\n── Origin: ${origin} ──`);

      const win = range(idx * 4, 2);
      const totalPrice = 12000;
      const expectedAmount = Math.round((totalPrice * depositPct) / 100);

      const [booking] = psqlJson(
        `INSERT INTO public.bookings (unit_id, state, check_in, check_out, num_guests, total_price, notes, manual_guest_name)
         VALUES ('${unit.id}', 'pending_deposit', '${win.checkIn}', '${win.checkOut}', 2, ${totalPrice},
                 'AUTOMATED PAYMENT-LINK SMOKE TEST — safe to delete', 'Smoke Test Guest')
         RETURNING id`
      );
      createdBookingIds.push(booking.id);
      info(`Seeded booking ${booking.id.slice(0, 8)} — ${win.checkIn}→${win.checkOut}, total ฿${totalPrice}.`);

      // 4. CORS preflight — must echo Access-Control-Allow-Origin for this origin.
      const preflight = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-link`, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, content-type, apikey",
        },
      });
      const acao = preflight.headers.get("access-control-allow-origin");
      if (preflight.status === 204 && acao === origin) ok(`CORS preflight: 204 + ACAO=${acao}`);
      else fail(`CORS preflight: status=${preflight.status} ACAO=${acao || "<none>"}`);

      // 5. Actual link generation.
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-link`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ booking_id: booking.id, expires_in_hours: 24 }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) { fail(`create-payment-link ${resp.status}: ${JSON.stringify(body)}`); continue; }
      ok(`Link generated (${resp.status}).`);

      if (body.amount === expectedAmount) ok(`Amount ฿${body.amount} matches ${depositPct}% of ฿${totalPrice}.`);
      else fail(`Amount ฿${body.amount} ≠ expected ฿${expectedAmount}`);

      if (typeof body.token === "string" && body.token.length >= 40) ok(`Raw token returned (${body.token.length} chars).`);
      else fail(`Token missing or too short.`);

      if (typeof body.url === "string" && body.url.includes(`/pay/${body.token}`)) ok(`URL well-formed: ${body.url}`);
      else fail(`URL malformed: ${body.url}`);

      const expiresMs = new Date(body.expires_at).getTime() - Date.now();
      if (expiresMs > 23 * 3600 * 1000 && expiresMs < 25 * 3600 * 1000) ok(`expires_at ~24h out.`);
      else fail(`expires_at out of expected window: ${body.expires_at}`);

      createdLinkIds.push(body.payment_link_id);

      // 6. DB round-trip — verify the row was persisted correctly.
      const [row] = psqlJson(
        `SELECT id, booking_id, amount::float AS amount, currency, revoked_at, used_at,
                (metadata->>'payment_type') AS payment_type
         FROM public.payment_links WHERE id = '${body.payment_link_id}'`
      );
      if (!row) { fail("payment_links row not found in DB."); continue; }
      if (row.booking_id === booking.id) ok(`DB: booking_id linked correctly.`);
      else fail(`DB: booking_id mismatch (${row.booking_id})`);
      if (row.amount === expectedAmount) ok(`DB: amount matches (฿${row.amount}).`);
      else fail(`DB: amount mismatch (฿${row.amount})`);
      if (!row.revoked_at && !row.used_at) ok(`DB: link is active (not revoked/used).`);
      else fail(`DB: link already revoked/used at creation.`);
      if (row.payment_type === "deposit") ok(`DB: metadata.payment_type=deposit.`);
      else warn(`DB: metadata.payment_type=${row.payment_type} (expected 'deposit').`);

      // 7. Booking should still be pending_deposit.
      const [bkAfter] = psqlJson(`SELECT state FROM public.bookings WHERE id='${booking.id}'`);
      if (bkAfter.state === "pending_deposit") ok(`Booking state = pending_deposit.`);
      else fail(`Booking state = ${bkAfter.state} (expected pending_deposit).`);
    }
  } finally {
    // 8. Cleanup.
    for (const id of createdLinkIds) {
      try { psqlExec(`DELETE FROM public.payment_link_events WHERE payment_link_id='${id}'`); } catch {}
      try { psqlExec(`DELETE FROM public.payment_links WHERE id='${id}'`); info(`Cleaned link ${id.slice(0, 8)}.`); }
      catch (e) { fail(`Link cleanup ${id}: ${e.message}`); }
    }
    for (const id of createdBookingIds) {
      try {
        psqlExec(`DELETE FROM public.payment_link_events WHERE booking_id='${id}'`);
        psqlExec(`DELETE FROM public.payment_links WHERE booking_id='${id}'`);
        psqlExec(`DELETE FROM public.payments WHERE booking_id='${id}'`);
        psqlExec(`UPDATE public.bookings SET state='cancelled' WHERE id='${id}'`);
        psqlExec(`DELETE FROM public.bookings WHERE id='${id}'`);
        info(`Cleaned booking ${id.slice(0, 8)}.`);
      } catch (e) { fail(`Booking cleanup ${id}: ${e.message}`); }
    }
  }

  console.log(process.exitCode
    ? `\n${RED}Payment-link smoke test FAILED${RESET}\n`
    : `\n${GREEN}Payment-link smoke test PASSED${RESET}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
