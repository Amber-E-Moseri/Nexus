-- User preferences for how task date changes cascade to subtasks and dependencies.
create table if not exists public.user_task_settings (
  user_id                     uuid primary key references public.users(id) on delete cascade,
  remap_subtask_dates         boolean not null default true,
  include_closed_in_remap     boolean not null default false,
  reschedule_dependencies     boolean not null default true,
  include_closed_in_reschedule boolean not null default false,
  updated_at                  timestamptz not null default now()
);

alter table public.user_task_settings enable row level security;

create policy "Users manage their own task settings"
  on public.user_task_settings
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Trigger function: cascade date changes from a parent task to subtasks
-- and/or downstream dependents, respecting the acting user's preferences.
create or replace function public.handle_task_date_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta          interval;
  v_settings       record;
  v_closed_cats    text[] := array['completed', 'cancelled'];

  -- Status category lookup for the acting task
  v_status_cat     text;
begin
  -- Only act on due_date changes; ignore inserts with no due date
  if (TG_OP = 'UPDATE' and old.due_date is not distinct from new.due_date) then
    return new;
  end if;

  if new.due_date is null or old.due_date is null then
    return new;
  end if;

  v_delta := new.due_date::date - old.due_date::date;
  if v_delta = '0 days'::interval then
    return new;
  end if;

  -- Load the acting user's cascade preferences (fall back to defaults if missing)
  select
    coalesce(uts.remap_subtask_dates,         true)  as remap_subtask_dates,
    coalesce(uts.include_closed_in_remap,     false) as include_closed_in_remap,
    coalesce(uts.reschedule_dependencies,     true)  as reschedule_dependencies,
    coalesce(uts.include_closed_in_reschedule,false) as include_closed_in_reschedule
  into v_settings
  from (select auth.uid() as uid) me
  left join public.user_task_settings uts on uts.user_id = me.uid;

  -- 1. Remap subtask due dates
  if v_settings.remap_subtask_dates then
    update public.tasks t
    set due_date = (t.due_date::date + v_delta)::date
    where t.parent_task_id = new.id
      and t.due_date is not null
      and (
        v_settings.include_closed_in_remap
        or not exists (
          select 1
          from public.task_status_definitions tsd
          where tsd.id = t.status_id
            and tsd.category = any(v_closed_cats)
        )
      );
  end if;

  -- 2. Reschedule downstream dependents (tasks blocked by this one)
  if v_settings.reschedule_dependencies then
    update public.tasks t
    set due_date = (t.due_date::date + v_delta)::date
    from public.task_dependencies td
    where td.depends_on_id = new.id
      and td.task_id = t.id
      and t.due_date is not null
      and (
        v_settings.include_closed_in_reschedule
        or not exists (
          select 1
          from public.task_status_definitions tsd
          where tsd.id = t.status_id
            and tsd.category = any(v_closed_cats)
        )
      );
  end if;

  return new;
end;
$$;

-- Attach trigger (idempotent via drop-if-exists)
drop trigger if exists on_task_due_date_change on public.tasks;

create trigger on_task_due_date_change
  after update of due_date on public.tasks
  for each row
  execute function public.handle_task_date_change();
