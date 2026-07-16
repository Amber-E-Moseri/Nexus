-- Onboarding login reminders.
--
-- Goal: while onboarding the team onto Nexus, nudge anyone who hasn't logged
-- in for 4+ days, then keep nudging them every ~4 days, until 2026-08-14.
--
-- Design:
--   • login_reminder_log tracks each reminder sent per user, so the cron can
--     run more often than every 4 days (daily) without over-sending — a user
--     is only eligible again once 4 days have passed since their LAST
--     reminder (or since they went inactive, for a first reminder).
--   • get_users_needing_login_reminder() is the single source of truth for
--     "who is due a nudge right now", including the 2026-08-14 cutoff, so the
--     campaign is self-limiting even if nobody remembers to unschedule the
--     cron job afterward.
--   • Scheduling follows the existing due-date-reminders/task-overdue-trigger
--     pattern in this repo: pg_cron + pg_net calling the edge function with
--     the service-role key, using the app.supabase_url / app.service_role_key
--     custom settings those jobs already depend on.

create extension if not exists pg_cron;

-- ─── 1. Reminder log (per-user send history) ───────────────────────────

create table if not exists public.login_reminder_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index if not exists idx_login_reminder_log_user_sent
  on public.login_reminder_log(user_id, sent_at desc);

alter table public.login_reminder_log enable row level security;

drop policy if exists "login_reminder_log_admin_view" on public.login_reminder_log;
create policy "login_reminder_log_admin_view"
  on public.login_reminder_log for select
  using (public.current_user_role() = 'super_admin');

-- ─── 2. Who's due a reminder right now ─────────────────────────────────

create or replace function public.get_users_needing_login_reminder()
returns table (id uuid, email text, first_name text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email, u.first_name, u.name
  from public.users u
  where u.status = 'active'
    and u.email is not null
    -- Onboarding campaign window — stop nudging after this date even if the
    -- cron job is still scheduled.
    and now() <= timestamptz '2026-08-14 23:59:59+00'
    -- Hasn't been seen in 4+ days (never-logged-in users use created_at)
    and coalesce(u.last_active_at, u.created_at) < now() - interval '4 days'
    -- Hasn't already gotten a reminder in the last 4 days
    and not exists (
      select 1 from public.login_reminder_log l
      where l.user_id = u.id
        and l.sent_at > now() - interval '4 days'
    );
$$;

-- ─── 3. Record a sent reminder (called by the edge function) ──────────

create or replace function public.record_login_reminder_sent(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.login_reminder_log (user_id) values (p_user_id);
$$;

-- ─── 4. Schedule ────────────────────────────────────────────────────────
-- Runs daily; get_users_needing_login_reminder()'s per-user 4-day gate and
-- 2026-08-14 cutoff do the real pacing/expiry, so a daily cron avoids the
-- month-boundary drift of a raw "every 4 days" cron expression.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'onboarding-login-reminders') then
    perform cron.unschedule('onboarding-login-reminders');
  end if;
end $$;

select cron.schedule(
  'onboarding-login-reminders',
  '0 15 * * *', -- daily, 15:00 UTC (11:00 AM EDT)
  $$
  select net.http_post(
    url := (select current_setting('app.supabase_url')) || '/functions/v1/send-login-reminder-emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

comment on function public.get_users_needing_login_reminder() is
  'Onboarding campaign (through 2026-08-14): users inactive 4+ days who have not gotten a reminder in the last 4 days.';
comment on function public.record_login_reminder_sent(uuid) is
  'Logs that an onboarding login reminder was sent to this user, called by send-login-reminder-emails.';
