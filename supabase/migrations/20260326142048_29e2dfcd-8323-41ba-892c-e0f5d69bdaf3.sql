INSERT INTO public.policy_settings (key, value, description)
VALUES
  ('wifi_network_name', '"Ground Stay WiFi"', 'WiFi network name shown in welcome email'),
  ('wifi_password', '"welcome2024"', 'WiFi password shown in welcome email'),
  ('house_rules_summary', '"No smoking indoors. Quiet hours 10 PM – 7 AM. No outside guests after 9 PM. Shoes off at the door."', 'Brief house rules for welcome email'),
  ('emergency_contact_name', '"Front Desk"', 'Emergency contact name for welcome email'),
  ('emergency_contact_phone', '"+66 XX XXX XXXX"', 'Emergency contact phone for welcome email')
ON CONFLICT (key) DO NOTHING;