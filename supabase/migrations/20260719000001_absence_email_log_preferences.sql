-- Convergence migration for absence_email_log preferences
-- This migration converges the intended schema for absence_email_log
-- that was deferred from 20260618000003 due to table creation ordering.

-- Add recipient_user_id column if not present (for tracking which user the email goes to)
alter table public.absence_email_log
  add column if not exists recipient_user_id uuid references public.users(id) on delete set null;

-- Update the status check constraint to include 'skipped' status
-- Drop existing constraint if present
alter table public.absence_email_log
  drop constraint if exists absence_email_log_status_check;

-- Create new constraint with all intended statuses
alter table public.absence_email_log
  add constraint absence_email_log_status_check
  check (status in ('sent', 'failed', 'pending', 'skipped'));
