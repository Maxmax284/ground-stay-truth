
# Ground Stay Platform Review -- Full Audit

## What This Platform Is

Ground Stay is a direct-booking accommodation management system built for Lamai Muay Thai fight camp in Thailand. It replaces third-party platforms (Booking.com, Agoda) to eliminate commissions and give full operational control. The system covers the entire guest lifecycle: inquiry, approval, deposit, check-in, stay support (maintenance/laundry), check-out, and cancellation -- all enforced by a 9-state booking machine with mandatory audit logging.

The platform serves 7 distinct roles (Guest, Viewer, Maintenance, Front Desk, Supervisor, Manager, Admin) with strict RLS enforcement, real-time notifications, 9-language i18n (including Thai), embed widgets for external sites, and an AI advisory layer called "Kru" that provides read-only operational intelligence.

---

## What's Working Well

- **Booking State Machine**: 9-state lifecycle with overlap protection, cleaning buffer enforcement, early check-in approval workflow, and mandatory audit trail on every transition. This is production-grade.
- **Role Hierarchy**: 7-tier system with RLS enforced at the database level via `has_role()` security definer function. Route guards and UI permission checks align with the DB policies.
- **AI Layer (Kru)**: 5-mode advisor (Explain, Summarize, Validate, Draft, Digest) with real-time property snapshots, staleness detection, per-role circuit breakers, and multi-language response support. Correctly read-only -- never executes actions.
- **Deposit Control System**: 3-mode policy (manual_only, online_optional, online_required) with Manager override + audit logging. Source channel tracking (front_desk, guest_portal, supervisor_override).
- **Stay Support**: Maintenance and laundry tracking with override audit logging, real-time notifications, and role-specific action buttons.
- **i18n**: Full 9-language support including Thai -- critical for the Thailand location.
- **Cancellation Policy**: Tiered refund calculator (free/partial/none) driven by policy_settings, not hardcoded values.
- **Embed Widgets**: 4 types (listing, compact, calendar, CTA) with configurable targets pointing to guest registration.
- **Reports**: Occupancy, revenue by unit, state distribution, blocked vs bookable analysis, plus account overview.

---

## Critical Gaps to Address

### 1. No "partial_refund_percentage" Policy Setting
The refund calculator references `partial_refund_percentage` but the policy_settings table only has `partial_refund_days`. The percentage defaults to 50% in code, but there's no admin-configurable row in the database for it.

**Fix**: Insert the missing `partial_refund_percentage` policy setting so admins can configure it.

### 2. Currency Hardcoded to USD ($)
The entire platform displays prices with `$` symbols. In Thailand, the operational currency is Thai Baht (THB). There's no currency configuration -- every price display hardcodes the dollar sign.

**Fix**: Add a `currency_code` and `currency_symbol` policy setting. Create a utility function `formatPrice(amount, currency)` and replace all hardcoded `$` references across the codebase (GuestPortal, BookingStateTransition, GuestBookingRequestForm, Reports, EmbedWidget, etc.).

### 3. No Thai Tax / Receipt Compliance
Thailand requires accommodation providers to issue tax invoices for stays. There's no receipt generation, no tax calculation (7% VAT), and no invoice numbering system.

**Fix**: Add `tax_rate` and `tax_included` policy settings. Build a receipt/invoice generation feature accessible from completed bookings -- even a simple printable summary would satisfy basic compliance.

### 4. No Guest Arrival Details Collection
For a fight camp, guests typically arrive from airports (Surat Thani or Koh Samui). There's no field for:
- Arrival flight/ferry details
- Expected arrival time
- Training program interest (Muay Thai schedule)
- Emergency contact
- Dietary restrictions / allergies (relevant for camps that provide meals)

**Fix**: Add an `arrival_details` JSONB column to bookings or a separate `guest_details` table. Surface these fields in the booking form and guest portal.

### 5. No Training/Gym Integration Context
This is a Muay Thai fight camp, but the system treats it as a generic accommodation platform. There's zero awareness of:
- Training schedule or session bookings
- Fighter vs. spectator/tourist guest types
- Gym orientation or welcome package info
- Weight class or training level (relevant for camp operations)

**Fix**: Add a `guest_type` field (fighter, training_guest, spectator, long_term) to bookings. Add a "Camp Info" tab or section in the guest portal with gym rules, training schedule, and orientation details. This is information display, not a parallel booking system.

### 6. No Check-In / Check-Out Time Display for Guests
Policy settings have `earliest_checkin_time` (16:00) and `checkout_time` (11:00), but these aren't displayed anywhere in the guest portal or booking confirmations.

**Fix**: Surface check-in/check-out times on the guest portal booking cards and in the policies tab.

### 7. No Soft Hold / Deposit Expiration Automation
Policy settings define `soft_hold_expiration_hours` (12h) and `deposit_deadline_hours` (24h), but there's no automated job or cron to actually expire these bookings. They rely on staff manually cancelling.

**Fix**: Create a scheduled edge function (pg_cron or a Supabase cron) that runs every 30 minutes to auto-expire soft holds and pending deposits that exceed their deadlines. Log the transitions as system-initiated.

### 8. No WhatsApp / LINE Integration for Notifications
In Thailand, WhatsApp and especially LINE are the dominant communication channels. The notification system is in-app only -- guests must be logged in to see alerts.

**Fix (Phase 1)**: Add an optional WhatsApp/LINE contact field to guest profiles. For now, display these in the staff view so front desk can manually message guests for urgent matters.

**Fix (Phase 2)**: Integrate with a messaging API (Twilio for WhatsApp, LINE Messaging API) to push critical notifications (booking confirmed, check-in reminder, deposit deadline).

### 9. AI Layer: No Guest-Facing Kru on Guest Portal Booking Form
Kru is available as a floating panel, but it doesn't contextually assist guests during the booking process. A guest browsing listings doesn't get proactive help like "This unit is popular for fighters doing 2-week training camps" or "Heads up: the weekend rate applies to your dates."

**Fix**: Add a contextual Kru suggestion on the booking form that auto-triggers in "explain" mode when a guest selects dates, showing a one-liner about pricing breakdown or camp tips relevant to their stay duration.

### 10. No Mobile Responsiveness Verification for Guest Portal
The guest portal is the primary conversion funnel. Many Thailand-bound travelers book from mobile. While Tailwind provides responsive utilities, there's no evidence of mobile-specific testing or optimization for the booking flow.

**Fix**: Audit and optimize the guest portal for mobile viewports (especially the booking form dialog, listing cards, and messaging thread view). Ensure tap targets are minimum 44px and the booking form doesn't require horizontal scrolling.

---

## Recommended Additions (Not Bolt-Ons -- Native Integrations)

### A. Booking Confirmation Email (Edge Function)
Currently no email is sent when a booking is confirmed. Create an edge function triggered after the `pending_deposit -> confirmed` transition that sends a formatted confirmation with check-in time, camp address, and arrival instructions.

### B. Guest Review / Feedback Collection
After checkout (`completed` state), prompt guests to leave a brief review. Store in a `reviews` table. Display aggregate ratings on embed widgets to build social proof and reduce dependency on third-party review platforms.

### C. Repeat Guest Recognition
Track returning guests. When a guest with a previous `completed` booking submits a new inquiry, flag it in the approval queue so staff can offer returning-guest pricing or priority.

### D. Kru "Camp Briefing" Mode
Add a 6th AI mode specifically for camp context: "What's the training schedule this week?", "Which units are closest to the gym?", "What should I bring for my first session?" This would pull from a `camp_info` policy or content table that admin can edit.

---

## Priority Order

| Priority | Item | Effort |
|----------|------|--------|
| 1 | Currency configuration (THB) | Medium |
| 2 | Check-in/check-out time display | Low |
| 3 | Missing partial_refund_percentage policy | Low |
| 4 | Guest arrival details fields | Medium |
| 5 | Guest type (fighter/tourist) field | Low |
| 6 | Soft hold / deposit expiration automation | Medium |
| 7 | Booking confirmation email | Medium |
| 8 | Thai tax/receipt basics | Medium |
| 9 | Camp info in guest portal | Low |
| 10 | Mobile optimization audit | Medium |

---

## Technical Details

**Currency Fix** requires changes to:
- `src/lib/pricingCalculator.ts` (return formatted amounts)
- `src/components/GuestBookingRequestForm.tsx` (all `$` references)
- `src/components/BookingStateTransition.tsx` (deposit display)
- `src/pages/GuestPortal.tsx` (listing prices)
- `src/pages/Reports.tsx` (revenue chart formatter)
- `src/pages/EmbedWidget.tsx` (widget price display)
- New: `src/lib/currency.ts` utility reading from policy_settings

**Expiration Automation** requires:
- New edge function `supabase/functions/expire-stale-bookings/index.ts`
- Cron trigger (pg_cron extension or external scheduler)
- System-level booking_state_log entries with `changed_by = NULL` (system action)

**Guest Details** requires:
- New columns or JSONB field on bookings table
- Updated booking form (both guest and staff sides)
- Display in BookingDetailSheet

All changes follow the existing architectural pattern: policy_settings for configuration, RLS for security, edge functions for privileged operations, and the constitutional principle that humans decide while the system enforces.
