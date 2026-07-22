ALTER TABLE public.payment_links
  ADD COLUMN IF NOT EXISTS checkout_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkout_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_links_checkout_session_id
  ON public.payment_links(checkout_session_id);

COMMENT ON COLUMN public.payment_links.checkout_started_at IS
  'When the guest launched Stripe Checkout. Soft signal only — does NOT lock the link. used_at is set only after webhook-verified payment success.';
COMMENT ON COLUMN public.payment_links.checkout_session_id IS
  'Most recent Stripe Checkout Session ID launched from this link. Used by the guest page to poll payment status without exposing the raw token.';