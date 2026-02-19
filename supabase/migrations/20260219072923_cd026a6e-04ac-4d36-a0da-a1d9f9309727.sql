-- Add guest_type and arrival_details to bookings
ALTER TABLE public.bookings 
  ADD COLUMN IF NOT EXISTS guest_type text DEFAULT 'training_guest',
  ADD COLUMN IF NOT EXISTS arrival_details jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.bookings.guest_type IS 'fighter, training_guest, spectator, long_term';
COMMENT ON COLUMN public.bookings.arrival_details IS 'JSON: flight_info, arrival_time, emergency_contact, dietary_restrictions';

-- Add whatsapp and line_id to profiles for Thai communication channels
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS line_id text DEFAULT NULL;