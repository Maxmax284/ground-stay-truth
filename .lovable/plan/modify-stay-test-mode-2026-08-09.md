# Modify Stay + Test Mode

Two subsystems, built in four phases. Phase order is deliberate: the data foundation lands before any UI touches a live booking, and Test Mode arrives before the riskiest scenarios get exercised.

## What exists today (verified)

- A booking is one row: one `unit_id`, one `check_in`/`check_out`. There is no concept of a guest occupying two rooms across one stay.
- `booking_adjustments` exists, but it recalculates the whole booking total and **refuses to run once any payment is recorded** — the exact situation a mid-stay change creates.
- `payments` is already itemized (`payment_type`, `description`, provider fields, refund fields), so it can serve as the money ledger without a parallel system.
- `override_audit_log` already captures who-did-what with server-side actor resolution.
- `check_booking_overlap()` prevents double-booking at the database level for blocking states.
- The existing War Room "Sandbox" is in-memory mock data only — nothing in the database is flagged as test data.

## Phase 1 — Stay segments and the money ledger

The foundation. No behaviour changes for existing bookings.

- New `booking_segments`: one row per room-and-date-range within a stay. Every current booking gets one segment backfilled from its existing `unit_id`/dates, so nothing looks different on day one.
- Overlap protection moves to segments, so a room move frees the old room and blocks the new one automatically — the calendar, availability, and ops views read the same source.
- New `stay_modifications`: the permanent record of each change — before/after dates and rooms, reason, notes, who, when, pricing before and after, money created, payment status.
- `booking_adjustments` gains a link to the modification that created it, and its payment-recorded block is relaxed for modification-generated charges (original payments stay untouched).
- Existing booking totals and paid amounts are never rewritten; extras stack as new entries.

## Phase 2 — Modify Stay workflow

Available on Confirmed **and** Checked-In bookings. Checked-in is treated as an active stay, not a frozen record.

Flow: pick what's changing (dates, room, or both) → structured reason (guest request, upgrade, downgrade, maintenance, safety, management relocation, early departure, other) + notes → availability check → review → commit.

- Availability failure never dead-ends: staff see the available alternatives for the affected range and pick one.
- Pricing computes **only the difference** — rate delta × affected nights for a room change, correct nightly rate for added nights. Shortening or downgrading produces a credit.
- Manual rate, discount, and full waiver are supported and require a reason. Waived amounts record the normal value, the waiver, and the final amount — never hidden.
- Review screen shows current stay vs proposed stay, original total, additional accommodation, credits, waivers, and amount due now, plus what will change in inventory, housekeeping, guest portal, and payments.
- Actions: **Save and Request Payment** (default whenever money is owed), Save Without Charge (permission-gated), Save as Pending, Cancel.
- Commit runs as a single server-side operation. Partial success is not possible — any failure rolls the whole modification back with a clear error.
- Concurrency: a modification claims the booking, so two staff editing the same stay produces a clear conflict message rather than a silent overwrite.

## Phase 3 — Payment requests, holds, and downstream sync

- Money owed creates a **separate** Stripe payment request for the difference only, reusing the existing payment-link pathway. Original payment records are untouched.
- State `Modification Pending Payment`: the affected room is held, the hold is visible to staff, it has a configurable deadline, staff get warned as it nears, and it releases automatically on expiry or cancellation.
- Webhook success marks the adjustment paid, confirms the modification, and refreshes guest and staff views together.
- Downstream sync from segments: calendar, availability, arrivals/departures, housekeeping (old room vacant date, new room occupied date), checkout schedule, today's stays, guest timeline.
- Guest portal shows current room, any upcoming room transfer, new checkout date, additional balance, payment status and button, receipts, and credits — reading the same segments and ledger staff read, so the two views cannot disagree.
- Permissions use the existing ops-role helpers: modify dates / move rooms (ops write), price override / waive / refund / change payment deadline (admin, manager).

## Phase 4 — Test Mode (dedicated test property)

A property flagged as sandbox. All test units, bookings, guests, payments, pickups, and housekeeping hang off it, reusing the property isolation already in place.

- Every live view, dashboard count, report, and ops query excludes the sandbox property unless Test Mode is active.
- Test Mode on: a large persistent `TEST MODE — NO REAL BOOKINGS OR PAYMENTS` banner, and sandbox records rendered visually distinct everywhere they appear.
- Hard blocks while in sandbox: Stripe test keys only (live objects cannot be created), and all guest/driver/staff notifications suppressed or redirected to approved test addresses.
- Seeded test units, guests, bookings, drivers, and stays, plus **Reset Sandbox** for authorized users — clears sandbox-generated data and restores the seeded baseline so a scenario reruns cleanly.
- Preseeded scenarios covering the hard cases: extension with room free, extension with room booked tomorrow, mid-stay upgrade and downgrade, maintenance relocation, payment success, payment failure, hold expiry, room lost during a pending modification, two staff editing at once, payment landing mid-edit, shortening, month and year boundary crossings, two moves in one stay, extension after relocation, refund failure, cancellation before and after payment, unauthorized override attempt.

## Technical notes

- `booking_segments(booking_id, unit_id, starts_on, ends_on, status, created_by, modification_id)` with an exclusion constraint on unit + date range for blocking states; `check_booking_overlap()` retargeted at segments. `bookings.unit_id` stays populated (mirrors the current segment) for backwards compatibility so no existing query breaks.
- `stay_modifications(booking_id, kind, reason_code, notes, before/after snapshots jsonb, pricing_before, pricing_after, waived_amount, final_amount, status, hold_expires_at, actor, timestamps)`.
- Commit lives in a new `modify-stay` edge function wrapping a single security-definer database function so segment writes, adjustment inserts, housekeeping updates, and payment-link creation succeed or fail together.
- All dates and deadlines go through `src/lib/timezone.ts` (UTC storage, Asia/Bangkok display) — no new formatting paths.
- Sandbox: `properties.is_sandbox` plus a `seed-sandbox` / `reset-sandbox` edge function; Stripe key selection and notification dispatch both gate on the property's sandbox flag server-side, not in the UI.
- Existing pickup, arrival, check-in, and Stripe behaviour is untouched; vitest suites are extended, not replaced, and the new work adds tests for extension, shortening, room move, upgrade/downgrade, waiver, payment success/failure, hold expiry, credits, inventory conflict, concurrency, audit, portal and housekeeping consistency, permissions, sandbox isolation, and Reset Sandbox.
