ALTER TABLE public.stay_support_log
  ADD COLUMN IF NOT EXISTS change_type text NOT NULL DEFAULT 'normal';