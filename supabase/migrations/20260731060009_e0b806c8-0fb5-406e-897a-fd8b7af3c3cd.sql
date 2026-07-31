-- ============================================================================
-- Guest document review workflow (staff-facing "document vault")
-- Advisory only: nothing here blocks check-in or any operational action.
-- ============================================================================

ALTER TABLE public.guest_documents
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS used_for_tm30 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tm30_marked_by uuid,
  ADD COLUMN IF NOT EXISTS tm30_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.guest_documents
    ADD CONSTRAINT guest_documents_review_status_check
    CHECK (review_status IN ('uploaded','reviewed','accepted','needs_replacement','superseded'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_guest_documents_review
  ON public.guest_documents (booking_id, review_status);

-- ---------------------------------------------------------------- access log
CREATE TABLE IF NOT EXISTS public.guest_document_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid,
  booking_id uuid,
  actor_id uuid,
  actor_role text,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.guest_document_access_log TO authenticated;
GRANT ALL ON public.guest_document_access_log TO service_role;

ALTER TABLE public.guest_document_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read document access log" ON public.guest_document_access_log;
CREATE POLICY "Staff can read document access log"
ON public.guest_document_access_log FOR SELECT TO authenticated
USING (public.can_view_guest_documents(auth.uid()));

DROP POLICY IF EXISTS "Staff can write document access log" ON public.guest_document_access_log;
CREATE POLICY "Staff can write document access log"
ON public.guest_document_access_log FOR INSERT TO authenticated
WITH CHECK (public.can_view_guest_documents(auth.uid()) AND actor_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_guest_doc_access_log_doc
  ON public.guest_document_access_log (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_doc_access_log_booking
  ON public.guest_document_access_log (booking_id, created_at DESC);

-- ------------------------------------------- supersede older uploads on insert
CREATE OR REPLACE FUNCTION public.trg_supersede_prior_documents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.guest_documents
     SET superseded = true,
         review_status = CASE WHEN review_status IN ('uploaded','reviewed')
                              THEN 'superseded' ELSE review_status END
   WHERE booking_id = NEW.booking_id
     AND document_type = NEW.document_type
     AND id <> NEW.id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_supersede_prior_documents: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS supersede_prior_documents ON public.guest_documents;
CREATE TRIGGER supersede_prior_documents
AFTER INSERT ON public.guest_documents FOR EACH ROW
EXECUTE FUNCTION public.trg_supersede_prior_documents();

-- ------------------------------- upload alert: first vs replacement + throttle
CREATE OR REPLACE FUNCTION public.trg_alert_guest_uploaded_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _guest text;
  _prior_count int;
  _recent int;
BEGIN
  SELECT COALESCE(p.full_name, p.email, 'Guest') INTO _guest
    FROM public.bookings b LEFT JOIN public.profiles p ON p.user_id = b.guest_id
    WHERE b.id = NEW.booking_id;

  SELECT count(*) INTO _prior_count
    FROM public.guest_documents
   WHERE booking_id = NEW.booking_id
     AND document_type = NEW.document_type
     AND id <> NEW.id;

  -- Anti-spam: if the same booking uploaded the same doc type in the last
  -- 10 minutes, stay quiet. Staff already have an alert to act on.
  SELECT count(*) INTO _recent
    FROM public.guest_documents
   WHERE booking_id = NEW.booking_id
     AND document_type = NEW.document_type
     AND id <> NEW.id
     AND created_at > now() - interval '10 minutes';

  IF _recent > 0 THEN
    RETURN NEW;
  END IF;

  PERFORM public.emit_admin_alert(
    'guest_uploaded_id',
    CASE WHEN _prior_count > 0
      THEN COALESCE(_guest,'Guest') || ' uploaded a replacement ID document — review the latest version'
      ELSE COALESCE(_guest,'Guest') || ' uploaded an ID document — review needed'
    END,
    NEW.booking_id, '/bookings?id=' || NEW.booking_id::text,
    jsonb_build_object('guest_name', _guest, 'document_type', NEW.document_type,
                       'is_replacement', _prior_count > 0,
                       'previous_uploads', _prior_count)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_guest_uploaded_id: %', SQLERRM; RETURN NEW;
END $$;