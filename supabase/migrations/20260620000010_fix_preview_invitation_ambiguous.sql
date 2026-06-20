-- Fix ambiguous expires_at column reference in preview_user_invitation

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
    and public.user_invitations.expires_at < now()
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
