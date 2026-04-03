ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS attachment_type text DEFAULT NULL;