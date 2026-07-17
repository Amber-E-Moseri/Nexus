-- Allow up to two active pastors per member (primary + secondary, assignment-order
-- determined, not surfaced in any UI). pastor_members is already many-to-many
-- (composite PK (pastor_id, member_id)); assign_pastor_member's old
-- `delete ...; insert ...` body was the only thing forcing single-pastor.

-- Default true is only safe because assign_pastor_member currently does delete-then-
-- insert, guaranteeing at most one existing row per member — no existing row can
-- collide with the unique index below.
alter table public.pastor_members
  add column if not exists is_primary boolean not null default true;

-- Structural cap: at most one row per member with is_primary = true, and at most one
-- with is_primary = false — "one primary, one secondary, no more," enforced at the DB
-- level rather than trusted to the RPC alone.
create unique index if not exists pastor_members_member_primary_uniq
  on public.pastor_members(member_id, is_primary);

-- Shared permission-check helper, used by both assign_pastor_member and
-- remove_pastor_member below, so a future role change is updated in one place, not two.
create or replace function public.assert_can_manage_pastoral_assignment(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.users%rowtype;
  v_member public.users%rowtype;
begin
  select * into v_actor from public.users where id = auth.uid();
  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to manage pastoral assignments';
  end if;

  select * into v_member from public.users where id = p_member_id;
  if v_actor.role = 'dept_lead' and v_actor.department_id is distinct from v_member.department_id then
    raise exception 'Department leads may manage assignments in their own department only';
  end if;
end;
$$;

-- Replaces the old delete-then-insert body. First assignment for a member is primary;
-- second is secondary. No ranking beyond order of assignment — reassigning later
-- doesn't change which is primary. Not surfaced in any UI.
create or replace function public.assign_pastor_member(p_pastor_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_pastor public.users%rowtype;
  v_member public.users%rowtype;
  v_count int;
begin
  perform public.assert_can_manage_pastoral_assignment(p_member_id);

  select * into v_pastor from public.users where id = p_pastor_id;
  select * into v_member from public.users where id = p_member_id;
  if v_pastor.role <> 'pastor' then
    raise exception 'Selected user is not a pastor';
  end if;
  if v_member.role <> 'member' then
    raise exception 'Selected user is not a member';
  end if;

  if exists (
    select 1 from public.pastor_members
    where member_id = p_member_id and pastor_id = p_pastor_id
  ) then
    return; -- idempotent no-op, already assigned
  end if;

  select count(*) into v_count from public.pastor_members where member_id = p_member_id;
  if v_count >= 2 then
    raise exception 'Member already has the maximum of two pastors assigned';
  end if;

  begin
    insert into public.pastor_members (pastor_id, member_id, is_primary)
    values (p_pastor_id, p_member_id, v_count = 0);
  exception when unique_violation then
    -- Concurrent assignment to the same member raced past the count check above; the
    -- unique index is the real guard, this just gives the friendly message instead of
    -- a raw constraint-violation error.
    raise exception 'Member already has the maximum of two pastors assigned';
  end;
end;
$$;

-- The active pair-scoped version (20270107000000_remove_pastor_member_by_pair.sql) was
-- a bare delete with no actor permission check at all (dropped when the signature
-- changed from single-arg to pair-scoped). Fixed here, in the same migration that's
-- already rewriting this function's body for auto-promotion, using the shared helper.
create or replace function public.remove_pastor_member(p_pastor_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_can_manage_pastoral_assignment(p_member_id);

  delete from public.pastor_members where pastor_id = p_pastor_id and member_id = p_member_id;

  -- Auto-promote so a member never ends up with a lone is_primary = false row and no
  -- primary — a latent trap for anything that later reads "the primary pastor". No-ops
  -- if a primary already exists or no rows remain.
  update public.pastor_members
  set is_primary = true
  where member_id = p_member_id
    and not exists (
      select 1 from public.pastor_members where member_id = p_member_id and is_primary = true
    );
end;
$$;

grant execute on function public.assert_can_manage_pastoral_assignment(uuid) to authenticated;
grant execute on function public.assign_pastor_member(uuid, uuid) to authenticated;
grant execute on function public.remove_pastor_member(uuid, uuid) to authenticated;

-- Verified, not assumed — no tasks_select_pastor RLS change needed
-- (20260608000000_initial_blw_canada_os_schema.sql:236-246): it's a per-row exists()
-- check keyed on auth.uid(), no reference to is_primary — both pastors get identical
-- task visibility regardless of primary/secondary status.
