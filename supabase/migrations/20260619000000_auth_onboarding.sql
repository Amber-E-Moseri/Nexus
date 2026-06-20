create extension if not exists pgcrypto;

create or replace view public.user_invites as
select * from public.user_invitations;

alter table public.user_invitations
  add column if not exists invite_message text,
  add column if not exists invitation_token_hash text,
  add column if not exists revoked_at timestamptz,
  add column if not exists initial_space_ids uuid[];

update public.user_invitations
set
  status = 'revoked',
  revoked_at = coalesce(revoked_at, cancelled_at)
where status = 'cancelled';

alter table public.user_invitations
  drop constraint if exists user_invitations_status_check;

alter table public.user_invitations
  add constraint user_invitations_status_check
  check (status in ('pending', 'accepted', 'expired', 'revoked'));

update public.user_invitations
set invitation_token_hash = md5(invitation_token)
where invitation_token is not null
  and invitation_token_hash is null;

create index if not exists user_invitations_token_hash_idx
  on public.user_invitations (invitation_token_hash);

create or replace function public.issue_user_invitation_token(
  p_invitation_id uuid,
  p_extend_expiry boolean default false
)
returns table (
  invitation_id uuid,
  invitation_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.users%rowtype;
  v_invitation public.user_invitations%rowtype;
  v_token text;
  v_hash text;
begin
  select * into v_actor from public.users where id = auth.uid();

  if v_actor.id is null then
    raise exception 'Authentication required';
  end if;

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to issue invitation links';
  end if;

  select * into v_invitation from public.user_invitations where id = p_invitation_id;

  if v_invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_actor.role = 'dept_lead' and v_invitation.department_id is distinct from v_actor.department_id then
    raise exception 'Department leads may issue invitation links for their own department only';
  end if;

  if v_invitation.status in ('accepted', 'expired', 'revoked') then
    raise exception 'Invitation cannot issue a new link while %', v_invitation.status;
  end if;

  v_token := substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 48);
  v_hash := md5(v_token);

  update public.user_invitations
  set
    invitation_token = null,
    invitation_token_hash = v_hash,
    expires_at = case when p_extend_expiry then now() + interval '7 days' else expires_at end
  where id = p_invitation_id
  returning public.user_invitations.id, public.user_invitations.expires_at
  into invitation_id, expires_at;

  invitation_token := v_token;
  return next;
end;
$$;

drop function if exists public.preview_user_invitation(p_token text) cascade;
create function public.preview_user_invitation(p_token text)
returns table (
  invitation_id uuid,
  first_name text,
  last_name text,
  email text,
  role text,
  department_id uuid,
  department_name text,
  assigned_pastor_name text,
  expires_at timestamptz,
  invite_message text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_hash text := md5(p_token);
begin
  update public.user_invitations
  set
    status = 'expired',
    delivery_status = 'expired',
    delivery_error = null
  where status = 'pending'
    and expires_at < now()
    and (
      invitation_token_hash = v_hash
      or invitation_token = p_token
    );

  return query
  select
    invitations.id,
    invitations.first_name,
    invitations.last_name,
    invitations.email,
    invitations.role,
    invitations.department_id,
    departments.name,
    pastors.name,
    invitations.expires_at,
    invitations.invite_message
  from public.user_invitations invitations
  join public.departments departments on departments.id = invitations.department_id
  left join public.users pastors on pastors.id = invitations.assigned_pastor_id
  where invitations.status = 'pending'
    and invitations.expires_at >= now()
    and (
      invitations.invitation_token_hash = v_hash
      or invitations.invitation_token = p_token
    );
end;
$$;

drop function if exists public.create_user_invitation(text, text, text, uuid, text, uuid) cascade;
create function public.create_user_invitation(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_department_id uuid,
  p_role text,
  p_assigned_pastor_id uuid default null,
  p_message text default null
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
    null,
    null,
    nullif(trim(p_message), ''),
    'pending'
  )
  returning *
  into v_result;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_created', 'user_invitation', v_result.id);

  return v_result;
end;
$$;

create or replace function public.resend_user_invitation(p_invitation_id uuid)
returns public.user_invitations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.users%rowtype;
  v_invitation public.user_invitations%rowtype;
begin
  select * into v_actor from public.users where id = auth.uid();

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to resend invitations';
  end if;

  select * into v_invitation from public.user_invitations where id = p_invitation_id;

  if v_invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_actor.role = 'dept_lead' and v_invitation.department_id is distinct from v_actor.department_id then
    raise exception 'Department leads may resend invitations for their own department only';
  end if;

  update public.user_invitations
  set
    resent_at = now(),
    expires_at = now() + interval '7 days',
    status = 'pending',
    delivery_status = 'pending',
    delivery_error = null
  where id = p_invitation_id
  returning *
  into v_invitation;

  return v_invitation;
end;
$$;

create or replace function public.cancel_user_invitation(p_invitation_id uuid)
returns public.user_invitations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.users%rowtype;
  v_invitation public.user_invitations%rowtype;
begin
  select * into v_actor from public.users where id = auth.uid();

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to revoke invitations';
  end if;

  select * into v_invitation from public.user_invitations where id = p_invitation_id;

  if v_invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_actor.role = 'dept_lead' and v_invitation.department_id is distinct from v_actor.department_id then
    raise exception 'Department leads may revoke invitations for their own department only';
  end if;

  update public.user_invitations
  set
    status = 'revoked',
    revoked_at = now(),
    delivery_status = 'cancelled',
    delivery_error = null
  where id = p_invitation_id
  returning *
  into v_invitation;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_revoked', 'user_invitation', v_invitation.id);

  return v_invitation;
end;
$$;

create or replace function public.update_user_invitation_expiry(
  p_invitation_id uuid,
  p_expires_at timestamptz
)
returns public.user_invitations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.users%rowtype;
  v_invitation public.user_invitations%rowtype;
begin
  select * into v_actor from public.users where id = auth.uid();

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to update invitation expiry';
  end if;

  select * into v_invitation from public.user_invitations where id = p_invitation_id;

  if v_invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_actor.role = 'dept_lead' and v_invitation.department_id is distinct from v_actor.department_id then
    raise exception 'Department leads may manage invitations for their own department only';
  end if;

  if p_expires_at <= now() then
    raise exception 'Expiry must be in the future';
  end if;

  update public.user_invitations
  set
    expires_at = p_expires_at,
    status = case when status = 'expired' then 'pending' else status end,
    delivery_status = case when delivery_status = 'expired' then 'pending' else delivery_status end
  where id = p_invitation_id
  returning *
  into v_invitation;

  return v_invitation;
end;
$$;

create or replace function public.accept_user_invitation(p_token text)
returns public.users
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invitation public.user_invitations%rowtype;
  v_auth_email text;
  v_user public.users%rowtype;
  v_full_name text;
  v_hash text := md5(p_token);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.user_invitations
  set
    status = 'expired',
    delivery_status = 'expired',
    delivery_error = null
  where status = 'pending'
    and expires_at < now()
    and (
      invitation_token_hash = v_hash
      or invitation_token = p_token
    );

  select *
  into v_invitation
  from public.user_invitations
  where status = 'pending'
    and expires_at >= now()
    and (
      invitation_token_hash = v_hash
      or invitation_token = p_token
    );

  if v_invitation.id is null then
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
    id,
    name,
    email,
    role,
    department_id,
    first_name,
    last_name,
    status,
    invited_at,
    activated_at,
    last_active_at
  )
  values (
    auth.uid(),
    v_full_name,
    lower(v_invitation.email),
    v_invitation.role,
    v_invitation.department_id,
    v_invitation.first_name,
    v_invitation.last_name,
    'active',
    v_invitation.created_at,
    now(),
    now()
  )
  on conflict (id) do update
    set
      name = excluded.name,
      email = excluded.email,
      role = excluded.role,
      department_id = excluded.department_id,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      status = 'active',
      invited_at = coalesce(public.users.invited_at, excluded.invited_at),
      activated_at = coalesce(public.users.activated_at, now()),
      last_active_at = now()
  returning *
  into v_user;

  if v_invitation.role = 'member' then
    delete from public.pastor_members
    where member_id = auth.uid();

    if v_invitation.assigned_pastor_id is not null then
      insert into public.pastor_members (pastor_id, member_id)
      values (v_invitation.assigned_pastor_id, auth.uid())
      on conflict (pastor_id, member_id) do nothing;
    end if;
  end if;

  update public.user_invitations
  set
    status = 'accepted',
    accepted_at = now(),
    accepted_user_id = auth.uid(),
    delivery_status = 'activated',
    delivery_error = null
  where id = v_invitation.id;

  insert into public.user_status_history (user_id, from_status, to_status, reason, changed_by)
  values (auth.uid(), 'invited', 'active', 'Invitation accepted', auth.uid());

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_accepted', 'user_invitation', v_invitation.id);

  return v_user;
end;
$$;
