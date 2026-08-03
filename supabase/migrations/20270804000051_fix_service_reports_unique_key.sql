-- service_reports: drop service_name from unique key
-- service_name can change in the source system; renaming a service was creating
-- a duplicate row (old name orphaned, new name inserted) causing double-counting.
-- The natural identity is (church_unit_id, service_kind, service_date) — one
-- service per center per kind per Sunday. On rename the upsert now updates the
-- existing row instead of inserting a new one.

-- 1. Drop old constraint (dynamic lookup handles PG name truncation)
DO $$
DECLARE
  cname text;
BEGIN
  SELECT constraint_name INTO cname
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name   = 'service_reports'
    AND constraint_type = 'UNIQUE'
    AND constraint_name LIKE 'service_reports_church_unit_id_service_kind_service_date%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.service_reports DROP CONSTRAINT %I', cname);
  END IF;
END;
$$;

-- 2. Deduplicate: keep the most recently synced row per (center, kind, date)
DELETE FROM public.service_reports
WHERE id NOT IN (
  SELECT DISTINCT ON (church_unit_id, service_kind, service_date) id
  FROM public.service_reports
  ORDER BY church_unit_id, service_kind, service_date, synced_at DESC
);

-- 3. New constraint: service_name excluded
ALTER TABLE public.service_reports
  ADD CONSTRAINT service_reports_center_kind_date_key
  UNIQUE (church_unit_id, service_kind, service_date);
