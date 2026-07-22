
# Booking Confirmation PDF — Audit & Phase 1 Plan

Audit-first. No Stripe, webhook, reconciliation, totals, deposit %, or state machine changes.

## A. Current post-payment flow

1. Guest pays via Stripe checkout link (`create-payment-link`).
2. `payment-webhook` verifies signature, records payment row.
3. Booking state transitions `pending_deposit → confirmed`.
4. `send-booking-confirmation` fires: sends a transactional email via Resend (template `booking_confirmed`) and writes an in-app notification.
5. Guest portal (`/guest`) shows the booking as Confirmed.

**Emails guests actually receive today:** Stripe receipt (payment proof) + our short "booking confirmed" transactional email. Neither is a formal accommodation confirmation document. No downloadable PDF exists for bookings.

## B. Reusable building blocks (good news)

- `supabase/functions/generate-tax-invoice/index.ts` already uses **pdf-lib** on the edge, uploads to a private storage bucket, returns a signed URL. Same pattern applies cleanly to a booking confirmation PDF.
- Private storage bucket `tax-invoices` exists — we'll add a sibling `booking-confirmations`.
- `send-transactional-email` supports templated Resend emails and can carry a signed link.
- `bookings`, `units`, `properties`, `profiles`, `airport_pickups`, `payments`, `policy_settings` already carry every field the PDF needs.
- Guest portal + BookingDetailSheet are the natural mount points for the buttons.

## C. Gaps

- No confirmation PDF generator.
- No storage bucket for confirmations.
- No stable human-readable reference number (only UUID). Recommend derived, not new column: `LMT-CS-{YYYY}-{first6upper of id}` — no schema change needed for Phase 1.
- No "Download confirmation" surface on guest portal or admin booking sheet.

## D. Phase 1 build (recommended, minimal, safe)

**Server**
- New edge function `generate-booking-confirmation` (mirrors `generate-tax-invoice`):
  - Auth: guest owning the booking **or** staff (admin/manager/front_desk/front_desk_supervisor) with property access.
  - Guard: only generates when `bookings.state = 'confirmed'` AND a recorded deposit exists (`payments.status='recorded'` for that booking). Any other state → 409 with plain message. This is the single hard gate; no state-machine changes.
  - Renders A4 PDF via pdf-lib with the content spec below.
  - Uploads to new private bucket `booking-confirmations` at `{year}/{booking_id}.pdf`, `upsert: true`.
  - Returns a short-lived signed URL (1 hour).
- New storage bucket `booking-confirmations` (private) with RLS: staff roles + guest-owns-booking read via signed URL only.

**Client**
- Guest portal booking card: "Download Booking Confirmation" button — visible only when booking is confirmed. Otherwise disabled with subtitle "Available once your deposit is recorded."
- `BookingDetailSheet` (staff): "Download", "Copy link", "Email to guest" trio under a new "Confirmation Document" section — enabled only when the same guard passes.
- "Email to guest" calls existing `send-transactional-email` with a new template `booking_confirmation_document` containing the signed URL (no attachment in Phase 1 — link only, safer and smaller).

**No changes** to Stripe, webhook, ledger, totals, or state machine.

## E. PDF content spec

Header: LMT CampStay + Lamai Muay Thai Camp, logo, "Booking Confirmation", reference `LMT-CS-YYYY-XXXXXX`, issue date.
Guest: name, email, phone, guest count.
Stay: unit name, group, check-in, check-out, nights, pickup (yes/no + flight + fee).
Status: **Confirmed**, deposit paid amount + method + date, remaining balance, currency THB, "Not a tax invoice" footnote.
Property: Lamai Muay Thai Camp, address, phone, email, website, Google Maps link if stored.
Notes: standard immigration-friendly wording ("This document confirms accommodation for the guest above").

Excluded: card data, Stripe internal IDs, staff notes, audit logs, other guests' data.

## F. Security/access

- Edge function does its own authorization; no reliance on client claims.
- Guest path: JWT → confirms `booking.guest_id = auth.uid()`.
- Staff path: `has_role` + `has_property_access` on the booking's property.
- Signed URLs expire in 1 hour. No unauthenticated download route in Phase 1.
- Cancelled bookings return 410 and do not regenerate — staff historical access can come later if needed.

## G. Data model

No new columns required for Phase 1. If Nikki later wants persistent tracking, add nullable `confirmation_first_generated_at`, `confirmation_last_sent_at` on `bookings` — deferred.

## H. Long-term (not now)

- PDF attachment on the auto-fire `send-booking-confirmation` email once size/deliverability is validated.
- Optional pending-booking summary PDF, clearly stamped "PENDING — NOT CONFIRMED".
- Persistent confirmation numbers + regeneration audit log.
- Multi-language body (reuse `preferred_language`).

## I. Test plan

1. Confirmed Stripe-paid booking (Arvid) → guest + staff can download; PDF fields correct.
2. Confirmed manual/offline-paid booking → same result.
3. `pending_deposit` booking → button disabled; direct API call returns 409.
4. `inquiry`, `soft_hold`, `cancelled`, `no_show` → 409/410.
5. Guest A cannot fetch guest B's confirmation (403).
6. Staff without property access → 403.
7. Signed URL expires after 1 hour.
8. Mobile Safari/Chrome + WhatsApp in-app browser: link opens PDF viewer cleanly.
9. Print layout on A4 renders on one page for a typical stay.

## J. Risks

- pdf-lib font limits (no Thai glyphs by default) — Phase 1 keeps PDF in English; Thai property name shown transliterated. Flagged for later.
- Storage bucket RLS misconfig — mitigated by using signed URLs only, bucket stays private.
- Guest confusion if they pay and click download before webhook lands — button stays disabled with clear copy; matches existing "we're confirming" pattern.

## K. Do-not-touch confirmation

No changes to: `payment-webhook`, `create-payment-link`, `process-payment`, `reconcile-stripe-payments`, pricing calculator, deposit policy, `bookingStateMachine.ts`, existing `send-booking-confirmation` email trigger.

## L. Plain-English note for Nikki

Good call. The Stripe email proves the guest paid; it's not the same as an accommodation confirmation. We'll add a proper downloadable Booking Confirmation — guest name, dates, room, Lamai contact details, reference number, confirmed status — that you and the guest can download or email from the booking. It only appears once the deposit is actually recorded and the booking is confirmed, so we never hand out official-looking proof for a booking that hasn't been paid. Phase 1 is a secure download link (works on phones and prints cleanly); attaching the PDF directly to emails can come later once we know it's reliable.

---

**Approve this plan and I'll build Phase 1: new `generate-booking-confirmation` edge function + `booking-confirmations` private bucket + Download/Send/Copy buttons on guest portal and staff booking sheet + email template. No payment or state-machine code touched.**
