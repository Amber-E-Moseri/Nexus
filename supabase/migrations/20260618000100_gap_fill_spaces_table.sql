-- Gap-fill: public.spaces is referenced as a FK target in 20260619000002
-- but no migration ever creates it.
-- The Nexus app uses 'spaces' as a synonym for 'departments'; in the live DB
-- the table was provisioned directly. This stub satisfies the FK constraint.

create table if not exists public.spaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);
