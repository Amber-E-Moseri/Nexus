-- Fix: "function similarity(text, text) does not exist" in icplc_match_import_rows.
-- pg_trgm may not be installed, or may live in the `extensions` schema, which the
-- function's pinned search_path (public, pg_catalog) does not include.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER FUNCTION public.icplc_match_import_rows(uuid)
  SET search_path = public, extensions, pg_catalog;
