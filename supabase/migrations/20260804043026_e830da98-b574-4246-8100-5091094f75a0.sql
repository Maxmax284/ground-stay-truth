CREATE OR REPLACE FUNCTION public.get_unit_essentials(_unit_id uuid)
 RETURNS TABLE(wifi_network text, wifi_password text, house_rules_detail text, emergency_contact_name text, emergency_contact_phone text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF has_role(auth.uid(), 'front_desk'::app_role)
     OR has_role(auth.uid(), 'front_desk_supervisor'::app_role)
     OR has_role(auth.uid(), 'manager'::app_role)
     OR has_role(auth.uid(), 'admin'::app_role)
  THEN
    RETURN QUERY
      SELECT u.wifi_network, u.wifi_password, u.house_rules_detail,
             u.emergency_contact_name, u.emergency_contact_phone
      FROM public.units u WHERE u.id = _unit_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.unit_id = _unit_id
      AND b.guest_id = auth.uid()
      AND b.state IN ('confirmed'::booking_state, 'checked_in'::booking_state)
  ) THEN
    RETURN QUERY
      SELECT u.wifi_network, u.wifi_password, u.house_rules_detail,
             u.emergency_contact_name, u.emergency_contact_phone
      FROM public.units u WHERE u.id = _unit_id;
  END IF;
END;
$function$;