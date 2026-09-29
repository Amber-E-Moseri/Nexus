-- ICPLC 2026 event content table (similar to this_is_it_event_content)
create table if not exists icplc26_content (
  id uuid primary key default gen_random_uuid(),
  event_dates text not null default 'Thursday, November 19, 2026 – Sunday, November 22, 2026',
  event_location text not null default 'Loveworld City, Asese, Nigeria',
  register_url text not null default 'https://icplcwithpastorchris.org/register',
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Ensure only one row exists (singleton pattern)
alter table icplc26_content add constraint icplc26_content_singleton check ((select count(*) from icplc26_content) <= 1);

-- Enable RLS (allow public read, admin write)
alter table icplc26_content enable row level security;

create policy "Public read" on icplc26_content for select using (true);

create policy "Admin write" on icplc26_content for update using (
  auth.jwt() ->> 'user_role' in ('super_admin', 'regional_secretary')
);

create policy "Admin insert" on icplc26_content for insert with check (
  auth.jwt() ->> 'user_role' in ('super_admin', 'regional_secretary')
);

-- Insert default row
insert into icplc26_content (event_dates, event_location, register_url)
select
  'Thursday, November 19, 2026 – Sunday, November 22, 2026',
  'Loveworld City, Asese, Nigeria',
  'https://icplcwithpastorchris.org/register'
where not exists (select 1 from icplc26_content);
