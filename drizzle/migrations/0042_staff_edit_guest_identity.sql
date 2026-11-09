CREATE OR REPLACE FUNCTION public.staff_edit_guest_identity(_guest_id uuid DEFAULT NULL, _booking_id uuid DEFAULT NULL, _full_name text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _property uuid; _target uuid;
BEGIN
 IF _actor IS NULL OR NOT (has_role(_actor,'admin') OR has_role(_actor,'manager')) THEN RAISE EXCEPTION 'Admin or manager required' USING ERRCODE='42501'; END IF;
 IF _full_name IS NULL OR length(trim(_full_name)) < 1 OR length(trim(_full_name)) > 255 THEN RAISE EXCEPTION 'Name must be 1 to 255 characters'; END IF;
 IF (_guest_id IS NULL) = (_booking_id IS NULL) THEN RAISE EXCEPTION 'Choose account or booking, not both'; END IF;
 IF _booking_id IS NOT NULL THEN
  SELECT property_id,guest_id INTO _property,_target FROM public.bookings WHERE id=_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT has_role(_actor,'admin') AND (_property IS NULL OR NOT has_property_access(_actor,_property)) THEN RAISE EXCEPTION 'Property access required' USING ERRCODE='42501'; END IF;
  UPDATE public.bookings SET manual_guest_name=trim(_full_name) WHERE id=_booking_id;
 ELSE
  PERFORM 1 FROM public.profiles WHERE user_id=_guest_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guest account not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_guest_id AND role <> 'guest') THEN RAISE EXCEPTION 'Staff accounts cannot be edited here' USING ERRCODE='42501'; END IF;
  IF NOT has_role(_actor,'admin') AND (NOT EXISTS (SELECT 1 FROM public.bookings WHERE guest_id=_guest_id) OR EXISTS (SELECT 1 FROM public.bookings WHERE guest_id=_guest_id AND (property_id IS NULL OR NOT has_property_access(_actor,property_id)))) THEN RAISE EXCEPTION 'Access to all account properties required' USING ERRCODE='42501'; END IF;
  UPDATE public.profiles SET full_name=trim(_full_name) WHERE user_id=_guest_id;
  _target := _guest_id;
 END IF;
 INSERT INTO public.staff_audit_events(event_type,severity,actor_id,target_user_id,reason,metadata)
 VALUES ('guest.identity_edited','info',_actor,_target,'Staff corrected guest name',jsonb_build_object('scope',CASE WHEN _booking_id IS NULL THEN 'account' ELSE 'booking' END,'booking_id',_booking_id));
END;
$$;
REVOKE ALL ON FUNCTION public.staff_edit_guest_identity(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_edit_guest_identity(uuid,uuid,text) TO authenticated;