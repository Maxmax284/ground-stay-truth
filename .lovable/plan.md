
# AI Governance Hardening Plan — Ground Stay

Builds on the prior audit. Closes the HIGH-risk gaps: unbounded `translate-message` and `verify-document`, no usage logging, no cost attribution, no per-property quotas, no per-feature kill switches, no admin visibility.

---

## Scorecard (current → target)

| Dimension | Now | Target after plan |
|---|---|---|
| AI Governance | 4 | 8 |
| Cost Control | 2 | 8 |
| Abuse Prevention | 3 | 7 |
| Observability | 3 | 9 |
| Multi-Tenant Readiness | 2 | 8 |
| Business Readiness | 3 | 8 |

Verdict moves from **READY WITH HIGH RISK** → **READY WITH MINOR ISSUES** for AI cost/abuse.

---

## Phase A — Foundation: `ai_usage_events` table (HIGH)

New table — single source of truth for every AI call.

```text
ai_usage_events
  id            uuid pk
  created_at    timestamptz default now()
  function_name text        -- 'ai-assistant' | 'translate-message' | 'verify-document' | ...
  mode          text        -- e.g. 'chat','digest','passport' (nullable)
  actor_id      uuid        -- auth.users.id (nullable for webhook calls)
  actor_role    app_role    -- snapshot
  property_id   uuid        -- nullable
  channel       text        -- 'web','whatsapp','telegram','line','cron' (nullable)
  status        text        -- 'ok','rate_limited','provider_error','blocked'
  model         text
  tokens_in     int
  tokens_out    int
  latency_ms    int
  cost_estimate_micro_usd  bigint   -- computed server-side from model price table
  request_hash  text        -- short hash for dedup/abuse correlation
  ip_hash       text        -- sha256(ip+salt), nullable
  error_code    text        -- nullable

Indexes:
  (actor_id, created_at desc)
  (property_id, created_at desc)
  (function_name, created_at desc)
  (created_at desc)

RLS:
  admin/manager: SELECT scoped to their property_id
  service_role:  full
  others:        no access
```

A small `ai_model_costs(model, input_per_1k, output_per_1k)` lookup keeps cost math out of code. Adding a row enables new models without redeploy.

---

## Phase B — Universal rate-limit middleware (HIGH)

New shared helper `supabase/functions/_shared/aiGuard.ts`:

- `checkAndLog({ functionName, mode, req, user, propertyId })`
- DB-backed (queries `ai_usage_events`), not in-memory — survives cold starts.
- Returns `{ allow, reason, remaining }`.
- Enforces, in order:
  1. Global kill switch (`ai_assistant_enabled`).
  2. Per-feature kill switch (new policy keys, see Phase D).
  3. Per-user hourly + daily caps (role-scoped).
  4. Per-property daily cap.
  5. Per-IP burst cap for anonymous webhook paths.
- Logs every call (allowed or denied) into `ai_usage_events`.
- Replaces the bespoke `security_events`-based limiter currently in `ai-assistant`.

Default caps (admin-overridable via `policy_settings`):

| Function | Guest | Staff | Manager | Admin | Property/day |
|---|---|---|---|---|---|
| ai-assistant | 20/hr, 60/day | 60/hr, 300/day | 200/hr, 1000/day | unlimited | 5000 |
| translate-message | 30/hr, 120/day | 60/hr, 400/day | same | unlimited | 4000 |
| verify-document | 5/hr, 10/day | 20/hr, 60/day | same | unlimited | 300 |
| draft-arrival-welcome | n/a | 20/hr, 80/day | same | unlimited | 500 |
| messaging-router (per remote channel id) | — | — | — | — | 200/channel/day |

---

## Phase C — Endpoint hardening (HIGH)

1. **`translate-message`** — wrap with `aiGuard`, cap text length to 4000 chars, add request hash dedup (return cached result for identical text+lang within 24h).
2. **`verify-document`** — wrap with `aiGuard`, enforce ≤ 10 MB image, mime-type allowlist (`image/jpeg`, `image/png`, `application/pdf`), reject animated formats.
3. **`ai-assistant`** — swap existing limiter for `aiGuard`.
4. **`draft-arrival-welcome`**, **`corner-talk`**, **`daily-briefing`** — log via `aiGuard` (cron exemption flag), no user caps.
5. **`messaging-router`** — per-remote-sender daily cap; webhook signature already enforced.
6. **`fraud-detection`**, **`guest-arrival-journey`** — server-internal; log only.

All wrapped functions also capture `usage` block from gateway response to populate `tokens_in/out` accurately.

---

## Phase D — Admin controls (HIGH)

New policy keys (property-scoped where applicable):

```
ai_translate_enabled        bool
ai_verify_document_enabled  bool
ai_messaging_enabled        bool
ai_drafts_enabled           bool

ai_user_daily_limit_guest   int
ai_user_daily_limit_staff   int
ai_user_daily_limit_manager int
ai_property_daily_limit     int
ai_property_monthly_budget_usd numeric
ai_alert_threshold_pct      int   -- e.g. 75
```

UI: extend Security Center with an **AI Usage** tab — toggles, quota inputs, current month-to-date counters, top consumers.

---

## Phase E — Observability & alerts (MEDIUM)

- **Admin AI Dashboard** (under Security Center):
  - MTD requests + estimated cost, split by function / role / property / user.
  - 14-day sparkline.
  - Top 10 consumers.
  - Recent rate-limit denials.
- **Budget alerts**: cron `ai-budget-watchdog` (15-min) checks per-property spend vs threshold and pushes via `notify-via-messaging` to admins at 75% / 90% / 100%.
- **Anomaly flag**: spike detection (>3× rolling 7-day median in a 1-hr window) raises a `security_event`.

---

## Phase F — Abuse hardening (MEDIUM)

- IP-hash velocity check on `verify-document` and `translate-message` (anon path: 20/day/IP).
- `request_hash` dedup short-circuit for identical translate payloads.
- Multi-account heuristic: flag accounts sharing IP-hash with >3 unique `actor_id` per 24h on verify-document.
- Pause-AI breaker: if property hits monthly budget, `aiGuard` returns 402 for everything except admin-tier functions.

---

## Phase G — Roadmap & effort

| Item | Priority | Effort | Risk reduction |
|---|---|---|---|
| `ai_usage_events` + `ai_model_costs` | HIGH | 0.5 d | Foundational |
| `aiGuard` middleware + wire into all 6 functions | HIGH | 1 d | Closes top 3 cost vectors |
| File-size/mime caps on verify-document | HIGH | 0.25 d | Caps highest-cost vector |
| Per-feature kill switches + quota policy keys | HIGH | 0.5 d | Operator safety |
| Admin AI Dashboard (Security Center tab) | MEDIUM | 1 d | Visibility |
| Budget watchdog + Telegram/email alerts | MEDIUM | 0.5 d | Early warning |
| Anomaly / multi-account heuristics | MEDIUM | 0.5 d | Abuse |
| CSV export of `ai_usage_events` | LOW | 0.25 d | Finance |

Total ≈ **4.5 dev-days**.

---

## Out of scope (intentionally)

- Streaming token metering at the SDK level (gateway returns aggregate `usage` — sufficient).
- Real-time anomaly ML (rule-based threshold is enough at current volume).
- Replacing `ai-assistant`'s existing `security_events` log retroactively — new events go to `ai_usage_events` going forward.

---

## Verification checklist

After build:
- [ ] Hit `translate-message` 200× in a loop as a guest → blocked at cap, logged.
- [ ] Upload 50 MB to `verify-document` → 413.
- [ ] Toggle `ai_translate_enabled=false` → all translate calls return 403 within seconds.
- [ ] Two properties run heavy load → each sees only its own rows in the dashboard.
- [ ] Budget watchdog fires at 75%, 90%, 100% (simulate by lowering threshold).
- [ ] Admin sees MTD spend per function with no extra config.

Ready to switch to build mode and execute Phases A–D first (the HIGH block), then layer E–F.
