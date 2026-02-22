ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS admin_response text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS admin_response_at timestamptz;