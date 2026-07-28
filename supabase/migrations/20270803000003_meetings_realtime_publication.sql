-- Enable realtime for the meetings table. Discovered while diagnosing a
-- permanently-stuck "Claude is reading the transcript..." AI-extraction
-- spinner: useExtractionStatus.js subscribes to postgres_changes UPDATE
-- events on public.meetings (filter: id=eq.<meetingId>) to learn when
-- extraction_status flips from 'processing' to 'complete'/'failed'. That
-- subscription has been dead code in production — public.meetings was never
-- added to the supabase_realtime publication, so no client has ever received
-- a live update. The edge function's write to extraction_status/
-- extraction_result always succeeds (confirmed live: rows reach 'complete'
-- within seconds), but the UI only reflects it after a manual page reload,
-- which re-runs useExtractionStatus's initial one-shot fetch.
--
-- Same bug class as 20270720000027_tasks_realtime_publication.sql (tasks had
-- the identical gap). Filter here is on `id`, the primary key, which is
-- already included under REPLICA IDENTITY DEFAULT — unlike the tasks case
-- (filtered on department_id/sprint_id/assignee_id/created_by), no
-- REPLICA IDENTITY FULL change is needed.
--
-- Guarded (not a bare ALTER PUBLICATION) in case this gets added manually
-- against the linked remote database during diagnosis before this migration
-- replays.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meetings'
    )
  then
    alter publication supabase_realtime add table public.meetings;
  end if;
end $$;
