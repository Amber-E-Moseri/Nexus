-- Task archival: a new, orthogonal concept from status. A task keeps its
-- "Completed" status and separately becomes archived (archived_at set),
-- so it stops cluttering department/space boards and personal lists but
-- stays fully accessible via a dedicated Archive view (mirrors how
-- deleted_at/Trash works — see 20270720000017_task_trash.sql).
--
-- Deliberately a single archived_at timestamptz column, not a redundant
-- is_archived boolean (unlike sprints.is_archived + sprints.archived_at):
-- this table already has the single-timestamp-column precedent in
-- deleted_at, and one column means one thing to set/clear/check instead of
-- two that can drift out of sync.

alter table public.tasks add column if not exists archived_at timestamptz;

-- Partial indexes mirror the shape of sprints_is_archived_end_date_idx
-- (20260624000003) — cheap because they only index the common "not
-- archived" case that every board/list query filters on.
create index if not exists tasks_department_archived_idx
  on public.tasks (department_id) where archived_at is null;

create index if not exists tasks_assignee_archived_idx
  on public.tasks (assignee_id) where archived_at is null;

comment on column public.tasks.archived_at is
  'When set, the task is archived: hidden from boards/lists via RLS (see task_archive_rls migration) but still accessible through get_archived_tasks()/the Archive view. Independent of status — an archived task typically stays "Completed".';
