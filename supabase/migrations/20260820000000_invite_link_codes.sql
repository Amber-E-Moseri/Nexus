-- Store invite links with short codes to avoid length limits in emails

create table if not exists public.invite_link_codes (
  code text primary key,
  action_link text not null,
  email text not null,
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone default now() + interval '7 days',
  used_at timestamp with time zone
);

alter table public.invite_link_codes enable row level security;

create policy "invite_links_anyone_can_use"
on public.invite_link_codes for select
to authenticated, anon
using (true);

create index invite_link_codes_expires_at on public.invite_link_codes(expires_at);
