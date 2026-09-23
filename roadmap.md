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

## Post-stage requests (done)
- [x] Island guide on the Arrivals Board — "Island guide" tab, managers/admins flag first-day essentials (arrival_essential)
- [x] Guest welcome flow — countdown -> airport by leg -> pickup -> island guide (pickup card hoisted, no duplicate)
- [x] Guest language picker in the portal, staff replies follow the guest's choice

## Unified messaging (WhatsApp + portal + email) — DONE except the connector
- [x] `messages.source` + `external_ref` (migration 0013) — one thread per guest, tagged by the app they wrote from
- [x] Inbound mirror in `messaging-router`: guest WhatsApp/Telegram/SMS/LINE text inserts into `messages` on their booking, raises `guest_message_received`
- [x] Source badges in `GuestThreadDialog` and `/messages`
- [x] `CampCommunicationCard` replaces the `/link <code>` onboarding, top-level in the guest portal
- [x] `notify-guest-message`: WhatsApp first, then a debounced email notice (10 min per guest), logged to `email_send_log`
- [x] Admin anti-bombardment already enforced by `emit-admin-alert` (3 per 5 min, critical-only switch)

### ⚠️ BLOCKED — final step, come back to this
- [ ] **Link the Lovable WhatsApp Business connector for Lamai.** Waiting on Max: no WhatsApp Business account for Lamai yet.
      Everything else is wired. The only seam is `supabase/functions/_shared/messagingConnector.ts` —
      once the connector is linked (creating `WHATSAPP_API_KEY`), outbound WhatsApp starts delivering with no code change.
      Until then `sendGuestWhatsApp()` returns `connector_not_linked` and guests fall back to email.
- [ ] After linking: point the connection's "Incoming messages" destination at this project, confirm inbound
      WhatsApp lands on the right booking thread, and retire the legacy `sendWhatsAppMeta` path in `notify-via-messaging`.
