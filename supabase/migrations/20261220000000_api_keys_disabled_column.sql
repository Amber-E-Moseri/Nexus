alter table public.api_keys
  add column if not exists disabled boolean not null default false;
