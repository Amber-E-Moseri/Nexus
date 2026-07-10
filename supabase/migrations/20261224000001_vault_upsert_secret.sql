-- Fix: reconnecting Google Calendar failed with
--   "duplicate key value violates unique constraint secrets_name_idx"
--
-- Root cause: vault secrets use fixed names (e.g. google_calendar_ministry_access).
-- The edge function tried to delete the old secret before creating a new one, but
-- the delete ran via PostgREST against the `vault` schema, which is not exposed —
-- so the delete silently no-op'd and the old secret survived. The subsequent
-- vault.create_secret() then collided on the unique name index.
--
-- Fix: provide an idempotent upsert RPC. If a secret with the given name already
-- exists, update its value in place (vault.update_secret); otherwise create it.
-- This removes the need to delete-then-create entirely. Also add a delete RPC for
-- the disconnect/cleanup path. Both are locked to service_role, matching
-- 20261223000002_lock_down_secret_rpcs.sql.

-- Idempotent create-or-update by name. Returns the vault secret UUID.
CREATE OR REPLACE FUNCTION public.vault_upsert_secret(
  secret_name text,
  secret_value text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = secret_name;

  IF v_id IS NULL THEN
    v_id := vault.create_secret(secret_value, secret_name);
  ELSE
    PERFORM vault.update_secret(v_id, secret_value, secret_name);
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.vault_upsert_secret IS
  'Create a Vault secret, or update it in place if one with the same name already exists. Idempotent — avoids unique-name collisions on re-connect.';

-- Delete a Vault secret by name (used by disconnect/cleanup). Safe no-op if absent.
CREATE OR REPLACE FUNCTION public.vault_delete_secret(secret_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  DELETE FROM vault.secrets WHERE name = secret_name
$$;

COMMENT ON FUNCTION public.vault_delete_secret IS
  'Delete a Vault secret by name. No-op if it does not exist.';

-- Lock both down to service_role only (same policy as the other vault RPCs).
REVOKE EXECUTE ON FUNCTION public.vault_upsert_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.vault_upsert_secret(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.vault_delete_secret(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.vault_delete_secret(text) TO service_role;
