-- Island guide editorial hygiene: a human review stamp, a temporary-closure
-- flag and a seasonal note, so nothing gets shown to a guest as current when
-- nobody has checked it in months.
ALTER TABLE public.local_recommendations
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS closed_temporarily boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seasonal_note text;

COMMENT ON COLUMN public.local_recommendations.last_reviewed_at IS
  'When a human last verified contact, hours and location. Guests see this date.';
COMMENT ON COLUMN public.local_recommendations.closed_temporarily IS
  'Set when a place is shut for the season or renovation; still listed, clearly marked.';
