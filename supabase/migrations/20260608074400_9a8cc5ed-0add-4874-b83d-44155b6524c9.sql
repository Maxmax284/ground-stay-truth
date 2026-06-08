ALTER TABLE public.guest_documents
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'passport';

CREATE INDEX IF NOT EXISTS idx_guest_documents_booking_type
  ON public.guest_documents (booking_id, document_type);