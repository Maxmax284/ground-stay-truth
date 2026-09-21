# Guest Arrival Intelligence — Addendum: Final-Phase Dual Flight-Data Integration

This addendum does **not** replace the agreed Guest Arrival Intelligence plan. It is appended as the **last stage**, after every earlier stage is built, validated and accepted.

## What Metro Echo actually uses (verified, not assumed)

Read from Metro Echo's own code (read-only snapshot), `supabase/functions/_shared/`:

- **FlightAware AeroAPI v4** — `aeroApi.ts`, secret `AEROAPI_KEY` (fallback name `FLIGHTAWARE_API_KEY`). Asked **first**. Reads airline dispatch: real UTC instants (`scheduled/estimated/actual_out|in`), delay seconds, terminal/gate, cancelled/diverted, last known position (lat/lon/altitude/heading/groundspeed), airport timezone carried with the record, and codeshare lists (`codeshares`, `codeshares_iata`) so a ticket number resolves to the operating number.
- **AviationStack** — `flightProvider.ts` → `flightStatus.ts`, secret `AVIATIONSTACK_API_KEY` (fallback `FLIGHT_API_KEY`). The **backup aggregator**. Cheaper/looser: schedule + status + a `codeshared` block giving operating vs marketed carrier. Its free tier refuses the `flight_date` filter, so Metro Echo retries without the date and filters the day in code.
- **Order and honesty rules** (`readFlightWithFeed`): AeroAPI first; on empty or thrown, fall back to AviationStack; if neither carries the flight, return nothing — silence is never rendered as "on time". The answering feed's name travels with the reading (`feed: "aeroapi" | "aviationstack"`).
- **Budget** (`countedRead`, `spentToday`): per-feed daily ceiling `FLIGHT_DAILY_BUDGET` (default 40 paid reads), each read logged to `api_usage_logs` with provider, feature, cache_hit and status *before* use. A feed that has spent its day is skipped rather than silencing the other one. `over_budget` is returned as a real answer, not an error.

CampStay today uses AviationStack only (`AVIATIONSTACK_API_KEY`, free tier, HTTP-only, date filtered in code) across `check-flight-status`, `poll-flights`, `poll-airport-traffic`, `guest-arrival-journey`, `arrival-fact-sync`.

## Overlap and division of labour

| Need | AeroAPI | AviationStack |
|---|---|---|
| Operating vs marketed carrier (TG6285 / BR3) | Authoritative, both directions | Present but thinner |
| Actual in/out instants + delay | Yes, with airport timezone | Partial, often schedule-only |
| Gate/terminal, cancelled/diverted | Yes | Sometimes |
| Live position (radar card) | Yes | No |
| Cost per read | Paid, per-query | Free tier / cheap, hard quota |

So: **AeroAPI is truth, AviationStack is presence.** Two feeds are for *verification and continuity*, not for more data.

## Recommendation: bounded local integration, not a shared service

Do **not** call Metro Echo's functions from CampStay. Different tenants, different auth, different RLS, and a cross-project dependency would make guest arrivals fail when an unrelated project changes. Instead port the *pattern* — provider adapters, feed-named readings, per-feed daily ceiling, usage ledger — into CampStay's own bounded seam, keyed to `flight_facts` (one row per physical flight/date) so five guests on one aircraft cost one read.

## Provider-neutral seams the earlier stages may define (and nothing more)

Earlier stages are allowed to shape these so late wiring is not a rewrite:

- `flight_facts.source` / `provenance` already records which feed produced each field; keep it a free string, not an enum of one.
- A single `readFlightFact(flightKey)` contract inside `arrival-fact-sync` — one adapter today (AviationStack), room for a list tomorrow.
- `arrival_conflicts` already carries `existing_source` vs `incoming_source`; feed-vs-feed disagreement will reuse it unchanged.
- No earlier stage adds a second provider secret, a second HTTP client, failover logic, or budget tables. Any temptation to "just add AeroAPI while we're here" is out of scope until this phase.

## Final phase: work items (only after all prior stages pass acceptance)

1. **Secrets & config** — `AEROAPI_KEY` added by Max in Project Settings → Secrets; `FLIGHT_DAILY_BUDGET` per feed. Absent key = single-feed behaviour, no crash.
2. **Adapter layer** — `supabase/functions/_shared/flightFeeds.ts`: `askAero()` and `askStack()` returning one normalised shape plus the feed name. Read-only; no booking, pickup, money or state writes.
3. **Ordering & failover** — AeroAPI first, AviationStack second, empty-is-empty. Terminal statuses still never re-polled.
4. **Budget ledger** — per-feed counted reads with a CampStay usage log, `over_budget` surfaced to staff as "flight data paused today", never as a fake status.
5. **Caching** — `flight_facts` stays the cache (10-minute freshness, shared per aircraft/date). Feed choice never bypasses the cache.
6. **Provenance & conflicts** — field-level feed attribution; when the two feeds disagree beyond tolerance (≥15 min), open an `arrival_conflicts` row for a human, do not silently pick a winner. Provider still never overwrites staff-entered facts.
7. **Codeshare resolution** — operating number resolution promoted to AeroAPI's codeshare lists, with AviationStack's `codeshared` block as fallback.
8. **Monitoring** — per-feed success/empty/limited counts, daily spend, and a single admin health line. No new dashboard.

## Acceptance criteria for this phase

- TG6285 (marketed) resolves to BR3 (operated) IAD→TPE via AeroAPI, and still resolves with AeroAPI disabled.
- AeroAPI empty → AviationStack answers; both empty → "no flight data on record", never "on time".
- Five guests on one flight/date = one paid read; ledger proves it.
- Per-feed ceiling reached → that feed skipped, other feed still answers; both spent → `over_budget` shown honestly.
- Feed disagreement on arrival time opens a conflict; no booking, pickup, room, price or state change occurs from any provider read.
- All earlier-stage regression tests (rollover, ferry leg, late pickup, no-show, no data, stale data, security boundaries) still pass unchanged.

## Explicitly out of scope, permanently

Cross-project calls to Metro Echo; position/telemetry treated as the guest's whereabouts; any automatic booking/pickup/check-in transition from a provider read; a third provider; a new dashboard.

## Decisions needed from Max

1. Fund AeroAPI at this phase, or ship single-feed and keep the adapter dormant?
2. Daily paid-read ceiling for CampStay (Metro Echo runs 40/feed)?
3. Keep the five original open decisions as they stand (driver access, screenshot review, landing auto-confirm, evidence retention, flight tier)?
