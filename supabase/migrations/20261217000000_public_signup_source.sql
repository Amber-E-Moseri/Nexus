-- Public mailing-list signup form
-- Allows the /subscribe public page (via the `subscribe` edge function) to add
-- contacts to communication_contacts. Extends the source CHECK to recognize
-- self-service signups and records when they subscribed.

alter table public.communication_contacts
  drop constraint if exists communication_contacts_source_check;

alter table public.communication_contacts
  add constraint communication_contacts_source_check
  check (source in ('manual', 'imported', 'public_signup'));

alter table public.communication_contacts
  add column if not exists subscribed_at timestamptz;
