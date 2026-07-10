-- Flock CRM: auto-provision per-pastor data + realtime for the dashboard widget
--
-- 1) Trigger: when a user is created with (or promoted to) the pastor or
--    regional_secretary role, seed their flock_settings defaults and surface
--    the flock_calls_due dashboard widget for users with a customized layout.
-- 2) Backfill the same for existing pastors / regional secretaries.
-- 3) Add flock_calls_due to dashboard_role_defaults (used by dashboard reset).
-- 4) Add flock tables to the realtime publication so the dashboard widget can
--    subscribe to postgres_changes instead of polling.

-- ---------------------------------------------------------------------------
-- 1) Auto-provision trigger
-- ---------------------------------------------------------------------------

create or replace function public.provision_flock_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('pastor', 'regional_secretary')
     and (tg_op = 'INSERT' or new.role is distinct from old.role) then

    insert into public.flock_settings (pastor_id, key, val)
    values
      (new.id, 'YOUR_NAME',              coalesce(nullif(new.name, ''), 'Pastor')),
      (new.id, 'REMINDER_EMAIL',         coalesce(new.email, '')),
      (new.id, 'MORNING_REMINDER_HOUR',  '8'),
      (new.id, 'DUESTATUS_REFRESH_HOUR', '6'),
      (new.id, 'MONDAY_FOLLOWUPS_HOUR',  '7'),
      (new.id, 'TIMEZONE',               'America/Winnipeg')
    on conflict (pastor_id, key) do nothing;

    -- Users with saved preferences skip the role preset entirely, so add the
    -- widget explicitly for them (preset users already get flock_calls_due
    -- from get_dashboard_presets).
    insert into public.dashboard_preferences (user_id, widget_key, visible, sort_order)
    select new.id, 'flock_calls_due', true, 0
    where exists (select 1 from public.dashboard_preferences p where p.user_id = new.id)
    on conflict (user_id, widget_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_provision_flock on public.users;
create trigger trg_provision_flock
  after insert or update of role on public.users
  for each row
  execute function public.provision_flock_for_user();

-- ---------------------------------------------------------------------------
-- 2) Backfill existing pastors / regional secretaries
-- ---------------------------------------------------------------------------

insert into public.flock_settings (pastor_id, key, val)
select
  u.id,
  s.key,
  case s.key
    when 'YOUR_NAME'      then coalesce(nullif(u.name, ''), 'Pastor')
    when 'REMINDER_EMAIL' then coalesce(u.email, '')
    else s.val
  end
from public.users u
cross join (values
  ('YOUR_NAME',              'Pastor'),
  ('REMINDER_EMAIL',         ''),
  ('MORNING_REMINDER_HOUR',  '8'),
  ('DUESTATUS_REFRESH_HOUR', '6'),
  ('MONDAY_FOLLOWUPS_HOUR',  '7'),
  ('TIMEZONE',               'America/Winnipeg')
) as s(key, val)
where u.role in ('pastor', 'regional_secretary')
on conflict (pastor_id, key) do nothing;

insert into public.dashboard_preferences (user_id, widget_key, visible, sort_order)
select u.id, 'flock_calls_due', true, 0
from public.users u
where u.role in ('pastor', 'regional_secretary')
  and exists (select 1 from public.dashboard_preferences p where p.user_id = u.id)
on conflict (user_id, widget_key) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Role defaults (dashboard "Reset to defaults" path)
-- ---------------------------------------------------------------------------

insert into public.dashboard_role_defaults (role, widget_key, visible, sort_order) values
  ('pastor',             'flock_calls_due', true, 0),
  ('regional_secretary', 'flock_calls_due', true, 0),
  ('super_admin',        'flock_calls_due', true, 0)
on conflict (role, widget_key) do nothing;

-- ---------------------------------------------------------------------------
-- 4) Realtime publication for flock tables (RLS still scopes events per user)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['flock_contacts', 'flock_interactions', 'flock_todos'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
