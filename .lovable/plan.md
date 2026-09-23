# CampStay LMT — Messaging Connector Audit (read-only, nothing changed)

Law being checked against: messaging feeds the system, it does not control it.

## 1. What is live now

- **One thread per stay.** Every message is stored against a booking. No loose inboxes, no orphan chats.
- **Guest portal card.** "Talk to the camp" sits in the portal, no codes, no PIN. One button opens the conversation with the front desk.
- **Staff can reply from anywhere they already work.** Chat buttons on Bookings rows and cards, Front Desk, Arrivals Board, Check-In Desk, and inside the booking sheet (header and next to the balance). Plus the Messenger page with Arriving Today / Here Now / In Transit filters.
- **Channel stamps.** Each message shows where it came from — Portal, WhatsApp, Telegram, SMS, LINE, email — in the thread and on the inbox list.
- **Replies default to guest-visible**, with a toggle for an internal note.
- **Guest email fallback, debounced.** A guest-visible reply triggers one email with a snippet and a link back to the portal. Maximum one per guest per 10 minutes. Internal notes never email.
- **Admin alerting.** A guest message raises a "guest message received" alert through the existing alert centre, with its rate limits and critical-only switch.
- **Telegram works end to end**, in and out, because the bot token is in place.

## 2. Scaffolded but not connected

- **WhatsApp outbound seam.** The staff reply path already tries WhatsApp first and falls back to email. Today it answers "connector not linked" every time, so email carries everything. No credentials = no sends, no crash.
- **Meta WhatsApp inbound webhook.** Written, verified handshake and all, but no verify token and no phone number configured.
- **SMS (Twilio) and LINE.** Full send and receive code, signature checks included, zero credentials. They report "not configured" and stop.
- **WhatsApp templates and the 24-hour reply window.** Not handled at all. Free-form text only, which works only while a guest has written first. This decision waits for the real account.

## 3. Partially done / old clutter

- **The old 6-digit code card is still on the portal**, further down in the setup section. It still mints codes and tells people to send `/link 123456`. The new card sits above it, so guests currently see two different invitations.
- **Code linking is still the only way an external chat gets matched to a person.** No phone matching yet.
- **Two outbound stacks exist side by side:** the new connector seam used by staff replies, and the older event pipeline that sends Telegram/LINE/SMS/WhatsApp directly. The old one should eventually lose its WhatsApp half.
- **Staff cannot see whether a guest has a working WhatsApp link.** No status anywhere in the staff views.
- **Email debounce is time-based only** — it does not know whether the guest is sitting in the portal right now.

## 4. In the blueprint, not built yet

- **Zero-code phone matching.** A guest texts in from the number on their profile and is recognised instantly. Same for staff numbers.
- **Booking-reference matching** (`#BK-4920`) as the fallback when a number is unknown.
- **Platform-sent handshake link** that drops a person straight into their own stay thread.
- **An unmatched-number queue** so staff can see and claim texts from numbers nobody recognises. Today those are logged and dropped silently.
- **Staff phone identity**, so a staff text reads as internal, not as a stranger.

## 5. Current inbound flow

A guest texts a channel → the channel's webhook normalises it → the router looks up the chat ID in its link table.

- **Not linked:** logged as "unlinked" and dropped. Nothing reaches the booking.
- **Linked, but no current or upcoming stay:** blocked.
- **Linked with a live or upcoming stay:** the message is written into the booking thread with the right channel stamp, and staff get an alert.

Staff are recognised by their role once their chat is linked — never by phone number.

## 6. Current outbound staff-reply flow

Staff write in the thread → the message saves to the booking → the system tries WhatsApp (currently unavailable) → falls back to one debounced email to the guest with a portal link. Every attempt is logged. The reply is already saved before any delivery is attempted, so nothing is lost if delivery fails.

## 7. Safety boundaries — confirmed

No message, from any channel, writes to bookings, pickups, room assignments, payments, pricing, refunds, fees, balances or check-in state. Verified across the message table, all four webhooks, and the router. The router only writes: the inbound log, chat links, the message itself, escalation flags, and alerts.

The single exception worth naming is not a mutation: when a guest with a live or upcoming stay says something that reads like "I've landed," the system records an advisory signal and tells staff. A human still moves the booking. "Cancel my pickup" or "upgrade my room" lands as plain text in the thread and waits for a person.

## 8. External dependency status

| Channel | Status |
|---|---|
| Telegram | Live, in and out |
| Email | Live, primary fallback, sending from the verified LMT sender |
| Portal chat | Live |
| WhatsApp Business | **Blocked** — needs Lamai's business account, then connector linkage and webhook token |
| SMS / Twilio | Code ready, no account credentials |
| LINE | Code ready, no account credentials |

## 9. Recommended build order

1. Remove the old code-link card from the portal so guests see one invitation, not two.
2. Phone matching: recognise a guest by the number on their profile or booking, with booking-reference as backup.
3. Staff phone matching so staff texts read as internal.
4. Unmatched-number queue for the front desk, so nothing is silently dropped.
5. Show linked-channel status on the guest's booking so staff know which door is open.
6. Suppress the email when the guest is actively in the portal.
7. Link the WhatsApp Business connector when Lamai's account exists, then decide on templates and the 24-hour window.
8. Retire the old WhatsApp sender in the legacy pipeline.

## 10. Flow diagram

```text
                 ┌───────────────────────────────┐
                 │   GUEST WRITES (any door)     │
                 │ Portal · WhatsApp · Telegram  │
                 │        SMS · LINE             │
                 └───────────────┬───────────────┘
                                 │
                 ┌───────────────▼───────────────┐
                 │  CHANNEL WEBHOOK (normalise)  │
                 └───────────────┬───────────────┘
                                 │
                 ┌───────────────▼───────────────┐
                 │   WHO IS THIS?                │
                 │  today: linked chat only      │
                 │  planned: phone / #BK-ref     │
                 └──────┬─────────────────┬──────┘
                    no  │                 │ yes
                        ▼                 ▼
          ┌─────────────────────┐  ┌────────────────────────┐
          │  DROPPED + LOGGED   │  │  HAS LIVE / UPCOMING   │
          │ (planned: staff     │  │  STAY?                 │
          │  triage queue)      │  └──────┬──────────┬──────┘
          └─────────────────────┘     no  │          │ yes
                                          ▼          ▼
                              ┌────────────────┐  ┌────────────────────┐
                              │    BLOCKED     │  │ WRITE TO BOOKING   │
                              └────────────────┘  │ THREAD + SOURCE    │
                                                  │ STAMP              │
                                                  └─────────┬──────────┘
                                                            │
                                    ┌───────────────────────▼──────────────┐
                                    │  ALERT STAFF (rate-limited)          │
                                    │  NO booking / money / room change    │
                                    └───────────────────────┬──────────────┘
                                                            │
                                    ┌───────────────────────▼──────────────┐
                                    │  HUMAN READS IT AND DECIDES          │
                                    └───────────────────────┬──────────────┘
                                                            │
                                    ┌───────────────────────▼──────────────┐
                                    │  STAFF REPLY (saved to booking)      │
                                    └───────────┬──────────────────────────┘
                                                │
                                 ┌──────────────▼──────────────┐
                                 │  TRY WHATSAPP (not linked)  │
                                 └──────────────┬──────────────┘
                                                │ unavailable
                                 ┌──────────────▼──────────────┐
                                 │  EMAIL FALLBACK             │
                                 │  1 per guest / 10 min       │
                                 │  portal link included       │
                                 └─────────────────────────────┘
```
