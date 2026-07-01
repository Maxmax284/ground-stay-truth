-- Clear the stale "failing" webhook_health row caused by an unsigned health probe.
-- Real Stripe events have never been received (payment_events is empty for stripe),
-- so the correct status is "awaiting first event", not "failing".
UPDATE public.webhook_health
SET status = 'pending',
    last_failure_at = NULL,
    last_failure_reason = NULL,
    updated_at = now()
WHERE provider = 'stripe'
  AND last_success_at IS NULL
  AND last_failure_reason ILIKE '%Missing stripe-signature header%';