# Ground Stay Cleanup Sprint — Plan

Scoped, sequenced plan across 7 areas. I'll group into 3 PR-sized phases so we can verify each before moving on.

## Phase 1 — Guest-facing fixes (low risk, high impact)

**1. Photo browsing (public)**
- Audit `src/components/GuestBookingRequestForm.tsx`, `src/pages/Stay.tsx`, `src/pages/EmbedWidget.tsx`, and any public room cards.
- Ensure each accommodation card uses the existing `Carousel` + `CarouselDots` with `CarouselPrevious`/`CarouselNext` arrows visible on desktop (≥md) and swipe enabled on mobile (Embla default).
- Hide arrows/dots when `photos.length <= 1`.
- Confirm photos are filtered to the specific `unit_id` (no cross-unit bleed).
- No auth required — verify routes `/stay` and `/embed` render arrows pre-login.

**2. Availability audit (read-only fixes)**
- `supabase/functions/get-availability/index.ts`: filter `units` by `is_active = true`, exclude `archived_at`/`deleted_at` if present, dedupe by `id`.
- `src/pages/Stay.tsx` and embed widget: same filter applied client-side as defense in depth.
- Calendar count source (`useUnits`, `CalendarGrid`): ensure inactive units excluded from "X of Y available" math.
- Verify booking overlap uses states `soft_hold|pending_approval|pending_deposit|confirmed|checked_in` (already in `check_booking_overlap` trigger).

## Phase 2 — Booking & payment flow correctness

**3. Package inquiry ≠ booking**
- In `GuestBookingRequestForm.tsx` (and any package-specific path), when submission type = `inquiry` / package question:
  - Insert into `bookings` with `state = 'inquiry'` (or dedicated `inquiries` table if present) — do NOT call `auto_create_pending_deposit`.
- Fix at DB level: modify `auto_create_pending_deposit` and `auto_create_pending_security_deposit` triggers to skip when `state = 'inquiry'` (already do — they only fire on `soft_hold|pending_approval|pending_deposit`). Verify no code path inserts inquiries directly into those states.
- Audit `supabase/functions/create-payment-link` and `guest-payment-link` to reject `state = 'inquiry'` (already added — keep).
- Add admin-only "Convert inquiry → booking" action (already exists in `InquiryQueue` — verify it sets state to `pending_approval` so triggers create deposit).

**4. Standard 20% deposit flow**
- `auto_create_pending_deposit` already defaults to 20% — confirm `policy_settings.deposit_percentage` defaults are seeded; if missing globally, seed `20`.
- Verify Stripe webhook + reconcile path (added last session) transitions `pending_deposit → confirmed` and stamps `provider = 'stripe'` so provenance badge shows Verified Stripe.
- Add explicit "Send deposit request" CTA on booking detail for staff (already in `PaymentLinkManager` — verify wording).

**5. Payment hierarchy & buckets**
- `calculateBookingFinancials` in `src/lib/paymentTypes.ts` already separates deposit / balance / security_deposit. Add `booking_fee` as a 4th `PaymentType`.
- Update `PAYMENT_TYPE_LABELS`, `sumReceived`/`sumPending` callers, and `BookingFinancialSummary.tsx` to render the 5-row breakdown: Total → Deposit → Balance → Security → Fee → Collected/Outstanding.
- Guest-facing `GuestPaymentSummary.tsx`: render same hierarchy (guest sees deposit + balance + security, hide fee if "included" mode).

**6. Booking fee controls**
- Migration: add policy_settings keys `booking_fee_enabled`, `booking_fee_mode` (`none|included|separate`), `booking_fee_percentage`, `booking_fee_fixed`, with property-level overrides supported by existing `property_id` column.
- Trigger: new `auto_create_booking_fee` fires on same booking states as deposit; respects mode (skip if `none` or `included`).
- UI: extend `PolicySettingsForm.tsx` with a "Booking Fee" section. Waiver: admin-only action on payment row with reason → writes to `policy_settings_history`/`staff_audit_events`.

## Phase 3 — Staff visibility polish

**7. Booking financial summary**
- `BookingFinancialSummary.tsx`: ensure all 9 fields render in a single card (Total, Deposit Required, Deposit Paid, Balance, Security, Fee, Total Collected, Outstanding, Status).
- Reuse on `BookingDetailSheet`, `Bookings` row expand, and `Calendar` quick-view.

## Technical notes

- DB changes go through `supabase--migration` (one migration per phase).
- All new `payment_type = 'booking_fee'` rows use existing `payments` table — no schema split.
- No new RLS surface; reuses existing `bookings`/`payments` policies.
- Inquiry filter on edge functions stays as defense-in-depth even after trigger guards.

## Verification per phase

- Phase 1: open `/stay` incognito on mobile+desktop preview, browse a multi-photo unit; confirm inactive unit hidden from availability JSON.
- Phase 2: submit a package inquiry → confirm no payment row created; submit a normal booking → confirm 20% deposit row + payment link works → simulate Stripe success via reconcile → state `confirmed`, badge Verified.
- Phase 3: open a booking with deposit paid + fee enabled → all 9 fields visible, math correct.

## Open questions before I start

1. **Booking fee default**: enabled or disabled out of the box? Suggest **disabled**, opt-in per property.
2. **Booking fee mode default when enabled**: `separate` (transparent line item) or `included` (rolled into displayed price)?
3. **Package inquiry**: do you want a dedicated `inquiries` table, or keep using `bookings` with `state='inquiry'` (current pattern)? Current pattern is fine and less churn.
4. Anything you want me to **skip or defer** to keep this sprint shippable?

Reply with answers (or "go with your defaults") and I'll execute Phase 1 immediately.