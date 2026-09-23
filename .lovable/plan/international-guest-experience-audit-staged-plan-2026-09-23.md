# International Guest Experience — Audit + Staged Plan

Read-only audit of the live CampStay LMT code. Nothing was changed. Findings below are split into **LIVE** (wired into a real screen), **PARTIAL** (exists but not fully reachable / thin), and **GAP / PROPOSED**.

## A. What actually exists today

### Guest portal (one surface, already context-driven)

- `src/pages/GuestPortal.tsx` is the single guest surface. It composes `GuestNowCard` (line 484), `GuestFlightTracker` (503, 1142), `GuestPersonalGuideCard` (533), `GuestPickupCard` (1132), `GuestPlaybook` (843). **LIVE.** The "one card tells you the next step" pattern the vision asks for already exists — new work extends it, no new dashboard needed.
- `GuestPortalPreview.tsx` is the admin/manager preview and renders `GuestNowCard` + `GroundRadar` directly. **LIVE.**
- `GroundRadar.tsx` is pure presentation, fed by `GuestFlightTracker`. **LIVE.**

### Flights / arrival intelligence

- `supabase/functions/_shared/flightProviders.ts`: providers are `aeroapi` then `aviationstack` (types line 24, calls 398-424), paid-read reservation, ceiling + `ceiling_reached` outcome, per-day cap 25 plus admin grants. **LIVE.**
- Tables present in generated types: `flight_facts`, `flight_provider_reads`, `flight_read_locks`, `flight_tracking`, `flight_budget_grants`, `journey_legs`, `journey_leg_field_provenance`, `journey_evidence`, `arrival_conflicts`, `guest_arrival_stage_log`, `airport_pickups`, `airport_traffic`, `pickup_driver_links`, `pickup_driver_messages`. **LIVE.**
- Functions present: `check-flight-status`, `guest-arrival-journey`, `guest-landed`, `journey-intake`, `arrival-fact-sync`, `arrival-progress`, `driver-pickup`, `cleanup-retention`, `daily-briefing`. **LIVE.**
- Admin budget panel `src/components/monitoring/FlightBudgetPanel.tsx`, `DriverResponseRateStrip`, `DriverResponseLine`. **LIVE (code), NOT staff-verified on a real device** — the previous live test only confirmed the driver link end-to-end; staff screens stopped at the authenticator prompt. This remains an open verification item, not a code gap.

### Driver pickup

- `DriverPickup.tsx` (token page, no login), `driver-pickup` function, `PickupConversation`/`PickupConversationDialog`, `front-desk/DriverChatPanel.tsx`, `AirportPickupSection.tsx` controls, expiring/revoked-on-collected links, immutable messages. **LIVE.**

### Airport content

- `src/lib/airportFactSheets.ts` — hardcoded fact sheets for BKK, USM, piers, bus, with a rich shape (immigration, customs, SIM, cash, transport, terminal, route, weather, connectivity, late night) plus a section schema used by `ArrivalWelcomeEditor.tsx` / `GuidedSectionEditor.tsx`. **PARTIAL:** real content, but only these few locations, code-resident (no review dates, no source links, no per-airport DB rows, editors can't add a new airport).
- `src/lib/airports.ts` — 9 tracked IATA codes with labels, no ICAO, no city/country/timezone, no terminals, no official links. **PARTIAL.**
- `src/lib/meetingPoints.ts`, `ArrivalWelcomeGuide.tsx`, `ArrivalRouteFAQ.tsx`, `DriverHandshakeCard.tsx`. **LIVE.**

### Language / i18n

- `src/i18n/index.ts` declares 9 languages, lazy-loaded. Actual key coverage (line counts): `en` 2283, `th` 2283, `fr`/`de`/`ko` 1226, `es`/`ja`/`ru`/`zh` 1047. So **English and Thai are complete; the other seven are roughly half or less and silently fall back to English.** Presenting them as "live" today would be inaccurate.
- `src/lib/__tests__/i18nCoverage.test.ts` enforces EN↔TH parity only — no gate on the other languages.
- `profiles.preferred_language` + `useLanguagePreference.ts` already gives each **staff member and guest** an individual persisted language, with explicit device choice winning. `LanguageToggle` / `LanguageSelector`. **LIVE.** No locale suggestion prompt exists anywhere — and no code currently infers language from airport (good).

### Translation

- `supabase/functions/translate-message/index.ts` — AI Gateway (`google/gemini-2.5-flash`), AI guard (budget + rate limit + role), 4000-char cap, CORS allowlist, usage logging. **LIVE.**
- `src/hooks/useMessageTranslation.ts` with an in-memory cache. **PARTIAL — staff side only:** the only consumer is `BookingDetailSheet.tsx` (811), using `profiles.preferred_language`. `useWelcomeTranslation.ts` translates arrival-guide content. `GuestThreadDialog.tsx` has **no** translation, so the guest never sees a translated staff reply and the driver chat has none at all.
- No persisted translation storage: nothing keeps the original + translation pair, no "translated by machine" marker in the DB, no cache across sessions or devices.

### Samui / Lamai content

- `local_recommendations` table exists (category, name, description, address, maps_url, phone, whatsapp, website, opening_hours, photos, badges, featured, is_active, sort_order, staff_notes, property_id). **ORPHAN:** `rg` finds zero references in `src/` outside generated types — no editor, no guest surface, no RLS verified in app code. Nothing is published to guests from it today.
- `intelligence_entries` (status, audience, location, translations JSON, image, expires_at, approved_by) is the closest working authoring+review model. **LIVE** via `IntelligenceEditor.tsx`. Its `translations` JSON column is the pattern to copy for guide content.
- No "last reviewed", "seasonal/closed", or accessible-directions fields anywhere yet.

### Inaccessible / unverified in this audit

- RLS policy text and grants for `local_recommendations` and `pickup_driver_messages` were not read (no schema queries in plan mode) — must be confirmed before building on them.
- No real-device (iOS/Android browser) verification exists for the flight budget panel, driver reply rate, or staff pickup chat.
- Actual guest nationality/origin mix is unknown — language priority below is a guess until we look at real booking data.

## B. Storyboard — traveller whose journey starts in France

No nationality is inferred. Only the verified itinerary (CDG → BKK → USM) and the guest's own chosen language are used.

1. **Booking / pre-departure.** Portal is in whatever the guest picked. Because the first leg is CDG, one dismissible line offers: "Your journey starts in Paris — read CampStay in Français?" with Yes / No thanks. Declining is remembered. Now card = deposit or "add your flights".
2. **Flights not booked yet.** Journey intake keeps the "not booked yet" state; the Now card asks for flight numbers rather than showing a fake radar.
3. **Origin airport (CDG).** Now card: departure day checklist (passport, deposit paid, meeting point for Samui, who to message). Airport guidance is generic + officially linked — no invented gates.
4. **Approaching BKK.** Ground Radar shows the aircraft leg. When the aircraft lands, the card explicitly says *aircraft landed — you may still be deplaning, at immigration or with bags*, plus BKK transit guidance (transit vs entering Thailand, official BKK links, connection time to the USM gate). No booking, room, fee or pickup change happens from a provider read.
5. **BKK → USM hop.** Second leg becomes the live leg. Pickup card moves up: meeting point, driver status, "I'm ready" button — guest-confirmed, never GPS-derived.
6. **USM arrival.** Pickup instructions first: meeting point photo, "I'm ready", driver chat. Discovery content stays collapsed underneath.
7. **Messaging.** Guest writes French. Front desk reads English (or Thai per their own `preferred_language`), replies in that language, guest sees French with "Translated — view original". Names, flight codes, PNRs and meeting-point names are preserved verbatim. Anything consequential (changed meeting point, booking change, medical/safety) shows an explicit confirm-with-original step and can be escalated to a human.
8. **Checked-in contrast.** Once a human check-in is recorded, radar and pickup disappear entirely. Now card becomes stay-focused: today's training, WiFi/essentials, laundry/maintenance, then the Lamai-edited island guide as the second layer.

## C. Staged rollout (separate approval per stage)

**Stage 0 — cross-cutting design system (small, do first).** Arrival/guest design tokens, one `WelcomeMoment` motion primitive honouring `prefers-reduced-motion`, one image component with low-bandwidth/offline fallback, a shared "next step first / detail second" card layout, contrast + focus audit, long-word/RTL-safe multilingual layout rules. Acceptance: existing guest portal visually unchanged where untouched; Lighthouse mobile ≥ current; reduced-motion honoured; all screens pass 2–3s load on a real phone over mobile data.

**Stage 1 — language foundation.** Locale suggestion prompt (itinerary-city based, opt-in, dismiss remembered, never nationality); explicit per-user persistence already exists so it's reused; extend the coverage test to gate every shipped language and hide/flag languages below a coverage threshold instead of claiming they're live; finish `fr` (or whichever the real guest mix names) to full parity; staff EN/TH preference surfaced in the staff profile. Acceptance: switching language persists across devices; incomplete languages never render raw keys; EN/TH regression test still green.

**Stage 2 — two-way message translation (depends on Stage 1).** Extend `translate-message` to persist original + translation + provider + timestamp; add translation to `GuestThreadDialog` and to the driver pickup chat (same limited scope, no financial data); "Translated — view original" on every machine-translated bubble; do-not-translate protection for names, flight numbers, PNRs, meeting-point labels; explicit failure state ("couldn't translate, showing original"); consequential-intent confirmation; translation never triggers an operational change. Reuse the existing AI guard budget/rate limits and cache. Acceptance: French guest ↔ English staff round trip with original preserved; message immutability and role RLS unchanged; driver link still needs no login; a forced provider failure degrades to original text, not a blank bubble.

**Stage 3 — airport guidance (independent of 1–2, can run parallel after Stage 0).** Move airport identity to a directory table (IATA, ICAO where available, city, country, timezone, official links, terminals) and keep `airportFactSheets.ts` content as the seed for a tiered curated layer with `source_url`, `last_reviewed_at`, and a generic fallback when an airport has no curated content. Start BKK + USM, then the origin/transit airports the real bookings show (IAD/TPE are examples, not defaults). Correct airport/terminal per leg. No indoor turn-by-turn, no invented gate or visa advice; entry/transit info links official jurisdiction sources with explicit uncertainty. Acceptance: an unknown airport renders the graceful generic card; each curated card shows its source and review date; per-leg airport is correct on a multi-leg itinerary.

**Stage 4 — Samui welcome + Lamai-edited guide (depends on 3 for layout, 1–2 for translations).** Adopt the orphan `local_recommendations` table (verify RLS first) or align it with the `intelligence_entries` authoring model: admin/manager draft → review → publish/unpublish, categories, images, maps link, accessible directions, verified contact/hours, `last_reviewed_at`, seasonal/closed flag, `translations` JSON. Editorial "Lamai picks" visually separated from official/safety info. Content layers **under** the pickup/arrival action pre-arrival, and rises after check-in. No hardcoded invented businesses — empty categories stay empty.

Ordering note: Stage 3 is deliberately allowed to run in parallel with 1–2 because it shares no code path; Stage 4 is last because it depends on both the layout and the translation plumbing.

**Each stage's regression checks:** real iOS + Android browser pass; guest / staff / admin / driver boundary checks (driver sees no financials, no login; guest sees only own booking); no duplicate cards or boards on the portal, Front Desk or Arrivals Board; full vitest suite; EN/TH i18n parity test. **Deploy** (functions live) ≠ **publish** (guests see it) ≠ **user acceptance** (Nikki signs off on a phone) — each stage gets all three, explicitly.

## D. Cost and operational considerations

- **Translation:** already metered through the AI guard; persisting translations plus a DB-level cache is the main cost lever (same text never re-billed). Per-message cost is small; the risk is an unbounded chat loop, so keep rate limits and length caps. Machine translation must always be labelled.
- **Maps / geo:** prefer official airport sites and plain maps links (already how `maps_url` is shaped) over a paid maps SDK. Any indoor map data would be a licensed, maintained feed — out of scope.
- **Images / licensing:** contextual Samui/Lamai imagery should come from Lamai's own photos via the existing media library, with an explicit credit field. No scraped or stock-ambiguous images.
- **Freshness / ownership:** every curated airport and recommendation row carries `last_reviewed_at` and an owner; stale rows surface in the existing monitoring page rather than silently ageing.
- **Flight API budget:** unchanged — 25 paid reads/day plus audited same-day grants, fail-closed on ledger errors.
- **Privacy:** itinerary city is used for a *suggestion* only; no nationality, citizenship or identity inference; no GPS; translation payloads follow existing AI-guard logging (hashed IP, no content retention beyond the message record).
- **Offline / low data:** cached last-known arrival state, lightweight images, text-first fallbacks.
- **Accessibility:** contrast, focus order, reduced motion, screen-reader labels for radar and status states, and readable layouts for long translated strings.

## E. Decisions for Max / Nikki (defaults are proposals only)

1. Which guest languages to actually finish first — *proposed default:* French and German next, confirmed against real booking origins, rest stay hidden until complete.
2. Should incomplete languages be hidden or shown with a "partly translated" note — *proposed:* hidden.
3. Does the driver chat get translation too — *proposed:* yes, same limited scope.
4. Who owns the Lamai guide content and review cadence — *proposed:* manager authors, admin publishes, 90-day review.
5. Airport curation list beyond BKK/USM — *proposed:* top 5 origin/transit airports from real bookings.
6. Whether to reuse `local_recommendations` or fold guide content into `intelligence_entries` — *proposed:* reuse `local_recommendations` after an RLS check.
7. Single-language or per-thread staff reading language — *proposed:* per-staff preference, already built.

## F. Next action (narrowest first step, needs separate approval)

**Stage 0 only: the cross-cutting design and safety foundation** — arrival design tokens, one reduced-motion welcome-moment primitive, one low-bandwidth image component, and a multilingual-safe card layout, applied to the existing Now card / Ground Radar / pickup card without adding any new screen, table, provider call or content. It is the prerequisite for every other stage, changes no data, and is fully reversible.

Alongside it, two zero-build verification asks: Nikki confirms the staff-side driver chat, reply rate and flight budget panel on a real phone (blocked for me by the authenticator prompt), and you confirm the real guest-origin mix so Stage 1's language priority isn't a guess.

No build, schema change, deployment or native packaging in this scope.

Approved — proceed with Stage 0: International Guest Experience Visual Foundation only. I want the existing CampStay guest portal to become more visually engaging, welcoming, and intuitive without changing or disrupting the booking, flight tracking, pickup, messaging, or check-in systems already in place. The visual experience should naturally adapt to the guest's journey, whether they're preparing to travel, in transit, arriving in Bangkok, approaching Koh Samui, awaiting pickup, or already checked in at Lamai. Establish a consistent design foundation with contextual imagery, subtle animations, welcoming transitions, mobile-friendly layouts, and clear next-step information. Everything should remain extremely easy to understand within 2–3 seconds, with the guest's immediate needs always taking priority over decorative or educational content. All new components must be ready for future multilingual support, accessible, responsive, and respectful of reduced-motion and low-bandwidth preferences. Reuse the existing Guest Portal, Now Card, Ground Radar, and Pickup Card rather than creating additional dashboards or duplicating functionality. I also want to see actual mobile screenshots demonstrating the different guest journey states so we can evaluate the experience visually, not just through automated tests. Complete the implementation and report the results for review before proceeding further. Stages 1–4, including expanded language support, two-way message translation, airport intelligence, and the Lamai-managed island guide, remain unapproved until we review and authorize each stage separately.