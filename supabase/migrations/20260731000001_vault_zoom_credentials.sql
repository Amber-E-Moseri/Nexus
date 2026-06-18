-- Migrate Zoom credentials from plaintext to Supabase Vault (P0 security fix)
-- NOTE: Vault not available on this project - will be enabled separately

-- Step 1: Ensure vault extension is enabled
-- CREATE EXTENSION IF NOT EXISTS vault;

-- Step 2: Add vault_secret_id columns to space_integration_secrets
ALTER TABLE public.space_integration_secrets
  ADD COLUMN IF NOT EXISTS vault_secret_id uuid,
  ADD COLUMN IF NOT EXISTS secret_type text DEFAULT 'plaintext'
    CHECK (secret_type IN ('plaintext', 'vault'));

-- Step 3: Update RLS to ensure only super_admin can read secrets
DROP POLICY IF EXISTS "space_integration_secrets_select" ON public.space_integration_secrets;

CREATE POLICY "Super admin only reads secrets"
  ON public.space_integration_secrets FOR SELECT
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
  );

-- Step 4: Keep write policy restrictive
DROP POLICY IF EXISTS "space_integration_secrets_write" ON public.space_integration_secrets;

CREATE POLICY "Super admin only writes secrets"
  ON public.space_integration_secrets FOR ALL
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
  )
  WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
  );

-- Step 5: Create RPC wrapper for vault.create_secret (allows edge functions to create secrets)
-- NOTE: Commented out until vault extension is enabled
-- CREATE OR REPLACE FUNCTION public.vault_create_secret(
--   secret_name text,
--   secret_value text
-- )
-- RETURNS uuid
-- LANGUAGE sql
-- SECURITY DEFINER
-- SET search_path = public, vault
-- AS $$
--   SELECT vault.create_secret(secret_value, secret_name)
-- $$;

/*
MANUAL MIGRATION REQUIRED (if any existing Zoom credentials):
For each row in space_integration_secrets where integration_type = 'zoom':
  1. Get the plaintext client_id and client_secret values
  2. For each value, run in SQL Editor:
     SELECT vault.create_secret('[plaintext_value]', 'zoom_secret_[space_id]_[field_name]');
  3. This returns a vault_id uuid
  4. Store that vault_id in vault_secret_id column with secret_type = 'vault'
  5. Delete the plaintext secret_value
*/
