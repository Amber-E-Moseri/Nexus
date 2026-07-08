-- =============================================================================
-- Fix: Tighten insert RLS policy on google_calendar_tokens
-- =============================================================================
-- Problem: The insert policy was `with check (true)`, allowing any authenticated
-- user to insert rows for other users' calendars.
--
-- Solution: Restrict inserts to users inserting their own token.

drop policy if exists "gcal_tokens_insert" on public.google_calendar_tokens;

create policy "Users can insert their own google calendar tokens"
  on public.google_calendar_tokens
  for insert
  to authenticated
  with check (user_id = auth.uid());
