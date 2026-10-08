DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.urgent_request_action(uuid,text,text,uuid)'::regprocedure);
  d := replace(d, 'status=CASE WHEN status=''open'' THEN ''acknowledged'' ELSE status END WHERE id=_id;',
    'status=CASE WHEN status IN (''open'',''escalated'') THEN ''acknowledged'' ELSE status END,
      next_escalation_at=now() + make_interval(mins => coalesce(nullif(public._assist_setting(''escalation_reminder_minutes''),'''')::int, 30)) WHERE id=_id;');
  EXECUTE d;
END $mig$;