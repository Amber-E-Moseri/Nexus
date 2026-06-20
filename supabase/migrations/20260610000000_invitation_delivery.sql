alter table public.user_invitations
  add column if not exists sent_at timestamptz,
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_count integer not null default 0,
  add column if not exists delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed', 'cancelled', 'activated', 'expired')),
  add column if not exists delivery_error text;

update public.user_invitations
set delivery_status = case
  when status = 'accepted' then 'activated'
  when status = 'cancelled' then 'cancelled'
  when status = 'expired' then 'expired'
  else 'pending'
end
where delivery_status is null
   or delivery_status not in ('pending', 'sent', 'failed', 'cancelled', 'activated', 'expired');

create index if not exists user_invitations_delivery_status_idx
  on public.user_invitations (delivery_status, last_sent_at desc);

create or replace function public.preview_user_invitation(p_token text)
returns table (
  invitation_id uuid,
  first_name text,
  last_name text,
  email text,
  role text,
  department_id uuid,
  department_name text,
  assigned_pastor_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.user_invitations
  set
    status = 'expired',
    delivery_status = 'expired',
    delivery_error = null
  where invitation_token = p_token
    and status = 'pending'
    and expires_at < now();

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
    invitations.expires_at
  from public.user_invitations invitations
  join public.departments departments on departments.id = invitations.department_id
  left join public.users pastors on pastors.id = invitations.assigned_pastor_id
  where invitations.invitation_token = p_token
    and invitations.status = 'pending'
    and invitations.expires_at >= now();
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
  select *
  into v_actor
  from public.users
  where id = auth.uid();

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to resend invitations';
  end if;

  select *
  into v_invitation
  from public.user_invitations
  where id = p_invitation_id;

  if v_invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_actor.role = 'dept_lead' and v_invitation.department_id is distinct from v_actor.department_id then
    raise exception 'Department leads may resend invitations for their own department only';
  end if;

  update public.user_invitations
  set
    invitation_token = substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 48),
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
  select *
  into v_actor
  from public.users
  where id = auth.uid();

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to cancel invitations';
  end if;

  select *
  into v_invitation
  from public.user_invitations
  where id = p_invitation_id;

  if v_invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_actor.role = 'dept_lead' and v_invitation.department_id is distinct from v_actor.department_id then
    raise exception 'Department leads may cancel invitations for their own department only';
  end if;

  update public.user_invitations
  set
    status = 'cancelled',
    cancelled_at = now(),
    delivery_status = 'cancelled',
    delivery_error = null
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
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.user_invitations
  set
    status = 'expired',
    delivery_status = 'expired',
    delivery_error = null
  where invitation_token = p_token
    and status = 'pending'
    and expires_at < now();

  select *
  into v_invitation
  from public.user_invitations
  where invitation_token = p_token
    and status = 'pending'
    and expires_at >= now();

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

  return v_user;
end;
$$;

create or replace function public.record_invitation_delivery_attempt(
  p_invitation_id uuid,
  p_delivery_status text,
  p_delivery_error text default null
)
returns public.user_invitations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invitation public.user_invitations%rowtype;
  v_next_count integer;
begin
  select *
  into v_invitation
  from public.user_invitations
  where id = p_invitation_id;

  if v_invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  if p_delivery_status not in ('pending', 'sent', 'failed', 'cancelled', 'activated', 'expired') then
    raise exception 'Invalid delivery status';
  end if;

  v_next_count := coalesce(v_invitation.send_count, 0) + 1;

  update public.user_invitations
  set
    sent_at = case
      when p_delivery_status = 'sent' and sent_at is null then now()
      else sent_at
    end,
    last_sent_at = now(),
    send_count = v_next_count,
    delivery_status = p_delivery_status,
    delivery_error = case
      when p_delivery_status = 'sent' then null
      else left(coalesce(p_delivery_error, ''), 1000)
    end
  where id = p_invitation_id
  returning *
  into v_invitation;

  return v_invitation;
end;
$$;
