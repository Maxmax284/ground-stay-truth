CREATE TABLE public.unit_ical_tokens (
  unit_id uuid PRIMARY KEY REFERENCES public.units(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.unit_ical_tokens TO authenticated;
GRANT ALL ON public.unit_ical_tokens TO service_role;
ALTER TABLE public.unit_ical_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins/managers read ical tokens" ON public.unit_ical_tokens
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
INSERT INTO public.unit_ical_tokens(unit_id) SELECT id FROM public.units ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.create_unit_ical_token() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.unit_ical_tokens(unit_id) VALUES (NEW.id) ON CONFLICT DO NOTHING; RETURN NEW; END $$;
CREATE TRIGGER trg_unit_ical_token AFTER INSERT ON public.units FOR EACH ROW EXECUTE FUNCTION public.create_unit_ical_token();