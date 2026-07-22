-- Sprint invite permission revamp:
-- 1. Open external invites to any sprint member (not just owners/managers)
-- 2. Tighten sprint_members INSERT to super_admin + creator bootstrap only
--    (all other inserts must go through SECURITY DEFINER RPCs which bypass RLS)
-- 3. Add add_sprint_member_by_id RPC (super_admin only, routes UI add-member form)
-- 4. Add add_pastor_group_to_sprint RPC (pastor role + must be sprint member)

-- ─── 1. Relax external-invite permission check ─────────────────────────────

drop function if exists public.invite_external_sprint_member(text, text, uuid, text, date);

create or replace function public.invite_external_sprint_member(
  p_email            text,
  p_name             text,
  p_sprint_id        uuid,
  p_role             text    default 'contributor',
  p_end_date         date    default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id   uuid;
  v_inviter   uuid := auth.uid();
  v_sprint_created_by uuid;
  v_is_sprint_owner boolean := false;
begin
  if v_inviter is null then
    raise exception 'Authentication required';
  end if;

  if p_role not in ('owner', 'manager', 'contributor', 'viewer') then
    raise exception 'Invalid sprint role: %', p_role;
  end if;

  select created_by into v_sprint_created_by
  from public.sprints
  where id = p_sprint_id;

  if v_sprint_created_by is null then
    raise exception 'Sprint not found';
  end if;

  v_is_sprint_owner := v_sprint_created_by = v_inviter or exists (
    select 1
    from public.sprint_members sm
    where sm.sprint_id = p_sprint_id
      and sm.user_id = v_inviter
      and sm.role = 'owner'
  );

  -- Any sprint member may invite externals (relaxed from owners/managers only)
  if not (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(p_sprint_id)
    or public.is_sprint_member(p_sprint_id)
  ) then
    raise exception 'You do not have permission to invite members to this sprint';
  end if;

  if p_role in ('owner', 'manager')
    and public.current_user_role() <> 'super_admin'
    and not v_is_sprint_owner
  then
    raise exception 'Only the sprint owner or a super admin can assign privileged sprint roles';
  end if;

  p_email := lower(trim(p_email));

  select id into v_user_id
  from auth.users
  where email = p_email
  limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      p_email,
      '',
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), split_part(p_email, '@', 1)), 'is_temporary', true),
      'authenticated',
      'authenticated'
    );

    insert into public.users (id, email, name, status, is_temporary, created_at)
    values (
      v_user_id,
      p_email,
      coalesce(nullif(trim(p_name), ''), split_part(p_email, '@', 1)),
      'pending_activation',
      true,
      now()
    );
  end if;

  if exists (
    select 1 from public.sprint_members
    where sprint_id = p_sprint_id and user_id = v_user_id
  ) then
    raise exception 'User is already a member of this sprint';
  end if;

  insert into public.sprint_members (
    sprint_id, user_id, role, is_temporary, membership_end_date, invited_by
  ) values (
    p_sprint_id, v_user_id, p_role, true, p_end_date, v_inviter
  );

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (v_inviter, 'sprint_external_member_invited', 'sprint', p_sprint_id);

  return v_user_id;
end;
$$;

grant execute on function public.invite_external_sprint_member(text, text, uuid, text, date) to authenticated;

-- ─── Relax add_sprint_member_profile (same gate change) ────────────────────

drop function if exists public.add_sprint_member_profile(uuid, text, text, uuid, text, date);

create or replace function public.add_sprint_member_profile(
  p_user_id   uuid,
  p_email     text,
  p_name      text,
  p_sprint_id uuid,
  p_role      text  default 'contributor',
  p_end_date  date  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid := auth.uid();
  v_sprint_created_by uuid;
  v_is_sprint_owner boolean := false;
begin
  if v_inviter is null then
    raise exception 'Authentication required';
  end if;

  if p_role not in ('owner', 'manager', 'contributor', 'viewer') then
    raise exception 'Invalid sprint role: %', p_role;
  end if;

  select created_by into v_sprint_created_by
  from public.sprints
  where id = p_sprint_id;

  if v_sprint_created_by is null then
    raise exception 'Sprint not found';
  end if;

  v_is_sprint_owner := v_sprint_created_by = v_inviter or exists (
    select 1
    from public.sprint_members sm
    where sm.sprint_id = p_sprint_id
      and sm.user_id = v_inviter
      and sm.role = 'owner'
  );

  -- Any sprint member may invite externals (relaxed from owners/managers only)
  if not (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(p_sprint_id)
    or public.is_sprint_member(p_sprint_id)
  ) then
    raise exception 'You do not have permission to invite members to this sprint';
  end if;

  if p_role in ('owner', 'manager')
    and public.current_user_role() <> 'super_admin'
    and not v_is_sprint_owner
  then
    raise exception 'Only the sprint owner or a super admin can assign privileged sprint roles';
  end if;

  insert into public.users (id, email, name, status, is_temporary, created_at)
  values (
    p_user_id,
    lower(trim(p_email)),
    coalesce(nullif(trim(p_name), ''), split_part(lower(trim(p_email)), '@', 1)),
    'pending_activation',
    true,
    now()
  )
  on conflict (id) do nothing;

  insert into public.sprint_members (
    sprint_id, user_id, role, is_temporary, membership_end_date, invited_by
  ) values (
    p_sprint_id, p_user_id, p_role, true, p_end_date, v_inviter
  )
  on conflict (sprint_id, user_id) do nothing;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (v_inviter, 'sprint_external_member_added', 'sprint', p_sprint_id);
end;
$$;

grant execute on function public.add_sprint_member_profile(uuid, text, text, uuid, text, date) to authenticated;

-- ─── 2. Tighten sprint_members INSERT RLS ───────���───────────────────────────
-- Replace the `for all` policy (which covers INSERT and would OR with the new
-- narrow INSERT policy, re-opening the bypass) with three targeted policies.

drop policy if exists "sprint_members_write" on public.sprint_members;

-- INSERT: super_admin only, or sprint creator inserting themselves (bootstrap).
-- All other inserts go through SECURITY DEFINER RPCs (which bypass RLS).
create policy "sprint_members_insert" on public.sprint_members
  for insert to authenticated
  with check (
    public.current_user_role() = 'super_admin'
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.sprints s
        where s.id = sprint_id and s.created_by = auth.uid()
      )
    )
  );

-- UPDATE: existing can_manage_sprint logic (separate policy so it does not
-- re-open the INSERT path via `for all` OR-semantics)
create policy "sprint_members_update" on public.sprint_members
  for update to authenticated
  using (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(sprint_id)
  )
  with check (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(sprint_id)
  );

-- DELETE: same guard as update
create policy "sprint_members_delete" on public.sprint_members
  for delete to authenticated
  using (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(sprint_id)
  );

-- ─── 3. add_sprint_member_by_id (super_admin only) ─────────────────────────

drop function if exists public.add_sprint_member_by_id(uuid, uuid, text, date);

create or replace function public.add_sprint_member_by_id(
  p_sprint_id uuid,
  p_user_id   uuid,
  p_role      text  default 'contributor',
  p_end_date  date  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() <> 'super_admin' then
    raise exception 'Only super admins can add existing users to a sprint';
  end if;

  if p_role not in ('owner', 'manager', 'contributor', 'viewer') then
    raise exception 'Invalid sprint role: %', p_role;
  end if;

  if not exists (select 1 from public.sprints where id = p_sprint_id) then
    raise exception 'Sprint not found';
  end if;

  insert into public.sprint_members (sprint_id, user_id, role, membership_end_date, invited_by)
  values (p_sprint_id, p_user_id, p_role, p_end_date, auth.uid())
  on conflict (sprint_id, user_id) do nothing;
end;
$$;

grant execute on function public.add_sprint_member_by_id(uuid, uuid, text, date) to authenticated;

-- ─── 4. add_pastor_group_to_sprint ───────────────────────────────────────���─

drop function if exists public.add_pastor_group_to_sprint(uuid);

create or replace function public.add_pastor_group_to_sprint(p_sprint_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_added  int  := 0;
begin
  if public.current_user_role() <> 'pastor' then
    raise exception 'Only pastors can use this function';
  end if;

  if not public.is_sprint_member(p_sprint_id) then
    raise exception 'You must be a sprint member to add your group';
  end if;

  if exists (select 1 from public.sprints where id = p_sprint_id and status = 'archived') then
    raise exception 'Cannot add members to an archived sprint';
  end if;

  insert into public.sprint_members (sprint_id, user_id, role, invited_by)
  select p_sprint_id, pm.member_id, 'contributor', v_caller
  from public.pastor_members pm
  where pm.pastor_id = v_caller
  on conflict (sprint_id, user_id) do nothing;

  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

grant execute on function public.add_pastor_group_to_sprint(uuid) to authenticated;
