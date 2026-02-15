
-- Add last_sign_in_at column to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;

-- Trigger function to sync last_sign_in_at from auth
CREATE OR REPLACE FUNCTION public.sync_last_sign_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles 
  SET last_sign_in_at = NEW.last_sign_in_at 
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

-- Trigger on auth.users (fires on login)
CREATE TRIGGER on_auth_user_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_last_sign_in();

-- Backfill existing data
UPDATE public.profiles p
SET last_sign_in_at = u.last_sign_in_at
FROM auth.users u
WHERE p.user_id = u.id;
