-- ── Priority 3: Financial Record Retention ──
ALTER TABLE public.payments DROP CONSTRAINT payments_booking_id_fkey;
ALTER TABLE public.payments ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS archived_booking_snapshot JSONB;

CREATE OR REPLACE FUNCTION public.snapshot_payments_before_booking_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unit_name_v TEXT;
  guest_name_v TEXT;
  guest_email_v TEXT;
BEGIN
  SELECT name INTO unit_name_v FROM public.units WHERE id = OLD.unit_id;
  SELECT full_name, email INTO guest_name_v, guest_email_v
    FROM public.profiles WHERE user_id = OLD.guest_id;

  UPDATE public.payments
  SET archived_booking_snapshot = jsonb_build_object(
    'booking_id', OLD.id,
    'check_in', OLD.check_in,
    'check_out', OLD.check_out,
    'num_guests', OLD.num_guests,
    'total_price', OLD.total_price,
    'unit_id', OLD.unit_id,
    'unit_name', unit_name_v,
    'guest_id', OLD.guest_id,
    'guest_full_name', guest_name_v,
    'guest_email', guest_email_v,
    'archived_at', now()
  )
  WHERE booking_id = OLD.id
    AND archived_booking_snapshot IS NULL;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS before_booking_delete_snapshot_payments ON public.bookings;
CREATE TRIGGER before_booking_delete_snapshot_payments
  BEFORE DELETE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_payments_before_booking_delete();

-- ── Priority 2: Tax Invoice infrastructure ──
CREATE SEQUENCE IF NOT EXISTS public.tax_invoice_seq START 1;

CREATE TABLE IF NOT EXISTS public.tax_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID UNIQUE REFERENCES public.payments(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  net_amount NUMERIC(12,2) NOT NULL,
  vat_amount NUMERIC(12,2) NOT NULL,
  gross_amount NUMERIC(12,2) NOT NULL,
  tax_rate NUMERIC(5,2) NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'THB',
  pdf_storage_path TEXT,
  buyer_name TEXT,
  buyer_email TEXT,
  buyer_tax_id TEXT,
  seller_snapshot JSONB,
  issued_by UUID,
  booking_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tax_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tax invoices"
  ON public.tax_invoices FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers read tax invoices"
  ON public.tax_invoices FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Guests read own tax invoices"
  ON public.tax_invoices FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = tax_invoices.booking_id
        AND b.guest_id = auth.uid()
    )
  );

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_tax_id TEXT;

-- ── Priority 4: Reconciliation + retry tracking ──
ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE TABLE IF NOT EXISTS public.payment_reconciliation_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity TEXT NOT NULL DEFAULT 'info',
  kind TEXT NOT NULL,
  payment_id UUID,
  stripe_object_id TEXT,
  expected NUMERIC(12,2),
  actual NUMERIC(12,2),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_reconciliation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read reconciliation log"
  ON public.payment_reconciliation_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert reconciliation log"
  ON public.payment_reconciliation_log FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_recon_log_run_at ON public.payment_reconciliation_log(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_recon_log_severity ON public.payment_reconciliation_log(severity, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_unprocessed
  ON public.payment_events(processed, created_at)
  WHERE processed = false;

-- ── Storage bucket for tax invoice PDFs ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('tax-invoices', 'tax-invoices', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins manage tax invoice PDFs"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'tax-invoices' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'tax-invoices' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers read tax invoice PDFs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'tax-invoices' AND has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Guests read own tax invoice PDFs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'tax-invoices'
    AND EXISTS (
      SELECT 1 FROM public.tax_invoices ti
      JOIN public.bookings b ON b.id = ti.booking_id
      WHERE ti.pdf_storage_path = storage.objects.name
        AND b.guest_id = auth.uid()
    )
  );

-- ── 4 company-identity policy_settings rows for legal Thai tax invoices ──
INSERT INTO public.policy_settings (key, value, description)
SELECT 'company_legal_name', '""'::jsonb, 'Legal company name printed on tax invoices'
WHERE NOT EXISTS (SELECT 1 FROM public.policy_settings WHERE key = 'company_legal_name' AND property_id IS NULL);

INSERT INTO public.policy_settings (key, value, description)
SELECT 'company_address', '""'::jsonb, 'Registered company address printed on tax invoices'
WHERE NOT EXISTS (SELECT 1 FROM public.policy_settings WHERE key = 'company_address' AND property_id IS NULL);

INSERT INTO public.policy_settings (key, value, description)
SELECT 'company_tax_id', '""'::jsonb, '13-digit Thai tax ID printed on tax invoices'
WHERE NOT EXISTS (SELECT 1 FROM public.policy_settings WHERE key = 'company_tax_id' AND property_id IS NULL);

INSERT INTO public.policy_settings (key, value, description)
SELECT 'company_branch_code', '"00000"'::jsonb, 'Branch code (00000 = head office / สำนักงานใหญ่)'
WHERE NOT EXISTS (SELECT 1 FROM public.policy_settings WHERE key = 'company_branch_code' AND property_id IS NULL);