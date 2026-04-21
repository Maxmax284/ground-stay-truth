-- Thread memory for rolling AI context
CREATE TABLE public.messaging_thread_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_thread_memory_user_channel ON public.messaging_thread_memory (user_id, channel, created_at DESC);

ALTER TABLE public.messaging_thread_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own thread memory"
  ON public.messaging_thread_memory FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own thread memory"
  ON public.messaging_thread_memory FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins manage thread memory"
  ON public.messaging_thread_memory FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trim function: keep only 10 most recent per (user_id, channel)
CREATE OR REPLACE FUNCTION public.trim_thread_memory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.messaging_thread_memory
  WHERE id IN (
    SELECT id FROM public.messaging_thread_memory
    WHERE user_id = NEW.user_id AND channel = NEW.channel
    ORDER BY created_at DESC
    OFFSET 10
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trim_thread_memory_trigger
AFTER INSERT ON public.messaging_thread_memory
FOR EACH ROW EXECUTE FUNCTION public.trim_thread_memory();

-- Notification preferences
CREATE TABLE public.messaging_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL,
  notification_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel, notification_type)
);

CREATE INDEX idx_notif_prefs_user ON public.messaging_notification_prefs (user_id, channel);
CREATE INDEX idx_notif_prefs_type ON public.messaging_notification_prefs (notification_type) WHERE enabled = true;

ALTER TABLE public.messaging_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own prefs"
  ON public.messaging_notification_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins read all prefs"
  ON public.messaging_notification_prefs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_notif_prefs_updated_at
BEFORE UPDATE ON public.messaging_notification_prefs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Outbound notification dispatch log (audit trail)
CREATE TABLE public.messaging_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL,
  chat_id text NOT NULL,
  notification_type text NOT NULL,
  subject_id uuid,
  outcome text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_log_user ON public.messaging_notification_log (user_id, created_at DESC);

ALTER TABLE public.messaging_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read notification log"
  ON public.messaging_notification_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users read own notification log"
  ON public.messaging_notification_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());