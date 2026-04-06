
-- Fix 1: Allow any authenticated user to INSERT into recovery_audit_log (for client-side error logging)
CREATE POLICY "Authenticated users can insert recovery audit log"
ON public.recovery_audit_log
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Fix 2: Add ip_address and user_agent to user_consents for compliance metadata
ALTER TABLE public.user_consents ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.user_consents ADD COLUMN IF NOT EXISTS user_agent text;

-- Fix 3: Create policy_settings_history table for config change auditing
CREATE TABLE IF NOT EXISTS public.policy_settings_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_id uuid NOT NULL,
  key text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  property_id uuid
);

ALTER TABLE public.policy_settings_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read policy history"
ON public.policy_settings_history
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert policy history"
ON public.policy_settings_history
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix 4: Trigger to auto-log policy_settings changes
CREATE OR REPLACE FUNCTION public.log_policy_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.policy_settings_history (setting_id, key, old_value, new_value, changed_by, property_id)
  VALUES (NEW.id, NEW.key, OLD.value, NEW.value, NEW.updated_by, NEW.property_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_policy_settings_change
  AFTER UPDATE ON public.policy_settings
  FOR EACH ROW
  WHEN (OLD.value IS DISTINCT FROM NEW.value)
  EXECUTE FUNCTION public.log_policy_settings_change();
