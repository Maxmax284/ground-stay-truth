CREATE OR REPLACE FUNCTION public.guard_message_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  -- Server-side jobs (no end-user session) are trusted.
  IF uid IS NULL THEN RETURN NEW; END IF;

  IF NOT public.has_ops_write(uid) AND NOT public.has_role(uid, 'admin') THEN
    -- Guests may only mark messages read.
    IF NEW.content IS DISTINCT FROM OLD.content
       OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
       OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
       OR NEW.is_internal IS DISTINCT FROM OLD.is_internal
       OR NEW.draft IS DISTINCT FROM OLD.draft
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.property_id IS DISTINCT FROM OLD.property_id
       OR NEW.attachment_url IS DISTINCT FROM OLD.attachment_url
       OR NEW.attachment_type IS DISTINCT FROM OLD.attachment_type
       OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.external_ref IS DISTINCT FROM OLD.external_ref
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Guests can only mark messages as read' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Releasing a draft or stamping approval is admin-only.
  IF NOT public.has_role(uid, 'admin') THEN
    IF (OLD.draft = true AND NEW.draft = false)
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
      RAISE EXCEPTION 'Only an admin can approve and release a draft message' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_message_update ON public.messages;
CREATE TRIGGER guard_message_update BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_update();