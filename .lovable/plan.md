

# Critical Gaps Audit -- COMPLETED

All 6 gaps from the audit have been addressed:

## ✅ Gap 1: Guest Inquiry Notifications (HIGH) — DONE
- `useTransitionBookingState` now sends contextual messages for inquiry→soft_hold and inquiry→cancelled
- Includes unit name and dismissal reason in guest notifications

## ✅ Gap 2: AI (Kru) on InquiryQueue (MEDIUM) — DONE
- Each inquiry item shows an AI advisory badge (Bot icon) with tooltip
- Lazy-loaded validate check flags date overlaps, maintenance conflicts, capacity concerns
- Respects circuit breaker (global + role toggles)

## ✅ Gap 3: AI Guest Context (MEDIUM) — DONE
- ai-assistant edge function fetches caller's own bookings when role is "guest"
- Appended to context so Kru can reference guest's booking state, dates, units

## ✅ Gap 4: Notification Localization (MEDIUM) — PARTIAL
- Added i18n keys for all notification message templates in en.json
- Full client-side rendering with translation keys deferred to Phase 2
- Current notifications still stored as English strings; future work: store translation key + params

## ✅ Gap 5: stay_support_log RLS (LOW-MEDIUM) — DONE
- Replaced permissive INSERT policy with two scoped policies:
  - Guests: can only insert for their own bookings
  - Staff (front_desk+): can insert for any booking

## ✅ Gap 6: Supervisor Queue Visibility (LOW) — DONE
- InquiryQueue and ApprovalQueue accept `readOnly` prop
- Dashboard shows queues to front_desk_supervisor in read-only mode (no action buttons)
- "Preview" badge shown when readOnly

## Remaining Work (Phase 2)
- Gap 4 full implementation: Store notification translation keys instead of raw strings, render localized in NotificationBell
