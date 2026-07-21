-- Adds recurrence support to meetings. Each occurrence of a recurring meeting is
-- materialized as its own row in `meetings` (own attendance/agenda/minutes),
-- sharing a `recurrence_id` so the series can be identified together.
alter table public.meetings
  add column if not exists recurrence_rule text,
  add column if not exists recurrence_id uuid;

create index if not exists idx_meetings_recurrence_id
  on public.meetings (recurrence_id)
  where recurrence_id is not null;
