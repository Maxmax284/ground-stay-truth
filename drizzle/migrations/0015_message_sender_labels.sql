-- Who wrote each message in a booking thread: staff or guest, and under which
-- name/line. Read-only labelling so a staff reply never reads as an unknown guest.
CREATE OR REPLACE FUNCTION public.get_message_sender_labels(_booking_id uuid)
RETURNS TABLE (
  sender_id uuid,
  display_name text,
  is_staff boolean,
  staff_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_ops_read(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = _booking_id AND b.guest_id = auth.uid()
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    m.sender_id,
    p.full_name,
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = m.sender_id AND ur.role <> 'guest'
    ) AS is_staff,
    (
      SELECT s.label FROM public.staff_phone_numbers s
      WHERE s.user_id = m.sender_id AND s.is_active = true
      ORDER BY s.created_at LIMIT 1
    ) AS staff_label
  FROM public.messages m
  LEFT JOIN public.profiles p ON p.user_id = m.sender_id
  WHERE m.booking_id = _booking_id AND m.sender_id IS NOT NULL;
END
$$;

GRANT EXECUTE ON FUNCTION public.get_message_sender_labels(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_staff_phone(text) TO authenticated, service_role;