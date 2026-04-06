
-- F-46: Profile change audit log
CREATE TABLE public.profile_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_user_id uuid NOT NULL,
  changed_by uuid,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile audit"
  ON public.profile_audit_log FOR SELECT TO authenticated
  USING (profile_user_id = auth.uid());

CREATE POLICY "Admins can view all profile audits"
  ON public.profile_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger to auto-log profile changes
CREATE OR REPLACE FUNCTION public.log_profile_changes()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
DECLARE
  changed_by_id uuid;
BEGIN
  -- Try to get current user, might be null for system changes
  changed_by_id := auth.uid();
  
  IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN
    INSERT INTO profile_audit_log (profile_user_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.user_id, changed_by_id, 'full_name', OLD.full_name, NEW.full_name);
  END IF;
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    INSERT INTO profile_audit_log (profile_user_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.user_id, changed_by_id, 'email', OLD.email, NEW.email);
  END IF;
  IF OLD.phone IS DISTINCT FROM NEW.phone THEN
    INSERT INTO profile_audit_log (profile_user_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.user_id, changed_by_id, 'phone', OLD.phone, NEW.phone);
  END IF;
  IF OLD.preferred_language IS DISTINCT FROM NEW.preferred_language THEN
    INSERT INTO profile_audit_log (profile_user_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.user_id, changed_by_id, 'preferred_language', OLD.preferred_language, NEW.preferred_language);
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_updated_audit
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_profile_changes();
