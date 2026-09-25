-- Gap-fill: absence_email_log was created outside the migration system.
-- 20260618000003 tries to ALTER it before 20260719000000 creates it.
-- This stub creates the table at the correct point in the chain so the
-- 20260618000003 ALTER TABLE succeeds. 20260719000000 uses CREATE TABLE IF NOT EXISTS,
-- so it becomes a no-op. The report_id FK to meeting_attendance_reports
-- is intentionally omitted here (that table is created in 20260716000001).

create table if not exists public.absence_email_log (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid,
  recipient_name  text not null default '',
  recipient_email text not null default '',
  subject         text not null default '',
  body            text not null default '',
  status          text not null default 'pending'
    constraint absence_email_log_status_check
    check (status in ('sent', 'failed', 'pending')),
  error_message   text,
  sent_by         uuid references public.users(id) on delete set null,
  sent_at         timestamptz not null default now()
);
