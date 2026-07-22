-- sync_task_department_id: derives tasks.department_id from sprint/team structure.
-- On INSERT: sets department_id (null if unresolvable — correct default).
-- On UPDATE of sprint_id/assignee_id: overwrites only when a value can be derived.
--   If resolution comes up empty on UPDATE, preserves existing department_id
--   (prevents silently wiping a space task that gets linked to a custom sprint).
-- Exception: assignee change that can't resolve in a non-single-dept sprint
--   explicitly clears department_id — the task leaves the space view.
--
-- External/temporary members (sprint_members.is_temporary = true) are explicitly
-- excluded from team-based resolution. Even if added to sprint_team_members, their
-- tasks stay sprint-only + My Tasks, never surface in space views.
--
-- Assumption: sprints.department_id is set-once at creation and not changed after.
-- The SprintModal edit path does not expose it. If this changes, add a trigger
-- on sprints.department_id to re-derive all tasks in that sprint.
--
-- Backfill (below) only writes department_id, which is not in the trigger's
-- OF list, so it won't re-fire the trigger. No loop/double-write risk.

create or replace function public.sync_task_department_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sprint_dept_id uuid;
  v_team_dept_id   uuid;
  v_is_insert      boolean := (TG_OP = 'INSERT');
begin
  if new.sprint_id is null then
    return new;
  end if;

  -- Priority 1: sprint's own department_id (single-dept sprints)
  select department_id into v_sprint_dept_id
  from public.sprints where id = new.sprint_id;

  if v_sprint_dept_id is not null then
    new.department_id := v_sprint_dept_id;
    return new;
  end if;

  -- Priority 2: assignee's team department_id (multi-dept sprints)
  -- Excludes external/temporary members — they never get space visibility.
  if new.assignee_id is not null then
    select st.department_id into v_team_dept_id
    from public.sprint_team_members stm
    join public.sprint_teams st on st.id = stm.team_id
    where st.sprint_id = new.sprint_id
      and stm.user_id = new.assignee_id
      and st.department_id is not null
      and not exists (
        select 1 from public.sprint_members sm
        where sm.sprint_id = new.sprint_id
          and sm.user_id = new.assignee_id
          and sm.is_temporary = true
      )
    order by st.created_at asc
    limit 1;

    if v_team_dept_id is not null then
      new.department_id := v_team_dept_id;
      return new;
    end if;
  end if;

  -- Priority 3: no resolution possible
  if v_is_insert then
    new.department_id := null;
  elsif new.assignee_id is distinct from old.assignee_id and v_sprint_dept_id is null then
    new.department_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_task_department_id on public.tasks;
create trigger trg_sync_task_department_id
  before insert or update of sprint_id, assignee_id
  on public.tasks
  for each row
  execute function public.sync_task_department_id();

-- Backfill existing sprint tasks with null department_id.

-- Pass 1: single-dept sprints
update public.tasks t
set department_id = s.department_id
from public.sprints s
where t.sprint_id = s.id
  and t.department_id is null
  and s.department_id is not null;

-- Pass 2: multi-dept sprints — assignee's team (earliest team wins)
-- Excludes external/temporary members, matching trigger behavior.
update public.tasks t
set department_id = sub.dept_id
from (
  select distinct on (t2.id) t2.id as task_id, st.department_id as dept_id
  from public.tasks t2
  join public.sprint_team_members stm on stm.user_id = t2.assignee_id
  join public.sprint_teams st on st.id = stm.team_id and st.sprint_id = t2.sprint_id
  where t2.department_id is null
    and t2.sprint_id is not null
    and t2.assignee_id is not null
    and st.department_id is not null
    and not exists (
      select 1 from public.sprint_members sm
      where sm.sprint_id = t2.sprint_id
        and sm.user_id = t2.assignee_id
        and sm.is_temporary = true
    )
  order by t2.id, st.created_at asc
) sub
where t.id = sub.task_id;
