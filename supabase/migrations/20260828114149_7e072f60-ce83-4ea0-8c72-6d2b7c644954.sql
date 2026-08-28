DO $$
BEGIN
  -- The one-time live correction was applied through the managed migration flow.
  -- This no-op marker keeps repository migration history aligned.
  NULL;
END $$;