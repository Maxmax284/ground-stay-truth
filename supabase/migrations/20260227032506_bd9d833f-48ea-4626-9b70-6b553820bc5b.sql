
-- Phase 1: Revenue Activation - Schema Changes

-- 1. Add provider-agnostic columns to payments table
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS provider_status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS refund_amount numeric,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS receipt_url text;

-- Unique constraint on idempotency_key to prevent double processing
CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_unique ON public.payments (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2. Create payment_events table for webhook audit trail
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.payments(id),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint on provider_event_id for idempotency
CREATE UNIQUE INDEX payment_events_provider_event_id_unique ON public.payment_events (provider_event_id);

-- RLS: Admin read-only, no client writes (webhook inserts via service role)
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read payment events"
  ON public.payment_events
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Create email_log table (needed for Phase 2, but creating now to avoid a second migration)
CREATE TABLE public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id),
  template_key text NOT NULL,
  recipient_email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  status text NOT NULL DEFAULT 'sent'
);

-- Unique constraint to prevent duplicate emails per booking+template
CREATE UNIQUE INDEX email_log_booking_template_unique ON public.email_log (booking_id, template_key);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read email log"
  ON public.email_log
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. Add foreign key constraint on payments.booking_id if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_name = 'payments'
      AND constraint_name = 'payments_booking_id_fkey'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_booking_id_fkey
      FOREIGN KEY (booking_id) REFERENCES public.bookings(id);
  END IF;
END $$;

-- 5. Guests need to read their own payments (to see payment status in Guest Portal)
CREATE POLICY "Guests can read own booking payments"
  ON public.payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings
      WHERE bookings.id = payments.booking_id
        AND bookings.guest_id = auth.uid()
    )
  );
