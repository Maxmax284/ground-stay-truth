-- 1. SECURITY DEFINER function exposure -------------------------------------
REVOKE EXECUTE ON FUNCTION public.assign_sandbox_to_caller() FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_overrides_missing_attribution() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_admin_elevation(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_admin_elevation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_active_elevation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_ops_read(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_ops_unlock(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_ops_write(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_property_access(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_ops_passcode_set() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_sandbox_booking(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_sandbox_property(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_override_event(text, text, uuid, uuid, uuid, jsonb, jsonb, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.tag_override_elevation() FROM anon, authenticated;

-- 2. policy_settings: staff-only general read, narrow guest allowlist -------
DROP POLICY IF EXISTS "Authenticated users can read policy settings" ON public.policy_settings;

CREATE POLICY "Staff can read policy settings"
ON public.policy_settings
FOR SELECT
TO authenticated
USING (
  public.has_ops_read(auth.uid())
  OR public.has_role(auth.uid(), 'maintenance'::app_role)
);

CREATE POLICY "Guests can read stay-facing policy settings"
ON public.policy_settings
FOR SELECT
TO authenticated
USING (
  key LIKE 'arrival_welcome_%'
  OR key LIKE 'booking_fee_%'
  OR key LIKE 'long_stay_%'
  OR key LIKE 'loyalty_%'
  OR key LIKE 'bank_transfer_%'
  OR key LIKE 'company_%'
  OR key LIKE 'deposit%'
  OR key LIKE 'security_deposit_%'
  OR key LIKE 'partial_refund_%'
  OR key IN (
    'stay_showcase','currency_code','currency_symbol','tax_rate','tax_included',
    'checkout_time','earliest_checkin_time','cleaning_buffer_hours','camp_info',
    'house_rules_summary','contact_email','emergency_contact_name','emergency_contact_phone',
    'free_cancellation_days','no_refund_hours','soft_hold_expiration_hours',
    'require_pre_arrival_completion_before_checkin','payment_provider','stripe_enabled',
    'stripe_publishable_key','flight_forecast_enabled','sound_effects_enabled',
    'sound_effects_volume','ai_guest_enabled','ai_translate_enabled','ai_assistant_enabled',
    'ai_verify_document_enabled'
  )
);

-- Defense in depth: secret-bearing keys are admin-only, whatever else allows.
CREATE POLICY "Only admins can read secret policy settings"
ON public.policy_settings
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR key NOT IN (
    'stripe_secret_key','stripe_webhook_secret','resend_api_key','fenrir_receive_token',
    'fenrir_endpoint','whatsapp_meta_webhook_verify_token'
  )
);

-- 3. recovery_audit_log: admin-only inserts --------------------------------
DROP POLICY IF EXISTS "Authenticated users can insert recovery audit log" ON public.recovery_audit_log;

-- 4. security_events: staff-only, actor must be the caller ------------------
DROP POLICY IF EXISTS "Authenticated users can insert security events" ON public.security_events;

CREATE POLICY "Staff can log their own security events"
ON public.security_events
FOR INSERT
TO authenticated
WITH CHECK (
  (actor_id IS NULL OR actor_id = auth.uid())
  AND (
    public.has_ops_read(auth.uid())
    OR public.has_role(auth.uid(), 'maintenance'::app_role)
  )
);

-- 5. staff_audit_events: require an actual staff role -----------------------
DROP POLICY IF EXISTS "Authenticated staff can append audit events about themselves" ON public.staff_audit_events;

CREATE POLICY "Staff can append audit events about themselves"
ON public.staff_audit_events
FOR INSERT
TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND (
    public.has_ops_read(auth.uid())
    OR public.has_role(auth.uid(), 'maintenance'::app_role)
  )
);

-- 6. trusted_devices: self-trust requires an MFA-verified session ----------
DROP POLICY IF EXISTS "Users update own device" ON public.trusted_devices;

CREATE POLICY "Users update own device"
ON public.trusted_devices
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND (
    status <> 'trusted'
    OR (
      public.device_self_approval_allowed()
      AND coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    )
  )
);
