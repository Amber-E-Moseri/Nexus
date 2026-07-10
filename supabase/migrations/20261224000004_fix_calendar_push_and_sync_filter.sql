-- Fix 1: Drop single-push enforcement — allow multiple sources to have push enabled.
-- The original partial unique index on (true) WHERE push_enabled = TRUE limited push
-- to exactly one source at a time. This is overly restrictive; admins should be able
-- to push approved events to multiple Google calendars simultaneously.
DROP INDEX IF EXISTS public.ministry_calendar_sources_one_push_idx;

-- Fix 2: (Frontend-only) Google-synced events arrive with event_type = 'event',
-- which is not a custom Nexus event type. The Ministry Calendar's event-type filter
-- was silently hiding all synced events because 'event' was never in selectedEventTypes.
-- Fixed in MinistryCalendar.jsx: events with source_id bypass the event-type filter
-- (they're controlled by source-level visibility instead).
-- No DB change needed for Fix 2 — this comment documents what changed.
