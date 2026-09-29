-- NOTE: The absence_email_log table is created in 20260719000000_expected_attendees_email.sql
-- The following modifications to that table are deferred until after it exists.
-- This allows 20260618000003 to execute independently without blocking on table creation.
-- The forward convergence migration 20260719000001 will apply these changes.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'absence_email_log'
  ) then
    -- Add user_id column to absence_email_log for checking preferences
    alter table public.absence_email_log
      add column if not exists recipient_user_id uuid references public.users(id) on delete set null;

    -- Update the status check constraint to include 'skipped'
    alter table public.absence_email_log
      drop constraint if exists absence_email_log_status_check;

    alter table public.absence_email_log
      add constraint absence_email_log_status_check
      check (status in ('sent', 'failed', 'pending', 'skipped'));
  end if;
end $$;

-- Default preference: absence emails enabled
insert into public.user_notification_prefs (user_id, notification_type, in_app, email)
select u.id, 'absent_from_meeting', false, true
from public.users u
where not exists (
  select 1 from public.user_notification_prefs p
  where p.user_id = u.id and p.notification_type = 'absent_from_meeting'
);
