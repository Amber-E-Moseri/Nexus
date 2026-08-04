-- The legacy policy bypasses the current meeting privacy rules, including
-- private 1-on-1 restrictions for super admins.
drop policy if exists "meetings_select_access" on public.meetings;
