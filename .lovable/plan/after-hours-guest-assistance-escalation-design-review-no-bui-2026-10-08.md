# After-Hours Guest Assistance & Escalation: design review (no build yet)

This is a review only. Nothing in the app, the data, the messages or the settings has been changed.

## What already exists (checked)

- **Emergency phone on the guest portal.** `GuestStaySummary.tsx` (around lines 444–485) shows `emergency_phone`. It only appears for checked-in guests. The number comes from `useStayEssentials.ts:48`: the room's own `emergency_contact_phone` if set, otherwise the camp-wide policy setting `emergency_contact_phone`. This is the natural home for the call button.
- `**guest_escalations` table.** Columns: `guest_user_id, channel, chat_id, summary, resolved, resolved_by, resolved_at`.
  - Only `messaging-router` writes to it (around lines 648 and 1558).
  - It has no `booking_id`, no severity, no acknowledgment step and no time limits.
  - Who can do what today: guests read their own; staff with read access can read; staff with write access can mark resolved; managers and admins have full access.
- `**staff_phone_numbers` table.** Holds `phone_e164, label, user_id, channel, is_active`. Managers and admins can edit it; staff can read it. It identifies staff numbers, but it is not a duty roster.
- **Alert fan-out.**
  - `emit-admin-alert` sends with a per-person duplicate-protection key (`alert-${eventId}-${uid}`).
  - `admin_alert_log` records `status`, `retry_count`, `channel` and `recipient_user_id`.
  - Email is the reliable channel.
  - Phone alerts: 0 phones signed up today.
- **Scheduled jobs.** pg_cron is already used (for example in `migrations/20260421030119…`), so a timed escalation job fits the existing pattern.
- **Reusable screen parts.**
  - `FrontDeskFAB.tsx` (78 lines): the guest's quick-contact button.
  - `ChaseList`, the Messages inbox, and the new Settings → App delivery health card.
  - The `GuestPreviewControls` read-only preview, so admins can see the guest view without acting as the guest.

## Smallest working version

**1. Guest: "Urgent help" card in the portal**

- One big **Call camp** button. It dials a number that management has approved, using a phone call link (`tel:`).
- A separate, clearly labelled **WhatsApp message** link with the same caption as today. It doesn't change Nikki's number.
- The wording says plainly: a phone call is fastest; a WhatsApp or app message may not be seen right away at night.
- Honest hours: "Staffed until HH:MM (Bangkok time). After hours we answer as quickly as we can; this is not a guaranteed 24/7 line." The real hours come from the duty roster.
- Optional **Send urgent request**. The guest picks a category (locked out, medical, safety, room problem, other) and can add one line of text. The request is tied to their active booking.
- The card says that for medical emergencies or danger, call 1669 or 191 first. It reuses the verified emergency numbers from The Rock.

**2. Staff: duty roster (managers and admins edit it)**

- Shifts in Bangkok time, each with a primary person, a backup person and start/end times.
- Nikki can stay primary every night until others are added. Nam and others start as backups or watchers, so they can see requests without owning the WhatsApp number.

**3. Staff: request lifecycle**

```text
open → acknowledged (by whom, when) → resolved (by whom, note)
```

- If nobody acknowledges within **X minutes**, the request goes to the backup. If still nobody after **Y minutes**, it goes to all managers and admins.
- Every step is logged.
- Nothing changes a booking, payment, room or check-in automatically. Resolving a request is only a note. Staff still do any real action from the booking itself.
- No AI sorting of requests. The category is whatever the guest picked; AI may at most suggest a draft reply.

**4. Where staff see it:** an "Urgent" pinned strip on the Front Desk and Chase List, and an "Urgent" badge on the booking.

## Database and server additions (proposed)

- **Extend `guest_escalations**` with new optional fields only: `booking_id`, `property_id`, `category`, `severity`, `status` (`open / acknowledged / escalated / resolved`), `acknowledged_by`, `acknowledged_at`, `escalation_level`, `next_escalation_at`, `source` (`portal / messaging`). Existing rows stay valid.
- **New `duty_roster` table:** `property_id`, `starts_at`, `ends_at`, `primary_user_id`, `backup_user_id`, `note`. Managers and admins write; staff read.
- **New `guest_escalation_events` table:** an add-only log of who did what and when. No edits or deletes, enforced by a guard like the one on messages.
- **Guest submission function** (`create_urgent_request`):
  - Only works on the guest's own booking.
  - The booking must be in `confirmed` or `checked_in` state, or arriving within 48 hours.
  - Rate limit: 3 requests per hour.
  - Fires an alert through `emit_admin_alert` to whoever is on duty now, with a per-person key.
- **Escalation job** (`escalation-tick`): runs every minute via pg_cron and moves on any request past its `next_escalation_at`. Each step is protected against firing twice (`esc-${id}-L${level}-${uid}`).
- **Settings:** approved urgent call number, WhatsApp display number, staffed hours text, and the X/Y time limits. Changes are recorded through the existing `policy_settings` change history.

## Edge cases

- **No one on the roster tonight:** go straight to managers and admins, and show staff a warning that there's a "coverage gap".
- **Shifts crossing midnight** in Bangkok time; store times in UTC.
- **The guest calls and also sends a request:** staff mark one as a duplicate and resolve it with a note.
- **Phone alerts not set up for anyone:** email still goes out. The urgent card must not imply anyone gets an instant buzz until at least one phone has signed up.
- **Guest without a booking** (just browsing, or arriving later): they see the call button only.
- **Requests coming in from messaging** reuse the same table with `source = messaging`, so there's no second inbox.
- **Admin preview of the guest portal:** sending a request is blocked, as it is for other actions.
- **Request spam:** rate limit, plus staff can close a request as spam.

## Rollout and tests

1. Build on the practice camp only, with test accounts. No live guests.
2. Test matrix on iPhone (installed app), Android (installed app) and desktop:
  - The call button opens the phone dialer.
  - The WhatsApp link opens WhatsApp.
  - A request appears for the person on duty.
  - Acknowledge stops the escalation.
  - The time limit escalates to the backup, then to managers.
  - Resolve writes the log.
  - A guest can't see another guest's request.
  - Nobody can edit the log.
3. Turn on Ops Alerts on Maxwell's phone, then Nikki's, before going live.
4. Go live with Nikki as primary, Maxwell as backup and Nam as a watcher.
5. **Rollback:** a single setting hides the urgent card. The new database fields are optional, so turning the feature off breaks nothing.

## Decisions needed before building

1. **Which number is the Call camp button?** Nikki's WhatsApp number, a separate night line, or the person on duty's number? This is management's decision; nothing is chosen automatically.
2. **Staffed hours** and the honest after-hours wording.
3. **Time limits X and Y** (suggested: 10 minutes, then 20).
4. **Who is on the roster**, and whether Nam is a backup or only a watcher at first.
5. **Who can see guest urgent requests:** all staff, or only managers and the person on duty.
6. **Should medical and safety requests skip straight to all managers?**

Please incorporate the following refinements into the existing **After-Hours Guest Assistance & Escalation** implementation plan before proceeding with development.

First, preserve Nikki's existing WhatsApp Business number and all current calling arrangements. Do not migrate, disconnect, redirect, or modify the number or its existing functionality. The goal is to complement the current communication system, not replace something guests already depend on, particularly for after-hours assistance.

Second, do not automatically assign Nikki, Nam, Max, or any other staff member to overnight coverage. All primary contacts, backup contacts, duty schedules, and escalation responsibilities must be configurable and explicitly approved by management. The system must also distinguish between someone who can receive a notification and someone who can physically assist a guest.

Third, prioritize direct phone contact for urgent accommodation issues, particularly room lockouts and access problems. The guest portal should clearly distinguish between calling for immediate assistance, sending a routine CampStay message, and contacting the existing WhatsApp number. Submitting an urgent request must never imply that immediate assistance is guaranteed.

Fourth, expand the existing `guest_escalations` infrastructure to track the complete incident lifecycle, including when a request was received, delivered, acknowledged, assigned, escalated, physically addressed, and resolved. Acknowledging a request must not automatically mark it as resolved or prevent follow-up on an unresolved incident. All significant actions should have an immutable audit history.

Fifth, introduce a management-controlled **Coverage & Escalation** section within the existing operations interface. Nikki and authorized management should be able to see current coverage, primary and backup responders, unresolved incidents, acknowledgment status, escalation history, and notification delivery health. This should integrate with the existing Front Desk, Chase List, Messages, and booking records rather than becoming another disconnected dashboard.

Sixth, if no staff member is assigned, available, or reachable, the system must clearly identify the coverage gap internally. It must not assume that sending an email or push notification means someone is available to respond. Guests should continue seeing the verified emergency contact arrangement, with no misleading claims of guaranteed 24/7 coverage.

Seventh, review the proposed request rate limits to ensure legitimate guests cannot be prevented from seeking urgent assistance during an ongoing incident. Abuse prevention should remain in place, but it must not create an unsafe situation for a guest who is locked out or requires help.

Eighth, preserve strict human control over all operational decisions. AI may assist with organizing information or preparing draft responses, but it must not independently classify emergencies, dismiss urgent requests, assign unapproved personnel, modify bookings, change rooms, process payments, or close incidents.

Ninth, ensure the new functionality works independently of WhatsApp and Twilio. It should use CampStay's existing communications infrastructure, with WhatsApp remaining an optional integration once its compatibility and operational implications have been properly assessed.

Finally, divide implementation into controlled phases. Begin with the guest assistance interface, management-controlled contact information, and booking-linked incident records. Follow with staff coverage management, acknowledgment workflows, escalation rules, and notification reliability testing. Automated after-hours escalation must remain disabled until management approves the staffing arrangements and the complete workflow has been verified using test accounts and the practice environment.

**Do not implement anything yet.** Update the existing plan to reflect these requirements, identify any architectural conflicts or missing dependencies, and return the revised implementation plan for review and approval. Preserve the current Communications Spine architecture and avoid unnecessary duplication of existing features.