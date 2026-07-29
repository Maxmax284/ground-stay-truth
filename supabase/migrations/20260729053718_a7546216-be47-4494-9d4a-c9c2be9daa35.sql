ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS hold_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS deadline_override_reason text,
  ADD COLUMN IF NOT EXISTS deadline_override_by uuid,
  ADD COLUMN IF NOT EXISTS deadline_override_at timestamptz;

COMMENT ON COLUMN public.bookings.hold_deadline_at IS 'Staff override: explicit expiry deadline for soft_hold / pending_deposit. When set, it replaces the policy-derived deadline.';