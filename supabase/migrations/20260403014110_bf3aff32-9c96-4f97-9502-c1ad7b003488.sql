
-- Phase 1: Add assist_mode confidence layer to airport_pickups
ALTER TABLE public.airport_pickups
  ADD COLUMN IF NOT EXISTS assist_mode text NOT NULL DEFAULT 'healthy',
  ADD COLUMN IF NOT EXISTS assist_reason text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assist_activated_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assist_resolved_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assist_activated_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assist_resolved_by uuid DEFAULT NULL;

-- Add constraint to validate assist_mode values
ALTER TABLE public.airport_pickups
  ADD CONSTRAINT airport_pickups_assist_mode_check
  CHECK (assist_mode IN ('healthy', 'degraded', 'manual_assist', 'recovery_pending'));
