DO $$
DECLARE
  _amount numeric;
BEGIN
  SELECT amount INTO _amount
  FROM public.payment_links
  WHERE id = '85afc9c7-23ce-4e99-9b31-95bea7a60782'::uuid;

  IF _amount IS DISTINCT FROM 1354.31::numeric THEN
    RAISE EXCEPTION 'Reconciled payment link amount changed unexpectedly: %', _amount;
  END IF;
END $$;