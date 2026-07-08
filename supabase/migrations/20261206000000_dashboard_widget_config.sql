-- Per-widget configuration (data source / metric / chart type / group-by)
-- for user-configurable widgets like Chart Widget and Calculation Widget.
-- One config per widget_key per user, matching the existing one-row-per-
-- widget-type model in dashboard_preferences.

ALTER TABLE public.dashboard_preferences
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.dashboard_role_defaults
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;
