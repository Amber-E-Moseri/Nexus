-- ICPLC 2026 public help-centre content. Single row; every editable string on
-- /icplc26 lives in `fields` (key -> text), falling back to code defaults.
create table if not exists icplc26_content (
  id uuid primary key default gen_random_uuid(),
  fields jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table icplc26_content add column if not exists fields jsonb not null default '{}'::jsonb;

alter table icplc26_content enable row level security;

drop policy if exists "Public read" on icplc26_content;
create policy "Public read" on icplc26_content for select using (true);

drop policy if exists "Admin write" on icplc26_content;
create policy "Admin write" on icplc26_content for update using (
  (select role from public.users where id = auth.uid()) in ('super_admin', 'regional_secretary')
);

drop policy if exists "Admin insert" on icplc26_content;
create policy "Admin insert" on icplc26_content for insert with check (
  (select role from public.users where id = auth.uid()) in ('super_admin', 'regional_secretary')
);

-- Named editor without a role change: Pastor Chi Nwokem (cedochie@gmail.com).
drop policy if exists "Named editors write" on icplc26_content;
create policy "Named editors write" on icplc26_content
  as permissive for all
  using (auth.uid() = '4c70ca61-443b-4a64-87aa-3453c9dd5c65')
  with check (auth.uid() = '4c70ca61-443b-4a64-87aa-3453c9dd5c65');

insert into icplc26_content (fields)
select '{}'::jsonb where not exists (select 1 from icplc26_content);
