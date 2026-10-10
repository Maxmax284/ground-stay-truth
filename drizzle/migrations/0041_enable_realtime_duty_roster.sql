DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'duty_roster'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.duty_roster;
  END IF;
END $$;