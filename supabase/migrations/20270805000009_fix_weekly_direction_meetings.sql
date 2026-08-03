-- Fix Weekly Direction Meeting series:
-- 1. Delete duplicate recurring series (keep the series that has a completed occurrence)
-- 2. Set meeting_type = direction_meeting and visibility = published on the kept series
-- 3. Add meeting_spaces shares to ORS, Pastors, and PFCC for every occurrence

DO $$
DECLARE
  keep_recurrence_id UUID;
  ors_dept_id        UUID;
  pastors_dept_id    UUID;
  pfcc_dept_id       UUID;
  deleted_count      INT;
BEGIN
  -- ── 1. Pick the series to keep ────────────────────────────────────────────
  -- Prefer the series that already has a completed occurrence (it has real history).
  -- If none are completed yet, fall back to the oldest series by created_at.
  SELECT recurrence_id INTO keep_recurrence_id
  FROM meetings
  WHERE LOWER(title) = 'weekly direction meeting'
    AND recurrence_id IS NOT NULL
    AND status = 'completed'
  LIMIT 1;

  IF keep_recurrence_id IS NULL THEN
    SELECT recurrence_id INTO keep_recurrence_id
    FROM meetings
    WHERE LOWER(title) = 'weekly direction meeting'
      AND recurrence_id IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF keep_recurrence_id IS NULL THEN
    RAISE NOTICE 'No recurring Weekly Direction Meeting found — skipping.';
    RETURN;
  END IF;

  -- ── 2. Remove cross-dept shares for meetings we're about to delete ─────────
  DELETE FROM meeting_spaces
  WHERE meeting_id IN (
    SELECT id FROM meetings
    WHERE LOWER(title) = 'weekly direction meeting'
      AND recurrence_id IS NOT NULL
      AND recurrence_id <> keep_recurrence_id
  );

  -- ── 3. Delete all duplicate series ────────────────────────────────────────
  WITH deleted AS (
    DELETE FROM meetings
    WHERE LOWER(title) = 'weekly direction meeting'
      AND recurrence_id IS NOT NULL
      AND recurrence_id <> keep_recurrence_id
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RAISE NOTICE 'Deleted % duplicate Weekly Direction Meeting row(s)', deleted_count;

  -- ── 4. Fix type and visibility on every occurrence of the kept series ──────
  UPDATE meetings
  SET meeting_type = 'direction_meeting',
      visibility   = 'published'
  WHERE recurrence_id = keep_recurrence_id;

  -- ── 5. Resolve department IDs ──────────────────────────────────────────────
  SELECT id INTO ors_dept_id     FROM departments WHERE name = 'ORS'     LIMIT 1;
  SELECT id INTO pastors_dept_id FROM departments WHERE name = 'Pastors' LIMIT 1;
  SELECT id INTO pfcc_dept_id    FROM departments WHERE name = 'PFCC'    LIMIT 1;

  IF ors_dept_id     IS NULL THEN RAISE WARNING 'ORS department not found';     END IF;
  IF pastors_dept_id IS NULL THEN RAISE WARNING 'Pastors department not found'; END IF;
  IF pfcc_dept_id    IS NULL THEN RAISE WARNING 'PFCC department not found';    END IF;

  -- ── 6. Share every occurrence with ORS, Pastors, and PFCC ─────────────────
  IF ors_dept_id IS NOT NULL THEN
    INSERT INTO meeting_spaces (meeting_id, department_id, added_by)
    SELECT m.id, ors_dept_id, m.created_by
    FROM meetings m
    WHERE m.recurrence_id = keep_recurrence_id
      AND NOT EXISTS (
        SELECT 1 FROM meeting_spaces ms
        WHERE ms.meeting_id = m.id AND ms.department_id = ors_dept_id
      );
  END IF;

  IF pastors_dept_id IS NOT NULL THEN
    INSERT INTO meeting_spaces (meeting_id, department_id, added_by)
    SELECT m.id, pastors_dept_id, m.created_by
    FROM meetings m
    WHERE m.recurrence_id = keep_recurrence_id
      AND NOT EXISTS (
        SELECT 1 FROM meeting_spaces ms
        WHERE ms.meeting_id = m.id AND ms.department_id = pastors_dept_id
      );
  END IF;

  IF pfcc_dept_id IS NOT NULL THEN
    INSERT INTO meeting_spaces (meeting_id, department_id, added_by)
    SELECT m.id, pfcc_dept_id, m.created_by
    FROM meetings m
    WHERE m.recurrence_id = keep_recurrence_id
      AND NOT EXISTS (
        SELECT 1 FROM meeting_spaces ms
        WHERE ms.meeting_id = m.id AND ms.department_id = pfcc_dept_id
      );
  END IF;

  RAISE NOTICE 'Done — kept series %, shared to ORS / Pastors / PFCC', keep_recurrence_id;
END $$;
