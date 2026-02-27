# GroundStay Operational Activation Blueprint

## Execution Phases

### Phase 1: Revenue Activation (CURRENT)
1. [x] Save plan
2. [x] Add columns to `payments` table + create `payment_events` table with RLS
3. [x] Add payment provider `policy_settings` rows
4. [x] Add API key policy_settings rows (stripe keys, resend keys)
5. [x] Build `process-payment` edge function (Stripe checkout sessions)
6. [x] Build `payment-webhook` edge function (signature verification, auto-transition)
7. [x] Add payment UI to Guest Portal (GuestPaymentButton component)
8. [x] Wire auto-transition (pending_deposit → confirmed) in webhook
9. [x] Build admin Integration Settings UI (Settings > Integrations tab)
10. [ ] Enable Stripe via admin Settings (user action — enter keys)

### Phase 2: Communication Automation
1. [x] Create `email_log` table with RLS
2. [x] Build `send-transactional-email` edge function (Resend, multi-language)
3. [ ] Refactor `send-booking-confirmation` to call `send-transactional-email`
4. [ ] Extend `expire-stale-bookings` with deposit reminders
5. [ ] Build pre-arrival + review request cron functions

### Phase 3: AI Operational Intelligence
1. [ ] Expand AI context per role (availability, revenue, digest, pricing)
2. [ ] Apply Section 4A tone/delivery enforcement
3. [ ] Maintenance photo analysis via Gemini vision

### Phase 4: Security Hardening
1. [ ] Rate limiting on public endpoints
2. [ ] Audit auth in all edge functions
3. [ ] Add missing FK constraints
4. [ ] Full security scan

### Phase 5: OTA Sync (Optional)
1. [ ] iCal export endpoint per unit
