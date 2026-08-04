-- Clean up duplicate recurring "Weekly Direction Meeting" series and excess instances.
-- Keep: completed ones (historical) + 1 upcoming scheduled instance per series.
-- Delete: all extra scheduled/future instances beyond the next one.
-- Then ensure only one upcoming instance has next_occurrence_scheduled set
-- so the cron only generates one at a time going forward.

DO $$
DECLARE
  keep_id UUID;
  keep_series_id UUID;
  deleted_count INT := 0;
BEGIN
  -- The accidentally created Weekly Direction Meeting series all point to the
  -- same meeting. Keep the series with completed history (or the oldest one)
  -- and remove duplicate series before trimming future occurrences.
  SELECT recurrence_id INTO keep_series_id
  FROM meetings
  WHERE lower(title) = 'weekly direction meeting'
    AND recurrence_id IS NOT NULL
  ORDER BY (status = 'completed') DESC, created_at ASC
  LIMIT 1;

  IF keep_series_id IS NOT NULL THEN
    DELETE FROM meetings
    WHERE lower(title) = 'weekly direction meeting'
      AND recurrence_id IS NOT NULL
      AND recurrence_id <> keep_series_id;

    UPDATE meetings
    SET meeting_type = 'manager_meeting'
    WHERE recurrence_id = keep_series_id;

    -- Keep completed history and one next scheduled occurrence in the retained series.
    SELECT id INTO keep_id
    FROM meetings
    WHERE recurrence_id = keep_series_id
      AND status = 'scheduled'
      AND date > NOW()
    ORDER BY date ASC
    LIMIT 1;

    -- Delete only excess future rows in this known duplicate series.
    WITH deleted AS (
      DELETE FROM meetings
      WHERE recurrence_id = keep_series_id
        AND status = 'scheduled'
        AND date > NOW()
        AND (keep_id IS NULL OR id <> keep_id)
      RETURNING id
    )
    SELECT deleted_count + COUNT(*) INTO deleted_count FROM deleted;

    -- Keep one generator marker for this series only.
    UPDATE meetings
    SET next_occurrence_scheduled = NULL
    WHERE recurrence_id = keep_series_id
      AND next_occurrence_scheduled IS NOT NULL;

    IF keep_id IS NOT NULL THEN
      -- Generate the next occurrence on its scheduled meeting day.
      UPDATE meetings
      SET next_occurrence_scheduled = date
      WHERE id = keep_id;
    ELSE
      -- No future instance exists — set next_occurrence_scheduled on the
      -- most recent instance so the cron can generate the next one
      UPDATE meetings
      SET next_occurrence_scheduled = NOW()
      WHERE id = (
        SELECT id FROM meetings
        WHERE recurrence_id = keep_series_id
        ORDER BY series_instance_num DESC
        LIMIT 1
      );
    END IF;
  END IF;

  RAISE NOTICE 'Deleted % excess recurring meeting instance(s)', deleted_count;
END $$;
