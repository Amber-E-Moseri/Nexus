-- Follow-up to 20270722000000_meeting_recurrence.sql. Recurring meetings are now
-- generated progressively (one at a time, ~1 day ahead) by a cron-triggered edge
-- function instead of being materialized all at once. These columns track series
-- position and drive the generator's "what's due next" query.
alter table public.meetings
  add column if not exists series_instance_num int,
  add column if not exists next_occurrence_scheduled timestamptz,
  add column if not exists exception_date date;

create index if not exists idx_meetings_next_occurrence
  on public.meetings (next_occurrence_scheduled)
  where next_occurrence_scheduled is not null;
