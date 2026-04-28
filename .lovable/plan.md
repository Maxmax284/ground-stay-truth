# Payment Audit Recommendations — Implementation Plan

Extending the existing payment architecture. Stripe stays the source of truth for money movement; DB updates only after provider confirmation. No rebuilds.

---

## Priority 1 — Real Stripe Refunds

**Problem:** `useRefundPayment` in `src/hooks/useBookings.ts` writes `refund_amount` and flips status to `refunded`/`partially_refunded` directly against the DB. Stripe never moves money. The platform can lie.

**Fix:** New edge function `refund-payment` that calls Stripe first, then updates the DB only on confirmed Stripe response.

### New file: `supabase/functions/refund-payment/index.ts`
- `verify_jwt = false`, in-code JWT validation, admin-only (`has_role('admin')`).
- Input: `{ payment_id, refund_amount, reason }`. Zod-validated.
- Flow:
  1. Load payment; verify `status IN ('recorded','partially_refunded')`, `provider='stripe'`, `provider_transaction_id` present.
  2. Compute `alreadyRefunded`, enforce `alreadyRefunded + refund_amount <= amount`.
  3. Generate idempotency key: `refund_${payment_id}_${alreadyRefunded + refund_amount}`.
  4. Call `stripe.refunds.create({ payment_intent, amount: cents, reason: 'requested_by_customer', metadata })` with that idempotency key.
  5. **Only on Stripe success** (`refund.status IN ('succeeded','pending')`):
     - UPDATE `payments` SET `refund_amount`, `refund_reason`, `status` (full vs partial), append refund metadata.
     - INSERT into `payment_events` (`provider='stripe'`, `event_type='refund.created'`, `payment_id`, payload).
     - Insert admin notification + dispatch `notify-via-messaging` event `refund_issued`.
  6. On Stripe error → return 502 with provider error code; **no DB mutation**.
- Add `refund.updated` / `refund.failed` event handlers to existing `payment-webhook` so async refund failures flip status back and alert admins.

### Frontend rewire
- `src/hooks/useBookings.ts` → `useRefundPayment` calls `supabase.functions.invoke('refund-payment', …)` instead of direct table update. Manual (`provider='manual'`) payments keep the legacy DB-only path with a clearly labeled "Manual refund recorded — no provider call" reason.
- `RefundDialog.tsx`: minor copy update so Stripe payments show "Stripe will be charged" vs manual payments show "DB record only."

### Config
- `supabase/config.toml`: add `[functions.refund-payment]` block with `verify_jwt = false`.

---

## Priority 2 — Thai Tax Invoice PDF

**Goal:** "Download Tax Invoice" action producing a Revenue-Department-style THB/VAT PDF for any `recorded` payment.

### New file: `supabase/functions/generate-tax-invoice/index.ts`
- `verify_jwt = false`, in-code JWT check. Admin/manager OR the booking's guest may download.
- Input: `{ payment_id }`.
- Generates PDF server-side using `pdf-lib` (Deno-compatible, ESM import) — **not** the existing client-side audit-PDF skill, since we want server attribution and consistent fonts.
- Reads:
  - `payments` + `bookings` + `units` + `profiles` (guest name/email).
  - `policy_settings`: `tax_rate` (7), `tax_included` (false), `currency_code` (THB), `currency_symbol` (฿), plus 4 new keys below.
- Computes per Thai Revenue Code §86/1:
  - If `tax_included=false`: `net = amount / (1 + tax_rate/100) … wait` — actually if `tax_included=false`, the recorded `amount` already excludes VAT; `vat = amount * tax_rate/100`; `gross = amount + vat`.
  - If `tax_included=true`: `gross = amount`; `net = gross / (1 + tax_rate/100)`; `vat = gross - net`.
- Renders A4 PDF with required Thai tax-invoice fields:
  - Header: "ใบกำกับภาษี / Tax Invoice"
  - Seller block: company name, address, Tax ID (13-digit), branch ("00000" / สำนักงานใหญ่)
  - Buyer block: guest name + email + (optional) tax ID from new `bookings.guest_tax_id` field (nullable, see migration)
  - Invoice number (sequential, see migration), issue date (Asia/Bangkok), original payment date
  - Line item: stay description, dates, nights
  - Totals: net, VAT 7%, grand total — all in THB (฿)
  - Footer: payment method (Credit Card via Stripe), Stripe transaction ID for reference
- Returns `application/pdf` with `Content-Disposition: attachment; filename=tax-invoice-{seq}.pdf`.

### Migration
- Table `tax_invoices`:
  - `id uuid pk`, `payment_id uuid unique not null`, `invoice_number text unique not null`, `issued_at timestamptz`, `net_amount numeric`, `vat_amount numeric`, `gross_amount numeric`, `tax_rate numeric`, `pdf_storage_path text`, `issued_by uuid` (NO ACTION), `created_at`.
  - RLS: admin/manager full; guest SELECT via booking ownership.
- Sequence `tax_invoice_seq` for `INV-YYYY-NNNNNN` numbering, generated server-side.
- Add nullable column `bookings.guest_tax_id text`.
- Add 4 policy_settings rows: `company_legal_name`, `company_address`, `company_tax_id`, `company_branch_code` (default "00000").
- New private storage bucket `tax-invoices` with RLS scoped same as `tax_invoices` table.

### Frontend
- `BookingDetailSheet.tsx`: next to each `recorded`/`partially_refunded` payment row, add "Download Tax Invoice" button (admin/manager + guest-on-own-booking). Calls function, opens returned blob.
- New tab in `PolicySettingsForm.tsx` → "Company / Tax Identity" group for the 4 company fields.
- Guest-side: button on `GuestPaymentSummary.tsx` per recorded payment.

---

## Priority 3 — Financial Record Retention

**Audit gap:** `payments.booking_id → bookings(id) ON DELETE CASCADE`. If a booking is deleted, every payment row vanishes — violates 5–7yr Thai financial retention.

Other risky FKs already safe (`recorded_by NO ACTION`, `bookings.guest_id SET NULL`). The retention bug is the booking→payments cascade.

### Migration
- `ALTER TABLE payments DROP CONSTRAINT payments_booking_id_fkey, ADD CONSTRAINT payments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;`
- Make `payments.booking_id` nullable.
- Add `payments.archived_booking_snapshot jsonb` — populated by trigger before booking delete with `{check_in, check_out, unit_id, unit_name, guest_full_name, guest_email, total_price}`. So even with booking gone, the financial record retains audit data.
- Trigger `before_booking_delete_snapshot_payments`:
  - For each payment of the booking, write the snapshot.
- Same SET NULL + snapshot treatment for `tax_invoices.payment_id` (after Priority 2 lands).
- Update `cleanup-retention/index.ts`: explicitly **exclude** `payments`, `payment_events`, `tax_invoices` from any retention-purge code paths (add comment + assertion).
- `delete-account` edge function: when deleting a guest user, do NOT delete their bookings; instead set `bookings.guest_id = NULL` (already FK behavior) and write the snapshot via the same trigger if any related booking ever gets purged later. Add explicit log line.

### Frontend
- No UI change needed; admin payment list already tolerates missing booking via `archived_booking_snapshot` fallback (small render tweak in `PaymentAnalytics.tsx` and `BookingDetailSheet.tsx` payment rows: when `bookings` join is null, show "Archived booking — {snapshot.check_in} → {snapshot.check_out}, {snapshot.guest_full_name}").

---

## Priority 4 — Webhook Failure Watcher + Reconciliation

### 4a. Daily watcher: `supabase/functions/payment-webhook-watchdog/index.ts`
- Auth via service role or anon key (pg_cron pattern).
- Query `payment_events WHERE processed=false AND created_at < now() - interval '1 hour'`.
- For each: attempt to re-run the appropriate handler (refactor `payment-webhook` handlers into a shared module imported here, OR re-fetch the event from Stripe by `provider_event_id` and re-process).
- After 3 retries (track in new column `payment_events.retry_count`), insert a `notifications` row to all admins: "Payment webhook stuck: {event_type} {provider_event_id}". Also dispatch `notify-via-messaging` `payment_webhook_stuck`.

### 4b. Weekly reconciliation: `supabase/functions/payment-reconciliation/index.ts`
- Pull last 7 days of Stripe `charges.list` + `refunds.list` (use `created[gte]`).
- For each Stripe charge:
  - Look up matching `payments` row by `provider_transaction_id`.
  - Mismatch cases logged into new table `payment_reconciliation_log`:
    - `missing_in_db` — Stripe says paid, no DB row.
    - `missing_in_stripe` — DB says recorded, Stripe charge not found / refunded.
    - `amount_mismatch` — amounts differ.
    - `refund_mismatch` — refund_amount differs.
- Insert summary notification to admins. If any non-zero discrepancies → also dispatch messaging event `payment_reconciliation_alert`.

### Migration
- `payment_events`: add `retry_count int NOT NULL DEFAULT 0`, `last_retry_at timestamptz`, `last_error text`.
- New table `payment_reconciliation_log` (run_at, severity, kind, payment_id, stripe_object_id, expected, actual, details jsonb). RLS admin-only.

### Cron schedule (pg_cron, via insert tool not migration — contains anon key)
- Watchdog: hourly `0 * * * *`.
- Reconciliation: weekly `0 3 * * 1` (Monday 03:00 UTC = 10:00 Bangkok).

### Frontend
- New Settings → Payments → "Reconciliation" panel showing the latest `payment_reconciliation_log` entries with severity badges and a "Run now" button (admin-only) that invokes `payment-reconciliation` ad hoc.
- New badge on the Admin dashboard StaffQuickActions: "Stuck webhooks: N" linking to a filtered view of `payment_events` where `retry_count >= 3 AND processed=false`.

---

## Testing (after all four ship — separate follow-up loop)

- Extend `src/lib/__tests__/paymentSystem.test.ts`:
  - Refund VAT math (tax-included vs excluded).
  - Snapshot fallback rendering.
  - Reconciliation classifier pure function.
- New Deno tests under `supabase/functions/refund-payment/index.test.ts` and `supabase/functions/generate-tax-invoice/index.test.ts` using mocked Stripe.
- Manual end-to-end Stripe **test mode** runbook: book → pay → partial refund → full refund → tax invoice download → simulate webhook failure (drop event) → confirm watchdog reprocess → confirm reconciliation flags nothing.

---

## Files Touched (summary)

**New**
- `supabase/functions/refund-payment/index.ts`
- `supabase/functions/generate-tax-invoice/index.ts`
- `supabase/functions/payment-webhook-watchdog/index.ts`
- `supabase/functions/payment-reconciliation/index.ts`
- 1 migration: payments FK change + snapshot column + trigger + tax_invoices table + reconciliation log table + payment_events retry columns + storage bucket + 4 policy_settings keys + bookings.guest_tax_id

**Edited**
- `src/hooks/useBookings.ts` — refund hook calls edge function
- `src/components/RefundDialog.tsx` — copy + provider awareness
- `src/components/BookingDetailSheet.tsx` — invoice download button + archived snapshot fallback
- `src/components/GuestPaymentSummary.tsx` — guest invoice download
- `src/components/PolicySettingsForm.tsx` — company tax identity tab
- `src/components/reports/PaymentAnalytics.tsx` — snapshot fallback
- `src/components/StaffQuickActionsWidget.tsx` — stuck-webhook badge
- `src/pages/Settings.tsx` — reconciliation panel route
- `supabase/functions/payment-webhook/index.ts` — refund.* event handlers, retry_count++ on handler failure
- `supabase/functions/cleanup-retention/index.ts` — explicit exclusion comment
- `supabase/functions/delete-account/index.ts` — preserve bookings + log
- `supabase/config.toml` — 4 new function blocks

**Cron (insert tool, not migration)** — 2 pg_cron schedules.

---

## Order of execution

1. Migration (schemas first so functions can write).
2. P1 refund function + frontend rewire.
3. P2 tax invoice function + UI + company settings.
4. P3 retention is mostly the migration; verify snapshot trigger works and update fallbacks.
5. P4 watchdog + reconciliation + cron + UI.
6. Hand back for end-to-end testing.

Confirm and I'll execute in this order.