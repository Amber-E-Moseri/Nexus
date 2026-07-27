-- Re-issue of 20270729000004, which the Supabase CLI reported as "up to
-- date" without actually applying (verified: neither the app_settings row
-- nor the cron jobs it should have created existed afterward) — likely
-- fallout from earlier out-of-order --include-all pushes in this session
-- confusing the CLI's migration-history bookkeeping. Using a fresh,
-- unambiguous later timestamp to sidestep that. Safe to run alongside
-- 20270729000004 remaining in the repo (both are idempotent: ON CONFLICT
-- upsert, and cron.unschedule-then-schedule).

insert into public.app_settings (key, value)
select 'archive_tasks_cron_secret', value
from public.app_settings
where key = 'recurring_meetings_cron_secret'
on conflict (key) do update set value = excluded.value;

select cron.unschedule(jobid) from cron.job where jobname = 'archive-completed-space-tasks';
select cron.schedule(
  'archive-completed-space-tasks',
  '0 4 * * 0',
  $$ select public.archive_completed_tasks_trigger('space'); $$
);

select cron.unschedule(jobid) from cron.job where jobname = 'archive-completed-personal-tasks';
select cron.schedule(
  'archive-completed-personal-tasks',
  '0 5 * * 0',
  $$ select public.archive_completed_tasks_trigger('personal'); $$
);
