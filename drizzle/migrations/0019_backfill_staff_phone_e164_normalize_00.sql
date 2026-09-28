-- Backfill: re-normalize any staff_phone_numbers rows saved before the 00-prefix fix.
UPDATE public.staff_phone_numbers
SET phone_e164 = public.normalize_phone(phone_raw)
WHERE phone_e164 IS DISTINCT FROM public.normalize_phone(phone_raw);