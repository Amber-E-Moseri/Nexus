-- ICPLC Email Event Scoping
-- Extends the communications engine to support event-scoped (ICPLC) campaigns.
--
-- Changes:
--   communication_campaigns   → add recipient_type + event_config_id + invariant CHECK
--   communication_email_templates → add event_config_id + scoped RLS
--   communication_sends       → add source_participant_id (informational, no FK)
--
-- Regression guarantee:
--   All existing campaigns get recipient_type='org' (DEFAULT) and event_config_id=NULL.
--   Both satisfy the CHECK constraint. No existing writer is affected.

-- ─────────────────────────────────────────────────────────────────────────────
-- communication_campaigns: event scope
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.communication_campaigns
  ADD COLUMN IF NOT EXISTS recipient_type text NOT NULL DEFAULT 'org',
  ADD COLUMN IF NOT EXISTS event_config_id uuid
    REFERENCES public.event_configs(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'communication_campaigns'
      AND constraint_name = 'campaigns_recipient_type_check'
  ) THEN
    ALTER TABLE public.communication_campaigns
      ADD CONSTRAINT campaigns_recipient_type_check
        CHECK (recipient_type IN ('org', 'icplc'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'communication_campaigns'
      AND constraint_name = 'campaigns_event_config_invariant'
  ) THEN
    ALTER TABLE public.communication_campaigns
      ADD CONSTRAINT campaigns_event_config_invariant
        CHECK ((recipient_type = 'org') = (event_config_id IS NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS communication_campaigns_event_config_id_idx
  ON public.communication_campaigns (event_config_id)
  WHERE event_config_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- communication_email_templates: event scope
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.communication_email_templates
  ADD COLUMN IF NOT EXISTS event_config_id uuid
    REFERENCES public.event_configs(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS communication_email_templates_event_config_id_idx
  ON public.communication_email_templates (event_config_id)
  WHERE event_config_id IS NOT NULL;

-- NULL event_config_id = org-wide template (all authenticated can see it).
-- Non-null = ICPLC-scoped template (requires write access to ICPLC participants).
DROP POLICY IF EXISTS "email_templates_select" ON public.communication_email_templates;
CREATE POLICY "email_templates_select"
  ON public.communication_email_templates FOR SELECT TO authenticated
  USING (
    event_config_id IS NULL
    OR (
      event_config_id IS NOT NULL
      AND public.icplc_can_read_participants()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- communication_sends: participant trace
-- Populated only for ICPLC sends; NULL for all org campaigns.
-- No FK — participant hard-deletion leaves a dangling UUID, which is acceptable
-- since this column is informational only (not used in any query path).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.communication_sends
  ADD COLUMN IF NOT EXISTS source_participant_id uuid;
