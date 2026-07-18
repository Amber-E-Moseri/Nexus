-- Calendar reminders schema (Phase 1a)
-- Safe additive migration: reminder configs, reminder log, deliverable task link,
-- and sprint link-back RPC for upcoming event prompts.

alter table public.calendar_event_types
  add column if not exists reminder_configs jsonb default '[]'::jsonb;

insert into public.calendar_event_types (name, color, active, sort_order, reminder_configs)
select v.name, v.color, v.active, v.sort_order, v.reminder_configs
from (
  values
    ('conference', '#6366F1', true, 10, '[]'::jsonb),
    ('program', '#10B981', true, 20, '[{"days_before":60,"sprint_prompt":false},{"days_before":30,"sprint_prompt":false}]'::jsonb),
    ('training', '#F59E0B', true, 30, '[]'::jsonb),
    ('prayer', '#8B5CF6', true, 40, '[]'::jsonb),
    ('graduation', '#EC4899', true, 50, '[]'::jsonb),
    ('event', '#3B82F6', true, 60, '[]'::jsonb),
    ('deadline', '#EF4444', true, 70, '[]'::jsonb),
    ('leave', '#6B7280', true, 75, '[]'::jsonb),
    ('regional_program', '#A855F7', true, 80, '[{"days_before":60,"sprint_prompt":true},{"days_before":30,"sprint_prompt":true}]'::jsonb),
    ('executive_birthday', '#F59E0B', true, 90, '[{"days_before":7,"sprint_prompt":false}]'::jsonb)
) as v(name, color, active, sort_order, reminder_configs)
where not exists (
  select 1 from public.calendar_event_types t where t.name = v.name
);

update public.calendar_event_types
set reminder_configs = '[{"days_before":60,"sprint_prompt":false},{"days_before":30,"sprint_prompt":false}]'::jsonb
where name = 'program'
  and (reminder_configs is null or reminder_configs = '[]'::jsonb);

alter table public.calendar_events
  drop constraint if exists calendar_events_event_type_check;

create or replace function public.validate_calendar_event_type()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.event_type is not distinct from old.event_type then
    return new;
  end if;

  if not exists (
    select 1
    from public.calendar_event_types
    where name = new.event_type
  ) then
    raise exception 'Invalid event_type: %. Must match a calendar_event_types entry.', new.event_type;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_event_type on public.calendar_events;
create trigger trg_validate_event_type
  before insert or update of event_type on public.calendar_events
  for each row execute function public.validate_calendar_event_type();

alter table public.calendar_events
  add column if not exists reminder_overrides jsonb default null;

create table if not exists public.calendar_event_reminder_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  days_before integer not null,
  sent_at timestamptz not null default now(),
  unique (event_id, days_before)
);

alter table public.calendar_event_reminder_log enable row level security;

drop policy if exists "service_role_only" on public.calendar_event_reminder_log;
create policy "service_role_only"
  on public.calendar_event_reminder_log
  for all
  using (false);

alter table public.tasks
  add column if not exists calendar_event_id uuid
    references public.calendar_events(id) on delete set null;

create index if not exists tasks_calendar_event_id_idx
  on public.tasks(calendar_event_id)
  where calendar_event_id is not null;

create or replace function public.link_calendar_event_sprint(p_event_id uuid, p_sprint_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  update public.calendar_events
  set sprint_id = p_sprint_id
  where id = p_event_id
    and status = 'approved'
    and sprint_id is null
    and (
      created_by = auth.uid()
      or public.current_user_role() = 'super_admin'
      or department_id = public.current_user_department()
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.link_calendar_event_sprint(uuid, uuid) to authenticated;

-- Add unique constraint on calendar_event_types.name to prevent ambiguous rename/delete operations
-- (identity by name is used by cascadeRenameEventType, getEventTypeUsageCount, validate_calendar_event_type)
alter table public.calendar_event_types
  add constraint calendar_event_types_name_key unique (name);

-- Register the daily cron job for calendar event reminders
-- The calendar-event-reminders edge function processes upcoming events (within their reminder windows)
-- and sends notifications. This runs once per day; the function handles idempotency via
-- calendar_event_reminder_log unique (event_id, days_before) constraint.
select cron.schedule(
  'calendar-event-reminders',
  '0 6 * * *',  -- 6 AM UTC daily
  $$select net.http_post(
    url := current_setting('app.calendar_reminders_url'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.calendar_reminders_token')),
    body := '{}'::jsonb
  );$$
) on conflict (jobname) do update set schedule = '0 6 * * *';

comment on function public.validate_calendar_event_type() is
  'Trigger function that ensures calendar_event is linked to a real calendar_event_types entry. Called on insert/update of event_type.';

comment on function public.link_calendar_event_sprint(uuid, uuid) is
  'RPC: link an approved calendar event to a sprint for event/sprint coordination. Respects ownership + dept + super_admin auth.';
