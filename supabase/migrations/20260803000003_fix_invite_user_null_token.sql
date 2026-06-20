-- Fix create_user_invitation inserting null for invitation_token (NOT NULL constraint violation).
-- The 20260619 rewrite deferred token generation to issue_user_invitation_token, but the column
-- is NOT NULL. Generate the token and its md5 hash at insert time instead.

create or replace function public.create_user_invitation(
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

  v_token := encode(gen_random_bytes(24), 'hex');

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
    v_token,
    md5(v_token),
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
