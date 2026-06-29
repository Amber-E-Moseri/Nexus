# Meeting Module Caching: Deployment Guide

**Timeline:** June 28-29, 2026  
**Status:** Ready to deploy  
**Risk Level:** LOW (all critical issues identified + fixed)

---

## Step 1: Database Migration (5 minutes)

### 1.1 Run the Migration

1. Open Supabase Dashboard → SQL Editor
2. Copy entire contents of:
   ```
   supabase/migrations/20260628000000_meeting_caching_foundation.sql
   ```
3. Run the script

### 1.2 Verify Migration

```sql
-- Verify columns added to meetings
SELECT extraction_cache, extraction_cached_at, extraction_cache_valid, 
       transcript_hash, transcription_in_progress 
FROM meetings LIMIT 1;
-- Should show 5 columns (all NULL/false initially)

-- Verify table created
SELECT COUNT(*) FROM user_transcription_quota;
-- Should return 0 rows (no data yet)

-- Test increment_transcription_count RPC
SELECT increment_transcription_count('550e8400-e29b-41d4-a716-446655440000'::uuid);
-- Should return: (2026-06-28, 1, false)

-- Test start_transcription_lock RPC
SELECT start_transcription_lock('550e8400-e29b-41d4-a716-446655440000'::uuid);
-- Should return: true
```

✅ **Success:** All queries return expected values

---

## Step 2: Remove Redis

### 2.1 Delete Redis Utils File

```bash
rm supabase/functions/redis-utils.ts
```

### 2.2 Remove from Supabase Secrets

1. Open Supabase Dashboard → Settings → Edge Functions → Secrets
2. Delete these secrets:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### 2.3 Verify No Redis References Remain

```bash
grep -r "redis\|upstash\|Redis" supabase/functions/ --include="*.ts"
```

✅ **Success:** No output (no redis references)

---

## Step 3: Deploy Edge Functions

### Option A: Using Supabase CLI

```bash
# Deploy the new extract function
supabase functions deploy extract-meeting-data-v2

# Or replace the old one (ensure old version is tested)
# supabase functions deploy extract-meeting-data
```

### Option B: Copy-Paste in Dashboard

1. Open Supabase Dashboard → Edge Functions
2. For `extract-meeting-data`:
   - **Option 1:** Keep old one, create new `extract-meeting-data-v2`
   - **Option 2:** Backup old, replace with new version
3. Paste contents of `supabase/functions/extract-meeting-data-v2/index.ts`
4. Click "Deploy"

### Option C: Manual Update

If updating existing function:

1. **Read current file** (backup the old version)
2. **Remove all Redis imports** (lines 1-13):
   ```typescript
   // DELETE THESE LINES:
   import { Redis } from "https://esm.sh/@upstash/redis";
   const redis = new Redis({...});
   async function getCachedExtraction() { ... }
   async function setCachedExtraction() { ... }
   ```
3. **Replace with Supabase-native cache functions** (from audit document)
4. **Add retry logic** (see audit document)
5. **Deploy**

---

## Step 4: Deploy React Hook (Optional for Launch)

### 4.1 Create Hook

Create file: `src/hooks/useMeetingWithCache.js`

Copy contents from document above.

### 4.2 Update Components (Optional)

Components don't need to change immediately. The hook is ready when you want to use it:

```javascript
// In any meeting component:
import { useMeetingWithCache } from '../hooks/useMeetingWithCache'

export function MeetingDetail({ meetingId }) {
  const { meeting, isLoading } = useMeetingWithCache(meetingId)
  // ... rest of component
}
```

---

## Step 5: Testing (20 minutes)

### Test 1: Cache Hit

```
1. Paste transcript: "Discussed Q3 goals, assigned John to budget review"
2. Extraction runs, Claude processes it → ~2 seconds
3. Paste SAME transcript again
4. Expected: "source: cache" in response, < 100ms (instant)
5. Check logs for: [extraction.cache] hit
```

**✅ PASS** = Caching works  
**❌ FAIL** = Check that extraction_cache column has data

---

### Test 2: Quota Enforcement

```
1. Get user ID from: SELECT id FROM auth.users LIMIT 1;
2. In Supabase SQL editor, run 11 times:
   SELECT increment_transcription_count('USER_ID'::uuid);
3. First 10 calls return: (2026-06-28, 1..10, false)
4. 11th call returns: (2026-06-28, 11, true)
5. Try transcription in app → should return 429
6. Wait until tomorrow (or manually UPDATE quota_date to CURRENT_DATE + 1)
7. Quota should reset → 11th call allowed
```

**✅ PASS** = Quota enforces correctly  
**❌ FAIL** = Check that RPC function is returning correct exceeded boolean

---

### Test 3: Concurrent Transcription Lock

```
1. User clicks "Transcribe" on meeting A
2. IMMEDIATELY click "Transcribe" again (within 1 second)
3. Expected:
   - First request: Deepgram called, processing
   - Second request: 409 error "Transcription already in progress"
4. Check logs for: [lock] already_in_progress
```

**✅ PASS** = Lock prevents double transcription  
**❌ FAIL** = Two Deepgram calls detected → lock RPC not working

---

### Test 4: Realtime Updates (If Using New Hook)

```
1. Open MeetingDetail in Tab A
2. Open same meeting in Tab B
3. In Tab A, click some button that updates meeting (e.g., mark as completed)
4. Tab B should see update within < 1 second (no refresh needed)
5. Check logs in Tab B: [meeting.realtime] update
```

**✅ PASS** = Realtime sync works  
**❌ FAIL** = Tab B doesn't update → Realtime not subscribed

---

### Test 5: Error Handling & Logging

Check Supabase logs:

```
Deno logs tab should show lines like:
[extraction] request_start
[extraction.cache] miss (or hit)
[extraction.claude] success (or api_error/failed)
[extraction.cache] saved
[extraction] complete
```

**✅ PASS** = Detailed logging at each step  
**❌ FAIL** = Some logs missing → add console.log statements

---

## Step 6: Pre-Launch Verification (10 minutes)

### Checklist

```
Database:
 ☐ Migration applied successfully
 ☐ Both RPC functions return correct types
 ☐ user_transcription_quota table exists
 ☐ Indexes created on meetings and quota tables

Environment:
 ☐ UPSTASH_REDIS_* secrets deleted
 ☐ ANTHROPIC_API_KEY present
 ☐ SUPABASE_SERVICE_ROLE_KEY present

Code:
 ☐ redis-utils.ts deleted
 ☐ extract-meeting-data function deployed
 ☐ No redis imports anywhere
 ☐ New hook created (optional but ready)

Testing:
 ☐ Cache hit works (test 1 passed)
 ☐ Quota enforcement works (test 2 passed)
 ☐ Lock prevents duplicates (test 3 passed)
 ☐ Realtime updates work if using hook (test 4 passed)
 ☐ Logging is comprehensive (test 5 passed)
```

---

## Step 7: Post-Deployment Monitoring (Day 1-3)

### Watch For

**Errors:**
```
[extraction] request_failed
[quota] rpc_error
[lock] acquire_error
```

**Performance:**
- Extraction should complete in < 3 seconds (fresh) or < 100ms (cache)
- Quota check should complete in < 50ms
- Lock acquisition should complete in < 100ms

**Monitoring Dashboard (Optional)**

```sql
-- Check extraction cache hit rate
SELECT 
  COUNT(CASE WHEN source = 'cache' THEN 1 END) as cache_hits,
  COUNT(CASE WHEN source = 'claude' THEN 1 END) as claude_calls,
  ROUND(100.0 * COUNT(CASE WHEN source = 'cache' THEN 1 END) / COUNT(*), 1) as hit_rate_pct
FROM (
  SELECT source FROM /* extraction logs table if logging to DB */
  WHERE created_at > NOW() - INTERVAL '24 hours'
) t;
```

---

## Rollback Plan (If Needed)

If something goes wrong after deployment:

### Quick Rollback (< 5 minutes)

1. **Revert to Redis (Temporary):**
   ```bash
   # Restore old extract-meeting-data function
   # Re-add UPSTASH_REDIS_* secrets
   # Tell users: Extraction is temporarily using old system
   ```

2. **Then investigate:**
   - Run Test 1-5 again in dev environment
   - Check logs for error messages
   - Fix the issue
   - Redeploy

### Full Rollback (If Needed)

```sql
-- In Supabase SQL Editor:
BEGIN;

DROP FUNCTION IF EXISTS start_transcription_lock(UUID) CASCADE;
DROP FUNCTION IF EXISTS increment_transcription_count(UUID) CASCADE;
DROP TABLE IF EXISTS user_transcription_quota CASCADE;

ALTER TABLE meetings
  DROP COLUMN IF EXISTS extraction_cache,
  DROP COLUMN IF EXISTS extraction_cached_at,
  DROP COLUMN IF EXISTS extraction_cache_valid,
  DROP COLUMN IF EXISTS transcript_hash,
  DROP COLUMN IF EXISTS transcription_in_progress;

COMMIT;
```

---

## Support & Debugging

### Issue: Quota always returns `exceeded: true`

**Likely Cause:** LIMIT set too low or quota_date calculation wrong

**Debug:**
```sql
SELECT * FROM user_transcription_quota 
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000';

-- Should show one row per day, count incrementing
```

**Fix:** Adjust limit in RPC or check date logic

---

### Issue: Extraction cache never hits

**Likely Cause:** transcript_hash not being saved or not matching

**Debug:**
```sql
SELECT id, transcript_hash, extraction_cache_valid, extraction_cached_at
FROM meetings 
WHERE extraction_cache IS NOT NULL;

-- Should show transcripts with non-NULL hashes
```

**Fix:** Ensure getCachedExtraction is checking correct columns

---

### Issue: Lock never releases

**Likely Cause:** Error in transcription function, finally block not executing

**Debug:**
```sql
SELECT id, transcription_in_progress, updated_at
FROM meetings
WHERE transcription_in_progress = true;

-- Any rows? Those are stuck.
-- Check their updated_at — if > 30 min old, timeout should have fired
```

**Fix:** Manually clear:
```sql
UPDATE meetings 
SET transcription_in_progress = false 
WHERE id = 'meeting-id-here';
```

---

## Timeline Summary

| Step | Duration | Status |
|------|----------|--------|
| 1. Database Migration | 5 min | Go/No-Go |
| 2. Remove Redis | 2 min | Go/No-Go |
| 3. Deploy Edge Functions | 5 min | Go/No-Go |
| 4. Deploy React Hook | 2 min | Optional |
| 5. Testing | 20 min | Go/No-Go |
| 6. Verification | 10 min | Go/No-Go |
| **TOTAL** | **44 min** | **Ready to Launch** |

---

## Final Checklist Before June 29 Launch

```
☐ Migration ran without errors
☐ All 5 tests passed
☐ No redis imports in codebase
☐ Logging shows correct format
☐ Quota enforcement works
☐ Cache hit rate > 0 (at least one cache hit)
☐ Lock prevents concurrent transcriptions
☐ No 500 errors in logs
☐ Secrets cleaned up (UPSTASH_* removed)
```

**Ready to Launch:** ✅ YES (if all boxes checked)

---

**Questions?** Check the audit report for detailed explanations of each component.

**Last Updated:** 2026-06-28 23:20 UTC
