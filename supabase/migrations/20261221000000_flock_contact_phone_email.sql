-- Flock CRM: contact phone + email so pastors can click-to-call from the
-- due list and dashboard widget.

alter table public.flock_contacts add column if not exists phone text;
alter table public.flock_contacts add column if not exists email text;
