-- Fix preview_user_invitation: "column reference expires_at is ambiguous".
--
-- The function's RETURNS TABLE declares an output column named expires_at,
-- which shadows user_invitations.expires_at inside the function body. The
-- opening UPDATE ... WHERE ... expires_at < now() referenced the column
-- unqualified, so PL/pgSQL couldn't tell the output column from the table
-- column and raised the ambiguity error (surfaced as a 400 on the
-- accept-invite page). Same class of bug fixed for
-- issue_user_invitation_token in 20261230000004; the preview function was
-- missed. Fix: alias the table in the UPDATE and qualify every column.

DROP FUNCTION IF EXISTS public.preview_user_invitation(text);
CREATE OR REPLACE FUNCTION public.preview_user_invitation(p_token text)
RETURNS TABLE (
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.user_invitations ui
  SET status = 'expired'
  WHERE ui.invitation_token = p_token
    AND ui.status = 'pending'
    AND ui.expires_at < now();

  RETURN QUERY
  SELECT
    invitations.id,
    invitations.first_name,
    invitations.last_name,
    invitations.email,
    invitations.role,
    invitations.department_id,
    departments.name,
    pastors.name,
    invitations.expires_at
  FROM public.user_invitations invitations
  LEFT JOIN public.departments departments ON departments.id = invitations.department_id
  LEFT JOIN public.users pastors ON pastors.id = invitations.assigned_pastor_id
  WHERE invitations.invitation_token = p_token
    AND invitations.status = 'pending'
    AND invitations.expires_at >= now();
END;
$$;
