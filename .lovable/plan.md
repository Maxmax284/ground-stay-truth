# Booking Status Page — "chase without guessing"

A single staff-facing page per booking that shows, in one glance, everything a guest has or hasn't done — so staff know exactly what to chase and can jump straight to the right action.

## What it shows

One page at `/bookings/:id/status`, linked from the booking card / booking detail ("Status" button). Sections, top to bottom:

1. **Readiness summary** — the five readiness signals (opened portal, paid, flight added, ID uploaded, messaged) shown as labelled rows with done/not-yet state, reusing the `useBookingReadiness` data for this one booking.
2. **Travel details** — journey legs in order (flight/ferry/bus, times, airports) with flight status where known, plus open arrival conflicts flagged for a human to resolve. Reuses `useArrivalIntelligence`. Read-only.
3. **ID & documents** — uploaded ID/passport documents with status, link to the existing staff document review. Reuses `useGuestDocuments`.
4. **Arrival checklist** — the pre-arrival checklist progress (14 items, critical items highlighted), read-only view of what the guest has ticked. Reuses `usePreArrivalChecklist` in read-only mode.
5. **Pickup status** — pickup requested/assigned, driver, meeting point, "I've landed" / "I'm here" signals if sent.
6. **Chase actions** — per missing step, a plain action: "Message guest" (opens the booking's chat thread with a suggested short line pre-filled, staff edits and sends — nothing auto-sends), "Send portal link" (copies the guest portal link), "Email guest".

## Rules kept

- Read-only on all operational data — the page never changes booking state, money, rooms, or pickups. Messaging still only feeds the system.
- Chase actions are human-sent messages only; no auto-nudges, no scheduled chasers.
- Staff-only route (front_desk and above), property-scoped like other booking views.
- Camp Ready minimal UI, dark theme, semantic tokens, i18n keys with English defaults, mobile-first (Nikki/Max on phones).

## Technical notes

- New page `src/pages/BookingStatus.tsx`, route registered in `App.tsx` with role guard in `src/lib/permissions.ts`.
- New thin hook `useBookingStatusSummary(bookingId)` composing the existing hooks; no new tables, no migrations, no edge functions.
- Entry points: "Status" button on booking cards in `Bookings.tsx` and on the booking detail header.
- Reuses: `useBookingReadiness`, `useArrivalIntelligence`, `usePreArrivalChecklist`, `useGuestDocuments`, `useAirportPickups`.
