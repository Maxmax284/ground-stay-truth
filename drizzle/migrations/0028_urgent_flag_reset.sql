DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.create_urgent_request(uuid,text,text)'::regprocedure);
  d := replace(d, '  RETURN jsonb_build_object(''id'', new_id', '  PERFORM set_config(''app.escalation_tx'', '''', true);
  RETURN jsonb_build_object(''id'', new_id');
  EXECUTE d;
  d := pg_get_functiondef('public.urgent_request_action(uuid,text,text,uuid)'::regprocedure);
  d := regexp_replace(d, 'END\s*\$function\$\s*$', 'PERFORM set_config(''app.escalation_tx'', '''', true);
END $function$');
  EXECUTE d;
END $mig$;