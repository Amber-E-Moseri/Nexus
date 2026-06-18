-- Add user_id column to absence_email_log for checking preferences
alter table public.absence_email_log
  add column if not exists recipient_user_id uuid references public.users(id) on delete set null;

-- Update the status check constraint to include 'skipped'
alter table public.absence_email_log
  drop constraint if exists absence_email_log_status_check;

alter table public.absence_email_log
  add constraint absence_email_log_status_check
  check (status in ('sent', 'failed', 'pending', 'skipped'));

-- Default preference: absence emails enabled
insert into public.user_notification_prefs (user_id, notification_type, in_app, email)
select u.id, 'absent_from_meeting', false, true
from public.users u
where not exists (
  select 1 from public.user_notification_prefs p
  where p.user_id = u.id and p.notification_type = 'absent_from_meeting'
);
