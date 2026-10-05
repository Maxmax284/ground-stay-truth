# CampStay LMT — Strategic Plan: Giving the Platform Instincts

Audit + brainstorm only. No code, schema, migrations or behavior changes. Grounded in a read of the edge functions, hooks, components and live table counts (5 Oct 2026).

## Street read

The body is built. It writes down almost everything that happens: portal opens, payment attempts, ID uploads, messages, emails, alerts, arrival taps. Almost none of it gets read back as a pattern. Every screen answers "what's going on with this guest right now." Nothing answers "what keeps going wrong, week after week."

The next phase is reading the receipts you already collect, not adding features. Two live numbers make the case:

- **139 "booking missing" vs 276 "booking loaded" portal events.** Roughly 1 in 3 portal loads ends with a guest who can't see their booking. Biggest friction signal in the system; nobody watches it as a trend.
- **Checkout funnel: 33 started → 17 created → 13 redirected → 4 reached the payment provider.** Payment friction is measurable today. It just isn't summarized anywhere.

(Numbers are small and include smoke tests. They still show which signals carry weight.)

Doctrine stays absolute: **signals feed the system, they never control it.** No auto-booking, no auto-check-in, no money moves, no guest-facing sends without a human. A guest request is a raised hand, not a confirmed booking.

## A. Surfaces to upgrade (not replace)

| Surface | Exists today | Upgrade |
|---|---|---|
| Corner Talk (`useCornerTalk`, `CornerTalkPanel`, `corner-talk` fn) | Role-aware lines, 2-min server cache | Becomes the plain-English cornerman: role-specific reads fed by rollups, with cited reasons |
| Front Desk / Chase List (`ChaseList.tsx`) | Readiness dots, last portal activity, sort by date | Attention chips with reasons + next safe action, urgency sort, "Today's Street Read" strip |
| Notifications (`notifications`, `admin_alert_log`, push, email) | One spine already | Category mapping + urgency classes (Urgent / Important / Digest / Silent log) |
| Daily Ops Brief (`daily-briefing` fn, `TodaysBriefing.tsx`) | Exists | Fold in arrival risk + overnight messages; feeds Corner Talk |
| Weekly Friction Radar | Does not exist | New rollup, delivered into Ops Control Tower + admin digest email |
| Ops Control Tower | Health, matrix, transit, exceptions, timeline, agents, verify | Gains a Friction tab; stays the engine-room home |
| AI drafts (`ai_action_drafts`, `useAIDrafts`, `AIDraftsPanel`) | Pipe exists, 0 rows ever written | Start feeding it: reply drafts, guide edits, chase messages |
| Guest portal | Journey-adaptive already | Calmer "next step" focus; Camp Notices stay official-looking; no new screens |

## B. Signals feeding each surface

Already captured (verified counts): `guest_portal_activity` ~1,040 events incl. full deposit/ID funnels, in-app-browser and network-error detection; `messages` 68; `admin_alert_log` 543; `email_send_log` 929 + `suppressed_emails` 3; `payments` 155 with link/webhook/rejection logs; `guest_documents` 13 with review status; `journey_legs`/`arrival_conflicts`/`flight_tracking`; `airport_pickups` + driver links; `ai_usage_events` 644; `intelligence_entries` 26; `ai_action_drafts` 0; `push_delivery_log` 4 (push barely used); `stay_support_log` 0.

Not captured today: which guide/welcome sections guests open, guest-question topics as categories, staff time-to-first-reply.

Mapping:
- **Corner Talk (Nam/front desk):** today's arrivals, missing flight/ID/payment (readiness rollups), overnight guest messages, pickup unassigned, email bounces.
- **Corner Talk (Nikki/admin):** booking requests awaiting review, large adjustments (from `booking_adjustments`), repeated friction themes, comms health.
- **Corner Talk (Max/dev):** webhook/push/email health (`get_ops_service_health`), booking-missing spike, payment funnel drop, pending AI drafts.
- **Chase List chips:** No flight info · ID missing · Email bounced · Payment incomplete · Guest messaged · Arrives today · Pickup not assigned · Booking not visible to guest · Arrival conflict · Reply needed — all derivable from existing readiness + portal activity + email log + pickups + conflicts.
- **Friction Radar:** booking-missing trend, payment funnel, ID funnel, email reachability, alert suppression ratio, repeated question topics.

## C. Minimal read-only SQL (smallest safe path)

3–5 `SECURITY DEFINER` functions, gated by `has_role(admin|manager)`, property-scoped via `has_property_access`, sandbox/test rows excluded:

1. `get_friction_radar(period)` — portal funnel, payment funnel, ID funnel, email health, alert suppression, all as counts/rates.
2. `get_arrival_risk(hours)` — next-72h arrivals missing flight/ID/portal-open or with open conflicts (feeds Corner Talk + Daily Brief).
3. `get_reply_latency(period)` — guest message → first staff reply, per booking (never per-person leaderboard).
4. `get_booking_visibility_issues(period)` — `guest_booking_missing` events grouped by cause hypothesis (email mismatch vs unlinked).

No new tables needed for phase 1. Topic labels (later) go in a separate table, never into `messages` itself.

## D. Corner Talk changes

- Keep the function + panel; change what feeds it.
- Role-split the payload: front desk gets today's operational read; admin gets owner read; dev gets engine-room read.
- Every line cites its reason: "2 missing flight info" links to those bookings on the Chase List.
- Deterministic SQL first, AI narration second (same pattern as `ops-tower-narrative` with its deterministic fallback).
- Tone example: "5 arrivals today. 2 missing flight info. 1 guest messaged overnight. 1 email bounced. No pickup conflicts."
- Never invents, never profiles guests, never shames staff, never acts.

## E. Front Desk / Chase List changes

- Attention chips per booking with the reason, not just grey dots.
- Sort by urgency (arrives today + most missing + unread reply first), not just date.
- Each card answers "what do I do next": Message / Status / copy portal link — all existing actions.
- Optional compact "Today's Street Read" strip at top, fed by the Daily Brief rollup.
- Stays read-only: chasing is a human-sent message.

## F. Notification categories → existing infrastructure

One spine, four classes, mapped onto what exists:

| Class | Audience | Examples | Channel |
|---|---|---|---|
| Stay Alerts | Guests | front desk replied, pickup changed, ID needs replacement, payment action needed, arrival info missing | portal + email (existing `notify-guest-message`, scheduled emails) |
| Ops Alerts | Staff | guest messaged, landed/here tap, booking request, ID uploaded, payment issue, email bounced | existing `admin_alert_log` fan-out + bell + opt-in push |
| Owner Alerts | Nikki/admin | large discount/waiver, booking request needing owner call, weekly friction radar, exceptions | email digest + bell |
| Engine Alerts | Max/dev | push failing, email queue failures, webhook issues, booking-missing spike, AI draft failures | Ops Control Tower + email |

Urgent = email + bell (+push if enabled). Important = bell + digest. Digest = weekly email only. Silent log = tables only. Push: audit and repair existing wiring (`push_delivery_log` shows 4 deliveries ever) before expanding anything.

## G. Daily Ops Brief + Weekly Friction Radar without bloat

- **Daily Brief:** extend the existing `daily-briefing` function with arrival-risk and overnight-message sections; same email, same `TodaysBriefing` card, also feeds Corner Talk. No new surface.
- **Weekly Friction Radar:** one scheduled admin email + one new tab in Ops Control Tower (not a new page). Pure SQL rollups + AI narration. Front desk never sees it unless they open the Tower.

## H. AI / Kru Glitch safe assistance

**Allowed next:** summarize briefs and radar in plain words; flag "guest stuck" and arrival risk with cited reasons; draft guest replies, guide edits, chase messages, housekeeping/task drafts into `ai_action_drafts` (human approves); label guest messages by topic (labels only, separate table); explain "why is this flagged."

**Forbidden, stays forbidden:** booking state, rooms, dates, prices, discounts, fees, balances, deposits, refunds, check-in/out; editing/merging guest records; approving/rejecting IDs; publishing guide content; sending anything guest-facing without a human pressing send; acting on WhatsApp/Telegram/LINE/email content; guest scoring, sentiment, nationality/language inference; flight status as guest location.

Any background AI job follows the batch-job rules: bounded batch, DB single-flight lock, idempotent progress, circuit breaker on 402/403/429, paused-state guard at every entry point. Model: `openai/gpt-6-astra` via the gateway, deterministic fallback always present.

## I. Aesthetics / motion language

**Staff side:** fight-camp operations board — dark Lamai base, red/blue accents, white utility text, status chips ("NEEDS EYES / READY / MISSING / ARRIVING"). Split-flap/departure-board reveals used sparingly: Corner Talk lines, Daily Brief reveal, readiness changes. Motion guides attention, never slows action. Honor `prefers-reduced-motion`. Zero animation on emergency, help, payment, check-in or passport-critical flows.

**Guest side:** same board language, softer — calm arrival board + welcome binder. "Your next step" always obvious. Gentle flip/snap once on load or status change only. Calm blue/gold accents; red only for urgent action-needed. Camp Notices look official and are reply-able underneath.

Implementation note for later: CSS transforms only, GPU-friendly 300ms transitions (matches existing interactive-cards pattern), semantic tokens, no hardcoded colors.

## J. Order of work

1. **Booking visibility root-cause check** (investigate first, maybe a bug not a report): why 139 `guest_booking_missing` events — which guests, email mismatch vs unlinked booking.
2. **Read-only rollup functions** (`get_friction_radar`, `get_arrival_risk`, `get_reply_latency`, `get_booking_visibility_issues`) — the data backbone for everything else.
3. **Corner Talk role-split** fed by rollups — the first visible "instinct."
4. **Chase List attention chips + urgency sort + Street Read strip.**
5. **Daily Brief upgrade** (arrival risk + overnight messages).
6. **Weekly Friction Radar** (Tower tab + admin email).
7. **Feed `ai_action_drafts`** — reply/chase/guide drafts with approval.
8. **Notification classification pass** on the existing spine; repair push wiring.
9. **Motion language pass** on Corner Talk / Brief / Chase List, then the guest portal's softer variant.

## Do NOT build now

Auto-booking, auto-check-in, WhatsApp auto-responder, dynamic pricing, auto-discounts, guest scoring/sentiment, GPS/location tracking, staff surveillance leaderboards, new dashboard pages, native app work, multi-tenant packaging, AI publishing or sending without approval, paid flight-provider upgrades (FlightAware) until arrival volume justifies it.
