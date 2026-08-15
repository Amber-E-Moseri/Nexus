-- Bug: generate-recurring-meetings (hourly pg_cron edge function) generates
-- the next occurrence of a recurring series, then resets the just-processed
-- row's next_occurrence_scheduled to null so it won't be picked up again.
-- That reset UPDATE runs on a service-role connection with no JWT, so
-- auth.uid() is null inside enforce_meetings_summary_only_update(). The
-- trigger's "auth.uid() is null" branch only exempts summary/updated_at/
-- extraction_* fields from its "only summary can change" check —
-- next_occurrence_scheduled isn't exempted, so the trigger raised an
-- exception on every single reset attempt. The edge function's update call
-- never checked the result for an error, so the failure was silently
-- swallowed and the same row kept re-triggering generation of an identical
-- "next occurrence" on every hourly cron tick since 2026-08-10 — producing
-- 129 duplicate rows on one series and 18 on another before this was caught.
--
-- Fix: exempt next_occurrence_scheduled from the trigger's field-diff check.
-- It's a purely internal cron-scheduling marker, never exposed in any edit
-- UI — exempting it doesn't loosen what a real user can silently change via
-- an unauthorized update, it only unblocks the system bookkeeping write this
-- trigger was never meant to guard in the first place.

CREATE OR REPLACE FUNCTION public.enforce_meetings_summary_only_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
declare
  old_rest jsonb;
  new_rest jsonb;
begin
  if public.is_meetings_full_editor(old.created_by, old.department_id, old.visibility, old.allowed_editors) then
    return new;
  end if;

  if auth.uid() is null then
    old_rest := to_jsonb(old) - 'summary' - 'updated_at' - 'next_occurrence_scheduled'
      - 'extraction_result' - 'extraction_status' - 'extraction_started_at'
      - 'extraction_completed_at' - 'extraction_error';
    new_rest := to_jsonb(new) - 'summary' - 'updated_at' - 'next_occurrence_scheduled'
      - 'extraction_result' - 'extraction_status' - 'extraction_started_at'
      - 'extraction_completed_at' - 'extraction_error';
  else
    old_rest := to_jsonb(old) - 'summary' - 'updated_at' - 'next_occurrence_scheduled';
    new_rest := to_jsonb(new) - 'summary' - 'updated_at' - 'next_occurrence_scheduled';
  end if;

  if old_rest is distinct from new_rest then
    raise exception 'Only the summary field can be updated without meeting-edit permission';
  end if;

  return new;
end;
$function$;
