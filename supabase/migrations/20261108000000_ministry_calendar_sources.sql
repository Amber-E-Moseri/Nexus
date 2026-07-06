-- ============================================================
-- Ministry Calendar Multi-Source Sync — Phase 1
-- Global (no org_id — this project has no org/multi-tenant concept;
-- confirmed against the live DB before writing this migration).
-- ============================================================

-- Singleton shared Google connection. One OAuth account covers all sources
-- (Birthdays/Holidays/etc are all visible via that account's calendarList),
-- so sources don't each need their own OAuth dance.
CREATE TABLE public.ministry_calendar_connection (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token   TEXT NOT NULL,
  refresh_token  TEXT NOT NULL,
  token_expiry   TIMESTAMPTZ NOT NULL,
  connected_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  connected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.ministry_calendar_connection.access_token IS
  'Plaintext (matches google_calendar_tokens precedent; Vault extension is disabled in this project — see 20261107000001_token_security_notes.sql). TODO: migrate to Vault when enabled.';
COMMENT ON COLUMN public.ministry_calendar_connection.refresh_token IS
  'Plaintext — see access_token comment.';

-- Hard singleton backstop at the DB layer (edge function also enforces this
-- via delete-then-insert rather than upsert, since a partial/expression
-- index isn't usable as a PostgREST upsert onConflict target).
CREATE UNIQUE INDEX ministry_calendar_connection_singleton_idx
  ON public.ministry_calendar_connection ((true));

ALTER TABLE public.ministry_calendar_connection ENABLE ROW LEVEL SECURITY;

-- Admin-only, no SELECT policy for regular users at all — this table holds
-- live OAuth secrets and has no per-user ownership (unlike google_calendar_tokens).
CREATE POLICY "ministry_calendar_connection_admin_only"
  ON public.ministry_calendar_connection
  FOR ALL
  USING (
    auth.jwt() ->> 'user_role' = 'super_admin'
    OR EXISTS (SELECT 1 FROM public.calendar_permissions
               WHERE user_id = auth.uid() AND can_manage = TRUE)
  );

-- ── Sources list ─────────────────────────────────────────────

CREATE TABLE public.ministry_calendar_sources (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_calendar_id TEXT NOT NULL,
  display_name       TEXT NOT NULL,
  color              TEXT,
  sync_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  is_read_only       BOOLEAN NOT NULL DEFAULT FALSE,
  push_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at     TIMESTAMPTZ,
  last_sync_error    TEXT,
  created_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (google_calendar_id)
);

-- Only one source may ever push Nexus -> Google (the "primary" org calendar).
-- Enforced via plain UPDATE in the edge function, not upsert-onConflict, so a
-- partial index is fine here (no arbiter-inference issue like the singleton
-- connection table above).
CREATE UNIQUE INDEX ministry_calendar_sources_one_push_idx
  ON public.ministry_calendar_sources ((true)) WHERE push_enabled = TRUE;

CREATE INDEX ministry_calendar_sources_sync_enabled_idx
  ON public.ministry_calendar_sources(sync_enabled) WHERE sync_enabled = TRUE;

ALTER TABLE public.ministry_calendar_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ministry_calendar_sources_admin_write"
  ON public.ministry_calendar_sources
  FOR ALL
  USING (
    auth.jwt() ->> 'user_role' = 'super_admin'
    OR EXISTS (SELECT 1 FROM public.calendar_permissions
               WHERE user_id = auth.uid() AND can_manage = TRUE)
  );

-- Deliberately open to all authenticated users (NOT admin-only) — everyone
-- needs to read display_name/color to render their personal visibility
-- toggles. Do not "fix" this into admin-only; it would break that UI.
CREATE POLICY "ministry_calendar_sources_read_all"
  ON public.ministry_calendar_sources
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── calendar_events additions ────────────────────────────────
-- source_id stays NULL for existing/manual rows — that's correct, not a gap.
-- Most events in this system are manually created/approved org events, not
-- Google-synced; only pulled-from-Google events ever get a source_id.
--
-- synced_to_google/synced_from_google reintroduce just these two columns
-- from the 20260625000000 batch that was reverted outside of migration
-- history in production (see docs/audits/CALENDAR_SYNC_AUDIT.md) — nothing
-- else from that batch is being restored.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.ministry_calendar_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS synced_to_google   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS synced_from_google BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS calendar_events_source_id_idx
  ON public.calendar_events(source_id) WHERE source_id IS NOT NULL;

-- Plain (non-partial) unique constraint — NOT a WHERE-scoped partial index.
-- Postgres treats NULL as distinct per-column in multi-column unique
-- constraints, so rows with source_id/google_event_id both NULL (all
-- existing manual events) never collide with each other or with real synced
-- rows. This also means supabase-js .upsert({..}, {onConflict:
-- 'source_id,google_event_id'}) works directly — a partial index would NOT
-- be usable as an onConflict target through the JS client.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_source_google_event_idx
  ON public.calendar_events(source_id, google_event_id);

-- ── sync_failures addition (Phase 0 table, needs one more column) ───

ALTER TABLE public.sync_failures
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.ministry_calendar_sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sync_failures_source_id_idx
  ON public.sync_failures(source_id) WHERE source_id IS NOT NULL;
