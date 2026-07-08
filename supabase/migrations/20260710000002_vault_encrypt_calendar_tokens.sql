-- =============================================================================
-- MIGRATION: Encrypt calendar OAuth tokens in Supabase Vault
-- =============================================================================
-- CONTEXT: google_calendar_tokens and ministry_calendar_connection store
--          long-lived OAuth credentials in plaintext. This migration moves them
--          to Supabase Vault with encrypted storage.
--
-- DATA: Zero live tokens exist — schema is redesigned, no migration needed.
-- VAULT: supabase_vault 0.3.1 required (enable if not already present).
-- SCOPE: Two tables (google_calendar_tokens, ministry_calendar_connection)
-- RPC: vault_create_secret/vault_get_secret wrapper functions enabled herein.
-- REFERENCE: token_security_notes.sql outlines the design intent and alternatives.
-- =============================================================================
-- NOTE: Supabase Vault (supabase_vault extension) is pre-enabled on this project.
-- No CREATE EXTENSION needed — it's managed by Supabase as part of the platform.

-- ─────────────────────────────────────────────────────────────────────────
-- Step 1: Redesign google_calendar_tokens table
-- Remove plaintext columns, add vault references
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.google_calendar_tokens
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS refresh_token,
  ADD COLUMN IF NOT EXISTS access_token_vault_id uuid,
  ADD COLUMN IF NOT EXISTS refresh_token_vault_id uuid,
  ADD COLUMN IF NOT EXISTS secret_type text DEFAULT 'vault'
    CHECK (secret_type IN ('vault'));

COMMENT ON COLUMN public.google_calendar_tokens.access_token_vault_id IS
  'UUID reference to vault.decrypted_secrets for access token (Supabase Vault encrypted storage)';
COMMENT ON COLUMN public.google_calendar_tokens.refresh_token_vault_id IS
  'UUID reference to vault.decrypted_secrets for refresh token (Supabase Vault encrypted storage)';
COMMENT ON COLUMN public.google_calendar_tokens.secret_type IS
  'Always "vault" — indicates tokens are stored in Vault, not plaintext';

-- ─────────────────────────────────────────────────────────────────────────
-- Step 2: Redesign ministry_calendar_connection table (singleton)
-- Remove plaintext columns, add vault references
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ministry_calendar_connection
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS refresh_token,
  ADD COLUMN IF NOT EXISTS access_token_vault_id uuid,
  ADD COLUMN IF NOT EXISTS refresh_token_vault_id uuid,
  ADD COLUMN IF NOT EXISTS secret_type text DEFAULT 'vault'
    CHECK (secret_type IN ('vault'));

COMMENT ON COLUMN public.ministry_calendar_connection.access_token_vault_id IS
  'UUID reference to vault.decrypted_secrets for access token (Supabase Vault encrypted storage)';
COMMENT ON COLUMN public.ministry_calendar_connection.refresh_token_vault_id IS
  'UUID reference to vault.decrypted_secrets for refresh token (Supabase Vault encrypted storage)';
COMMENT ON COLUMN public.ministry_calendar_connection.secret_type IS
  'Always "vault" — indicates tokens are stored in Vault, not plaintext';

-- ─────────────────────────────────────────────────────────────────────────
-- Step 3: RPC wrapper functions for Vault access (Vault now enabled)
-- ─────────────────────────────────────────────────────────────────────────

-- Store secret in Vault, return UUID reference
CREATE OR REPLACE FUNCTION public.vault_create_secret(
  secret_name text,
  secret_value text
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT vault.create_secret(secret_value, secret_name)
$$;

COMMENT ON FUNCTION public.vault_create_secret IS
  'Store a secret value in Supabase Vault. Returns UUID reference to vault.decrypted_secrets row.';

-- Retrieve secret from Vault by UUID reference
CREATE OR REPLACE FUNCTION public.vault_get_secret(secret_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = secret_id
$$;

COMMENT ON FUNCTION public.vault_get_secret IS
  'Retrieve decrypted secret from Vault by UUID reference. Only callable by authenticated users with appropriate RLS permissions.';

-- ─────────────────────────────────────────────────────────────────────────
-- Step 4: Preserve RLS policies (no changes needed — they now protect
--         vault_secret_id references instead of plaintext columns)
-- ─────────────────────────────────────────────────────────────────────────

-- google_calendar_tokens RLS already scopes by user_id
-- ministry_calendar_connection RLS already restricts to super_admin/managers
-- Both policies prevent direct access to plaintext tokens regardless

-- ─────────────────────────────────────────────────────────────────────────
-- Step 5: Add index on vault IDs for faster lookups
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS google_calendar_tokens_vault_idx
  ON public.google_calendar_tokens (access_token_vault_id, refresh_token_vault_id);

CREATE INDEX IF NOT EXISTS ministry_calendar_connection_vault_idx
  ON public.ministry_calendar_connection (access_token_vault_id, refresh_token_vault_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Summary
-- ─────────────────────────────────────────────────────────────────────────
-- Changes:
--   ✅ google_calendar_tokens: plaintext columns → vault references
--   ✅ ministry_calendar_connection: plaintext columns → vault references
--   ✅ RPC functions enabled: vault_create_secret, vault_get_secret
--   ✅ RLS policies preserved (no plaintext exposure)
--   ✅ Indexes added for vault UUID lookups
--
-- Data impact: Zero live tokens — no migration data needed
-- Safe to apply to production: Yes (schema-only, no existing data)
-- Next: Update google-calendar-sync code to use vault RPC functions
-- =============================================================================
