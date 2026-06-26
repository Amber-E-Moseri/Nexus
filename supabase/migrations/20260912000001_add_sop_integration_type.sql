-- ============================================================
-- Add SOP (Standard Operating Procedure) as integration type
-- ============================================================

-- Update the type constraint to include 'sop'
ALTER TABLE public.external_integrations
  DROP CONSTRAINT IF EXISTS external_integrations_type_check;

ALTER TABLE public.external_integrations
  ADD CONSTRAINT external_integrations_type_check
  CHECK (type IN ('foundation_school', 'zoom', 'canva', 'google_drive', 'custom', 'sop'));

-- Recategorize Foundation School as 'sop' type (it was 'foundation_school')
UPDATE public.external_integrations
  SET type = 'sop'
  WHERE type = 'foundation_school';

-- ─── Add a category column for SOP organization ──────────────

ALTER TABLE public.external_integrations
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT NULL;

-- ─── Example: Seed additional SOPs ────────────────────────────

-- Uncomment and customize as needed:
-- INSERT INTO public.external_integrations
--   (name, type, category, launch_url, icon_emoji, enabled, show_in_sidebar)
-- VALUES
--   ('Ministry Operations SOP', 'sop', 'operations', '/sops/ministry-operations.html', '📋', true, true),
--   ('Leadership Training SOP', 'sop', 'training', '/sops/leadership-training.html', '🎓', true, true);

COMMENT ON COLUMN public.external_integrations.type IS
  'Integration type: sop (Standard Operating Procedure), foundation_school, zoom, canva, google_drive, custom';

COMMENT ON COLUMN public.external_integrations.category IS
  'Optional category for organizing SOPs: operations, training, finance, pastoral, etc.';
