-- Backfill "To Do" into every space that has per-space statuses but is missing it.
-- get_space_statuses() returns only per-space rows when any exist, so spaces
-- created before 20260623 (or cloned without it) silently drop "To Do".

-- Fix existing "To Do" rows that have wrong legacy_key / is_default so the RPC
-- and task-remapping step below can find them reliably.
update public.task_status_definitions
set
  legacy_key  = 'to_do',
  is_default  = true,
  active      = true
where department_id is not null
  and lower(name) = 'to do'
  and (legacy_key is distinct from 'to_do' or is_default is distinct from true);

-- Insert "To Do" only for spaces that truly have no row with that name yet.
insert into public.task_status_definitions (
  name, color, category, department_id, sort_order, is_default, active, legacy_key
)
select
  'To Do',
  '#378ADD',
  'open',
  d.id,
  0,
  true,
  true,
  'to_do'
from public.departments d
where
  exists (
    select 1 from public.task_status_definitions tsd
    where tsd.department_id = d.id
  )
  and not exists (
    select 1 from public.task_status_definitions tsd
    where tsd.department_id = d.id
      and lower(tsd.name) = 'to do'
  )
;

-- Demote any other per-space status that was incorrectly marked is_default=true
-- now that To Do is the canonical default.
update public.task_status_definitions
set is_default = false
where department_id is not null
  and legacy_key <> 'to_do'
  and is_default = true;

-- Remap tasks that reference a global status ID to the matching per-space status.
-- This happens when a space gained per-space statuses AFTER tasks were created with
-- global status IDs — get_space_statuses() will no longer return those global rows,
-- so the tasks fall off every status bucket in the UI.
update public.tasks t
set status_id = space_status.id
from public.task_status_definitions global_status,
     public.task_status_definitions space_status
where t.status_id = global_status.id
  and global_status.department_id is null          -- task points at a global status
  and space_status.legacy_key = global_status.legacy_key
  and space_status.department_id = t.department_id -- matching per-space status
  and t.department_id is not null
  and exists (
    select 1 from public.task_status_definitions
    where department_id = t.department_id
  );
