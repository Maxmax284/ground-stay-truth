#!/usr/bin/env node
/**
 * Twin room smoke test — automated.
 *
 * Verifies the min_billable_guests=2 platform rule end-to-end for Twin units:
 *   1. Picks a Superior Twin unit (activates it if disabled).
 *   2. Runs calculatePricing with num_guests=1 and num_guests=2.
 *   3. Inserts real bookings via psql for both scenarios (staff-side & guest-side
 *      both hit the same overlap trigger + booking constraints).
 *   4. Reads them back and asserts total_price matches the calculator (which now
 *      bills for max(num_guests, min_billable_guests)=2 in both cases).
 *   5. Deletes the test bookings and restores the unit's is_active flag.
 *
 * Run:  node scripts/twin-smoke-test.mjs
 * Requires PG* env vars (same as psql).
 */
import { execSync } from "node:child_process";
import { calculatePricing } from "../src/lib/pricingCalculator.ts";

const RED = "\x1b[31m", GREEN = "\x1b[32m", DIM = "\x1b[2m", RESET = "\x1b[0m";
const ok = (m) => console.log(`${GREEN}✓${RESET} ${m}`);
const fail = (m) => { console.log(`${RED}✗ ${m}${RESET}`); process.exitCode = 1; };
const info = (m) => console.log(`${DIM}${m}${RESET}`);

function psqlJson(sql) {
  const out = execSync(
    `psql -At -c "SELECT COALESCE(json_agg(t), '[]'::json)::text FROM (${sql.replace(/"/g, '\\"')}) t;"`,
    { encoding: "utf8" }
  ).trim();
  return JSON.parse(out);
}
function psqlExec(sql) {
  execSync(`psql -c "${sql.replace(/"/g, '\\"')}"`, { stdio: "pipe" });
}

async function main() {
  console.log("\n── Twin smoke test ──\n");

  // 1. Pick a Twin unit.
  const [twin] = psqlJson(
    `SELECT id, name, capacity, base_price, pricing_type, min_billable_guests, is_active
     FROM public.units
     WHERE min_billable_guests >= 2 AND pricing_type = 'per_person'
     ORDER BY name LIMIT 1`
  );
  if (!twin) return fail("No Twin unit with min_billable_guests>=2 found. Aborting.");
  info(`Using unit ${twin.name} (${twin.id}) — base ฿${twin.base_price}, min_billable=${twin.min_billable_guests}, active=${twin.is_active}`);

  const wasActive = twin.is_active;
  if (!wasActive) {
    psqlExec(`UPDATE public.units SET is_active = true WHERE id = '${twin.id}'`);
    info("Temporarily activated unit for test.");
  }

  // 2. Load pricing rules for the calculator.
  const rules = psqlJson(
    `SELECT id, unit_id, name, start_date, end_date, price, weekend_price,
            adjustment_type, adjustment_value, min_nights, created_at
     FROM public.pricing_rules WHERE unit_id = '${twin.id}'`
  );

  // 3. Pick two non-overlapping date windows far in the future.
  const range = (offset) => {
    const inD = new Date(Date.UTC(2027, 5, 1 + offset));
    const outD = new Date(Date.UTC(2027, 5, 3 + offset));
    return { checkIn: inD.toISOString().slice(0, 10), checkOut: outD.toISOString().slice(0, 10) };
  };
  const windowA = range(0);   // num_guests=1
  const windowB = range(5);   // num_guests=2

  const createdIds = [];

  try {
    // 4. Run calculator for both scenarios.
    const priceOne = calculatePricing(twin, windowA.checkIn, windowA.checkOut, rules, null, null, 0, 0, 1);
    const priceTwo = calculatePricing(twin, windowB.checkIn, windowB.checkOut, rules, null, null, 0, 0, 2);

    info(`Calc — 1 guest: total ฿${priceOne.total}, billableGuests=${priceOne.billableGuests}`);
    info(`Calc — 2 guests: total ฿${priceTwo.total}, billableGuests=${priceTwo.billableGuests}`);

    if (priceOne.billableGuests === 2) ok("1-guest booking bills for 2 (min_billable_guests floor applied).");
    else fail(`Expected billableGuests=2 for 1-guest booking, got ${priceOne.billableGuests}`);

    if (priceOne.total === priceTwo.total) ok(`Totals identical (฿${priceOne.total}) — occupancy floor working.`);
    else fail(`Totals differ: 1-guest=฿${priceOne.total} vs 2-guest=฿${priceTwo.total}`);

    const nights = 2;
    const expected = Number(twin.base_price) * 2 * nights;
    if (priceOne.total === expected) ok(`Matches expected ฿${expected} (base × 2 guests × ${nights} nights).`);
    else fail(`Expected ฿${expected}, got ฿${priceOne.total}`);

    // 5. Insert test bookings (staff-style path — same trigger surface as guest RPC).
    for (const [scenario, win, calc, guests] of [
      ["staff-1guest", windowA, priceOne, 1],
      ["guest-2guest", windowB, priceTwo, 2],
    ]) {
      const [row] = psqlJson(
        `INSERT INTO public.bookings (unit_id, state, check_in, check_out, num_guests, total_price, notes)
         VALUES ('${twin.id}', 'inquiry', '${win.checkIn}', '${win.checkOut}', ${guests}, ${calc.total},
                 'AUTOMATED TWIN SMOKE TEST — safe to delete')
         RETURNING id, num_guests, total_price::float AS total_price`
      );
      createdIds.push(row.id);
      ok(`Inserted ${scenario} booking ${row.id.slice(0, 8)} — ฿${row.total_price} for ${row.num_guests} guest(s).`);

      const [back] = psqlJson(
        `SELECT total_price::float AS total_price, num_guests FROM public.bookings WHERE id = '${row.id}'`
      );
      if (back.total_price === calc.total) ok(`  DB total matches calculator (฿${back.total_price}).`);
      else fail(`  DB total ฿${back.total_price} ≠ calc ฿${calc.total}`);
    }
  } finally {
    // 6. Cleanup — cancel + delete test bookings, restore unit state.
    for (const id of createdIds) {
      try {
        psqlExec(`UPDATE public.bookings SET state='cancelled' WHERE id='${id}'`);
        psqlExec(`DELETE FROM public.bookings WHERE id='${id}'`);
        info(`Cleaned booking ${id.slice(0, 8)}.`);
      } catch (e) {
        fail(`Cleanup failed for ${id}: ${e.message}`);
      }
    }
    if (!wasActive) {
      psqlExec(`UPDATE public.units SET is_active = false WHERE id = '${twin.id}'`);
      info("Restored unit to inactive state.");
    }
  }

  console.log(process.exitCode ? `\n${RED}Smoke test FAILED${RESET}\n` : `\n${GREEN}Smoke test PASSED${RESET}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
