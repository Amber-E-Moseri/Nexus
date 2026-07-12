-- Fix issue_user_invitation_token:
-- 1. "expires_at" column reference was ambiguous (RETURNS TABLE output column
--    vs user_invitations.expires_at in UPDATE SET / RETURNING INTO).
-- 2. invitation_token was set to NULL instead of the generated v_token.

CREATE OR REPLACE FUNCTION public.issue_user_invitation_token(
  p_invitation_id uuid,
  p_extend_expiry boolean DEFAULT false
)
RETURNS TABLE (
  invitation_id uuid,
  invitation_token text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor public.users%rowtype;
  v_invitation public.user_invitations%rowtype;
  v_token text;
  v_hash text;
  v_out_id uuid;
  v_out_expires timestamptz;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE id = auth.uid();

  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_actor.role NOT IN ('super_admin', 'dept_lead') THEN
    RAISE EXCEPTION 'You do not have permission to issue invitation links';
  END IF;

  SELECT * INTO v_invitation FROM public.user_invitations WHERE id = p_invitation_id;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF v_actor.role = 'dept_lead' AND v_invitation.department_id IS DISTINCT FROM v_actor.department_id THEN
    RAISE EXCEPTION 'Department leads may issue invitation links for their own department only';
  END IF;

  IF v_invitation.status IN ('accepted', 'expired', 'revoked') THEN
    RAISE EXCEPTION 'Invitation cannot issue a new link while %', v_invitation.status;
  END IF;

  v_token := substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 48);
  v_hash := md5(v_token);

  UPDATE public.user_invitations ui
  SET
    invitation_token = v_token,
    invitation_token_hash = v_hash,
    expires_at = CASE WHEN p_extend_expiry THEN now() + interval '7 days' ELSE ui.expires_at END
  WHERE ui.id = p_invitation_id
  RETURNING ui.id, ui.expires_at
  INTO v_out_id, v_out_expires;

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id)
  VALUES (auth.uid(), 'invitation_link_issued', 'user_invitation', p_invitation_id);

  invitation_id := v_out_id;
  invitation_token := v_token;
  expires_at := v_out_expires;
  RETURN NEXT;
END;
$$;
