# GroundStay ↔ Fenrir Lock Integration

## Doctrine (non-negotiable)

**GroundStay → Fenrir Lock, one-way only.**

- GroundStay **sends** signed security events to Fenrir.
- Fenrir **receives, validates, normalizes, scores, and alerts**.
- Fenrir **does not** control GroundStay.
- No shared database. No shared auth. No two-way sync. No remote command
  execution as part of normal operations.
- The inbound `fenrir-webhook` endpoint is kept dormant behind
  `policy_settings.fenrir_inbound_enabled = false`. It stays out of the
  active integration surface unless an emergency-control workflow is
  separately, explicitly re-approved.

## Data flow

```
GroundStay app code
  └─▶ security_events (local audit, always)
        └─▶ supabase/functions/_shared/fenrir.ts
              ├─ allowlist internal event name
              ├─ map to dotted Fenrir namespace
              ├─ strip / hash PII, bucket amounts
              ├─ stamp environment + correlation_id
              └─▶ HTTPS POST to Fenrir endpoint (server-side API key)
```

Fenrir outage never blocks GroundStay operations — the helper swallows all
network / config failures and returns a status object.

## Configuration

Runtime knobs live in `policy_settings`:

| Key | Default | Purpose |
| --- | ------- | ------- |
| `fenrir_enabled` | `false` | Turn outbound forwarding on/off |
| `fenrir_endpoint` | `""` | HTTPS endpoint for the Fenrir ingest |
| `fenrir_inbound_enabled` | `false` | Doctrine gate — inbound commands dormant |

Secrets (server-side only, never sent to the browser):

- `integration_secrets.fenrir_api_key` — preferred.
- `FENRIR_API_KEY` env var — fallback.
- `FENRIR_ENVIRONMENT` env var — `staging` (default) or `production`.

## Staging test events

Use the existing `vanta-test-event` pattern or invoke `fenrir-dispatch`
directly from an admin tool with a batch:

```jsonc
{
  "events": [
    {
      "event_type": "staff_login",
      "severity": "low",
      "confidence_score": 90,
      "details": {
        "actor_id": "…",
        "actor_role": "admin",
        "actor_email": "test@example.com",
        "login_method": "password"
      }
    }
  ]
}
```

While `FENRIR_ENVIRONMENT` is `staging` (default) the envelope is stamped
accordingly so Fenrir can bucket/discard test signal.

## Guarantees

- Unknown internal event types are **rejected** at the helper allowlist.
- Raw `actor_email` is never transmitted — it is SHA-256 hashed to
  `actor_email_hash`.
- Guest names, phone, email, passport / document numbers, addresses, free
  text notes / descriptions / messages / conversations are dropped.
- Monetary amounts are bucketed (`<100`, `100-1k`, `1k-10k`, `10k-100k`,
  `100k+`).
- API keys stay server-side (edge function only).
- Payload matches the Fenrir dotted-namespace envelope regardless of the
  legacy internal name used at the call site (mapper layer).

## Out of scope for this phase

- Renaming the 14 legacy emit helpers.
- Wiring new live call sites beyond the ones already emitting today.
- Production API keys and production `FENRIR_ENVIRONMENT`.
- Any inbound command execution from Fenrir.
