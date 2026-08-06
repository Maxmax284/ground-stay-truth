# Staff Workflow Fixes — Nikki's Onboarding Findings

Six issues, each traced to a specific code path. Nothing about the booking state machine, pricing, or payment math changes — the fixes are about what staff are shown and how manual/legacy bookings are treated.

## 1. Manual / legacy bookings throw too many warnings

Right now every arriving booking gets flagged for "Deposit unpaid", "ID document missing", and "Security deposit not collected" regardless of how it was created. Bookings Nikki entered by hand (guest paid by bank transfer, ID checked in person) light up red for things that were already handled offline.

Fix:
- Add a staff-set "handled offline" acknowledgement per booking (stored on the booking, set from Booking Detail with a reason, logged to the override audit trail with the actor).
- Front Desk warnings and the operational status badge respect that acknowledgement: acknowledged items stop showing as red problems and show as a quiet "Confirmed by staff" note instead.
- Documents stay advisory as they are today — no new blocking.

## 2. Checkout still asks for an override when everything is done

Confirmed root cause: `completed` is only a valid transition out of `checked_in`. Any booking that was never checked in (manual bookings that went straight to `confirmed`, or the guest left before staff pressed check-in) can only reach `completed` through the admin override toggle.

Fix:
- Allow `confirmed → completed` as a normal transition for staff with checkout permission, with a required short reason ("guest already departed"), logged to the override audit trail as an attributed staff action.
- Remove the override requirement for the ordinary `checked_in → completed` case where balance is settled or the balance has been acknowledged as collected offline.

## 3. Cleaning schedule shows on the dashboard but not on Front Desk

Confirmed root cause: the Front Desk data hook only loads bookings that are `checked_in` or have a check-in inside the next 7 days. Once a guest checks out the booking becomes `completed` and drops out entirely, so its turnover task disappears from the Turnover Board even though the room still needs cleaning.

Fix:
- Load today's housekeeping tasks for the property directly (not only through bookings), so the Turnover Board shows every open task for today including rooms whose guest already checked out.
- Show unit name, task type (turnover vs scheduled), and status, matching what the dashboard shows so the two screens agree.

## 4. Pay-on-arrival bookings show as payment overdue

There is currently no concept of "guest is paying on arrival" anywhere in the system, so any unpaid confirmed booking reads as a problem — "Arrival Problem — Deposit Unpaid" in red.

Fix:
- Add a "Paying on arrival" marker staff can set on a booking.
- When set, Front Desk and the status badge show "Paying on arrival" in neutral tone instead of an overdue/red warning, and the pre-arrival alert roll-up skips it.
- Payment obligations and the ledger are untouched — the balance is still owed and still visible; only the alarm framing changes.

## 5. Flight arrival date/time mismatch

Confirmed root cause: the guest-facing arrival form converts the typed time using the guest's device timezone (`new Date(value).toISOString()`) and redisplays the stored value by string-slicing UTC. A guest typing 14:30 from Europe stores the wrong absolute time, and staff see a shifted value.

Fix:
- Route the guest arrival form and the guest booking request form through the existing Thailand-time helpers (`toCampInputValue` / `fromCampInputValue`) so typed times are always read as Thailand time, matching the staff side.
- Label the field explicitly as Thailand time on the guest side.
- Add tests covering the round trip from several device timezones.

## 6. Audit trail, Kru Glitch, and staff clarity

- Every new action above (offline acknowledgement, early completion, pay-on-arrival marker) writes an attributed entry through the existing `log_override_event` path, so the Monitoring Center "who did what" panel picks them up with no extra work.
- Kru Glitch booking context gains the three new markers so it stops telling staff a booking is at risk when staff already resolved it offline.
- Warning copy gets rewritten in plain English with what to actually do, e.g. "Balance owed — collect at check-in or mark as paying on arrival" instead of a bare red flag.

## Technical notes

- New booking columns: `pay_on_arrival` (boolean), `offline_acknowledgements` (jsonb: which items staff confirmed, who, when, why). Guest-write guard trigger updated so guests cannot set them.
- `src/lib/bookingStateMachine.ts`: add `completed` to `confirmed` transitions.
- `src/hooks/useFrontDesk.ts`: new today's-housekeeping query keyed on active property, independent of booking window.
- `src/lib/operationalStatus.ts` and `src/pages/FrontDesk.tsx` warning builder: consume the new markers.
- `src/components/GuestArrivalSelector.tsx`, `src/components/GuestBookingRequestForm.tsx`: timezone helpers.
- `supabase/functions/ai-assistant/index.ts`: include markers in booking context.
- Tests: timezone round trip, status badge behaviour with markers set, transition validity.
