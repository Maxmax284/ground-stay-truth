# Driver Response Rate, Flight Budget Control, Live Link Test

## 1. Driver response rate

Two things are already recorded: whether a driver link was opened (view count, last viewed) and whether a driver actually sent a pickup message. Today nothing turns that into a number.

- **Per pickup:** a small status line on the pickup card — "Link not opened yet", "Opened, no reply yet" (with time since opening), or "Driver replied" (with time of last driver message).
- **Arrivals Board:** a compact strip at the top showing, over the last 30 days: links sent, links opened, drivers who replied, and the reply rate as a percentage. A short note explains it counts opened links that produced at least one driver message.
- No change to how links are made, how they expire, or what a driver can do.

## 2. Admin flight budget dashboard

Paid flight lookups are already logged and hard-capped at 25 per day, but the cap is invisible and cannot be adjusted without a code change.

- Admin-only panel showing today's paid reads used, remaining, the standing cap of 25, and any extra granted today.
- A list of today's reads: time, provider, flight, outcome — so a wasted spend is obvious.
- **Top up today:** an admin enters extra reads plus a reason. It applies to today only; tomorrow returns to 25. Every grant is stored with who granted it and why.
- The flight service reads the effective limit (25 plus today's grants) instead of the fixed constant, and still fails closed if the ledger cannot be read.
- Managers and below see nothing here; no automatic top-ups.

## 3. Live end-to-end check

Run in a real browser against the running app:

1. Create a driver link from Front Desk and open it as a driver would.
2. Send a driver message; confirm it appears in the Front Desk driver chat and on the guest pickup card.
3. Confirm the response-rate line flips to "Driver replied".
4. Mark the pickup collected, then reload the link and confirm it is closed off.
5. Report findings with screenshots.

## Technical notes

- New table `flight_budget_grants` (read_day, extra_reads, reason, granted_by, created_at) with RLS + GRANTs; admin insert/select only.
- `paidReadsRemaining` in `supabase/functions/_shared/flightProviders.ts` becomes `base 25 + sum(grants for today) - count(paid reads today)`; ledger errors still return 0.
- Response-rate hook aggregates `pickup_driver_links` (view_count, created_at) joined to `pickup_driver_messages` where `sender_type = 'driver'`, 30-day window; per-pickup variant reused by the pickup card.
- New components: `FlightBudgetPanel` (admin settings/monitoring surface), `DriverResponseRateStrip` (Arrivals Board), status line inside the existing pickup card section.
- EN/TH i18n keys for all new copy. Tests for the rate calculation and the effective-cap math.
