-- Add source_channel column to payments table
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS source_channel text NOT NULL DEFAULT 'front_desk';

-- Add comment for documentation
COMMENT ON COLUMN public.payments.source_channel IS 'Where payment was recorded: front_desk, guest_portal, supervisor_override';