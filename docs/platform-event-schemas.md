# GroundStay Platform Event Schemas (Fenrir Envelope)

All outbound Fenrir events share the same envelope, produced by
`supabase/functions/_shared/fenrir.ts`:

```jsonc
{
  "event_type": "auth.login_success",       // dotted Fenrir namespace
  "internal_event_type": "staff_login",     // legacy GroundStay name
  "severity": "low" | "medium" | "high" | "critical",
  "confidence_score": 0-100,
  "source_platform": "groundstay",
  "platform_version": "groundstay-1.0",
  "environment": "staging" | "production",
  "correlation_id": "uuid",
  "timestamp": "ISO-8601",
  "details": { /* scrubbed, see below */ }
}
```

## Internal → Dotted namespace map

| Internal name | Dotted event | Severity band |
| ------------- | ------------ | ------------- |
| `staff_login` | `auth.login_success` | low |
| `staff_login_failed` | `auth.login_failed` | medium / high |
| `privilege_escalation` | `admin.privilege_escalation` | high |
| `guest_data_access` | `guest.data_access` | low |
| `guest_data_modified` | `guest.data_modified` | medium |
| `bulk_guest_export` | `guest.bulk_export` | high |
| `gdpr_request_received` | `guest.gdpr_request` | medium |
| `payment_processed` | `payment.processed` | low |
| `payment_failed` | `payment.failed` | medium |
| `payment_anomaly` | `payment.anomaly` | high |
| `chargeback_received` | `payment.chargeback` | high |
| `card_testing_detected` | `payment.card_testing` | high |
| `refund_issued` | `payment.refund_issued` | medium |
| `rate_override` | `payment.rate_override` | medium |
| `unauthorized_discount` | `payment.unauthorized_discount` | high |
| `cross_property_access` | `access.cross_property` | high |
| `after_hours_access` | `access.after_hours` | medium |
| `key_card_anomaly` | `access.key_card_anomaly` | medium |
| `data_residency_violation` | `compliance.residency_violation` | high |
| `booking_fraud_flag` | `booking.fraud_flag` | high |
| `guest_complaint_escalated` | `guest.complaint_escalated` | medium |
| `emergency_freeze` | `system.emergency_freeze` | critical |
| `emergency_unfreeze` | `system.emergency_unfreeze` | high |

Any name not in this map is **rejected** by the helper.

## PII minimization applied to `details`

Dropped entirely:

- `guest_name`, `guest_full_name`, `full_name`, `first_name`, `last_name`
- `guest_email`, `email`, `phone`, `phone_number`
- `passport_number`, `passport`, `id_number`, `document_number`, `address`
- `notes`, `description`, `message`, `content`, `conversation`

Transformed:

- `actor_email` → `actor_email_hash` (SHA-256 hex)
- `amount` → `amount_bucket` (`<100 | 100-1k | 1k-10k | 10k-100k | 100k+`)

Preserved (safe metadata):

- `actor_id`, `actor_role`, `booking_id`, `unit_id`, `property_id`
- `fields_accessed`, `fields_changed` (field names only)
- `payment_method`, `currency`, `error_code`, `login_method`
- `record_count`, `export_format`, `includes_pii` (boolean)
- `risk_indicators`, `local_hour`

## Doctrine reminders

- Full AI conversations must not be sent to Fenrir.
- Free-text guest messages must not be sent to Fenrir.
- Fenrir is signal, not a dashboard — keep events useful and minimal.
