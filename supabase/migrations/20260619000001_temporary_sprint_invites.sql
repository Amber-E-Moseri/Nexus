-- ============================================================
-- Temporary Sprint Invites
-- ============================================================

-- Add is_temporary flag to users table
alter table public.users
  add column if not exists is_temporary boolean not null default false;

-- Create index for finding temp users
create index if not exists idx_users_is_temporary on public.users(is_temporary);

-- Add temporary member tracking to sprint_members
alter table public.sprint_members
  add column if not exists membership_end_date date,
  add column if not exists is_temporary boolean not null default false,
  add column if not exists invited_by uuid references public.users(id) on delete set null;

-- Create indexes for common queries
create index if not exists idx_sprint_members_membership_end_date on public.sprint_members(membership_end_date);
create index if not exists idx_sprint_members_is_temporary on public.sprint_members(is_temporary);
create index if not exists idx_sprint_members_invited_by on public.sprint_members(invited_by);

-- Update RLS policy to allow sprint owners to update temp member end dates
drop policy if exists "sprint_members_write" on public.sprint_members;
create policy "sprint_members_write" on public.sprint_members
  for all to authenticated
  using (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(sprint_id)
    or (
      is_temporary = true
      and (
        public.current_user_role() = 'super_admin'
        or exists (
          select 1 from public.sprints s
          where s.id = sprint_id and s.created_by = auth.uid()
        )
      )
    )
  )
  with check (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(sprint_id)
    or (
      is_temporary = true
      and (
        public.current_user_role() = 'super_admin'
        or exists (
          select 1 from public.sprints s
          where s.id = sprint_id and s.created_by = auth.uid()
        )
      )
    )
  );

-- Function to check if temporary member access has expired
create or replace function public.is_temp_member_expired(
  p_user_id uuid,
  p_membership_end_date date
)
returns boolean
language sql
stable
as $$
  select
    p_membership_end_date is not null
    and p_membership_end_date <= current_date
    and exists (
      select 1
      from public.sprint_members
      where user_id = p_user_id
        and is_temporary = true
        and membership_end_date = p_membership_end_date
    )
$$;

-- Create notification trigger for expired temporary members (optional, handled in app)
create or replace function public.notify_temp_member_expiration()
returns trigger
language plpgsql
as $$
begin
  if new.is_temporary = true
    and new.membership_end_date is not null
    and new.membership_end_date <= current_date + interval '1 day'
    and (old.membership_end_date is null or old.membership_end_date > current_date + interval '1 day')
  then
    -- Trigger notification (handled in app)
    null;
  end if;
  return new;
end;
$$;
