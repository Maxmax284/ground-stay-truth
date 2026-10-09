CREATE OR REPLACE FUNCTION public.log_ops_config_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb := to_jsonb(CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END);
BEGIN
  INSERT INTO public.ops_config_audit(table_name,row_id,action,actor_id,old_row,new_row)
  VALUES (TG_TABLE_NAME, COALESCE(r->>'id', r->>'user_id')::uuid, TG_OP, auth.uid(),
          CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;