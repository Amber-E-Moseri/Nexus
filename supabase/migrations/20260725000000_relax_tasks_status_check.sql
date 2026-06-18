-- Board/List drag between columns failed (UPDATE rejected, card snaps back)
-- because of an inconsistency between two existing migrations:
--
--   * 20260608000000_initial_blw_canada_os_schema.sql constrains tasks.status to
--     check (status in ('backlog','in_progress','review','done','blocked'))
--   * 20260618000001_configurable_task_statuses.sql installs the
--     sync_task_status_fields() BEFORE-UPDATE trigger, which DERIVES status from
--     status_id as coalesce(legacy_key, slug(name)). For the seeded "Cancelled"
--     status that yields 'cancelled', and for any custom per-space status it
--     yields a slug like 'in_review' — neither is in the CHECK set, so the write
--     raises 23514 check_violation and the move is rolled back.
--
-- status_id (+ the trigger) is now the source of truth for a task's status, so the
-- legacy text CHECK is obsolete and actively harmful. Drop it. The status column
-- itself stays (the trigger keeps it populated as a human-readable mirror).
alter table public.tasks
  drop constraint if exists tasks_status_check;
