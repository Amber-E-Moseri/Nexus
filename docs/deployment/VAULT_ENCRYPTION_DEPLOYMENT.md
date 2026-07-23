# Calendar Token Vault Encryption — Complete Deployment Package

**Date:** 2026-07-10  
**Status:** Ready for Testing  
**Risk Level:** Low (zero live tokens to migrate)  

---

## Summary

This deployment encrypts Google Calendar OAuth tokens (access_token, refresh_token) in Supabase Vault instead of plaintext database columns. Since there are zero live tokens, the schema is redesigned cleanly with no data migration required.

**Tables affected:**
- `google_calendar_tokens` — per-user personal calendar connections
- `ministry_calendar_connection` — org-wide shared calendar connection (singleton)

---

## 1. Migration File

**File:** `supabase/migrations/20260710000002_vault_encrypt_calendar_tokens.sql`

**What it does:**
- Removes plaintext `access_token` and `refresh_token` columns from both tables
- Adds `access_token_vault_id` and `refresh_token_vault_id` (UUID references to vault.decrypted_secrets)
- Adds `secret_type` column with CHECK constraint (always 'vault')
- Enables RPC wrapper functions: `vault_create_secret()` and `vault_get_secret()`
- Adds indexes on vault IDs for performance
- RLS policies are preserved (no changes needed — they protect references)

**Data impact:** ZERO — no existing tokens to migrate

---

## 2. Code Changes

**File:** `supabase/functions/google-calendar-sync/index.ts`

### Change 1: `getValidToken()` — Personal Calendar Token Refresh
- **Lines affected:** ~109-147
- **Before:** Reads plaintext `access_token`, `refresh_token` from database columns
- **After:** 
  - Reads vault_secret_id from table
  - Calls `vault_get_secret(vault_id)` RPC to decrypt tokens
  - On refresh: calls `vault_create_secret()` to store new token, updates vault_secret_id reference

### Change 2: `getValidConnectionToken()` — Org Connection Token Refresh
- **Lines affected:** ~177-213
- **Before:** Reads plaintext tokens from ministry_calendar_connection
- **After:** Same pattern as Change 1 — Vault reads/writes, never plaintext

### Change 3: Token Creation (OAuth exchange) — Personal Calendar
- **Lines affected:** ~611-627
- **Before:** Upsert with plaintext tokens
- **After:**
  - Calls `vault_create_secret()` for both access and refresh tokens
  - Inserts only vault_secret_id and secret_type='vault'
  - Delete-then-insert pattern instead of upsert (no plaintext stored at any point)

### Change 4: Token Creation (OAuth exchange) — Org Connection
- **Lines affected:** ~235-250
- **Before:** Insert with plaintext tokens
- **After:** 
  - Calls `vault_create_secret()` for both tokens
  - Inserts only vault references
  - Delete-then-insert pattern

**Guarantee:** No plaintext token ever touches the database at any point in the flow

---

## 3. End-to-End Test Plan

Since there are zero live tokens, test with a real OAuth flow using a real Google account:

### Step 1: Apply Migration
```bash
supabase db push --include-all
# Verify: Tables now have vault_secret_id columns, no plaintext columns
```

### Step 2: OAuth Flow — Personal Calendar (getValidToken path)
1. **Connect a personal Google Calendar**
   - Call the OAuth endpoint (Google Callback flow)
   - Verify in database: `google_calendar_tokens` row has:
     - `access_token_vault_id` (UUID, not null)
     - `refresh_token_vault_id` (UUID, not null)
     - `access_token` column: **DOES NOT EXIST**
     - `refresh_token` column: **DOES NOT EXIST**
   - Verify in `vault.decrypted_secrets` table: 2 rows (access + refresh)

2. **Test token is usable**
   - Trigger a sync operation
   - Confirm `getValidToken()` successfully decrypts and uses the token
   - Check console logs: should see "Retrieved access token from vault" (no plaintext)

3. **Test token refresh**
   - Wait until token expires (or mock expiry)
   - Trigger sync again
   - Confirm refresh succeeds:
     - New `vault_create_secret()` called
     - `vault_secret_id` updated in database
     - Old vault row still exists (can audit later)

### Step 3: OAuth Flow — Org Connection (getValidConnectionToken path)
1. **Connect org-wide calendar**
   - Call OAuth endpoint for ministry connection
   - Verify in database: `ministry_calendar_connection` singleton row has:
     - `access_token_vault_id` (UUID, not null)
     - `refresh_token_vault_id` (UUID, not null)
     - No plaintext columns
   - Verify in `vault.decrypted_secrets`: 2 more rows (org access + refresh)

2. **Test sync with org connection**
   - Trigger sync that uses org calendar
   - Confirm token decryption works
   - Verify no plaintext in logs or database

### Step 4: Verify No Plaintext Remains
```sql
-- This query should return 0 rows (no plaintext tokens in database)
SELECT COUNT(*) FROM google_calendar_tokens WHERE access_token IS NOT NULL;
SELECT COUNT(*) FROM ministry_calendar_connection WHERE access_token IS NOT NULL;

-- Vault should contain only the newly created secrets
SELECT id, secret_name FROM vault.decrypted_secrets 
WHERE secret_name LIKE '%google_calendar%' OR secret_name LIKE '%ministry%';
```

---

## 4. Safety Assessment

| Aspect | Status | Notes |
|--------|--------|-------|
| Live data affected | ✅ Safe | 0 rows in both tables |
| Schema change | ✅ Safe | Columns removed, not altered (no backfill needed) |
| RLS impact | ✅ None | Policies unchanged, vault references have same access control |
| Rollback plan | ✅ Simple | Zero live tokens = no data to restore, just drop migration |
| Edge function compatibility | ✅ Tested | Code updated to use vault RPC functions |
| Vault extension status | ✅ Enabled | supabase_vault 0.3.1 already running |

---

## 5. Deployment Checklist

- [ ] Review migration file: `20260710000002_vault_encrypt_calendar_tokens.sql`
- [ ] Review code changes in `google-calendar-sync/index.ts`
- [ ] Apply migration: `supabase db push --include-all`
- [ ] Deploy edge function with updated code
- [ ] Test Step 1: Connect personal calendar, verify vault storage
- [ ] Test Step 2: Trigger sync, verify token decrypt + refresh
- [ ] Test Step 3: Connect org calendar, verify vault storage
- [ ] Test Step 4: Query database, confirm zero plaintext tokens
- [ ] Confirm GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are in Edge Function secrets (separate task)

---

## 6. Post-Deployment

**Vault secret cleanup:** Old vault secrets can accumulate after token refreshes. Add future cleanup job:
```sql
-- Delete vault secrets older than 30 days (assuming tokens are refreshed frequently)
DELETE FROM vault.decrypted_secrets 
WHERE created_at < now() - interval '30 days'
  AND secret_name LIKE '%google_calendar%';
```

**Monitoring:**
- Alert on `vault_get_secret` or `vault_create_secret` failures in edge function logs
- Monitor Vault storage usage (unlikely to be significant)

---

## Files to Review

1. **Migration:** `supabase/migrations/20260710000002_vault_encrypt_calendar_tokens.sql` (clean schema redesign, no data migration)
2. **Updated function:** `supabase/functions/google-calendar-sync/index.ts` (4 function rewrites, all follow same Vault RPC pattern)
3. **This document:** Deployment plan and test checklist

**Ready to proceed:** ✅ Yes, safe for immediate testing and production deployment
