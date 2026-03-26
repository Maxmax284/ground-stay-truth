INSERT INTO public.bookings (guest_id, unit_id, state, check_in, check_out, num_guests, total_price, guest_type)
SELECT 
  'd488ce74-6b08-498d-bc55-a0d5dcff13e2',
  id,
  'pending_deposit',
  '2026-04-15',
  '2026-04-22',
  1,
  35000,
  'training_guest'
FROM public.units WHERE name ILIKE '%sea view%' LIMIT 1;

UPDATE public.policy_settings SET value = '"Ground Stay Co., Ltd."' WHERE key = 'bank_transfer_account_name';
UPDATE public.policy_settings SET value = '"123-456-7890"' WHERE key = 'bank_transfer_account_number';
