# CampStay LMT — Strategic Audit: From "Built" to "Gets Smarter With Use"

Audit only. No code, schema or behavior changes. Based on a read of the edge functions, hooks and live table counts (5 Oct 2026).

## Street read

The machine is built. It already writes down almost everything that happens: portal opens, payment attempts, ID uploads, messages, emails, alerts. Almost none of that gets read back as a pattern. Every screen answers "what's going on with this guest right now". Nothing answers "what keeps going wrong, week after week".

The next phase is reading what you already record, not adding features. Two numbers make the case:

- **139 "booking missing" vs 276 "booking loaded" portal events.** Roughly 1 in 3 portal loads ends with a guest who can't see their booking. That's the biggest friction signal in the system, and nobody is watching it as a trend.
- **Checkout funnel: 33 started → 17 created → 13 redirected → 4 reached the payment provider.** Payment friction is measurable today. It's just not summarized anywhere.

(Small numbers, and some of them are smoke tests. They still show which signals carry weight.)

## 1. Signals CampStay already captures

| Area | Where it lives | Volume today |
|---|---|---|
| Portal behaviour (loaded, booking missing, deposit/ID funnel, in-app browser, network errors, email-fallback notice) | `guest_portal_activity` (22 cols) | ~1,040 |
| Guest and staff messages, Camp Notices (`external_ref notice:*`), landed and "I'm here" taps | `messages` | 68 |
| Staff alerts sent, suppressed or deduped | `admin_alert_log` | 543 |
| Email sent, failed, bounced, complained, suppressed | `email_send_log`, `email_log`, `suppressed_emails`, `handle-email-events` | 929 / 3 suppressed |
| Push delivery | `push_delivery_log`, `push_subscriptions` | 4 (push is barely used) |
| Payments, links, webhooks, rejections, reconciliation | `payments`, `payment_link_events`, `payment_events`, `payment_rejection_log`, `payment_reconciliation_log` | 155 payments |
| Booking lifecycle and money changes | `booking_state_log`, `booking_adjustments` (immutable), `override_audit_log` | — |
| ID documents and review status | `guest_documents`, `guest_document_access_log`, `verify-document` | 13 |
| Travel: journey legs, evidence, provenance, conflicts, flights | `journey_legs`, `journey_evidence`, `arrival_conflicts`, `flight_tracking`, `flight_facts` | 2 evidence |
| Pickups and drivers | `airport_pickups`, `pickup_driver_links`, `pickup_driver_messages` | — |
| Stay ops | `housekeeping_tasks`, `laundry_requests`, `maintenance_requests`, `maintenance_blocks`, `stay_support_log` | 0 support log |
| AI usage and audit | `ai_usage_events`, `ai_assistant_audit`, `ai_action_drafts`, `intelligence_entries` | 644 / 0 drafts / 26 intel |
| Staff actions | `staff_audit_events`, `profile_audit_log`, `security_events` | — |
| Readiness dots (computed live, not stored) | `useBookingReadiness` | — |

**Not captured:** which Guest Guide or welcome-sheet sections guests open, what questions guests ask Kru Glitch as a category, and how long it takes staff to reply to a guest.

## 2. Strongest learning loops (none of them creepy)

All of these work on events, not people:

1. **Booking visibility.** Track the `guest_booking_missing` rate. Most likely causes: the guest signed up with a different email than the one on the booking, or the booking isn't linked yet. Fixing the cause gets rid of a whole category of WhatsApp "I can't see my booking" messages.
2. **Payment friction.** The deposit/checkout funnel events already exist end to end. A weekly drop-off summary shows whether the problem is Stripe, the in-app browser (7 hits) or the link itself.
3. **ID upload friction.** Started vs succeeded vs rejected (`guest_documents.review_status`). Tells you whether the instructions are clear.
4. **Email reachability.** Bounces, suppressions and complaints per week, plus guests with no email on file. The banner already exists for one booking at a time. This would be the trend view.
5. **Repeated guest questions.** Guest messages grouped by topic each week (wifi, pickup, laundry, schedule). If the same question shows up 5 times, the guide or welcome sheet is missing something. It suggests a guide edit; a human publishes it.
6. **Arrival risk.** Arriving in the next 72h with no flight, no ID, an unopened portal or an open conflict. Chase list data, ranked.
7. **Alert and notification health.** Ratio of suppressed to sent alerts, push basically unused, email failures. Tells you whether staff are drowning or missing things.
8. **Staff responsiveness and workload.** Time from a guest message to the first staff reply, measured per booking and per shift. Not a per-person leaderboard.
9. **Stay ops patterns.** Maintenance repeats per unit, laundry volume by week. The data is thin today, so this comes later.

## 3. A safe CampStay Intelligence Layer

```text
signals (existing tables)
   -> nightly/weekly read-only rollups (SQL views / RPCs, security definer, admin+manager only)
   -> summaries + flags + suggested drafts (ai_action_drafts / intelligence_entries)
   -> human reads, decides, acts in the existing UI
```

Rules:
- **Read-only.** Rollups only SELECT. The only things it writes are summaries and drafts, into tables that already exist.
- **Aggregate first.** Reports show counts and rates. Drill into a single booking only when a staff member clicks through.
- **No personal profiling.** No scores on guests, no inferring nationality, language or identity, no sentiment ratings on guests.
- **Explainable.** Every flag cites the rows behind it ("4 of 9 deposit attempts stopped at redirect").
- **Quiet.** Delivered by email digest and in Ops Control Tower. No new pop-ups, no new push spam.
- **Deterministic first, AI second.** Numbers come from SQL. The AI only puts them into plain words, with the existing deterministic fallback (as `ops-tower-narrative` already does).

## 4. Kru Glitch / Ops AI — allowed vs forbidden

**Allowed next:**
- Summarize: the daily brief and weekly friction radar in plain words.
- Flag: "guest stuck" and arrival risk, each with the reason cited.
- Draft: reply drafts to guests, guide edits, chase messages, housekeeping/task drafts. These already go through `ai_action_drafts` with approval.
- Group: label guest messages by topic, labels only, never actions.
- Explain: "why is this booking flagged".

**Forbidden, stays that way:**
- Changing booking state, rooms, dates, prices, discounts, fees, balances, deposits, refunds, check-in or check-out.
- Editing or merging guest records, or approving or rejecting IDs.
- Sending anything to a guest without a human pressing send. Camp Notices stay template-driven, not AI-written.
- Publishing guide content. It drafts; an admin publishes.
- Acting on anything that arrives through WhatsApp, Telegram, LINE or email.
- Scoring or ranking guests, or inferring identity, nationality or language.
- Treating flight status as guest location.

## 5. Next phase (after feature-building)

In order, each one small:

1. **Weekly Friction Radar** (biggest win). One admin email plus a Control Tower tab covering booking-missing rate, payment funnel, ID funnel, email reachability, and top repeated question topics. Pure SQL plus the existing digest pipeline.
2. **Booking visibility root-cause check.** Before building anything, investigate the 139 missing events: which guests, and why. This may be a bug to fix, not something to report on.
3. **Daily Ops Brief upgrade.** Fold arrival risk (next 72h) and unanswered guest messages older than X hours into the existing `daily-briefing`.
4. **Guide gap suggestions.** Repeated topics become a draft guide edit in Settings → Guide, admin approves.
5. **Notification health card.** Email failure rate, alert suppression rate, push reach, in Systems Health.
6. **Staff response time.** Time to first reply, per booking, shown on the Chase list.

## 6. What exists vs gaps (smallest safe path)

**Already there:**
- `guest_portal_activity` with funnel events
- `daily-briefing`, `ops-tower-narrative`, `corner-talk`, `get_ops_exceptions`, `get_ops_service_health`
- `ai_action_drafts` with safe executors (fail-closed)
- `intelligence_entries`
- `email_send_log` and `handle-email-events`
- `admin_alert_log` with suppression
- `useBookingReadiness`, Chase list and Booking Status pages
- immutable audit tables

**Gaps:**
- No time-series rollups. Everything is computed live, one booking at a time. Smallest fix: 3 to 5 read-only SQL functions (`get_friction_radar(period)`, `get_arrival_risk(hours)`, `get_reply_latency(period)`).
- `ai_action_drafts` is unused (0 rows). The approval pipe exists but nothing feeds it.
- `stay_support_log` is empty and `push_delivery_log` is nearly empty. Not enough data to learn from yet.
- No guide or welcome-sheet view events. If added, a single `guide_section_viewed` event in the existing telemetry table, aggregate only.
- Guest messages carry no topic label. That needs a nightly AI labeling pass that writes labels into a separate table, never into the message itself.
- Smoke-test and sandbox rows mix into real counts. Rollups must exclude `is_sandbox_booking` and test guests.

## 7. Do NOT build yet

- A WhatsApp auto-responder or any bot that answers guests on its own. Still blocked on Lamai's Business account, and on the core law.
- Auto check-in from "I'm here", landed taps or geolocation.
- Dynamic pricing, auto-discounts or automated upsell offers.
- Guest scoring, sentiment ratings, "VIP" or "risk" labels on people.
- GPS or location tracking, or behaviour tracking inside the portal beyond the funnel events that exist today.
- Native iOS/Android app work. PWA plus email covers it, and push has 4 deliveries total.
- Multi-tenant packaging. Prove the learning loops on Lamai first.
- New dashboards. Put rollups into Ops Control Tower and the daily email, not a new screen.
- Paid flight-provider upgrades (FlightAware) until arrival volume justifies the cost.
- Per-staff leaderboards or surveillance-style productivity tracking.

## Technical notes

- Rollups: `SECURITY DEFINER` SQL functions gated by `has_role(admin|manager)`, property-scoped through `has_property_access`, sandbox excluded.
- Delivery: reuse `daily-briefing` and `send-scheduled-emails` (recipient-scoped idempotency keys).
- AI wording: reuse the `aiGuard` budget and the deterministic fallback pattern.
- Anything actionable goes into `ai_action_drafts`. Only the existing safe executors (housekeeping/tasks) may auto-apply on approval.
