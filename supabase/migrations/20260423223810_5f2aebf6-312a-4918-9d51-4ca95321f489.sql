-- Restrictive policy: non-admins cannot read messaging bridge config keys.
-- Restrictive policies AND with permissive ones, so this hides specific keys
-- without affecting other policy_settings reads.
CREATE POLICY "Hide messaging bridge config from non-admins"
ON public.policy_settings
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR key NOT IN (
    'telegram_bridge_enabled',
    'telegram_webhook_registered',
    'telegram_webhook_url',
    'twilio_bridge_enabled',
    'twilio_webhook_registered',
    'line_bridge_enabled',
    'line_webhook_registered',
    'line_webhook_url',
    'line_oa_id',
    'whatsapp_bridge_enabled',
    'whatsapp_meta_webhook_verify_token'
  )
);