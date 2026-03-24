ALTER TABLE public.pricing_rules 
  ADD COLUMN weekend_price numeric DEFAULT NULL,
  ADD COLUMN adjustment_type text NOT NULL DEFAULT 'absolute',
  ADD COLUMN adjustment_value numeric DEFAULT NULL,
  ADD COLUMN min_nights integer DEFAULT NULL;