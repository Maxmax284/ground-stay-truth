# International Guest Experience — roadmap

Stage 0 — Visual foundation — DONE (journey stages, WelcomeMoment, ContextImage, JourneyBanner, EN/TH copy, mobile screenshots).

## Stage 1 — Language foundation — DONE
- [x] Guest-surface key set + measured coverage per language; incomplete languages labelled "Partly translated"
- [x] Filled guest-surface gaps for French and German (100% of guest-critical keys)
- [x] Optional language suggestion from device locale only (never nationality/origin airport), opt-in, persisted
- [x] Per-staff reading language via profiles.preferred_language

## Stage 2 — Two-way message translation — DONE
- [x] Guest thread: translate into reader's language, keep original, mark machine translation, visible failure
- [x] Pickup driver chat: same, limited scope (no translate button on the link-only driver page)
- [x] Prompt keeps flight codes / PNRs / names / meeting points verbatim; no operational action from translation
- [x] translate-message redeployed with the tightened prompt

## Stage 3 — Airport guidance — DONE
- [x] Leg-aware airport card, official links + last-reviewed date (19 airports curated)
- [x] Honest "no coverage" fallback; no invented gates or visa advice

## Stage 4 — Samui welcome + Lamai-edited guide — DONE
- [x] Guest island guide from local_recommendations (published only, staff notes excluded), under arrival/pickup actions
- [x] Manager authoring + admin-only publish, temporary-closure and seasonal flags, review dates
- [x] Renders nothing until the camp publishes an entry — no invented businesses

## Open / blocked
- [ ] Real-device pass by Nikki on staff screens (driver chat, reply rate, flight budget) — blocked on MFA in this environment
- [ ] Actual guest-origin mix to prioritise languages beyond FR/DE — needs Max/Nikki
- [ ] Decision: should the pickup journey stage appear from arrival day, or only once a pickup is enabled?
- [ ] Nobody has written island guide entries yet — guests see no guide until Nikki adds places under Settings → Guide
