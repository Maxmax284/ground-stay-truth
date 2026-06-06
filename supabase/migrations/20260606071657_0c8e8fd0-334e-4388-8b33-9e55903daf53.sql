
UPDATE public.payments
SET status = 'recorded',
    provider_status = 'completed',
    description = COALESCE(description, '') || ' [manually reconciled — webhook missed]'
WHERE id = 'ba5307d4-ab6c-4a49-a497-85c2e15cfec7'
  AND status = 'pending';

-- Cancel the duplicate auto-created pending obligation that was superseded
UPDATE public.payments
SET status = 'cancelled',
    description = COALESCE(description, '') || ' [superseded by online deposit ba5307d4]'
WHERE id = '2d871442-5e35-48ce-a892-83c643dbf68d'
  AND status = 'pending';

UPDATE public.bookings
SET state = 'confirmed'
WHERE id = '4d5ec270-55d1-49ec-a170-90dfbeb3fe0f'
  AND state = 'pending_deposit';

INSERT INTO public.booking_state_log (booking_id, from_state, to_state, reason)
VALUES ('4d5ec270-55d1-49ec-a170-90dfbeb3fe0f', 'pending_deposit', 'confirmed',
        'Online deposit (1766 THB) manually reconciled — Stripe webhook did not fire');
