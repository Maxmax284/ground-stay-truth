# Messaging Connector Audit — Read Only

Nothing was changed. This is what is actually live in CampStay LMT today.

## Plain English

**The spine is built and working.** Every conversation is stored against one booking, so the front desk always sees one thread per stay. Guests can write from the portal, staff can reply from Bookings, Front Desk, Arrivals Board, Check-In Desk, the booking sheet and the Messenger page. Each message carries a stamp saying where it came from (Portal, WhatsApp, Telegram, SMS, LINE, email), and staff see that stamp in the thread and in the inbox list.

**Email fallback is live and is not spammy.** When staff send a guest-visible reply, the guest gets one email notice with a snippet and a link back to their portal — at most one per 10 minutes per guest, and never for internal notes. Admins get a "guest message received" alert through the existing alert centre with its own rate limits and critical-only switch.

**Telegram is the only external channel actually connected.** The bot token is in place, so Telegram in and out works. WhatsApp, SMS (Twilio) and LINE all have complete code paths but no credentials, so they politely report "not configured" and the system falls back to email. That is the real external dependency: Lamai's WhatsApp Business account.

**The old PIN dance is half retired.** The prominent "Talk to the camp" card is live in the guest portal and does not use codes. But the old code-based "Connect WhatsApp / Telegram" card is still rendered further down the portal (in the setup section), and the 6-digit code function and its table are still the only way an external chat gets matched to a person.

**Zero-code phone matching does not exist yet.** This is the biggest gap. A guest who saves their WhatsApp number in their profile is still not recognised when they text in — the router only knows people who completed a code link. Unmatched numbers are logged as "unlinked" and dropped; nothing reaches the booking thread. Staff phone matching has the same gap: a staff member texting from an unlinked number is simply unknown.

**Safety rule holds.** Nothing in the messaging path writes to bookings, payments, pickups, pricing, refunds or check-in state. Guest intents land as text only. The one thing inbound messages do write is an arrival self-report signal and an alert for staff — both advisory, both requiring a human to act.

## Technical notes

### 1. `public.messages`
Columns: `id, booking_id (NOT NULL), sender_id, content, is_internal (default true), created_at, read_at, draft, approved_by, property_id, attachment_url, attachment_type, source (NOT NULL default 'portal'), external_ref`. Source tags are supported and constrained to portal/whatsapp/telegram/sms/line/email. No provider/author-name column — inbound external messages carry `sender_id = guest user id` and `external_ref` for the provider id.

RLS: staff read via `has_ops_read`, write via `has_ops_write`; admins full. Guests read only non-internal, non-draft rows on their own bookings; insert only with `is_internal = false` and `sender_id = auth.uid()`; update limited to read status. Note the table default for `is_internal` is `true` — guest-visible is explicit, set by the UI toggle.

### 2. Guest portal UI
- `guest/CampCommunicationCard.tsx` — live, rendered at `GuestPortal.tsx:575`, code-free. Portal chat button always; `wa.me` deep link only when bot identity reports WhatsApp configured (currently it is not, so the button is hidden).
- `MessagingConnectCard.tsx` — **still rendered** at `GuestPortal.tsx:776`, still mints 6-digit codes via `messaging-link` and opens `/link <code>` / `/start link_<code>`. `GuestPersonalGuideCard` uses the same flow. `GuestMessagingOnboarding.tsx` is deleted.
- Phone/WhatsApp entry is only in `ProfileEditor.tsx` (`phone`, `whatsapp`, `line_id`, `preferred_language`) — not on the communication card, and not used for matching.
- No email-fallback button; email is automatic, not user-triggered.

### 3. Staff UI
`GuestThreadLauncher` is wired into Bookings (row + card), Front Desk (two spots), Arrivals Board (two spots), Check-In Desk, and `BookingDetailSheet` (header + payments panel). `GuestThreadDialog` renders `MessageSourceBadge` per message; `Messages.tsx` shows the last-message source in the inbox list, with Arriving Today / Here Now / In Transit filters. Reply default is **guest-visible** (dialog state `isInternal = false`), with a toggle; non-admin guest-visible replies are flagged as admin-notified. Staff do **not** see whether a guest has a linked WhatsApp/phone anywhere in these views.

### 4. Inbound
`whatsapp-meta-webhook` (Meta verify handshake + text messages), `twilio-webhook` (`?channel=sms`, HMAC-SHA1 signature verified), `line-webhook`, `telegram-webhook` — all normalise to `{channel, chat_id, text, display_name}` and POST to `messaging-router` with the internal bridge token.

`messaging-router` resolves identity **only** via `messaging_chat_bindings` on `(channel, chat_id)`, created solely by `/link <6-digit code>` against `messaging_link_codes`. No phone/`profiles.whatsapp`/`manual_guest_phone`/booking-reference matching exists. Unlinked → logged to `messaging_inbound_log` with `outcome: 'unlinked'` and dropped. Matched guests are gated by `getGuestPhase` (active / upcoming / post_stay today; otherwise blocked), then `mirrorGuestMessage` inserts into `messages` with `booking_id` (checked-in booking first, else next check-in) and `source = channel`, and raises `guest_message_received`. Staff are recognised by `user_roles` once their chat is bound — role-derived, not phone-derived.

### 5. Outbound
Staff reply path: `useBookings.ts` writes the message row, then fire-and-forget invokes `notify-guest-message`, which tries `sendGuestWhatsApp` (Lovable connector gateway seam, needs `LOVABLE_API_KEY` + `WHATSAPP_API_KEY`) and then debounced email. Today it returns `connector_not_linked`, so email always carries it.

`notify-via-messaging` is the older event pipeline and holds real implementations for Telegram (`api.telegram.org`), LINE push, Twilio SMS, and direct Meta WhatsApp Cloud sends with retry/logging. `integration_secrets` currently holds `telegram_bot_token` only — no `whatsapp_*`, `twilio_*` or `line_*` keys, so only Telegram outbound is live; the others short-circuit as `not_configured`.

WhatsApp 24-hour customer-service window and approved template names are **not** implemented — the connector seam sends free-form text, which only works inside a guest-initiated window. This is a connector-time decision, deliberately left open.

### 6. Email fallback and anti-spam
`notify-guest-message`: staff-role gated (403 otherwise), skips internal notes, resolves email from `profiles.email` or `bookings.manual_guest_email`, debounces on `email_send_log` (10 minutes per recipient per template), idempotency key `guest-msg-<message_id>-<email>`. Template `guest_message_notice` in the transactional registry, sent via Lovable managed email from `notify.lmtcampstay.com`. Admin side: `emit-admin-alert` with `guest_message_received` from the catalog, rate limits and `__critical_only__` handled there. **Active-portal-session suppression is not implemented** — the debounce is purely time-based.

### 7. Safety
Confirmed: no path from `messages`, the webhooks, or `messaging-router` writes to `bookings`, `payments`, `airport_pickups` status, units, pricing, refunds or fees. Router side effects are limited to `messaging_inbound_log`, `messaging_chat_bindings`, `messaging_thread_memory`, `messages`, `guest_escalations` and admin alerts. Closest thing to a mutation is arrival self-report detection for active/upcoming guests, which records an advisory signal for staff review. No mutation risk found.

### 8. State of play
- **Done:** one-thread-per-booking model, source column and badges, staff chat buttons everywhere, guest communication card, inbound mirror into `messages`, debounced guest email, admin alerting, Telegram end to end.
- **Partial:** old code-link card still on the portal; `messaging-link` / `messaging_link_codes` still the only matcher; two outbound stacks (`notify-guest-message` seam vs `notify-via-messaging` direct sends); no linked-channel status shown to staff; no session-aware email suppression.
- **Blocked on Lamai's WhatsApp Business account:** connector linkage (`WHATSAPP_API_KEY`), Meta webhook verify token, message templates and window handling, retiring the legacy direct Meta sender.
- **Not implemented:** phone-number matching for guests or staff, booking-reference matching (`#BK-…`), platform-sent handshake link to a specific thread, unmatched-number triage queue for staff.

### Manual tests after publish
1. Guest portal: open "Talk to the camp", send a message, confirm it appears on the booking thread for staff.
2. Staff reply from a Bookings row and from the booking sheet; confirm guest sees it and one email notice arrives; send a second reply within 10 minutes and confirm no second email.
3. Internal note: confirm no email and no guest visibility.
4. Telegram: complete the code link once, text the bot, confirm the message lands on the right booking with a Telegram badge.
5. Confirm a booking's payment, pickup and check-in state are untouched after all of the above.
