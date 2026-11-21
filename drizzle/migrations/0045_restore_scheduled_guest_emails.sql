DO $$
DECLARE base text := 'https://eglgvhnkwhozjnenwjxd.supabase.co/functions/v1/';
  anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnbGd2aG5rd2hvempuZW53anhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1OTIyNDUsImV4cCI6MjA4NjE2ODI0NX0.z429jY15Upn48hTXD4FIImzpD99kJqTUz7jZwLQUsd0';
  hdr text;
BEGIN
  hdr := format($h$jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s','apikey','%s','x-internal-token', public.get_integration_secret('cron_internal_token'))$h$, anon, anon);
  PERFORM cron.schedule(
    'send-scheduled-emails-hourly',
    '0 * * * *',
    format('select net.http_post(url:=%L, headers:=%s, body:=''{}''::jsonb)', base||'send-scheduled-emails', hdr)
  );
END $$;