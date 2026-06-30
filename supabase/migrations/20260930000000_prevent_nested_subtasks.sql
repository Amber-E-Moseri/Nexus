-- Enforce the "one level of nesting" architecture decision for tasks.
--
-- Subtasks are tasks where parent_task_id IS NOT NULL. A subtask may never itself
-- become a parent: if NEW.parent_task_id points at a row that already has its own
-- parent_task_id, reject the write. This guards against sub-subtasks at the DB level
-- regardless of which client path (app, RPC, manual SQL) attempts the insert/update.
--
-- Note: tasks.sort_order (numeric) already exists from 20260724000000_task_sort_order.sql
-- and is reused for subtask drag-to-reorder; no schema change needed for ordering.

create or replace function public.prevent_nested_subtasks()
returns trigger
language plpgsql
as $$
begin
  if new.parent_task_id is not null then
    if exists (
      select 1
      from public.tasks
      where id = new.parent_task_id
        and parent_task_id is not null
    ) then
      raise exception 'Subtasks cannot have subtasks. Only one level of nesting is supported.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_single_level_subtasks on public.tasks;

create trigger enforce_single_level_subtasks
  before insert or update on public.tasks
  for each row execute function public.prevent_nested_subtasks();
