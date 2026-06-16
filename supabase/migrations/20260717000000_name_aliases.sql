create table public.expected_attendee_aliases (
  id uuid primary key default gen_random_uuid(),
  expected_attendee_id uuid not null
    references public.expected_attendees(id) on delete cascade,
  alias_name text not null,
  alias_match_key text generated always as
    (lower(trim(alias_name))) stored,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique(alias_match_key)
);

alter table public.expected_attendee_aliases enable row level security;

create policy "aliases_select" on public.expected_attendee_aliases
  for select to authenticated using (true);

create policy "aliases_write" on public.expected_attendee_aliases
  for all to authenticated
  using ((auth.jwt() ->> 'user_role') in ('super_admin','dept_lead'))
  with check ((auth.jwt() ->> 'user_role') in ('super_admin','dept_lead'));
