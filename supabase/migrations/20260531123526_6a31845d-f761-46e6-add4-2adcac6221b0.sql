
-- Payment-link abuse protection: attempt counter, abuse lock, and auto-revoke on booking state change.
ALTER TABLE public.payment_links
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS abuse_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS abuse_reason text;

CREATE INDEX IF NOT EXISTS idx_payment_links_abuse_locked
  ON public.payment_links (abuse_locked_at DESC)
  WHERE abuse_locked_at IS NOT NULL;

-- Security-definer helper used by the public guest-payment-link edge function.
-- Increments the attempt counter atomically and returns the new count.
CREATE OR REPLACE FUNCTION public.increment_payment_link_attempt(_link_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.payment_links
  SET attempt_count = attempt_count + 1,
      last_attempt_at = now()
  WHERE id = _link_id
  RETURNING attempt_count;
$$;

-- Lock a link as abusive (called by edge function once cap is exceeded).
CREATE OR REPLACE FUNCTION public.lock_payment_link_abuse(_link_id uuid, _reason text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.payment_links
  SET abuse_locked_at = COALESCE(abuse_locked_at, now()),
      abuse_reason = COALESCE(abuse_reason, _reason),
      revoked_at = COALESCE(revoked_at, now())
  WHERE id = _link_id;
$$;

-- Auto-revoke any active payment links when the booking moves out of pending_deposit.
CREATE OR REPLACE FUNCTION public.revoke_links_on_booking_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state
     AND OLD.state = 'pending_deposit'
     AND NEW.state <> 'pending_deposit' THEN
    UPDATE public.payment_links
    SET revoked_at = now()
    WHERE booking_id = NEW.id
      AND used_at IS NULL
      AND revoked_at IS NULL;

    INSERT INTO public.payment_link_events (booking_id, event_type, actor_role, context)
    SELECT NEW.id, 'revoked_on_state_change', 'system',
           jsonb_build_object('from_state', OLD.state, 'to_state', NEW.state);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_revoke_links_on_booking_state_change ON public.bookings;
CREATE TRIGGER trg_revoke_links_on_booking_state_change
AFTER UPDATE OF state ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.revoke_links_on_booking_state_change();
