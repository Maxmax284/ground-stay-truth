-- Phase 1: Add payment lifecycle columns to payments table
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'deposit',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_session_id text;

-- Add index for looking up pending payments by session
CREATE INDEX IF NOT EXISTS idx_payments_provider_session_id ON public.payments (provider_session_id) WHERE provider_session_id IS NOT NULL;

-- Add index for finding pending/expired payments
CREATE INDEX IF NOT EXISTS idx_payments_status_expires ON public.payments (status, expires_at) WHERE status = 'pending';