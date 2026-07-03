-- Get most recent active regional update
CREATE OR REPLACE FUNCTION public.get_active_regional_update()
RETURNS TABLE (
  id uuid,
  content text,
  created_by uuid,
  creator_name text,
  created_at timestamptz,
  expires_at timestamptz
) LANGUAGE sql STABLE AS $$
  SELECT
    u.id,
    u.content,
    u.created_by,
    uu.name,
    u.created_at,
    u.expires_at
  FROM public.regional_updates u
  LEFT JOIN public.users uu ON uu.id = u.created_by
  WHERE u.expires_at > now()
  ORDER BY u.created_at DESC
  LIMIT 1;
$$;

-- Get all regional updates (for sidebar list)
CREATE OR REPLACE FUNCTION public.get_regional_updates_list()
RETURNS TABLE (
  id uuid,
  content text,
  created_by uuid,
  creator_name text,
  created_at timestamptz,
  expires_at timestamptz,
  is_expired boolean
) LANGUAGE sql STABLE AS $$
  SELECT
    u.id,
    u.content,
    u.created_by,
    uu.name,
    u.created_at,
    u.expires_at,
    (u.expires_at <= now()) as is_expired
  FROM public.regional_updates u
  LEFT JOIN public.users uu ON uu.id = u.created_by
  ORDER BY u.created_at DESC
  LIMIT 50;
$$;
