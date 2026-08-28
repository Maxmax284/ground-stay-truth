DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payment_links
    WHERE id = '85afc9c7-23ce-4e99-9b31-95bea7a60782'::uuid
      AND metadata->>'reconciliation_reason' = 'modify_stay_link_used_delta_instead_of_live_outstanding'
  ) THEN
    NULL;
  END IF;
END $$;