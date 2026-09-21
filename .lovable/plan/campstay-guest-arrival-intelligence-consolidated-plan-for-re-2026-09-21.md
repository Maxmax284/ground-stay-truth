# CampStay Guest Arrival Intelligence — Consolidated Plan (for review)

One stay, one journey, five role-shaped views. Plan only — nothing in this document has been built beyond what the "LIVE" section states.

## Ground rules (Max's decisions, now binding)

1. Aircraft landing means **the aircraft landed**. It never advances guest ready / collected / checked-in. Those need a human tap.
2. Flight data never claims to know where a guest physically is. No telemetry-as-location, ever.
3. No provider read may change a booking, price, room, pickup status or state. Reads produce facts and, on disagreement, visible conflicts for a human.
4. AeroAPI stays off until the final phase. Earlier stages keep AviationStack only, plus a provider-neutral seam — no second secret, HTTP client, failover or budget ledger before then.
5. Screenshot extraction may fill **missing** facts automatically with provenance. Conflicts and consequential changes go to a human.
6. Driver access is least-privilege: assigned driver and authorised transport staff only.
7. Evidence retention is finite and stated in days before launch.

## Status reconciliation — what is actually deployed

**LIVE (built, deployed, not yet user-accepted):** Stage 1 read-model and provenance.

- Tables `flight_facts` (30 cols), `journey_legs` (26), `arrival_conflicts` (15) exist in the live database with role-shaped RLS. All three currently hold **0 rows** — nothing is feeding them yet.
- `src/lib/arrivalIntelligence.ts` (source hierarchy, `canOverwrite`, flight key, connection assessment, conflict detection, role views), `src/hooks/useArrivalIntelligence.ts`, `src/lib/__tests__/arrivalIntelligence.test.ts` (20 passing tests).
- `supabase/functions/arrival-fact-sync/index.ts` deployed: staff-only, reuses facts <10 min old, AviationStack fallback, records disagreements as conflicts, writes nothing operational.
- 20 passing tests are **not** your sign-off. Stage 1 acceptance is still open: it needs real legs flowing in and the role views read on a phone.

**Also LIVE from before:** `airport_pickups`, `flight_tracking`, `check-flight-status`, `poll-flights` (15-min cron), `poll-airport-traffic`, `guest-landed`, guest surfaces (`GuestNowCard`, `MetroEchoRadar`, `WhileYouWaitTab`, `GuestFlightTracker`, `GuestPickupCard`, `LandedConfirmationDialog`), staff surfaces (`ArrivalsBoard`, `FlightForecastWidget`, `AirportPickupSection`, `CheckInDesk`), booking state machine + `booking_state_log`, messaging with instant staff replies.

**Known gaps still standing:** no leg intake (so the read-model is empty), `guest-landed` still auto-confirms pickup (violates decision 1 and is fixed in Stage 3), no driver view, no conflict-resolution UI, no screenshot intake, aliases cover a handful of airports.

## The three-second standard (applies to every stage)

Each role, one glance, human verbs only — Confirm details, Assign pickup, I'm ready, Collected, Checked in, Noted.

- **Guest:** what happens next, my legs, where to meet, who to contact.
- **Reception:** who's arriving today, what needs doing now.
- **Manager:** exceptions only — tight connections, unassigned pickups, conflicts, no-shows.
- **Admin:** provenance, feed health, audit.
- **Driver:** one pickup — name, time, terminal, meeting point, contact. No money, no other guests, no provenance.

No new dashboard, no aviation jargon, no duplicate notices. New facts enrich the existing arrival situation.

## Stages

### Stage 1 — Read-model + provenance — BUILT, awaiting your acceptance

Acceptance: legs visible for a real booking; provider never silently overwrites a staff-entered value; driver view provably carries no financial or other-guest data.

### Stage 2 — Flight & journey intake (next stage)

Guest enters legs (marketed number, date, route) or uploads a booking screenshot/confirmation. Multi-leg ordered legs, ferry/road legs included, only the final leg drives operations. Extraction rules:

- Empty field + confident extraction → fill it, stamped `source: extracted`, dated, with the evidence linked. No staff gate.
- Field already set by a human, or extraction disagrees, or the change is consequential (arrival date/airport/final leg) → open conflict, human decides.
- Booking references and PNRs are treated as secret: stored masked, never shown in staff lists or notifications, visible only to the owning guest and admin.
- Guest ownership: a guest may only attach evidence to their own booking; staff uploads are attributed to the staff member.  
Acceptance: TG6285 marketed resolves to the operating BR3 IAD→TPE; BKK→Samui plus ferry reads as one journey; date rollover across timezones correct; five guests on one aircraft share one fact row; a screenshot that contradicts staff entry raises a conflict rather than overwriting.

### Stage 3 — Two tracks: aircraft status vs guest progress

Split the signals. Aircraft: scheduled / airborne / landed / cancelled / diverted. Guest: details_needed → details_confirmed → travelling → self-reported landed → ready for pickup → collected → checked in. `guest-landed` stops auto-confirming pickup; "I'm ready" and "Collected" become explicit human actions.  
Acceptance: landed aircraft with no guest tap leaves pickup unconfirmed; late pickup, no-show and no-data cases behave; no state change without a named actor in the audit log.

### Stage 4 — Role views + conflict resolution in existing screens

Guest Now card, reception arrivals list, manager exception list, admin provenance panel, narrowly scoped driver view. Conflict rows get a plain-language resolve UI ("Keep staff value" / "Use flight data" / "Noted").  
Driver access default proposed: **a single-pickup, expiring, read-only tokenised link** (no account, no password, scoped to one pickup, auto-dead after checkout), plus authorised transport staff via normal login. Flagged for your call — say the word if you'd rather drivers have real logins.  
Acceptance: each role view readable in under three seconds on a phone; driver link exposes exactly one pickup and nothing financial; expired link is dead.

### Stage 5 — Retention, consent, monitoring

Proposed defaults, for your approval before launch (not yet approved):

- Uploaded travel evidence (screenshots/confirmations): delete **30 days after checkout**.
- Derived flight facts: keep **90 days**, then delete.
- Provenance/audit rows (who set what, when, from which source, no payload): keep **2 years**, PNRs masked.  
Plus consent copy for evidence upload, and a single admin health line. Acceptance: a scheduled purge demonstrably deletes expired evidence while audit trails survive.

---

## Final phase (after stages 1–5 pass acceptance): dual flight-data providers

Verified from Metro Echo's own code, not assumed: it runs **FlightAware AeroAPI v4** (`AEROAPI_KEY`, asked first — dispatch-grade actual times, delays, gate/terminal, cancelled/diverted, position, airport timezone, codeshare lists) with **AviationStack** (`AVIATIONSTACK_API_KEY`) as backup aggregator, a per-feed daily ceiling (`FLIGHT_DAILY_BUDGET`, 40 there) and every paid read logged before use. CampStay today is AviationStack-only, free tier.

Position in this phase: **AeroAPI is the preferred operational feed, not infallible truth.**

- Availability fallback: AeroAPI empty, error or limited → ask AviationStack. Both empty → "no flight data on record". Never a fabricated "on time".
- Routine dual-source verification is **not** a second paid call. Where two readings already exist (cache, fallback), disagreements surface as conflicts with dated per-field provenance. No gratuitous second call for comparison's sake.
- Ceiling is **measured, not copied**: count actual arrivals per day from live bookings, multiply by the polls a stay needs, price it against AeroAPI's tier, and bring you a number for explicit approval before any paid activation.
- Per-flight shared caching stays the gate (one `flight_facts` row per aircraft/date), plus a lock so concurrent requests for the same flight cannot both pay.
- Do not port Metro Echo's functions or call them across projects — equivalent bounded integration inside CampStay, so an unrelated project can never break guest arrivals.

Release gates for this phase: marketed→operating resolution works with AeroAPI on and off; five guests one flight = one paid read, proven in the ledger; ceiling reached → that feed skipped, the other still answers, "flight data paused today" shown honestly; feed disagreement opens a conflict; every stage 1–5 regression test still green; no booking/pickup/price/room change from any read.

## Outstanding decisions

1. Driver access mechanism — accept the expiring single-pickup link default, or require real logins?
2. Retention numbers — accept 30 / 90 days / 2 years, or set your own?
3. Paid-read ceiling — approve after I bring measured volumes and AeroAPI pricing (final phase only).

## Approval requested

Approval for **Stage 2 (flight & journey intake) only**. Stages 3–5 and the final dual-provider phase each come back for separate sign-off.

&nbsp;

Approved — proceed with Stage 2: Flight & Journey Intake only.

&nbsp;

Include the following requirements in the implementation:

&nbsp;

- Verify the Stage 1 foundation using a real authorized test booking and confirm that journey legs, shared flight facts, provenance, conflicts, and role permissions work correctly.

- Allow guests to submit flight details manually or through booking screenshots and confirmations. Support complete multi-leg journeys, including international connections, domestic flights, ferries, and road transfers.

- Automatically enrich missing, non-destructive information when extraction is reliable, preserving the original evidence and source attribution. Existing human-entered facts, conflicting information, and consequential changes must require human review.

- Never assume that an international arrival is the guest's final arrival in Koh Samui. Ask for missing onward travel details when necessary.

- Resolve operating versus marketing carriers and codeshares where supported, including the TG6285 / EVA Air BR3 test case.

- Preserve existing booking, pickup, accommodation, payment, and check-in behavior. Flight intake must not silently change any of these states.

- Maintain strict guest ownership, role-based access, and protection of sensitive booking references.

&nbsp;

UX requirement: Everything must be painfully obvious. Guests should understand what information is needed and what happens next within 2–3 seconds. Reuse the existing CampStay experience without adding unnecessary dashboards, confusing terminology, or extra steps.

&nbsp;

Complete the implementation, run the agreed acceptance and regression tests, and report the results before proceeding further.

&nbsp;

Stages 3–5 and the final AeroAPI/AviationStack integration remain unapproved. Do not begin subsequent stages without my explicit authorization.