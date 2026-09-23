DROP POLICY "Guests mark own pickup messages read" ON public.pickup_driver_messages;
DROP POLICY "Property staff mark pickup messages read" ON public.pickup_driver_messages;
REVOKE UPDATE ON public.pickup_driver_messages FROM authenticated;

COMMENT ON COLUMN public.pickup_driver_messages.content IS 'Immutable after insert; read receipts are updated only by the validated pickup service.';