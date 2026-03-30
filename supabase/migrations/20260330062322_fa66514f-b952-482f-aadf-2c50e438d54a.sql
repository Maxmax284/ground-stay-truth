ALTER TABLE public.units ADD COLUMN max_extra_beds integer NOT NULL DEFAULT 0;
ALTER TABLE public.units ADD COLUMN extra_bed_fee numeric DEFAULT 0;