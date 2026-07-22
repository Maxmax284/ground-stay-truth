-- Backfill min_billable_guests for existing per-person units so they don't underquote
-- when a guest books fewer than the room's capacity.
UPDATE public.units
SET min_billable_guests = GREATEST(COALESCE(capacity, 1), 1)
WHERE pricing_type = 'per_person'
  AND min_billable_guests IS NULL;