CREATE OR REPLACE FUNCTION public.normalize_phone(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _raw IS NULL OR btrim(_raw) = '' THEN NULL
    ELSE '+' || regexp_replace(regexp_replace(_raw, '[^0-9]', '', 'g'), '^00', '')
  END
$$;