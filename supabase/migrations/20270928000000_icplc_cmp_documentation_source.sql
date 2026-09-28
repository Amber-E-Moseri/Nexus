-- ICPLC: Add cmp_documentation source type to identity maps
--
-- Extends the source_type CHECK constraint on icplc_identity_maps to include
-- 'cmp_documentation', which identifies rows originating from the ICPLC
-- documentation form synced via cmp-documentation-sync edge function.
--
-- Migration is idempotent: finds and replaces the existing source_type
-- constraint by name, regardless of how it was first created.

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  -- Find the existing source_type CHECK constraint (may be auto-named or
  -- named by a prior migration that added mi_member)
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class cl ON cl.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = cl.relnamespace
  WHERE ns.nspname = 'public'
    AND cl.relname = 'icplc_identity_maps'
    AND con.contype = 'c'
    AND con.conname LIKE '%source_type%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.icplc_identity_maps DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;

  -- Re-add with full set of known source types
  ALTER TABLE public.icplc_identity_maps
    ADD CONSTRAINT icplc_identity_maps_source_type_check
      CHECK (source_type IN (
        'csv',
        'cmp_registrations',
        'cmp_flights',
        'registration',
        'mi_member',
        'cmp_documentation'
      ));
END $$;
