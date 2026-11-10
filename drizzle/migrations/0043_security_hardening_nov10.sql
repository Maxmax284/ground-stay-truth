-- lovable-cron-fallback-reviewed: existing jobs (flight polling, arrival journey, AI budget) only gain an auth header; cadence unchanged
DROP POLICY IF EXISTS "Authenticated users can read maintenance blocks" ON public.maintenance_blocks;
CREATE POLICY "Staff can read maintenance blocks" ON public.maintenance_blocks
  FOR SELECT TO authenticated USING (public.has_ops_read(auth.uid()));

DROP POLICY IF EXISTS "Anyone authenticated can read model costs" ON public.ai_model_costs;
CREATE POLICY "Staff can read model costs" ON public.ai_model_costs
  FOR SELECT TO authenticated USING (public.has_ops_read(auth.uid()));

DROP POLICY IF EXISTS "Public read access for app downloads" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read intelligence images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view unit photos" ON storage.objects;
CREATE POLICY "Staff can list public asset buckets" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('app-downloads','intelligence-images','unit-photos') AND public.has_ops_read(auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_guest_pickup_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _base numeric; _type text;
BEGIN
  IF auth.uid() IS NULL OR public.has_ops_write(auth.uid()) THEN RETURN NEW; END IF;
  SELECT NULLIF(regexp_replace(value::text,'"','','g'),'')::numeric INTO _base
    FROM public.policy_settings WHERE key='transport_base_fee' AND property_id IS NULL LIMIT 1;
  SELECT regexp_replace(value::text,'"','','g') INTO _type
    FROM public.policy_settings WHERE key='transport_fee_type' AND property_id IS NULL LIMIT 1;
  _base := COALESCE(_base, 600);
  NEW.fee := CASE WHEN _type = 'per_person' THEN _base * GREATEST(COALESCE(NEW.passenger_count,1),1) ELSE _base END;
  NEW.fee_override := NULL;
  NEW.status := 'requested';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_guest_pickup_fee ON public.airport_pickups;
CREATE TRIGGER enforce_guest_pickup_fee BEFORE INSERT ON public.airport_pickups
  FOR EACH ROW EXECUTE FUNCTION public.enforce_guest_pickup_fee();

CREATE OR REPLACE FUNCTION public.enforce_guest_inquiry_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u record; _nights int; _floor numeric; _ceil numeric; _low numeric;
BEGIN
  IF auth.uid() IS NULL OR public.has_ops_write(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.total_price IS NULL THEN RETURN NEW; END IF;
  SELECT base_price, weekend_price, weekly_rate, monthly_rate, cleaning_fee, extra_bed_fee
    INTO u FROM public.units WHERE id = NEW.unit_id;
  _nights := GREATEST(NEW.check_out - NEW.check_in, 1);
  IF u IS NULL OR COALESCE(u.base_price,0) <= 0 THEN NEW.total_price := NULL; RETURN NEW; END IF;
  _low := LEAST(u.base_price,
                COALESCE(NULLIF(u.weekly_rate,0)/7, u.base_price),
                COALESCE(NULLIF(u.monthly_rate,0)/30, u.base_price));
  _floor := _low * _nights * 0.5;
  _ceil := GREATEST(u.base_price, COALESCE(u.weekend_price,0)) * _nights * GREATEST(COALESCE(NEW.num_guests,1),1) * 2
           + COALESCE(u.cleaning_fee,0) + COALESCE(u.extra_bed_fee,0) * _nights * 2;
  IF NEW.total_price < _floor OR NEW.total_price > _ceil THEN
    NEW.total_price := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_guest_inquiry_price ON public.bookings;
CREATE TRIGGER enforce_guest_inquiry_price BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_guest_inquiry_price();

INSERT INTO public.integration_secrets (secret_key, encrypted_value, description)
SELECT 'cron_internal_token', encode(extensions.gen_random_bytes(32),'hex'), 'Internal token presented by scheduled jobs to edge functions'
WHERE NOT EXISTS (SELECT 1 FROM public.integration_secrets WHERE secret_key='cron_internal_token');

DO $$
DECLARE base text := 'https://eglgvhnkwhozjnenwjxd.supabase.co/functions/v1/';
  anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnbGd2aG5rd2hvempuZW53anhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1OTIyNDUsImV4cCI6MjA4NjE2ODI0NX0.z429jY15Upn48hTXD4FIImzpD99kJqTUz7jZwLQUsd0';
  hdr text;
BEGIN
  hdr := format($h$jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s','apikey','%s','x-internal-token', public.get_integration_secret('cron_internal_token'))$h$, anon, anon);
  PERFORM cron.schedule('poll-flights-every-15min','*/15 * * * *', format('select net.http_post(url:=%L, headers:=%s, body:=''{}''::jsonb)', base||'poll-flights', hdr));
  PERFORM cron.schedule('cleanup-storage-weekly','0 4 * * 0', format('select net.http_post(url:=%L, headers:=%s, body:=''{}''::jsonb)', base||'cleanup-storage', hdr));
  PERFORM cron.schedule('daily-briefing-08-bangkok','0 1 * * *', format('select net.http_post(url:=%L, headers:=%s, body:=jsonb_build_object(''scheduled_at'', now()))', base||'daily-briefing', hdr));
  PERFORM cron.schedule('arrival-stage1-guest-18-bkk','0 11 * * *', format('select net.http_post(url:=%L, headers:=%s, body:=''{}''::jsonb)', base||'guest-arrival-journey?mode=stage1_guest', hdr));
  PERFORM cron.schedule('arrival-stage1-staff-08-bkk','0 1 * * *', format('select net.http_post(url:=%L, headers:=%s, body:=''{}''::jsonb)', base||'guest-arrival-journey?mode=stage1_staff', hdr));
  PERFORM cron.schedule('arrival-poll-15m','*/15 * * * *', format('select net.http_post(url:=%L, headers:=%s, body:=''{}''::jsonb)', base||'guest-arrival-journey?mode=all_crons', hdr));
  PERFORM cron.schedule('ai-budget-watchdog-15m','*/15 * * * *', format('select net.http_post(url:=%L, headers:=%s, body:=''{}''::jsonb)', base||'ai-budget-watchdog', hdr));
END $$;