ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS manual_guest_name text,
  ADD COLUMN IF NOT EXISTS manual_guest_email text,
  ADD COLUMN IF NOT EXISTS manual_guest_phone text,
  ADD COLUMN IF NOT EXISTS manual_guest_note text;

COMMENT ON COLUMN public.bookings.manual_guest_name IS 'Guest display name entered manually when no guest account is linked (walk-ins, pre-existing bookings, OTA sync).';