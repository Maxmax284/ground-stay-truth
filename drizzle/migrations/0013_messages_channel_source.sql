-- Every message, whichever channel it arrived on, stays one row in public.messages.
-- source tells staff where the guest wrote from; external_ref keeps the provider id
-- so an inbound WhatsApp/Telegram message is never inserted twice.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'portal',
  ADD COLUMN IF NOT EXISTS external_ref text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_source_check'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_source_check
      CHECK (source IN ('portal','whatsapp','telegram','sms','line','email'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS messages_source_idx ON public.messages(source);
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_ref_key
  ON public.messages(source, external_ref) WHERE external_ref IS NOT NULL;