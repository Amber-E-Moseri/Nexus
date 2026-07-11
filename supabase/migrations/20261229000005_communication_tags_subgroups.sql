-- Communication Tags & Sub-Groups
-- Replaces department-based recipient targeting with flexible tags,
-- formalises sub-groups as a managed table, and adds leadership responsibilities.

-- ──────────────────────────────────────────────
-- 1. Sub-groups (replaces free-text subgroup on expected_attendees)
-- ──────────────────────────────────────────────
create table if not exists communication_sub_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  color       text default '#6B7280',
  created_by  uuid references users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  constraint communication_sub_groups_name_unique unique (name)
);

alter table communication_sub_groups enable row level security;

create policy "Authenticated users can read sub-groups"
  on communication_sub_groups for select
  to authenticated using (true);

create policy "Admins can manage sub-groups"
  on communication_sub_groups for all
  to authenticated using (
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'user_role',
      (select role from users where id = auth.uid())
    ) in ('super_admin', 'regional_secretary')
  );

-- Junction: which people belong to which sub-group (by email for cross-table support)
create table if not exists communication_sub_group_members (
  id            uuid primary key default gen_random_uuid(),
  sub_group_id  uuid not null references communication_sub_groups(id) on delete cascade,
  email         text not null,
  person_name   text,
  created_at    timestamptz default now(),
  constraint communication_sub_group_members_unique unique (sub_group_id, email)
);

alter table communication_sub_group_members enable row level security;

create policy "Authenticated users can read sub-group members"
  on communication_sub_group_members for select
  to authenticated using (true);

create policy "Admins can manage sub-group members"
  on communication_sub_group_members for all
  to authenticated using (
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'user_role',
      (select role from users where id = auth.uid())
    ) in ('super_admin', 'regional_secretary')
  );

-- ──────────────────────────────────────────────
-- 2. Tags (flexible labels replacing department-based targeting)
-- ──────────────────────────────────────────────
create table if not exists communication_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text default '#4C2A92',
  created_by  uuid references users(id),
  created_at  timestamptz default now(),
  constraint communication_tags_name_unique unique (name)
);

alter table communication_tags enable row level security;

create policy "Authenticated users can read tags"
  on communication_tags for select
  to authenticated using (true);

create policy "Admins can manage tags"
  on communication_tags for all
  to authenticated using (
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'user_role',
      (select role from users where id = auth.uid())
    ) in ('super_admin', 'regional_secretary')
  );

-- Junction: tags applied to people (by email)
create table if not exists communication_person_tags (
  id          uuid primary key default gen_random_uuid(),
  tag_id      uuid not null references communication_tags(id) on delete cascade,
  email       text not null,
  person_name text,
  created_at  timestamptz default now(),
  constraint communication_person_tags_unique unique (tag_id, email)
);

alter table communication_person_tags enable row level security;

create policy "Authenticated users can read person tags"
  on communication_person_tags for select
  to authenticated using (true);

create policy "Admins can manage person tags"
  on communication_person_tags for all
  to authenticated using (
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'user_role',
      (select role from users where id = auth.uid())
    ) in ('super_admin', 'regional_secretary')
  );

-- ──────────────────────────────────────────────
-- 3. Leadership responsibilities (formalises leadership_category)
-- ──────────────────────────────────────────────
create table if not exists communication_leadership_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  color       text default '#E8A020',
  created_by  uuid references users(id),
  created_at  timestamptz default now(),
  constraint communication_leadership_roles_name_unique unique (name)
);

alter table communication_leadership_roles enable row level security;

create policy "Authenticated users can read leadership roles"
  on communication_leadership_roles for select
  to authenticated using (true);

create policy "Admins can manage leadership roles"
  on communication_leadership_roles for all
  to authenticated using (
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'user_role',
      (select role from users where id = auth.uid())
    ) in ('super_admin', 'regional_secretary')
  );

-- Junction: leadership roles assigned to people
create table if not exists communication_leadership_role_members (
  id                   uuid primary key default gen_random_uuid(),
  leadership_role_id   uuid not null references communication_leadership_roles(id) on delete cascade,
  email                text not null,
  person_name          text,
  created_at           timestamptz default now(),
  constraint communication_leadership_role_members_unique unique (leadership_role_id, email)
);

alter table communication_leadership_role_members enable row level security;

create policy "Authenticated users can read leadership role members"
  on communication_leadership_role_members for select
  to authenticated using (true);

create policy "Admins can manage leadership role members"
  on communication_leadership_role_members for all
  to authenticated using (
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'user_role',
      (select role from users where id = auth.uid())
    ) in ('super_admin', 'regional_secretary')
  );

-- ──────────────────────────────────────────────
-- 4. Seed sub-groups from existing roster data
-- ──────────────────────────────────────────────
insert into communication_sub_groups (name)
select distinct subgroup
from expected_attendees
where subgroup is not null and subgroup <> ''
on conflict (name) do nothing;

insert into communication_sub_group_members (sub_group_id, email, person_name)
select sg.id, ea.email, ea.full_name
from expected_attendees ea
join communication_sub_groups sg on sg.name = ea.subgroup
where ea.email is not null and ea.email <> ''
  and ea.subgroup is not null and ea.subgroup <> ''
on conflict (sub_group_id, email) do nothing;

-- Seed leadership roles from existing roster data
insert into communication_leadership_roles (name)
select distinct leadership_category
from expected_attendees
where leadership_category is not null and leadership_category <> ''
on conflict (name) do nothing;

insert into communication_leadership_role_members (leadership_role_id, email, person_name)
select lr.id, ea.email, ea.full_name
from expected_attendees ea
join communication_leadership_roles lr on lr.name = ea.leadership_category
where ea.email is not null and ea.email <> ''
  and ea.leadership_category is not null and ea.leadership_category <> ''
on conflict (leadership_role_id, email) do nothing;

-- Indexes
create index if not exists idx_comm_sub_group_members_group on communication_sub_group_members(sub_group_id);
create index if not exists idx_comm_sub_group_members_email on communication_sub_group_members(email);
create index if not exists idx_comm_person_tags_tag on communication_person_tags(tag_id);
create index if not exists idx_comm_person_tags_email on communication_person_tags(email);
create index if not exists idx_comm_leadership_role_members_role on communication_leadership_role_members(leadership_role_id);
create index if not exists idx_comm_leadership_role_members_email on communication_leadership_role_members(email);
