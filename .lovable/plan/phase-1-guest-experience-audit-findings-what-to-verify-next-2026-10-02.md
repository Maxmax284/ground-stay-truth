# Phase 1 Guest Experience Audit — findings + what to verify next

Read-only. Data window: telemetry exists from 27 Jul to 29 Sep 2026 (about 65 days). Older than that is unknown, not zero.

## Executive summary

Working
- Guests do come in: 53 distinct guest accounts opened the portal (374 loads); 31 came back on more than one day.
- ID upload works: 12 uploads from 7 guests, 8 passports accepted by staff, 1 marked "needs replacement", 2 replaced. Review flow is used.
- Payment links work as a staff tool: 37 generated, 31 opened, 20 checkouts started; 84 "already paid" taps were blocked correctly (no double charges).
- Every message is tied to a booking (0 orphan messages). Internal notes (43) are flagged internal and kept out of guest view.
- Staff alerts fire: 36 "guest message received", 39 "guest uploaded ID", 21 "pickup requested", 47 "deposit paid".

Weak
- "Booking not found" is the biggest wall: 120 events across 46 guest accounts — guests sign in and see no stay. Likely signup with a different email than the booking, or bookings not linked to an account (23 of 63 recent bookings have no guest account).
- Portal chat is barely used: 15 guest-visible messages on 4 bookings; only 9 written by guests. Guest-notice emails sent: 2 (3 suppressed by the anti-spam window).
- Card payment funnel leaks: 33 checkout starts, 17 confirmed "checkout page ready", only 4 recorded actually leaving for the card page (the newer tracking began late, so older starts have no recorded outcome). iOS Safari is the #1 device (416 events) — the redirect-stall fix is recent and not yet proven with real guests.
- Staff alert emails: 33 failed, 210 still "pending", 79 suppressed out of ~700. Needs checking — pending may be a stuck queue, not real delivery.
- Pickup driver links: 0 ever created. Built but unused.

Unknown / not tracked
- Which portal sections guests view (no per-section tracking beyond pay/ID buttons).
- Flight entry by guests vs staff (pickups store a flight number but not who typed it).
- Landing confirmation: no "guest confirmed landing" event exists in telemetry; stage log shows 2 "transfer ETA" and 1 "collected".

## Usage snapshot (last ~65 days, confirmed data)

```text
Bookings (check-in or created, 90d)  63  (40 linked to a guest account)
  completed 23 | cancelled 19 | checked_in 10 | confirmed 9 | inquiry 2
Portal: guests who loaded it          53   returning (2+ days) 31
  booking shown / missing             27 guests / 46 guests
  linked bookings with zero activity  4
Devices: iPhone Safari 416 | desktop Chrome 284 | Edge 89 | Android 74 | iPhone Chrome 61
  in-app browsers (Facebook/IG etc.)  12 events, 1 guest
Pickups                               16 (7 completed, 1 assigned, 4 requested, 4 cancelled); 15 have a flight no.
Flight tracking rows                  3   | new flight read-model: 0 facts, 2 legs, 0 conflicts
Driver links                          0
Messages guest-visible / internal     15 / 43  (4 bookings with guest chat)
Deposits via Stripe recorded          22  | Stripe cancelled 30 | pending 23
Balances recorded manually            34  (front desk cash/transfer — normal)
ID docs                               13 passports (8 accepted); no other doc types uploaded
Island guide entries                  0   (guests see nothing yet)
```

## Guest journey map

```text
Booking -> Sign in -> [WALL: booking missing, 46 guests]
 -> Pay deposit (10 tapped, 5 guests confirmed checkout page) -> card page
 -> Upload passport (7 guests) -> staff accept / ask for replacement
 -> Flight + pickup (mostly staff-entered) -> Arrivals Board
 -> Landing (no guest action tracked) -> driver (manual, no links used)
 -> Check-in (welcome email 15 sent) -> stay (Wi-Fi, laundry, maintenance)
 -> Checkout (11 follow-up emails)
```

## Top friction points
1. Signed in, no booking shown (46 guests).
2. Card checkout on iPhone: many starts, few confirmed hand-offs.
3. Chat not discovered or not trusted — guests likely message on WhatsApp/email instead.
4. Arrival day: guests have no "I've landed" action that staff see; driver links never used.
5. Welcome content scattered: stay basics live across Now card, Stay summary, Stay support, "While you wait", camp info.

## Stay-info coverage vs the paper welcome sheet

| Paper sheet item | In CampStay today | Editable without code? |
|---|---|---|
| Welcome message | Journey banner greeting | No — fixed text in translations |
| Reception/office info, contact | company phone, contact email | Yes — Settings → Policies |
| Wi-Fi | wifi name/password, unit overrides | Yes — Stay Essentials editor |
| House rules | house_rules_summary, gym rules | Yes — Policies / Camp Info |
| Training schedule, what to bring | camp_info | Yes — Camp Info |
| Laundry / housekeeping / maintenance | Stay support request panels | Requests yes; explainer text fixed |
| Private lessons | Not found as guest content | Gap |
| Emergency numbers | emergency contact name/phone only | Partly — one contact; no police/hospital/tourist police list |
| Taxi / getting around | arrival welcome guides (BKK, Samui, bus, ferry) | Yes — arrival guide settings |
| Lamai / Samui tips | Island guide (built) | Yes — but 0 entries |
| What the camp can do for you | Not a single section | Gap |
| Checkout time | checkout_time | Yes |

## Admin/manager control gaps
- Stay content edits are spread across Policies, Stay Essentials, Camp Info, Arrival guides and Guide — no single "Guest welcome content" page.
- Welcome greeting, laundry/housekeeping explainers, help text: fixed in code.
- No preview of "what the guest sees" next to the editor (Guest Portal Preview exists separately).
- Island guide empty — needs Nikki's first entries.

## Staff feedback loop
- Exists: Operations Monitor → Guest Portal Health (funnel events), admin alerts for messages/ID/pickup/payments.
- Missing on the booking card: a simple row of checks — opened portal, paid deposit, added flight, uploaded ID, messaged, landed. All but "landed" can be derived from existing data.

## Safety checks (confirmed from code reviews earlier this project, re-checked here)
- Guest tools write requests, messages, documents and telemetry only; booking state, money, rooms, pickups, refunds and check-in change only through staff actions. Payments only change via the Stripe webhook after real payment.
- Guest views: internal notes filtered; pricing receipt guest mode strips operator names/reasons. To re-verify in Phase 2 QA as a signed-in guest.

## Phase 2 recommendations (not built)
1. Fix "booking missing": match on booking email at sign-in, plus a clear "Can't see your booking? Tell us your confirmation number" path; staff-side "link guest account" button.
2. Engagement checklist row on booking cards / Arrivals Board.
3. One "Your stay" section in the portal mirroring the paper sheet order: welcome → reception → what we can do → during your stay (Wi-Fi, laundry, housekeeping, private lessons) → emergency → Lamai tips.
4. One "Guest welcome content" settings page grouping all editable pieces, each with "guests see this here".
5. Add editable private lessons, services list, and a full emergency numbers list.
6. Guest "I've landed" button that informs staff only (no automatic changes).
7. Investigate the 210 pending / 33 failed alert emails.
8. Make the chat entry point more prominent post-booking and on arrival day.

## Phase 3 motion recommendations (not built)
Useful (guides attention or confirms state): next-step card change, "message sent — camp alerted" confirmation, payment success/failure state, arrival progress step advance, ID accepted / needs replacement. Light: stay-essential cards entrance. Avoid on emergency/help (must be instant) and local tips (static is fine). Always honour reduced motion and slow connections.

## Data limitations
- Telemetry starts 27 Jul; no section-level view tracking; checkout outcome tracking improved mid-window so older starts look like drop-offs; "pending" email status may mean queued or stuck — unconfirmed; no per-guest attribution of who entered flight info.

## Inspected
Tables: bookings, guest_portal_activity, airport_pickups, flight_tracking, flight_facts, journey_legs, journey_evidence, arrival_conflicts, guest_arrival_stage_log, pickup_driver_links, messages, user_roles, email_send_log, admin_alert_log, payments, payment_link_events, guest_documents, pre_arrival_checklist, local_recommendations, policy_settings.
Code: GuestPaymentButton, guestPortalTelemetry, GuestStaySupport, GuestStaySummary, GuestNowCard, StayEssentialsEditor, LaundryPanel, WhileYouWaitTab, PolicySettingsForm, GuestThreadDialog, GuestPortal.

## Manual QA checklist (real guests, after Phase 2)
- New guest signs up with booking email → sees booking immediately.
- iPhone Safari: Pay Deposit → card page opens → returns to "paid".
- Guest sends a chat → staff alerted by email + in-app → staff reply → guest email arrives.
- Upload wrong document → staff marks "needs replacement" → guest sees it clearly.
- Guest taps "I've landed" → shows on Arrivals Board, nothing changes automatically.
- Guest view never shows internal notes, discount reasons or operator names.
- Admin edits Wi-Fi / emergency number → guest portal updates without code.
