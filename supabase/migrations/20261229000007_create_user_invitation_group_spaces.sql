-- Update create_user_invitation RPC to accept group_space_ids
-- The RPC will store them on the invitation and add the user to group spaces upon acceptance

DROP FUNCTION IF EXISTS public.create_user_invitation(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_department_id uuid,
  p_role text,
  p_assigned_pastor_id uuid,
  p_message text,
  p_group_name text
) CASCADE;

CREATE FUNCTION public.create_user_invitation(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_department_id uuid,
  p_role text,
  p_assigned_pastor_id uuid,
  p_message text,
  p_group_name text,
  p_group_space_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  email text,
  first_name text,
  last_name text,
  status text,
  created_at timestamp,
  expires_at timestamp
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_invitation_id uuid;
  v_expires_at timestamp;
begin
  -- Validate input
  if trim(p_email) = '' then
    raise exception 'Email cannot be empty';
  end if;

  if p_first_name is null or trim(p_first_name) = '' then
    raise exception 'First name is required';
  end if;

  if p_last_name is null or trim(p_last_name) = '' then
    raise exception 'Last name is required';
  end if;

  -- Invitation expires in 30 days
  v_expires_at := now() + interval '30 days';

  -- Create invitation with group_space_ids
  insert into public.user_invitations (
    email,
    first_name,
    last_name,
    department_id,
    role,
    assigned_pastor_id,
    message,
    group_name,
    group_space_ids,
    expires_at,
    status
  ) values (
    lower(trim(p_email)),
    trim(p_first_name),
    trim(p_last_name),
    p_department_id,
    p_role,
    p_assigned_pastor_id,
    p_message,
    p_group_name,
    coalesce(p_group_space_ids, array[]::uuid[]),
    v_expires_at,
    'pending'
  )
  returning public.user_invitations.id into v_invitation_id;

  -- Return invitation details
  return query
  select
    public.user_invitations.id,
    public.user_invitations.email,
    public.user_invitations.first_name,
    public.user_invitations.last_name,
    public.user_invitations.status,
    public.user_invitations.created_at,
    public.user_invitations.expires_at
  from public.user_invitations
  where public.user_invitations.id = v_invitation_id;
end;
$$;
