INSERT INTO public.policy_settings (key, value, description) VALUES
  ('bank_transfer_bank_name', '"Bangkok Bank"', 'Bank name shown to guests for bank transfer deposits'),
  ('bank_transfer_account_name', '""', 'Account holder name for bank transfer deposits'),
  ('bank_transfer_account_number', '""', 'Bank account number for bank transfer deposits'),
  ('bank_transfer_notes', '"Please transfer the exact deposit amount and include your booking reference."', 'Additional instructions shown to guests for bank transfer')
ON CONFLICT (key) DO NOTHING;