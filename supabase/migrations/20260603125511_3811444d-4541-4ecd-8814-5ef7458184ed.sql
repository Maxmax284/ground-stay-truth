
CREATE TABLE public.vanta_lookup_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id text NOT NULL UNIQUE,
  request_id text,
  lookup_type text NOT NULL,
  lookup_id text,
  purpose text,
  requester_source text NOT NULL DEFAULT 'vanta',
  authorized boolean NOT NULL DEFAULT false,
  signature_valid boolean NOT NULL DEFAULT false,
  response_status text NOT NULL,
  fields_returned text[] NOT NULL DEFAULT '{}',
  sensitivity_level text,
  environment text,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vanta_lookup_audit_created_at ON public.vanta_lookup_audit(created_at DESC);
CREATE INDEX idx_vanta_lookup_audit_request_id ON public.vanta_lookup_audit(request_id);

GRANT SELECT ON public.vanta_lookup_audit TO authenticated;
GRANT ALL ON public.vanta_lookup_audit TO service_role;

ALTER TABLE public.vanta_lookup_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view vanta lookup audit"
ON public.vanta_lookup_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
