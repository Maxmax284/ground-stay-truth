
-- New audit log table (append-only, no update/delete policies)
CREATE TABLE public.review_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL,
  action text NOT NULL,
  performed_by uuid NOT NULL,
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.review_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log" ON public.review_audit_log
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert audit log" ON public.review_audit_log
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add booking metadata columns to reviews for public display
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS stay_check_in date;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS stay_check_out date;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS stay_unit_name text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS stay_nights integer;
