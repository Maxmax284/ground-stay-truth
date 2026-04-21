-- Link codes (one-time, short-lived)
CREATE TABLE public.messaging_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  used_at timestamptz,
  used_channel text,
  used_chat_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX messaging_link_codes_active_code_idx
  ON public.messaging_link_codes (code)
  WHERE used_at IS NULL;
CREATE INDEX messaging_link_codes_user_id_idx ON public.messaging_link_codes (user_id);

ALTER TABLE public.messaging_link_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own link codes"
  ON public.messaging_link_codes FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins read all link codes"
  ON public.messaging_link_codes FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Chat bindings (channel + external chat id -> user)
CREATE TABLE public.messaging_chat_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('telegram','whatsapp','sms')),
  chat_id text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX messaging_chat_bindings_unique
  ON public.messaging_chat_bindings (channel, chat_id);
CREATE INDEX messaging_chat_bindings_user_idx
  ON public.messaging_chat_bindings (user_id);

ALTER TABLE public.messaging_chat_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own bindings"
  ON public.messaging_chat_bindings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own bindings"
  ON public.messaging_chat_bindings FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins manage all bindings"
  ON public.messaging_chat_bindings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Telegram polling state (singleton)
CREATE TABLE public.telegram_bot_state (
  id int PRIMARY KEY CHECK (id = 1),
  update_offset bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.telegram_bot_state (id, update_offset) VALUES (1, 0);

ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read telegram state"
  ON public.telegram_bot_state FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Inbound message log (audit)
CREATE TABLE public.messaging_inbound_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  chat_id text NOT NULL,
  user_id uuid,
  inbound_text text,
  outbound_text text,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messaging_inbound_log_chat_idx
  ON public.messaging_inbound_log (channel, chat_id, created_at DESC);

ALTER TABLE public.messaging_inbound_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read inbound log"
  ON public.messaging_inbound_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Cleanup function for expired codes (used by cleanup-retention or pg_cron later)
CREATE OR REPLACE FUNCTION public.cleanup_expired_link_codes()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.messaging_link_codes
  WHERE used_at IS NULL AND expires_at < now() - interval '1 hour';
$$;