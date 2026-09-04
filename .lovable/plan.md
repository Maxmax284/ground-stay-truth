# Twilio SMS/RCS Audit — LMT CampStay

Read-only audit. No code changed. Headline: most of the SMS plumbing already exists and is unused. This is a wiring, consent and routing problem, not a build-from-scratch problem.

## 1. What communication infrastructure already exists

**Email (primary, healthy)**
- `supabase/functions/_shared/appEmail.ts` — `sendAppEmail`, recipient-scoped idempotency keys.
- Templates in `_shared/email-templates/` and `_shared/transactional-email-templates/`.
- Senders: `send-booking-confirmation`, `send-booking-state-email`, `send-scheduled-emails`, `auth-email-hook`, `generate-booking-confirmation` (PDF), `handle-email-events`, `test-contact-email`, `ops-email-selftest`.
- Tables: `email_log`, `email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`.

**Admin alert engine**
- `emit-admin-alert` + `_shared/adminAlertCatalog.ts` (mirrored in `src/lib/adminAlertCatalog.ts`), fan-out to in-app `notifications`, email, and best-effort push. Channels supported today: `in_app`, `email`, push. **No SMS channel.**
- Per-admin prefs in `messaging_notification_prefs` with control keys `__email_master__`, `__critical_only__`. Suppression: 3 non-critical per event per admin per 5 min. Every attempt logged to `admin_alert_log`.

**Messaging bridge (multi-channel, capture-only)**
- Outbound: `notify-via-messaging` already has a working `sendTwilioSms()` (Twilio `Messages.json`, Basic auth, retry via `_shared/messagingRetry.ts`) and dispatches when a binding's `channel === 'sms'`.
- Inbound: `supabase/functions/twilio-webhook/index.ts` already accepts `?channel=sms`, verifies `X-Twilio-Signature` (HMAC-SHA1 over URL + sorted params), forwards to `messaging-router`, replies TwiML, and honours silent mode when staff take over.
- `messaging-router` (1539 lines): resolves `chat_id` → user → role, urgency/language detection, Kru Glitch reply, thread memory. Explicitly capture-only.
- Binding: `messaging-link` mints a 6-digit code (15 min) → `messaging_link_codes` → `messaging_chat_bindings`.
- Tables: `messaging_chat_bindings`, `messaging_notification_prefs`, `messaging_notification_log` (error_category, severity, retry_count, correlation_id, provider_response), `messaging_inbound_log`, `messaging_thread_memory`, `guest_escalations`.
- UI: `src/components/MessagingBridgeSettings.tsx` already renders an "SMS Bridge (Twilio)" card for `twilio_account_sid`, `twilio_auth_token`, `twilio_sms_from`, shows the `…/twilio-webhook?channel=sms` URL, and warns about SMS Pumping Protection / Geo Permissions. `src/hooks/useIntegrationSecrets.ts` already lists those keys.

**Current live state (queried)**
- `integration_secrets`: no `twilio_*` rows — Twilio has never been configured.
- `messaging_chat_bindings`: 1 row, telegram. `messaging_inbound_log`: 2 telegram. `messaging_notification_log`: 15, all `telegram:sent`.
- `messaging_notification_prefs`: 8 email, 5 telegram, 0 sms.
- `profiles.phone`: set on 3 of 71 rows; `whatsapp`, `line_id` also exist. `bookings.manual_guest_phone` exists for walk-ins. `drivers.phone` / `drivers.whatsapp` exist.
- `user_consents`: only `privacy_policy` and `terms_of_service` — no SMS/marketing consent type.

## 2. Where Twilio plugs in cleanly

- Outbound: nothing new needed in `notify-via-messaging` for staff — create secrets, create an `sms` binding, create `sms` pref rows.
- Admin alerts: `emit-admin-alert` needs a fourth channel. Cleanest is *not* to reimplement Twilio there — add a small `sms` branch that calls `notify-via-messaging` (or a new `_shared/sms.ts`) for critical-severity events only.
- Guest transactional: a `sms_nudge` step alongside the existing email sends (`send-booking-state-email`, `create-payment-link` / `guest-payment-link`, `guest-arrival-journey`, `guest-landed`, `check-flight-status`) — SMS carries a one-line summary + deep link, email stays the document of record.
- Inbound: `twilio-webhook?channel=sms` is already live-ready; no new endpoint.

## 3. Guest events — channel split

- **Email only (long-form / record):** booking confirmation + PDF, tax invoice, receipts, cancellation/refund breakdown, TM30/document requests, arrival welcome guide, review requests, policy/legal, unsubscribe.
- **Email + SMS nudge (short, link out):** deposit due / payment link issued, deposit deadline approaching, booking confirmed (one-liner), 24h check-in instructions, room ready, upgrade/modification confirmed.
- **SMS-first / urgent:** driver dispatched + plate/name, pickup ETA change, flight-delay pickup reschedule, guest-landed handshake, "we can't reach you, call front desk", overbooking/room-change on arrival day.
- Never SMS: full pricing breakdowns, ID/document content, deposit deduction reasons, anything with PII beyond first name + booking ref.

## 4. Admin / front-desk events — SMS or not

**Yes (critical severity only):** payment webhook down, Stripe verification failing, booking created but no unit assigned on arrival day, guest stranded / unreachable arrival, overbooking or availability conflict, security/Fenrir critical, guest escalation flagged in `guest_escalations`, no-show decision required.

**No:** every `defaultEmail` catalog event that is informational (new inquiry, note added, portal activity, email delivery warnings, AI budget, daily briefing/digest, room-ready churn, discount/override logs, MCP activity). These are the exact events the 5-min suppression window exists to tame; on SMS they become spend and alert fatigue.

Rule to encode: SMS fires only when `severity === 'critical'` (or a small explicit `smsAllowed` flag in the catalog) **and** the recipient holds an on-call `sms` binding, with quiet hours in Asia/Bangkok and a hard per-user daily cap.

## 5. Inbound SMS mapping without bypassing approval

Keep the existing law: messaging captures, the platform decides.
- Resolution order: exact `messaging_chat_bindings` (`channel='sms'`, `chat_id` = E.164) → `profiles.phone` match → `bookings.manual_guest_phone` on an active/upcoming stay → unknown.
- Unknown or ambiguous numbers get a neutral reply + a row in `messaging_inbound_log`; they never auto-bind. Phone-number-only matches should be treated as *suggested* identity and surfaced for staff confirmation, not trusted for anything privileged.
- `messaging-router` must never call state transitions, `record_offline_payment`, `modify-stay`, or `apply-booking-adjustment` from SMS. Intents land as `ai_action_drafts` / `guest_escalations` / staff notes only — Plan→Approve→Execute stays inside the app.
- No Control Mode, no Borrowed Authority, no ops passcode over SMS — ever. SMS is unauthenticated by design (SIM swap, number reuse).
- Honour `STOP`/`HELP`/`UNSUBSCRIBE` before routing to the AI at all.

## 6. Database / functions / components needing extension

- `messaging_chat_bindings`: needs a verified-phone path and E.164 normalisation; consider `verified_at` and a uniqueness guard on `(channel, chat_id)`.
- `user_consents`: add `sms_transactional` consent type; log grant/revoke.
- `messaging_notification_prefs`: add `sms` channel rows + quiet-hours and daily-cap settings. Note current default is **skip when no pref row exists** — SMS will silently send nothing until rows are seeded.
- `adminAlertCatalog.ts` (both copies): add an SMS-eligibility flag; `emit-admin-alert` gets an SMS branch + `admin_alert_log` rows with `channel='sms'`.
- New: `sms_opt_out` / suppression table (or reuse a suppression pattern) for STOP handling; `_shared/sms.ts` helper so Twilio auth lives in one place.
- Frontend: `MessagingBridgeSettings.tsx` (phone verification flow), `NotificationPreferencesPanel.tsx` + `settings/NotificationSettings.tsx` (SMS toggles, quiet hours), `ProfileEditor.tsx` (verify phone), guest-side consent checkbox, `MonitoringCenter` / Ops for SMS spend + failure visibility.
- `messaging-link` needs a guest-friendly alternative: today binding requires the user to text a 6-digit code first, which no arriving guest will do.

## 7. Security / privacy / consent / audit risks

- **SMS pumping fraud** — any endpoint that can trigger an outbound SMS is a spend vector. Enable Twilio SMS Pumping Protection and Geo Permissions (TH + guest origin countries only), cap per-user and per-day.
- **No consent record today** — Thai PDPA/GDPR: transactional SMS needs an explicit, logged opt-in and a working STOP.
- **Phone numbers are weak identity** — never grant record access on a number match alone.
- **Signature verification depends on exact URL** — `twilio-webhook` hashes `req.url`; any proxy/rewrite that alters the URL breaks verification silently.
- **Secrets in `integration_secrets`** — column is named `encrypted_value` but is read as plaintext by the functions; keep access service-role only and treat as high-sensitivity.
- **PII in message bodies + logs** — `messaging_inbound_log` / `messaging_notification_log` store full text. Keep SMS bodies minimal and include SMS in the `cleanup-retention` purge.
- **Audit** — every SMS send/receive should carry the existing `correlation_id`, and any staff action taken from an SMS-originated draft must attribute the real actor, not the bridge.

## 8. Phased plan

1. **Turn on what exists (staff only).** Configure the three Twilio secrets, point the SMS number at `twilio-webhook?channel=sms`, bind Maxwell's phone via `messaging-link`, seed `sms` pref rows, send one test. Zero code.
2. **Critical-only admin SMS.** Add the SMS eligibility flag to the catalog, an SMS branch in `emit-admin-alert` gated on `severity === 'critical'`, quiet hours, daily cap, `admin_alert_log` coverage. Nikki gets on-call SMS for money/arrival failures only.
3. **Guest consent + verification.** Add `sms_transactional` consent, phone verification (OTP) that creates a verified `sms` binding, STOP/HELP handling and suppression.
4. **Guest transactional nudges.** SMS one-liners beside existing emails for payment-link issued, 24h check-in, room ready, driver dispatched. Email remains the record.
5. **Two-way capture.** Enable SMS in `messaging-router` with the same capture-only guarantees as Telegram; inbound intents become drafts/escalations. Add SMS spend + failure panels to Monitoring.
6. **RCS (later).** Twilio RCS needs a verified brand/agent and different send semantics; revisit only after phases 1–5 are stable, and treat WhatsApp (already Meta-direct) as the richer channel in the meantime.

## 9. What makes this easier / harder than expected

**Easier:** the outbound sender, inbound webhook with signature verification, router, bindings/prefs/logs schema, retry helper, and the settings UI all already exist and are proven on Telegram. The capture-only architectural law is already enforced in code. Thailand is a WhatsApp/LINE market and both are already wired, so SMS can stay a thin urgent channel.

**Harder:** `emit-admin-alert` — the engine that actually drives staff alerts — has no SMS path and is a separate pipeline from `notify-via-messaging`, so "admin SMS" means touching the alert engine, not just the bridge. Binding requires a 6-digit code text, unusable for guests without an OTP flow. Almost no phone numbers on file (3 of 71 profiles). No consent type exists. Default-skip prefs make SMS look broken when it is merely unconfigured. And the two alert catalogs must be kept in sync by hand.
