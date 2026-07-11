-- Add membership tracking for group spaces
-- Group spaces should only be visible to: super_admin, owner, or invited members

create table public.group_space_members (
  id uuid default gen_random_uuid() primary key,
  group_space_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  added_at timestamp not null default now(),
  added_by uuid references public.users(id) on delete set null,

  unique (group_space_id, user_id)
);

create index group_space_members_group_idx on public.group_space_members(group_space_id);
create index group_space_members_user_idx on public.group_space_members(user_id);

-- RLS: users can see their own group space memberships; super_admin sees all
alter table public.group_space_members enable row level security;

create policy "group_space_members_select" on public.group_space_members
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or user_id = auth.uid()
  );

create policy "group_space_members_insert" on public.group_space_members
  for insert to authenticated
  with check (public.current_user_role() = 'super_admin');

create policy "group_space_members_delete" on public.group_space_members
  for delete to authenticated
  using (public.current_user_role() = 'super_admin');

-- Migrate existing group spaces: auto-add owner as member
insert into public.group_space_members (group_space_id, user_id, role, added_by)
select id, owner_id, 'owner', owner_id
from public.departments
where space_type = 'group' and owner_id is not null
on conflict do nothing;

-- Backfill: add any other group members (if tracked via group_space_members_backup or elsewhere)
-- This is a safety insert - in practice, only the owner will be added above
