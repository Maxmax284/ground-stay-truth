# Guest Arrival Intelligence — Audit and Integration Plan

Audit-only pass on the live CampStay LMT code, schema and RLS. Nothing was changed.

## 1. What actually exists today

**LIVE**

- Pickup record per booking: `airport_pickups` (flight_number = final leg, international_flight_number = first leg, final_flight_confirmed, confirmed_airport, guest_landed_at, arrival_type/location/confidence, transport_intent, pickup_enabled, assist_mode + reason + audit columns).
- Journey interpretation: `src/lib/travelState.ts` (pre_departure → missing_final_flight → awaiting_departure → in_transit_bkk → arriving → arrived), `src/lib/arrivalModel.ts` (normalizeArrival, pickup resolution, staff warnings). Good bones — reuse, don't replace.
- Flight cache + polling: `flight_tracking` (one row per pickup), `check-flight-status` (10-min cache, 3-min force cooldown, per-user/per-pickup rate limits, terminal statuses never re-polled), `poll-flights` (15-min cron, 2-day window, 200 cap, 15-min near / 120-min far cooldown), `poll-airport-traffic` + `airport_traffic` (per-airport board, unique on flight_iata+date+airport+direction).
- Guest landing: `guest-landed` (guest-owned only, rate-limited), driver handshake payload, BKK-transit vs final-destination distinction, airport mismatch cross-check, staff + guest notifications.
- Guest surfaces: `GuestFlightTracker`, `MetroEchoRadar`, `GuestNowCard`, `WhileYouWaitTab`, `GuestPickupCard`, `LandedConfirmationDialog`, `GuestArrivalSelector`.
- Staff surfaces: `ArrivalsBoard`, `FlightForecastWidget`, `AirportPickupSection`, `CheckInDesk`, `GuestJourneyTimeline`.
- RLS is real and role-shaped: pickups/flight_tracking/arrival stage log readable by owning guest or `has_ops_read`, writable by `has_ops_write`/manager/admin/supervisor.
- Booking lifecycle: `bookingStateMachine.ts` inquiry → pending_deposit/confirmed → checked_in → completed, with `booking_state_log`.
- Messaging: `messages` + `GuestThreadDialog` (staff reply is instant, admin notified), Telegram/LINE/WhatsApp/Twilio capture functions, `notify-via-messaging`, push + email.

**PARTIAL**

- Multi-leg: exactly two legs, by column name only. No leg list, no per-leg status, no onward-connection risk, no ferry leg as a tracked leg.
- Airport vocabulary: alias map in `check-flight-status` covers USM/BKK/DMK/URT only; `src/lib/airports.ts` lists nine codes. TPE, IAD etc. are unmapped strings.
- Timezones: `src/lib/timezone.ts` is Asia/Bangkok only. Provider timestamps are stored as-is; no departure-timezone or date-rollover handling.
- Staleness/assist: `evaluateAssistMode` is written but driven by ad-hoc call sites, not one shared read-model.
- Provenance: `flight_tracking.raw_response` exists; there is no per-field source or "who set this" record, so a poll can overwrite a staff-entered value with no trail.

**MISSING**

- Marketed vs operating carrier / codeshare. `flight_tracking` has `airline_name` and one flight number. TG6285 marketed / BR3 operated cannot be represented, and a lookup on the marketed number may miss or mismatch.
- Shared-aircraft dedupe. Lookups are keyed by `pickup_id`, so five guests on one flight cost five provider calls and can disagree.
- Screenshot / confirmation-email intake. Only `guest_documents.document_type = 'passport'` exists in production; `verify-document` is ID-only. No flight-evidence upload, no OCR, no extraction review.
- Separation of aircraft-landed from guest-ready. `guest_landed_at` is the only signal and `guest-landed` auto-promotes pickup to confirmed. There is no distinct immigration-cleared / bags / I'm ready / collected / checked-in ladder.
- Driver view of any kind. `drivers` has no user/auth column — drivers cannot log in, so "driver sees only what he needs" has no surface at all today.
- Conflict resolution UI. Mismatch only flips assist_mode; nobody is shown two competing facts and asked to choose.
- Onward-leg risk (missed BKK→USM connection, ferry fallback) and ferry-leg tracking.

**BLOCKED**

- AviationStack free tier: HTTP only, no `flight_date` filter, tight monthly quota. Codeshare and multi-leg fidelity may need a paid tier or a second provider. Decision needed before build.
- Driver-facing access needs a decision (login vs tokenised link) — cannot be designed around silently.

## 2. Target design

**One read-model, one writer.** A single derived "arrival situation" per booking, assembled server-side from: guest-stated legs, staff-entered facts, provider flight data, guest self-reports. Every leg and every fact carries a source and a confidence. Provider data never overwrites a staff- or guest-authoritative field; a disagreement becomes a visible conflict with a human action, never a silent edit.

**Legs, not two columns.** A journey is an ordered list of legs (flight, ferry, road), each with marketed number, operating number, operating carrier, from/to, local departure and arrival times with their own zone, and status. The final Samui leg remains the only operational driver — that rule stays.

**Aircraft vs person.** Two separate tracks that never merge: aircraft status (scheduled/in air/landed/delayed/diverted) and guest progress (Confirm details → I'm ready → Collected → Checked in). Landed never implies ready. Only a human action advances the guest track.

**Shared flight facts.** Flight data keyed by flight + date + airport, referenced by many pickups. One lookup serves five guests, all see the same fact, quota drops.

**2–3-second role views, no new dashboard.** Same journey, five renderings inside existing pages:

- Guest (`/guest`): one Now card — next action, today's leg, where to stand, who to contact.
- Reception (`FrontDesk`/`ArrivalsBoard`): who is arriving, what needs doing, one action per row.
- Driver: a single scoped view — name, meeting point, time, phone. Nothing financial, nothing about other guests.
- Manager: exceptions only — unassigned, late, conflicting, missed connection, no data.
- Admin: same plus provenance, system health, quota and audit.

Verbs are meaning-specific: Confirm details, Assign pickup, I'm ready, Collected, Checked in, Noted. No aviation jargon, no telemetry-as-location, no duplicate notices.

## 3. Rollout stages

1. **Read-model + provenance** behind the existing screens, no new UI. Legs, sources, conflicts, shared flight facts.
2. **Guest flight intake**: paste or type flight; evidence upload with staff-reviewed extraction; nothing auto-applied.
3. **Aircraft vs guest ladder**: split the tracks, retire auto-confirm on landing, add the human verbs.
4. **Role views**: reception exceptions, manager exceptions, driver scoped view (after the access decision).
5. **Onward-leg risk and ferry legs**: missed connection, fallback, uncertain timing.

## 4. Acceptance scenarios

TG6285 marketed / BR3 operated IAD→TPE with later BKK→USM and a ferry alternative; date and time rollover across zones; five guests on one aircraft (one lookup, one shared fact); flight lands but guest is not ready; late pickup; no-show; no flight data at all; guest changes flight after staff entered it; provider contradicts staff; guest tries to read another guest's arrival; driver view leaks nothing extra; quota exhausted degrades honestly.

## 5. Explicitly out of scope

Live GPS or continuous location sharing; automatic booking-state changes from flight data; automatic refunds or fee changes; a new standalone dashboard; passenger manifests; a second guest messaging surface; replacing `travelState.ts`/`arrivalModel.ts`.

## 6. Decisions needed from Max

1. Flight data source: stay on AviationStack free (accept weak codeshare/multi-leg), or fund a tier/second provider? Recommendation: build provider-agnostic, keep free tier for stage 1, revisit before stage 5.
2. Driver access: tokenised link per pickup (no account), or real driver logins? Recommendation: tokenised link, expiring, single pickup, read-only plus "Collected".
3. Screenshot intake: staff-reviewed extraction only, or auto-apply high-confidence reads? Recommendation: always staff-reviewed at first.
4. Landing behaviour: keep auto-confirming pickup on landing, or require a human "I'm ready"/"Assign"? Recommendation: stop auto-confirming; landing raises an action, a human confirms.
5. Evidence retention: how long do flight screenshots/confirmations live before purge? Recommendation: 30 days after checkout, then delete.

Approved — proceed with the staged architecture only: build the behind-the-scenes read-model, provenance, conflicts, and shared flight facts first, while keeping the current CampStay booking flow intact and making sure flight data never automatically changes bookings, money, rooms, or pickup status without human confirmation..