# AI Governance — Phases E + F + Executive PDF

## Phase E — Observability & Admin Dashboard

**1. Admin AI Usage dashboard** (new tab in Security Center)
- MTD spend (sum of `cost_estimate_micro_usd` from `ai_usage_events`)
- 30-day sparkline of daily calls + cost
- Top consumers (by `actor_id`, by `property_id`, by `function_name`)
- Recent denials (kill switch / quota hits) from `ai_usage_events` where `status != 'ok'`
- Per-feature breakdown with current kill-switch state inline
- Filters: date range, property, function

**2. Budget watchdog edge function** (`ai-budget-watchdog`)
- Cron every 15 minutes (pg_cron + pg_net using insert tool, not migration)
- Reads MTD spend vs `ai_monthly_budget_micro_usd` policy key
- Fires `security_events` rows at 75% / 90% / 100% thresholds (one row per threshold per month — dedup key)
- At 100%: auto-flips `ai_global_enabled` to false and logs `staff_audit_event` severity=critical
- Per-property budget check using `ai_property_monthly_budget_micro_usd`

**3. Read endpoints**
- New `ai-usage-summary` edge function for the dashboard (server-side aggregation, admin-only)

## Phase F — Abuse Prevention

**1. IP-hash velocity guard** inside `aiGuard.ts`
- Track per-IP-hash hourly count via `ai_usage_events.ip_hash`
- Threshold: >100 calls/hr from one IP → soft block + `security_events` row

**2. Request dedup**
- Hash of `(actor_id, function_name, request_payload)` → skip identical call within 60s window, return cached `ok` log entry

**3. Multi-account heuristic**
- Same `ip_hash` with 3+ distinct `actor_id` in 1hr → flag in `security_events`, no auto-block (admin review)

**4. Pause-AI circuit breaker**
- One-click "Pause all AI for 30 min" button in dashboard → sets `ai_global_enabled=false` + scheduled re-enable timestamp in policy_settings; watchdog cron restores it

## Executive PDF — "AI Governance Brief"

Same aesthetic family as prior audit PDF: dark cover, gold/terracotta accents, sectioned spreads, scorecard tiles, risk matrix, timeline.

**Contents:**
1. **Cover** — "Ground Stay — AI Governance & Cost Control"
2. **Executive Summary** — one-page: what AI does on the platform, why limits exist, current posture score
3. **What AI Does Here** — table of all 9 AI endpoints, purpose, who triggers them, business value
4. **The Limits We Set** — visual breakdown of the 5 enforcement layers (kill switch → feature flag → per-user → per-property → per-IP)
5. **Numbers That Matter** — default quotas per role (guest/staff/admin), per-function caps, monthly budget ceiling
6. **Where It Lives** — architecture diagram: `aiGuard` middleware, `ai_usage_events` table, `policy_settings` keys, watchdog cron, admin dashboard location (Security Center → AI Usage tab)
7. **How It Works** — request lifecycle diagram (call → guard → model → log → aggregate → alert)
8. **What Admins Can Do** — dashboard screenshots/mockup, kill-switch flow, budget alerts, pause button
9. **Risk Posture** — before/after matrix, the 4 HIGH items resolved, residual risks
10. **Roadmap** — what's done, what's next (streaming token metering, ML anomaly)
11. **Appendix** — full policy_settings key reference

Output: `/mnt/documents/Ground_Stay_AI_Governance_Brief.pdf` (ReportLab, matching dark/gold styling from prior brief). Includes mandatory visual QA pass.

## Files

**New:**
- `supabase/functions/ai-budget-watchdog/index.ts`
- `supabase/functions/ai-usage-summary/index.ts`
- `src/components/admin/AIUsageDashboard.tsx`
- `/tmp/build_ai_governance_pdf.py` → `/mnt/documents/Ground_Stay_AI_Governance_Brief.pdf`

**Edited:**
- `supabase/functions/_shared/aiGuard.ts` (IP velocity + dedup + multi-account)
- Security Center page (add AI Usage tab)
- Migration: new policy keys for budgets + watchdog state; pg_cron insert for 15-min schedule

## Out of scope
- Real-time streaming token metering
- ML-based anomaly detection (heuristics only)
- Backfilling historical AI calls before `ai_usage_events` existed
