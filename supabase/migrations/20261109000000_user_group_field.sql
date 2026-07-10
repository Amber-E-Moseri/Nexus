-- Add ministry group (map region) to users and invitations.
-- Groups mirror the BLW CAN map regions: Central, Central-East, West.
-- Used to default the campus map + prayer mode to the user's own territory.

alter table public.users
  add column if not exists group_name text
  check (group_name is null or group_name in ('Central', 'Central-East', 'West'));

alter table public.user_invitations
  add column if not exists group_name text
  check (group_name is null or group_name in ('Central', 'Central-East', 'West'));

-- ── create_user_invitation: accept an optional group ─────────────────────────
-- Adding a parameter changes the signature; drop the old overload so PostgREST
-- named-arg resolution stays unambiguous.
drop function if exists public.create_user_invitation(text, text, text, uuid, text, uuid, text);

create or replace function public.create_user_invitation(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_department_id uuid,
  p_role text,
  p_assigned_pastor_id uuid default null,
  p_message text default null,
  p_group_name text default null
)
returns public.user_invitations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.users%rowtype;
  v_existing public.user_invitations%rowtype;
  v_email text := lower(trim(p_email));
  v_token text;
  v_result public.user_invitations%rowtype;
begin
  select * into v_actor from public.users where id = auth.uid();

  if v_actor.id is null then
    raise exception 'Authentication required';
  end if;

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to invite users';
  end if;

  if p_role not in ('super_admin', 'dept_lead', 'pastor', 'member') then
    raise exception 'Invalid role';
  end if;

  if p_group_name is not null and p_group_name not in ('Central', 'Central-East', 'West') then
    raise exception 'Invalid group';
  end if;

  if v_actor.role = 'dept_lead' then
    if p_role <> 'member' then
      raise exception 'Department leads may invite members only';
    end if;

    if p_department_id is distinct from v_actor.department_id then
      raise exception 'Department leads may invite within their own department only';
    end if;
  end if;

  if exists (
    select 1
    from public.users existing_user
    where lower(existing_user.email) = v_email
      and existing_user.status <> 'archived'
  ) then
    raise exception 'A user with this email already exists';
  end if;

  select *
  into v_existing
  from public.user_invitations
  where lower(email) = v_email
    and status = 'pending';

  if v_existing.id is not null then
    raise exception 'A pending invitation already exists for this email';
  end if;

  if p_assigned_pastor_id is not null then
    if not exists (
      select 1
      from public.users pastor_user
      where pastor_user.id = p_assigned_pastor_id
        and pastor_user.role = 'pastor'
        and pastor_user.department_id = p_department_id
    ) then
      raise exception 'Assigned pastor must be an active pastor in the selected department';
    end if;
  end if;

  v_token := substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 48);

  insert into public.user_invitations (
    first_name,
    last_name,
    email,
    department_id,
    role,
    assigned_pastor_id,
    invited_by,
    invitation_token,
    invitation_token_hash,
    invite_message,
    group_name,
    status
  )
  values (
    trim(p_first_name),
    trim(p_last_name),
    v_email,
    p_department_id,
    p_role,
    p_assigned_pastor_id,
    auth.uid(),
    v_token,
    md5(v_token),
    nullif(trim(p_message), ''),
    p_group_name,
    'pending'
  )
  returning *
  into v_result;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_created', 'user_invitation', v_result.id);

  return v_result;
end;
$$;

grant execute on function public.create_user_invitation(text, text, text, uuid, text, uuid, text, text) to authenticated;

-- ── accept_user_invitation: carry group onto the new user ────────────────────
create or replace function public.accept_user_invitation(p_token text)
returns public.users
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invitation public.user_invitations%rowtype;
  v_auth_email text;
  v_user       public.users%rowtype;
  v_full_name  text;
  v_hash       text := md5(p_token);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.user_invitations
  set
    status         = 'expired',
    delivery_status = 'expired',
    delivery_error = null
  where status = 'pending'
    and expires_at < now()
    and (
      invitation_token_hash = v_hash
      or invitation_token   = p_token
    );

  select *
  into v_invitation
  from public.user_invitations
  where status = 'pending'
    and expires_at >= now()
    and (
      invitation_token_hash = v_hash
      or invitation_token   = p_token
    );

  if v_invitation.id is null then
    select *
    into v_invitation
    from public.user_invitations
    where (invitation_token_hash = v_hash or invitation_token = p_token)
      and status          = 'accepted'
      and accepted_user_id = auth.uid();

    if v_invitation.id is not null then
      select * into v_user from public.users where id = auth.uid();
      return v_user;
    end if;

    raise exception 'Invitation is invalid or expired';
  end if;

  select lower(email)
  into v_auth_email
  from auth.users
  where id = auth.uid();

  if v_auth_email is distinct from lower(v_invitation.email) then
    raise exception 'Signed-in email does not match invitation email';
  end if;

  v_full_name := trim(v_invitation.first_name || ' ' || v_invitation.last_name);

  insert into public.users (
    id, name, email, role, department_id,
    first_name, last_name, status, group_name,
    invited_at, activated_at, last_active_at
  )
  values (
    auth.uid(), v_full_name, lower(v_invitation.email), v_invitation.role, v_invitation.department_id,
    v_invitation.first_name, v_invitation.last_name, 'active', v_invitation.group_name,
    v_invitation.created_at, now(), now()
  )
  on conflict (id) do update
    set
      name           = excluded.name,
      email          = excluded.email,
      role           = excluded.role,
      department_id  = excluded.department_id,
      first_name     = excluded.first_name,
      last_name      = excluded.last_name,
      status         = 'active',
      group_name     = coalesce(public.users.group_name, excluded.group_name),
      invited_at     = coalesce(public.users.invited_at, excluded.invited_at),
      activated_at   = coalesce(public.users.activated_at, now()),
      last_active_at = now()
  returning * into v_user;

  if v_invitation.role = 'member' then
    delete from public.pastor_members where member_id = auth.uid();

    if v_invitation.assigned_pastor_id is not null then
      insert into public.pastor_members (pastor_id, member_id)
      values (v_invitation.assigned_pastor_id, auth.uid())
      on conflict (pastor_id, member_id) do nothing;
    end if;
  end if;

  update public.user_invitations
  set
    status           = 'accepted',
    accepted_at      = now(),
    accepted_user_id = auth.uid(),
    delivery_status  = 'activated',
    delivery_error   = null
  where id = v_invitation.id;

  insert into public.user_status_history (user_id, from_status, to_status, reason, changed_by)
  values (auth.uid(), 'invited', 'active', 'Invitation accepted', auth.uid());

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_accepted', 'user_invitation', v_invitation.id);

  return v_user;
end;
$$;

-- ── heal_pending_invitation_for_self: carry group in the self-heal path too ──
create or replace function public.heal_pending_invitation_for_self()
returns public.users
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_email text;
  v_invitation public.user_invitations%rowtype;
  v_existing   public.users%rowtype;
  v_full_name  text;
  v_user       public.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_existing from public.users where id = auth.uid();
  if v_existing.id is not null then
    return v_existing;
  end if;

  select lower(email) into v_auth_email
  from auth.users
  where id = auth.uid();

  select * into v_invitation
  from public.user_invitations
  where lower(email) = v_auth_email
    and status = 'pending'
    and expires_at >= now()
  order by created_at desc
  limit 1;

  if v_invitation.id is null then
    return null;
  end if;

  v_full_name := trim(v_invitation.first_name || ' ' || v_invitation.last_name);

  insert into public.users (
    id, name, email, role, department_id,
    first_name, last_name, status, group_name,
    invited_at, activated_at, last_active_at
  )
  values (
    auth.uid(), v_full_name, v_auth_email, v_invitation.role, v_invitation.department_id,
    v_invitation.first_name, v_invitation.last_name, 'active', v_invitation.group_name,
    v_invitation.created_at, now(), now()
  )
  on conflict (id) do update
    set
      name           = excluded.name,
      email          = excluded.email,
      role           = excluded.role,
      department_id  = excluded.department_id,
      first_name     = excluded.first_name,
      last_name      = excluded.last_name,
      status         = 'active',
      group_name     = coalesce(public.users.group_name, excluded.group_name),
      invited_at     = coalesce(public.users.invited_at, excluded.invited_at),
      activated_at   = coalesce(public.users.activated_at, now()),
      last_active_at = now()
  returning * into v_user;

  if v_invitation.role = 'member' and v_invitation.assigned_pastor_id is not null then
    insert into public.pastor_members (pastor_id, member_id)
    values (v_invitation.assigned_pastor_id, auth.uid())
    on conflict (pastor_id, member_id) do nothing;
  end if;

  update public.user_invitations
  set
    status           = 'accepted',
    accepted_at      = now(),
    accepted_user_id = auth.uid(),
    delivery_status  = 'activated',
    delivery_error   = null
  where id = v_invitation.id;

  insert into public.user_status_history (user_id, from_status, to_status, reason, changed_by)
  values (auth.uid(), 'invited', 'active', 'Invitation accepted (self-heal)', auth.uid());

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_accepted', 'user_invitation', v_invitation.id);

  return v_user;
end;
$$;

-- ── Users may set their own group (profile page) ─────────────────────────────
-- Existing self-update policies typically cover this; this is a safety net for
-- environments where users can't update their own row.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users' and policyname = 'users_self_update_group'
  ) then
    create policy users_self_update_group on public.users
      for update using (id = auth.uid()) with check (id = auth.uid());
  end if;
end $$;
