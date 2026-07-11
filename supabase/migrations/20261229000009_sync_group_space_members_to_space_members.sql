-- Sync group_space_members -> space_members
--
-- Problem discovered: group space VISIBILITY (sidebar / space list) is
-- gated by group_space_members (added in 20261229000001/2), but actual
-- CONTENT inside a space (tasks, folders, lists) is gated by
-- can_view_space(), which checks the pre-existing space_members table.
-- These two tables were disconnected: a member added via the new
-- "Manage Members" panel could see the space card but not any tasks/
-- folders/lists inside it.
--
-- Fix: mirror every group_space_members row into space_members via
-- trigger, so can_view_space() (and the tasks/folders/lists RLS
-- policies that depend on it) automatically recognize group space
-- members. group_space_members remains the source of truth for the
-- UI (owner/member roles, invite flow); space_members is kept as the
-- mechanism the rest of the RLS surface already understands.

create or replace function public.sync_group_space_member_to_space_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.space_members (space_id, user_id, role, added_by)
    values (
      NEW.group_space_id,
      NEW.user_id,
      case when NEW.role = 'owner' then 'owner' else 'contributor' end,
      NEW.added_by
    )
    on conflict (space_id, user_id) do update
      set role = excluded.role;
    return NEW;
  end if;

  if TG_OP = 'DELETE' then
    delete from public.space_members
    where space_id = OLD.group_space_id
      and user_id = OLD.user_id;
    return OLD;
  end if;

  return null;
end;
$$;

drop trigger if exists group_space_members_sync on public.group_space_members;
create trigger group_space_members_sync
  after insert or delete on public.group_space_members
  for each row
  execute function public.sync_group_space_member_to_space_members();

-- Backfill: sync any existing group_space_members rows (from the owner
-- auto-add in 20261229000001) into space_members now that the trigger exists.
insert into public.space_members (space_id, user_id, role, added_by)
select
  gsm.group_space_id,
  gsm.user_id,
  case when gsm.role = 'owner' then 'owner' else 'contributor' end,
  gsm.added_by
from public.group_space_members gsm
on conflict (space_id, user_id) do update
  set role = excluded.role;
