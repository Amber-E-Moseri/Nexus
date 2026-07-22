-- Enable realtime for the tasks table. Discovered while fixing the My Tasks
-- "Delegated" tab (see 20270720000021 area of work): `public.tasks` was never
-- added to the supabase_realtime publication, so every postgres_changes
-- subscription against it anywhere in the app (My Tasks, Kanban boards,
-- Sprint boards, TasksContext, usePersonalList, useMyTaskCounts) has silently
-- received zero events in production. Every "realtime sync" comment on
-- tasks-related channels has been dead code — the app has only ever updated
-- live via explicit refetches (handleSaved, handleTaskStatusChange, page
-- navigation).
--
-- Guarded (not a bare ALTER PUBLICATION) because this table was already added
-- manually against the linked remote database during diagnosis, before this
-- migration existed — re-running a bare ADD TABLE would error with
-- "relation already member of publication" when this migration replays.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
    )
  then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

-- Second, related gap found while smoke-testing the above: `tasks` had
-- REPLICA IDENTITY DEFAULT, which only puts primary-key columns in the "old"
-- row Postgres hands to logical replication for UPDATE/DELETE. Realtime's
-- server-side column filter (department_id=eq., sprint_id=eq., assignee_id=
-- eq., created_by=eq.) needs that column present in the old row to evaluate
-- a DELETE against it — without FULL, every filtered DELETE subscription on
-- tasks silently never fires, even though INSERT/UPDATE now do. Confirmed via
-- live test: dept-board and sprint-board channels saw INSERT+UPDATE but not
-- DELETE until this was applied. Same pattern already used for
-- app_notifications (20260901000000_native_communications_system.sql:54).
alter table public.tasks replica identity full;
