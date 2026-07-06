-- ============================================================
-- Per-user Ministry Calendar source visibility preferences
-- Follows the calendar_category_visibility fail-open convention (see
-- src/features/calendar/hooks/useCategoryVisibility.js): a missing row
-- means visible; hiding a source upserts hidden=true; showing it again
-- deletes the row. Reuses an existing codebase pattern rather than the
-- literal is_visible-boolean schema from the original build prompt.
-- ============================================================

CREATE TABLE public.user_calendar_source_preferences (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_id  UUID NOT NULL REFERENCES public.ministry_calendar_sources(id) ON DELETE CASCADE,
  hidden     BOOLEAN NOT NULL DEFAULT TRUE,  -- row only ever exists when hidden=true
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, source_id)
);

CREATE INDEX user_calendar_source_preferences_source_idx
  ON public.user_calendar_source_preferences(source_id);

ALTER TABLE public.user_calendar_source_preferences ENABLE ROW LEVEL SECURITY;

-- Purely personal — no admin bypass needed (unlike calendar_category_visibility,
-- which is role-wide and admin-managed).
CREATE POLICY "user_calendar_source_prefs_own"
  ON public.user_calendar_source_preferences
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
