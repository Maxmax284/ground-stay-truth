-- Lets the team mark a published place as something an arriving guest needs to
-- know about (late-night food, pharmacy, ATM), so it can be surfaced on the
-- Arrivals Board next to the people actually landing.
ALTER TABLE public.local_recommendations
  ADD COLUMN IF NOT EXISTS arrival_essential boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.local_recommendations.arrival_essential IS
  'Flagged as essential for a guest arriving today. Editorial flag only — changes nothing operational.';

CREATE INDEX IF NOT EXISTS local_recommendations_arrival_essential_idx
  ON public.local_recommendations (arrival_essential)
  WHERE arrival_essential;
