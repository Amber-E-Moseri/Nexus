-- Fix 3 invite-system bugs exposed by group-space-only invitations:
--
-- 1. preview_user_invitation used INNER JOIN on department_id, so invitations
--    with a null department_id (group-space-only) returned no rows and the
--    accept-invite page showed "Invitation not found".
--
-- 2. create_bulk_user_invitations called create_user_invitation with 6 positional
--    args. That overload was dropped in 20261229000009, breaking bulk import.
--
-- 3. send-user-invitation edge function is handled separately (TypeScript).

-- Fix 1: LEFT JOIN so group-space-only invitations resolve correctly
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
  UPDATE public.user_invitations
  SET status = 'expired'
  WHERE invitation_token = p_token
    AND status = 'pending'
    AND expires_at < now();

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

-- Fix 2: Rewrite create_bulk_user_invitations to call the current 9-arg signature
-- (department is required for bulk import via CSV — group-space-only not supported there)
CREATE OR REPLACE FUNCTION public.create_bulk_user_invitations(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row jsonb;
  v_department_id uuid;
  v_pastor_id uuid;
  v_created integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  LOOP
    BEGIN
      SELECT id
      INTO v_department_id
      FROM public.departments
      WHERE lower(name) = lower(trim(v_row->>'department'));

      IF v_department_id IS NULL THEN
        RAISE EXCEPTION 'Department not found';
      END IF;

      IF coalesce(trim(v_row->>'pastor_email'), '') <> '' THEN
        SELECT id
        INTO v_pastor_id
        FROM public.users
        WHERE lower(email) = lower(trim(v_row->>'pastor_email'))
          AND role = 'pastor';
      ELSE
        v_pastor_id := null;
      END IF;

      PERFORM public.create_user_invitation(
        p_first_name       := v_row->>'first_name',
        p_last_name        := v_row->>'last_name',
        p_email            := v_row->>'email',
        p_department_id    := v_department_id,
        p_role             := coalesce(nullif(lower(trim(v_row->>'role')), ''), 'member'),
        p_assigned_pastor_id := v_pastor_id
      );

      v_created := v_created + 1;
      v_results := v_results || jsonb_build_object(
        'email', v_row->>'email',
        'status', 'created'
      );
    EXCEPTION
      WHEN unique_violation THEN
        v_skipped := v_skipped + 1;
        v_results := v_results || jsonb_build_object(
          'email', v_row->>'email',
          'status', 'skipped',
          'message', 'Pending invitation already exists'
        );
      WHEN others THEN
        v_failed := v_failed + 1;
        v_results := v_results || jsonb_build_object(
          'email', v_row->>'email',
          'status', 'failed',
          'message', sqlerrm
        );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'skipped', v_skipped,
    'failed', v_failed,
    'results', v_results
  );
END;
$$;
