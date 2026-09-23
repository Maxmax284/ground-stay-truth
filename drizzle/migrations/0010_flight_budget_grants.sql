-- One-off same-day top-ups to the paid flight read ceiling.
-- The standing cap stays at 25/day in code; a grant only widens TODAY.
CREATE TABLE public.flight_budget_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  read_day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  extra_reads integer NOT NULL CHECK (extra_reads > 0 AND extra_reads <= 200),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 300),
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_flight_budget_grants_day ON public.flight_budget_grants(read_day);

GRANT SELECT, INSERT ON public.flight_budget_grants TO authenticated;
GRANT ALL ON public.flight_budget_grants TO service_role;

ALTER TABLE public.flight_budget_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read flight budget grants"
  ON public.flight_budget_grants FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins grant flight budget"
  ON public.flight_budget_grants FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND granted_by = auth.uid());