-- =============================================================================
-- Connect 1-on-1 meetings to Flock CRM
-- -----------------------------------------------------------------------------
-- A 1-on-1 meeting with a pastor should count as a Flock "interaction" so it
-- isn't logged twice in two disconnected systems. Adds:
--   1. flock_contacts.linked_user_id — optional link to a real user account,
--      for reliable matching (falls back to fuzzy name-matching when unset).
--   2. meetings.flock_contact_id — lets a meeting creator explicitly pick
--      which of their own Flock contacts a 1-on-1 meeting is with, rather
--      than relying purely on inference.
--   3. flock_interactions.meeting_id — traceability back to the source
--      meeting, plus a unique partial index enforcing at most one
--      auto-logged interaction per meeting (hard backstop against
--      duplicates, on top of the client-side idempotency check).
--
-- No RLS changes needed: flock_contacts/flock_interactions policies
-- (20260708000000_flock_crm_per_pastor.sql) are bare `pastor_id = auth.uid()`
-- checks with no per-column restriction, so they already cover these new
-- columns.
-- =============================================================================

alter table public.flock_contacts
  add column if not exists linked_user_id uuid references public.users(id) on delete set null;
create index if not exists flock_contacts_linked_user_id_idx on public.flock_contacts(linked_user_id);

alter table public.meetings
  add column if not exists flock_contact_id uuid references public.flock_contacts(id) on delete set null;
create index if not exists meetings_flock_contact_id_idx on public.meetings(flock_contact_id);

alter table public.flock_interactions
  add column if not exists meeting_id uuid references public.meetings(id) on delete set null;
create unique index if not exists flock_interactions_meeting_id_uniq
  on public.flock_interactions(meeting_id) where meeting_id is not null;
create index if not exists flock_interactions_meeting_id_idx on public.flock_interactions(meeting_id);
