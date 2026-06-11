-- Phase 0: Activate sibling units so real inventory matches the calendar.
-- Scope: only units currently is_active=false in the 5 groups below.
-- Safe-list by exact unit name to avoid touching anything unintended.

UPDATE public.units
SET is_active = true, updated_at = now()
WHERE is_active = false
  AND name IN (
    -- Standard Single (activate 12–16)
    'Standard Single 12','Standard Single 13','Standard Single 14','Standard Single 15','Standard Single 16',
    -- Superior Single (activate 2–5)
    'Superior Single 2','Superior Single 3','Superior Single 4','Superior Single 5',
    -- Superior Double (activate 7)
    'Superior Double 7',
    -- Superior Twin (activate 9, 10)
    'Superior Twin 9','Superior Twin 10',
    -- Sea View Villa (Lower Level) (activate 2–5)
    'Sea View Villa (lower level) 2','Sea View Villa (lower level) 3','Sea View Villa (lower level) 4','Sea View Villa (lower level) 5'
  );