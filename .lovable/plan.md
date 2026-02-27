# GroundStay Operational Activation Blueprint

## Execution Phases

### Phase 1: Revenue Activation (CURRENT)
1. [x] Save plan
2. [ ] Add columns to `payments` table + create `payment_events` table with RLS
3. [ ] Add payment provider `policy_settings` rows
4. [ ] Enable Stripe via Lovable integration
5. [ ] Build `process-payment` edge function
6. [ ] Build `payment-webhook` edge function
7. [ ] Add payment UI to Guest Portal
8. [ ] Wire auto-transition (pending_deposit → confirmed)

### Phase 2: Communication Automation
1. [ ] Create `email_log` table with RLS
2. [ ] Build `send-transactional-email` edge function (Resend)
3. [ ] Refactor `send-booking-confirmation` for real delivery
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
