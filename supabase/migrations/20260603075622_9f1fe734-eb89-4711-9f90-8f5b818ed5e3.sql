-- Wire emit_vanta_signal() to operational tables.
-- Safe to re-run: drop-then-create each trigger.

DROP TRIGGER IF EXISTS trg_vanta_emit_bookings ON public.bookings;
CREATE TRIGGER trg_vanta_emit_bookings
AFTER INSERT OR UPDATE OF state ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.emit_vanta_signal();

DROP TRIGGER IF EXISTS trg_vanta_emit_messages ON public.messages;
CREATE TRIGGER trg_vanta_emit_messages
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.emit_vanta_signal();

DROP TRIGGER IF EXISTS trg_vanta_emit_maintenance ON public.maintenance_requests;
CREATE TRIGGER trg_vanta_emit_maintenance
AFTER INSERT ON public.maintenance_requests
FOR EACH ROW EXECUTE FUNCTION public.emit_vanta_signal();

DROP TRIGGER IF EXISTS trg_vanta_emit_laundry ON public.laundry_requests;
CREATE TRIGGER trg_vanta_emit_laundry
AFTER INSERT ON public.laundry_requests
FOR EACH ROW EXECUTE FUNCTION public.emit_vanta_signal();