ALTER TABLE public.pricing_rules
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.unit_groups(id) ON DELETE CASCADE;

ALTER TABLE public.pricing_rules ALTER COLUMN unit_id DROP NOT NULL;

-- Exactly one scope: a rule targets either a single unit (override) or a whole group.
ALTER TABLE public.pricing_rules
  DROP CONSTRAINT IF EXISTS pricing_rules_scope_check;
ALTER TABLE public.pricing_rules
  ADD CONSTRAINT pricing_rules_scope_check
  CHECK ((unit_id IS NOT NULL AND group_id IS NULL) OR (unit_id IS NULL AND group_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS pricing_rules_group_id_idx ON public.pricing_rules(group_id);

-- Backfill: promote the canonical per-unit seasonal sets to group scope.
-- Superior Single 5 (888ea50a-835e-412b-af79-e9995d69a38a) was priced manually
-- on purpose and stays as a unit-level override.
UPDATE public.pricing_rules pr
SET group_id = u.group_id, unit_id = NULL
FROM public.units u
WHERE pr.unit_id = u.id
  AND u.group_id IS NOT NULL
  AND pr.unit_id <> '888ea50a-835e-412b-af79-e9995d69a38a'::uuid;