# After-Hours Guest Assistance & Escalation: revised plan (v2, for approval)

This version adds your ten refinements. Nothing has been built yet.

## Fixed rules (from your refinements)

1. **Nikki's WhatsApp Business number and all current calling stay exactly as they are.** No migration, redirect or change. CampStay only displays the number that management approves.
2. **No one is assigned automatically.** Every primary, backup, shift and escalation step is set up and approved by management. The system tracks two separate things for each person:
   - **Can be notified** (gets alerts)
   - **Can physically assist** (can actually reach the guest)
3. **Phone first for lockouts and access problems.** The portal shows three clearly separate options:
   - **Call for immediate help**: a phone call to the approved number.
   - **Send a CampStay message**: routine, answered when staff are available.
   - **Existing WhatsApp**: Nikki's number, unchanged.

   A submitted request never says or suggests that help is guaranteed.
4. **Full incident lifecycle with a permanent audit trail.** Steps: received → delivered → acknowledged → assigned → escalated → physically addressed → resolved. Acknowledging a request does not resolve it, and it does not stop follow-up on an unresolved incident.
5. **Coverage & Escalation section inside the existing operations screens.** It feeds into Front Desk, Chase List, Messages and the booking. It is not a separate dashboard.
6. **Coverage gaps are shown openly to staff.** A sent email or push never counts as someone being available. Guests keep seeing the verified emergency numbers and are never promised 24/7 cover.
7. **Rate limits never block a real emergency.** See "Rate limiting" below.
8. **Humans decide.** AI may summarise an incident or draft a reply. It may never:
   - classify how serious a request is
   - dismiss or close a request
   - assign people
   - change bookings, rooms or payments
9. **Works without WhatsApp or Twilio.** It uses CampStay's portal, email and phone alerts. WhatsApp stays optional and comes later.
10. **Phased rollout. Automatic escalation stays off** until management approves the staffing and the full workflow passes on the practice camp.

## Reuse (verified existing pieces)

- `GuestStaySummary.tsx` (around lines 444–485) and `useStayEssentials.ts:48`: the emergency phone number already shown in the portal. This becomes the approved Call number.
- `FrontDeskFAB.tsx`: the guest's quick-contact button. The three options go here.
- `guest_escalations`: extended, not replaced. `messaging-router` keeps writing to it, so there's one inbox.
- `staff_phone_numbers`: where staff contact numbers come from for the roster.
- `emit-admin-alert` and `admin_alert_log`: alert delivery with per-person duplicate protection, plus delivery status.
- `get_comms_health` and the Settings → App delivery card: notification health.
- `policy_settings` and its change history: approved numbers, wording, time limits, on/off switches.
- The admin preview of the guest portal: actions are blocked there, so admins can look without doing anything for real.

## Phase 1: Guest help screen, contact settings, linked incidents

Automatic escalation is off in this phase.

**Settings** (`policy_settings`, managers and admins only, every change logged):
- `urgent_call_number`: approved by management. Blank means no Call button; the guest sees emergency numbers only.
- `whatsapp_display_number`: display only. It defaults to whatever is shown today.
- `staffed_hours_text` and `after_hours_notice`: the honest wording, written by management.
- `urgent_requests_enabled`: master switch. **Starts off.**

**Guest "Need help?" card:**
- Call / Message / WhatsApp, clearly separated.
- Lockout and access issues say "Call first".
- 1669 and 191 for medical emergencies or danger.
- An optional urgent request linked to their booking. The guest picks a category; nothing is classified automatically.

**Database:**
- Extend `guest_escalations` with optional fields only (existing rows stay valid):
  - Links and labels: `booking_id`, `property_id`, `category` (the guest's choice), `source` (`portal` / `messaging`), `status`
  - Lifecycle times: `received_at`, `delivered_at`, `acknowledged_at` / `_by`, `assigned_to`, `escalation_level`, `next_escalation_at`, `addressed_at` / `_by`, `resolved_at` / `_by`, `resolution_note`
- New `guest_escalation_events` table: one row per action, add-only. A database guard blocks edits and deletes, the same pattern as messages and booking adjustments.
- New `create_urgent_request` function: the guest's own booking only, `confirmed`, `checked_in`, or arriving within 48 hours. It records the request and alerts the people approved to receive alerts. If none are set up, managers and admins get it, flagged as a coverage gap.

**Staff:** an Urgent strip on the Front Desk and Chase List, and a badge on the booking. Staff can mark a request acknowledged, assigned, physically addressed or resolved; each step is a separate action.

## Phase 2: Coverage, acknowledgments, escalation, reliability

**New `duty_roster` table:**
- Fields: `property_id`, `starts_at` / `ends_at` (stored in UTC, shown in Bangkok time), `primary_user_id`, `backup_user_id`, `approved_by`, `approved_at`.
- Staff read it; managers and admins write it.
- A shift only counts once it has been approved.

**New `responder_capabilities` table:** `user_id`, `property_id`, `can_receive_alerts`, `can_assist_on_site`, `approved_by`. A person on the roster who can't physically assist triggers a coverage-gap warning.

**Coverage & Escalation panel** (a new tab inside Front Desk / Ops, not a new dashboard). It shows:
- who is on now
- gaps in the next 24 hours
- unresolved incidents
- acknowledgment times
- escalation history
- delivery health, using the existing card

**Escalation job** `escalation-tick`:
- Fires on new requests. A backstop check runs every 2 minutes, only while unresolved requests exist. It stops when the queue is empty, so it costs nothing when quiet.
- Gated by `auto_escalation_enabled`, which **starts off**.
- Duplicate protection key: `esc-${id}-L${level}-${uid}`.
- Escalation only re-notifies people; it never closes or reassigns anything without a person.
- **Unresolved but acknowledged:** a reminder goes out after Z minutes without "addressed" or "resolved".

**Reliability tests:** test pushes and emails go to approved test accounts only.

## Rate limiting (does not block help)

- The Call button and emergency numbers are **never** rate limited.
- A guest with an open request **adds an update to it** instead of creating a new one. Updates aren't capped; they re-alert at most once every 2 minutes.
- New separate requests: soft limit of 5 per booking per hour. After that, the request still saves and still alerts. It is flagged "high volume" for staff to review; it is never dropped.
- Staff, not the system, can mark a request as spam.

## Conflicts and missing pieces

- **`guest_escalations` has no booking link.** Old rows from messaging stay unlinked; they're shown as "no booking" and not guessed at.
- **Its current policy lets ops staff update every field.** It needs a column guard so the lifecycle times can only move forward through the new staff actions.
- **No phone has signed up for alerts (0 today).** Phase 2 can't go live until at least one primary and one backup have them working on their phones.
- **`emergency_contact_phone` may be shown somewhere today.** I need to confirm which number that is before it becomes the approved Call number; nothing changes until management confirms.
- **The guest card is only shown to checked-in guests today.** Showing it to guests arriving within 48 hours is a small change to the display rule.

## Rollback

- `urgent_requests_enabled` off hides the guest card. `auto_escalation_enabled` off stops escalation.
- All new fields are optional and the new tables can be left unused, so turning it off breaks nothing.
- The audit log is kept even after rollback.

## Tests (practice camp, test accounts only)

On iPhone (installed app), Android (installed app) and desktop:
- **Contact buttons:** Call opens the dialer, WhatsApp opens WhatsApp, and a CampStay message goes to the booking's thread.
- **Requests:** an urgent request creates an incident linked to the booking, and a second one adds to the open incident.
- **Lifecycle:** acknowledging does not resolve, and the reminder fires while a request is unresolved.
- **Coverage gap:** with no approved shift, staff see the coverage-gap warning and the guest copy promises nothing.
- **Escalation off:** with escalation off, there are no automatic re-notifications.
- **Escalation on:** with escalation on (practice camp only), escalation goes primary → backup → managers.
- **Permissions:** a guest can't see another guest's request, the log can't be edited or deleted, and AI can't change status.
- **Preview:** admin preview can't send a request.

## Decisions needed from management before building

1. Which number the Call button uses, and whether it is shown to guests arriving within 48 hours.
2. The staffed hours and after-hours wording.
3. Who can receive alerts and who can assist on site, per property.
4. Time limits: X (to backup), Y (to managers), Z (unresolved reminder). Suggested: 10, 20 and 30 minutes.
5. Who can see urgent requests: all ops staff, or only managers and the person on duty.
6. Whether medical and safety categories alert managers straight away. This is the guest's choice of category, not an AI decision.

Once you approve, I build Phase 1 only, with every switch off.
