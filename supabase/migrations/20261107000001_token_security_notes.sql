-- =============================================================================
-- SECURITY AUDIT: OAuth Token Storage Assessment
-- Date: 2026-11-07
-- =============================================================================
--
-- AUDIT FINDINGS SUMMARY
-- ======================
--
-- Three locations store OAuth tokens. Two use plaintext columns with FALSE
-- comments claiming "encrypted in application layer." One (Google Drive) uses
-- Supabase Vault correctly. Details below.
--
--
-- TABLE 1: public.google_calendar_sync
-- -------------------------------------
-- Migration: 20260625000000_calendar_system_foundation.sql (line 74-77)
-- Columns:
--   google_access_token  TEXT  -- PLAINTEXT. Prior comment falsely said "encrypted in application layer"
--   google_refresh_token TEXT  -- PLAINTEXT. Prior comment falsely said "encrypted in application layer"
--
-- Code that reads/writes these columns:
--   supabase/functions/google-calendar-sync/index.ts
--     line 83:  SELECT google_access_token, google_refresh_token, token_expires_at ...
--     line 113: UPDATE SET google_access_token = tokens.access_token
--     line 149: INSERT google_access_token, google_refresh_token
--
--
-- TABLE 2: public.user_integrations
-- -----------------------------------
-- Migration: 20260625000004_user_integrations.sql (line 27-29)
-- Columns:
--   oauth_token         TEXT  -- PLAINTEXT. Prior comment falsely said "encrypted in application layer"
--   oauth_refresh_token TEXT  -- PLAINTEXT. Prior comment falsely said "encrypted in application layer"
--
-- Code that reads/writes these columns:
--   src/lib/user-integrations/api.js
--     line 9:   destructures oauth_token, oauth_refresh_token from payload
--     line 18:  INSERT oauth_token, oauth_refresh_token
--     line 274: UPDATE oauth_token = newToken
--     line 275: UPDATE oauth_refresh_token = newRefreshToken
--     line 336: INSERT oauth_token = googleCalendarData.access_token
--     line 337: INSERT oauth_refresh_token = googleCalendarData.refresh_token
--     line 353: INSERT oauth_token = slackData.access_token
--     line 382: INSERT oauth_token = zapierApiKey
--   src/features/user-integrations/components/IntegrationConnectionModal.jsx
--     line 210: payload.oauth_token = formData.api_key
--     line 213: payload.oauth_token = formData.api_key
--   src/pages/auth/TeamsCallback.jsx
--     line 46:  oauth_token = teamsData.access_token
--     line 47:  oauth_refresh_token = teamsData.refresh_token
--
--
-- TABLE 3: public.google_calendar_tokens
-- ----------------------------------------
-- Migration: 20260701000000_planner.sql (line 56-64)
-- Columns:
--   access_token   TEXT NOT NULL  -- PLAINTEXT, no encryption comment present
--   refresh_token  TEXT NOT NULL  -- PLAINTEXT, no encryption comment present
--
-- Code that reads/writes these columns:
--   supabase/functions/google-calendar-sync/index.ts
--     line 32:  SELECT access_token, refresh_token, token_expiry
--     line 60:  UPDATE SET access_token = tokens.access_token
--     line 329: INSERT access_token, refresh_token
--     line 481: SELECT access_token, refresh_token, token_expiry, user_id
--
--
-- EXCEPTION (correctly using Vault):
-- -----------------------------------
-- Google Drive tokens are stored via Supabase Vault correctly:
--   supabase/functions/google-drive-auth/index.ts calls vault_create_secret RPC
--   supabase/functions/google-drive-upload/index.ts reads from vault by secret name
--   Vault infrastructure set up in: 20260731000001_vault_zoom_credentials.sql
--
--
-- VAULT STATUS
-- ============
-- Migration 20260731000001_vault_zoom_credentials.sql exists but has the
-- CREATE EXTENSION IF NOT EXISTS vault line COMMENTED OUT (line 5). The
-- vault_create_secret RPC function is also commented out (lines 36-46).
-- This means calls to vault_create_secret() from google-drive-auth will FAIL
-- at runtime unless vault was enabled manually outside migrations.
--
-- =============================================================================
-- CORRECTIVE ACTION: Remove false "encrypted in application layer" comments
-- =============================================================================

-- NOTE (2026-11-07 push): google_calendar_sync and user_integrations do not
-- exist on the live database (dropped outside of migration history at some
-- point — see docs/audits/CALENDAR_SYNC_AUDIT.md). Guarding these comments
-- with existence checks so this migration applies cleanly regardless.
DO $$
BEGIN
  IF to_regclass('public.google_calendar_sync') IS NOT NULL THEN
    COMMENT ON COLUMN public.google_calendar_sync.google_access_token IS
      'Google OAuth access token stored in plaintext. TODO: migrate to Supabase Vault (see google_drive_auth pattern in 20260731000001_vault_zoom_credentials.sql).';
    COMMENT ON COLUMN public.google_calendar_sync.google_refresh_token IS
      'Google OAuth refresh token stored in plaintext. TODO: migrate to Supabase Vault.';
  END IF;

  IF to_regclass('public.user_integrations') IS NOT NULL THEN
    COMMENT ON COLUMN public.user_integrations.oauth_token IS
      'OAuth access token stored in plaintext. TODO: migrate to Supabase Vault.';
    COMMENT ON COLUMN public.user_integrations.oauth_refresh_token IS
      'OAuth refresh token stored in plaintext. TODO: migrate to Supabase Vault.';
  END IF;
END $$;

-- =============================================================================
-- MIGRATION STUB: Enable Vault and migrate google_calendar_sync tokens
-- =============================================================================
-- To actually encrypt these tokens, follow these steps when Supabase Vault
-- is available on this project:
--
-- STEP 1: Enable the vault extension (requires Supabase dashboard or CLI):
--   CREATE EXTENSION IF NOT EXISTS vault;
--
-- STEP 2: Uncomment and run the vault_create_secret RPC from
--   20260731000001_vault_zoom_credentials.sql (lines 36-46).
--
-- STEP 3: Add vault_secret_id columns to google_calendar_sync:
--
--   ALTER TABLE public.google_calendar_sync
--     ADD COLUMN IF NOT EXISTS access_token_vault_id uuid,
--     ADD COLUMN IF NOT EXISTS refresh_token_vault_id uuid;
--
-- STEP 4: Migrate existing rows (run interactively per row):
--   For each row, call vault.create_secret(google_access_token, 'gcal_access_<id>')
--   and vault.create_secret(google_refresh_token, 'gcal_refresh_<id>'), store the
--   returned UUIDs in access_token_vault_id / refresh_token_vault_id, then null
--   out the plaintext columns.
--
-- STEP 5: Repeat for user_integrations (oauth_token, oauth_refresh_token).
--
-- STEP 6: Repeat for google_calendar_tokens (access_token, refresh_token).
--
-- STEP 7: Update edge functions to read from vault instead of plaintext columns:
--   supabase/functions/google-calendar-sync/index.ts
--   Pattern to follow: supabase/functions/google-drive-upload/index.ts
--
-- STEP 8: Drop the plaintext columns after confirming vault reads work.
--
-- =============================================================================
-- IMMEDIATE MITIGATIONS (no vault required)
-- =============================================================================
--
-- 1. RLS is already enforced on all three tables — users can only read their
--    own tokens. This limits blast radius if app-layer is compromised.
--
-- 2. Restrict google_calendar_tokens to user-scoped select only (already done
--    via "gcal_tokens_select" policy in 20260701000000_planner.sql).
--
-- 3. Ensure no SELECT * queries expose token columns to the frontend.
--    Verify that api.js and edge functions SELECT only needed columns.
--
-- 4. Consider short-lived access tokens only: refresh on each use via the
--    refresh_token, and do not persist access_token at all (set to null after
--    each use and re-fetch on next call).
--
-- =============================================================================
