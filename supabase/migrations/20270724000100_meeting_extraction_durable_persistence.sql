-- =============================================================================
-- Durable AI-extraction persistence for meetings
-- -----------------------------------------------------------------------------
-- AI Extract results previously lived only in React state (AudioTranscriptionPanel,
-- the "Audio" tab) or a 72h-TTL localStorage mirror (MeetingDetailView's "AI
-- Extract" tab) — never written server-side. Since the source recording may
-- not exist anywhere else, losing an in-progress or just-completed extraction
-- to a tab switch, refresh-past-TTL, or device change meant losing real work
-- with no way to regenerate it.
--
-- 20260628000000_meeting_caching_foundation.sql (which adds
-- extraction_cache/extraction_cached_at/etc via ADD COLUMN IF NOT EXISTS)
-- is tracked as applied in this project's migration history, but the live
-- `meetings` table does not actually have these columns — confirmed by a
-- failed push attempt (`column "extraction_cache" does not exist`,
-- SQLSTATE 42703). History and live schema have drifted for this one; not
-- something this migration can safely investigate further, so it no longer
-- assumes the dormant columns exist. Adds the five extraction-bookkeeping
-- columns directly instead of renaming — idempotent regardless of whether
-- the old columns are actually present on any given environment.
-- =============================================================================

alter table public.meetings
  add column if not exists extraction_result jsonb default null,
  add column if not exists extraction_completed_at timestamptz default null,
  add column if not exists extraction_status text not null default 'idle'
    check (extraction_status in ('idle', 'processing', 'complete', 'failed')),
  add column if not exists extraction_started_at timestamptz,
  add column if not exists extraction_error text;

-- extraction_cache_valid / transcript_hash: dead (per grep across src/ and
-- supabase/functions/) wherever they do exist — dropped defensively with
-- IF EXISTS since, per the above, we can no longer assume any particular
-- environment actually has them.
alter table public.meetings
  drop column if exists extraction_cache_valid,
  drop column if exists transcript_hash;

create index if not exists idx_meetings_extraction_status
  on public.meetings(extraction_status) where extraction_status = 'processing';

comment on column public.meetings.extraction_result is
  'Durable raw JSON result of the last completed extract-meeting-data run for this meeting. Written server-side by the edge function itself (both streaming and non-streaming paths), independent of which UI triggered it.';

-- -----------------------------------------------------------------------------
-- Trigger extension: let the edge function's service-role client persist
-- extraction results, WITHOUT opening a blanket exemption that any ordinary
-- non-editor viewer could also exploit via a direct client write.
--
-- enforce_meetings_summary_only_update() (20270723000006) only checks WHICH
-- columns changed, not WHO changed them — a plain column-based exemption
-- (adding these five columns to the same exempt set as `summary`) would let
-- any authenticated non-editor viewer who can reach the row under
-- meetings_update freely rewrite extraction_result/extraction_status/
-- extraction_error directly via the client (fabricate results, forge
-- errors, flip status back to 'processing' repeatedly).
--
-- auth.uid() IS NULL is true only for a service-role JWT (no `sub` claim) —
-- never reachable by a client-side non-editor write. So: full editors keep
-- their existing unconditional exemption; a service-role caller additionally
-- gets the five extraction columns; an ordinary non-editor viewer keeps
-- exactly today's summary-only exemption, unchanged.
-- =============================================================================

create or replace function public.enforce_meetings_summary_only_update()
returns trigger as $$
declare
  old_rest jsonb;
  new_rest jsonb;
begin
  if public.is_meetings_full_editor(old.created_by, old.department_id, old.visibility, old.allowed_editors) then
    return new;
  end if;

  if auth.uid() is null then
    old_rest := to_jsonb(old) - 'summary' - 'updated_at'
      - 'extraction_result' - 'extraction_status' - 'extraction_started_at'
      - 'extraction_completed_at' - 'extraction_error';
    new_rest := to_jsonb(new) - 'summary' - 'updated_at'
      - 'extraction_result' - 'extraction_status' - 'extraction_started_at'
      - 'extraction_completed_at' - 'extraction_error';
  else
    old_rest := to_jsonb(old) - 'summary' - 'updated_at';
    new_rest := to_jsonb(new) - 'summary' - 'updated_at';
  end if;

  if old_rest is distinct from new_rest then
    raise exception 'Only the summary field can be updated without meeting-edit permission';
  end if;

  return new;
end;
$$ language plpgsql;
