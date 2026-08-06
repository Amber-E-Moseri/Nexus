-- Minutes Hub search must use the caller's meetings RLS policy rather than
-- separately reconstructing department and visibility access rules.
-- This includes private meetings only for their creator and explicit viewers.

DROP FUNCTION IF EXISTS public.search_meeting_notes(text, uuid);

CREATE FUNCTION public.search_meeting_notes(
  p_query text,
  p_dept_id uuid DEFAULT NULL,
  p_meeting_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  date timestamptz,
  notes_text text,
  rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    m.id,
    m.title,
    m.date,
    m.notes_text,
    ts_rank(
      to_tsvector('english', coalesce(m.notes_text || ' ' || m.summary || ' ' || m.transcript, '')),
      websearch_to_tsquery('english', p_query)
    ) AS rank
  FROM public.meetings AS m
  WHERE (
      (m.notes_text IS NOT NULL AND m.notes_text != '')
      OR (m.summary IS NOT NULL AND m.summary != '')
      OR (m.transcript IS NOT NULL AND m.transcript != '')
    )
    AND (p_meeting_type IS NULL OR m.meeting_type = p_meeting_type)
    AND (
      p_dept_id IS NULL
      OR m.department_id = p_dept_id
      OR public.meeting_shared_with_department(m.id, p_dept_id)
    )
    AND (
      to_tsvector('english', coalesce(m.notes_text, ''))
        @@ websearch_to_tsquery('english', p_query)
      OR to_tsvector('english', coalesce(m.summary, ''))
        @@ websearch_to_tsquery('english', p_query)
      OR to_tsvector('english', coalesce(m.transcript, ''))
        @@ websearch_to_tsquery('english', p_query)
    )
  ORDER BY rank DESC, m.date DESC
  LIMIT 30;
$$;
