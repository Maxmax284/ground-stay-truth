-- 1. Append-only audit for roster/responder changes
CREATE TABLE IF NOT EXISTS public.ops_config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  row_id uuid,
  action text NOT NULL,
  actor_id uuid,
  old_row jsonb,
  new_row jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ops_config_audit TO authenticated;
GRANT ALL ON public.ops_config_audit TO service_role;
ALTER TABLE public.ops_config_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Managers read ops config audit" ON public.ops_config_audit;
CREATE POLICY "Managers read ops config audit" ON public.ops_config_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE OR REPLACE FUNCTION public.log_ops_config_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.ops_config_audit(table_name,row_id,action,actor_id,old_row,new_row)
  VALUES (TG_TABLE_NAME,
          COALESCE((CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END)),
          TG_OP, auth.uid(),
          CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_audit_duty_roster ON public.duty_roster;
CREATE TRIGGER trg_audit_duty_roster AFTER INSERT OR UPDATE OR DELETE ON public.duty_roster
  FOR EACH ROW EXECUTE FUNCTION public.log_ops_config_change();
DROP TRIGGER IF EXISTS trg_audit_responder_capabilities ON public.responder_capabilities;
CREATE TRIGGER trg_audit_responder_capabilities AFTER INSERT OR UPDATE OR DELETE ON public.responder_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.log_ops_config_change();

-- 2. Make audit tables tamper-evident: no UPDATE/DELETE for anyone
CREATE OR REPLACE FUNCTION public.block_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS trg_block_ops_config_audit_mutation ON public.ops_config_audit;
CREATE TRIGGER trg_block_ops_config_audit_mutation BEFORE UPDATE OR DELETE ON public.ops_config_audit
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();
DROP TRIGGER IF EXISTS trg_block_policy_history_mutation ON public.policy_settings_history;
CREATE TRIGGER trg_block_policy_history_mutation BEFORE UPDATE OR DELETE ON public.policy_settings_history
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

-- History is written only by the SECURITY DEFINER trigger; clients can no longer forge rows.
DROP POLICY IF EXISTS "Admins can insert policy history" ON public.policy_settings_history;

-- 3. Read-only readiness snapshot (admin + manager). No guest data, no numbers, only booleans/counts.
CREATE OR REPLACE FUNCTION public.get_comms_readiness() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE since timestamptz := now() - interval '7 days'; cov jsonb;
  FUNCTION_SET boolean;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'managers only' USING ERRCODE = '42501';
  END IF;
  BEGIN cov := to_jsonb(public.get_current_coverage(now())); EXCEPTION WHEN others THEN cov := NULL; END;
  RETURN jsonb_build_object(
    'auto_escalation_enabled', COALESCE((SELECT value::text = 'true' FROM policy_settings WHERE key='auto_escalation_enabled' ORDER BY property_id NULLS FIRST LIMIT 1), false),
    'urgent_requests_enabled', COALESCE((SELECT value::text = 'true' FROM policy_settings WHERE key='urgent_requests_enabled' ORDER BY property_id NULLS FIRST LIMIT 1), false),
    'call_number_set', EXISTS (SELECT 1 FROM policy_settings WHERE key='urgent_call_number' AND value::text NOT IN ('null','""','')),
    'whatsapp_number_set', EXISTS (SELECT 1 FROM policy_settings WHERE key='whatsapp_display_number' AND value::text NOT IN ('null','""','')),
    'default_oncall_set', EXISTS (SELECT 1 FROM policy_settings WHERE key='default_oncall_primary' AND value::text NOT IN ('null','""','')),
    'responders_notify', (SELECT count(*) FROM responder_capabilities WHERE can_receive_alerts),
    'responders_onsite', (SELECT count(*) FROM responder_capabilities WHERE can_assist_on_site),
    'shifts_next_7d', (SELECT count(*) FROM duty_roster WHERE ends_at > now() AND starts_at < now() + interval '7 days'),
    'coverage_now', cov,
    'push_devices', (SELECT count(*) FROM push_subscriptions),
    'push_staff', (SELECT count(DISTINCT user_id) FROM push_subscriptions),
    'push_devices_failing', (SELECT count(*) FROM push_subscriptions WHERE COALESCE(failure_count,0) > 0 OR last_error IS NOT NULL),
    'push_accepted_7d', (SELECT count(*) FROM push_delivery_log WHERE created_at >= since AND status IN ('accepted','delivered')),
    'push_failed_7d', (SELECT count(*) FROM push_delivery_log WHERE created_at >= since AND status NOT IN ('accepted','delivered')),
    'push_device_gone_7d', (SELECT count(*) FROM push_delivery_log WHERE created_at >= since AND http_status IN (404,410)),
    'email_sent_7d', (SELECT count(*) FROM email_send_log WHERE created_at >= since AND status = 'sent'),
    'email_failed_7d', (SELECT count(*) FROM email_send_log WHERE created_at >= since AND status IN ('failed','dlq','bounced','error')),
    'email_suppressed_7d', (SELECT count(*) FROM email_send_log WHERE created_at >= since AND status = 'suppressed'),
    'open_urgent', (SELECT count(*) FROM guest_escalations WHERE kind='urgent_request' AND status NOT IN ('resolved','closed','cancelled')),
    'last_test_push_accepted_at', (SELECT max(created_at) FROM push_delivery_log WHERE source ILIKE '%test%' AND status IN ('accepted','delivered')),
    'practice_run_verified', false
  );
END $$;
REVOKE ALL ON FUNCTION public.get_comms_readiness() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_comms_readiness() TO authenticated;