-- Meeting Minutes Browser: add notes_blocks (ProseMirror JSON) + notes_text (FTS mirror)
-- to the meetings table, which is what MeetingDetailView.jsx actually writes to.
-- meeting_minutes_segments is left unchanged.

-- 1. New columns
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS notes_blocks jsonb,  -- ProseMirror doc tree from Tiptap
  ADD COLUMN IF NOT EXISTS notes_text   text;   -- trigger-maintained plaintext mirror for FTS

-- 2. Recursive ProseMirror tree → plain text extractor
--    Mirrors the JS function in src/features/meetings/lib/minutesBlocks.js
CREATE OR REPLACE FUNCTION extract_tiptap_text(node jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  child  jsonb;
  result text := '';
BEGIN
  -- Leaf text nodes carry the actual content
  IF (node->>'type') = 'text' THEN
    RETURN COALESCE(node->>'text', '');
  END IF;
  -- Recurse into child nodes
  IF node ? 'content' AND jsonb_typeof(node->'content') = 'array' THEN
    FOR child IN SELECT jsonb_array_elements(node->'content') LOOP
      result := result || ' ' || extract_tiptap_text(child);
    END LOOP;
  END IF;
  RETURN trim(result);
END;
$$;

-- 3. Trigger: keep notes_text in sync with notes_blocks (or fall back to minutes)
CREATE OR REPLACE FUNCTION sync_meeting_notes_text() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.notes_blocks IS NOT NULL THEN
    NEW.notes_text := extract_tiptap_text(NEW.notes_blocks);
  ELSE
    NEW.notes_text := NEW.minutes;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_sync_meeting_notes_text
BEFORE INSERT OR UPDATE OF notes_blocks, minutes ON meetings
FOR EACH ROW EXECUTE FUNCTION sync_meeting_notes_text();

-- 4. Server-side backfill: wrap existing plain-text minutes in a ProseMirror paragraph
--    Disable the summary-only-update trigger for this backfill; it only applies to
--    unprivileged client sessions and would block a superuser migration that touches
--    columns other than `summary`.
ALTER TABLE meetings DISABLE TRIGGER enforce_meetings_summary_only_update;

UPDATE meetings
SET
  notes_blocks = jsonb_build_object(
    'type', 'doc',
    'content', jsonb_build_array(
      jsonb_build_object(
        'type', 'paragraph',
        'content', CASE
          WHEN minutes IS NOT NULL AND minutes != ''
          THEN jsonb_build_array(jsonb_build_object('type', 'text', 'text', minutes))
          ELSE '[]'::jsonb
        END
      )
    )
  ),
  notes_text = minutes
WHERE minutes IS NOT NULL AND minutes != '' AND notes_blocks IS NULL;

ALTER TABLE meetings ENABLE TRIGGER enforce_meetings_summary_only_update;

-- 5. GIN index for full-text search
--    No CONCURRENTLY: migrations run inside a transaction block and Postgres refuses
--    CONCURRENTLY there. New column with no existing readers — brief lock is fine.
CREATE INDEX IF NOT EXISTS meetings_notes_fts_idx
  ON meetings USING gin(to_tsvector('english', COALESCE(notes_text, '')));

-- 6. Partial composite index for timeline pagination
--    Includes both stable predicates so the planner avoids seq-scans on hub queries.
CREATE INDEX IF NOT EXISTS meetings_dept_date_idx
  ON meetings(department_id, date DESC)
  WHERE notes_text IS NOT NULL AND notes_text != '' AND visibility = 'published';

-- 7. Search RPC — enforces dept scoping server-side so p_dept_id cannot be used
--    for privilege escalation. SET search_path prevents search_path hijacking.
CREATE OR REPLACE FUNCTION search_meeting_notes(p_query text, p_dept_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, title text, date timestamptz, notes_text text, rank real)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role     text;
  v_dept     uuid;
  v_eff_dept uuid;
BEGIN
  -- Always resolve caller's actual role/dept from DB; never trust client param for auth.
  -- Table: public.users with columns role text, department_id uuid.
  SELECT u.role, u.department_id INTO v_role, v_dept
  FROM users u WHERE u.id = auth.uid();

  IF v_role IN ('super_admin', 'regional_secretary') THEN
    -- Admins may pass p_dept_id to narrow scope, but cannot be forced wider than all.
    v_eff_dept := p_dept_id;  -- NULL = all depts; UUID = narrow to that dept
  ELSE
    -- Regular users always scoped to their own dept; p_dept_id is ignored.
    v_eff_dept := v_dept;
  END IF;

  RETURN QUERY
  SELECT m.id, m.title, m.date, m.notes_text,
         ts_rank(to_tsvector('english', COALESCE(m.notes_text, '')),
                 websearch_to_tsquery('english', p_query)) AS rank
  FROM meetings m
  WHERE m.visibility = 'published'
    AND m.notes_text IS NOT NULL AND m.notes_text != ''
    AND (
      v_eff_dept IS NULL
      OR m.department_id = v_eff_dept
      OR EXISTS (
        SELECT 1 FROM meeting_spaces ms
        WHERE ms.meeting_id = m.id AND ms.department_id = v_eff_dept
      )
    )
    AND to_tsvector('english', COALESCE(m.notes_text, ''))
        @@ websearch_to_tsquery('english', p_query)
  ORDER BY rank DESC, m.date DESC
  LIMIT 30;  -- MVP cap; add p_limit param in follow-up if needed
END;
$$;

-- 8. Deprecation note on meetings.minutes
--    Target drop date: one sprint after prod backfill is verified.
--    Pre-drop check: SELECT COUNT(*) FROM meetings WHERE minutes IS NOT NULL AND notes_blocks IS NULL;
COMMENT ON COLUMN meetings.minutes IS
  'DEPRECATED: replaced by notes_blocks + notes_text. Drop after prod backfill verified.';
