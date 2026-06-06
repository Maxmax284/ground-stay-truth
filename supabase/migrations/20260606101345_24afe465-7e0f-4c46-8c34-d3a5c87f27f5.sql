-- Prevent two active units in the same property from sharing a name (case-insensitive).
-- Inactive units are exempt so historical/deactivated duplicates remain valid.
CREATE UNIQUE INDEX IF NOT EXISTS units_active_name_per_property_uniq
  ON public.units (property_id, lower(name))
  WHERE is_active = true;