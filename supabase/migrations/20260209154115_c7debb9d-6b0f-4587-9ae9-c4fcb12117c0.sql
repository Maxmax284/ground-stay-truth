-- Add FK from bookings.guest_id to profiles.user_id so PostgREST can join them
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_guest_id_profiles_fkey
  FOREIGN KEY (guest_id) REFERENCES public.profiles(user_id)
  ON DELETE SET NULL;