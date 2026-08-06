# Immerse TTS Caching Setup & End-to-End Test Guide

This guide walks through enabling persistent audio caching for the Immerse reader. Audio is now generated once and reused across all users — re-listens cost zero tokens.

## Architecture Overview

```
User plays sentence
    ↓
Frontend: POST /generate-tts { text, voice, bookId, segmentId }
    ↓
Edge Function (generate-tts):
  ├─ Check credits
  ├─ Compute SHA256 cache key from (text, voice, model, version)
  ├─ Query tts_cache table
  │  ├─ CACHE HIT (status='ready'): return signed URL immediately ✅
  │  ├─ GENERATING: wait/return status (concurrent protection)
  │  └─ MISS/FAILED: generate from OpenAI, upload to Storage
  ├─ Store in tts-cache Storage bucket
  └─ Return signed URL + duration
    ↓
Frontend: plays audio, calls onSentencePlayed(duration)
    ↓
Credits deducted based on actual audio duration (not generation)
```

**Daily cleanup job** (`cleanup-tts-cache`):
- Marks stale 'generating' rows (>120s) as 'failed'
- Deletes 'failed' rows older than 24h
- Evicts 'ready' rows unused for 90+ days (LRU)

---

## Prerequisites

### 1. Supabase Configuration

**Verify OpenAI API key is accessible:**
- Go to Supabase Dashboard → **Settings → Secrets** (or **Vault**)
- Confirm `OPENAI_API_KEY` exists and contains your valid OpenAI key
- The edge functions read it as `Deno.env.get("OPENAI_API_KEY")`

**Set cron secret for cleanup job:**
- Add a new secret: `CRON_SECRET=your-random-32-char-secret-here`
- Example: `CRON_SECRET=$(openssl rand -hex 16)` (if you have openssl)
- Or just use: `CRON_SECRET=dev-local-secret-12345678901234` (for testing)

### 2. Local Environment

Ensure `.env.local` has:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DB_PASSWORD=your-db-password
```

---

## Setup Steps

### Step 1: Apply Migrations

Push the two new migrations to your Supabase database:

```bash
cd C:\Users\moser\Downloads\clickup
supabase db push
```

This creates:
- `tts_cache` table (status tracking, metadata)
- `tts-cache` Storage bucket (holds MP3 files)
- RLS policies (authenticated users can read; only service role can write)
- Cleanup job RPC (`increment_tts_access`)

**Verify:**
```bash
supabase db list-tables  # Should show 'tts_cache'
```

### Step 2: Deploy Edge Functions

Deploy the TTS edge functions:

```bash
supabase functions deploy generate-tts
supabase functions deploy cleanup-tts-cache
```

**Verify:**
```bash
supabase functions list  # Should show both functions
```

### Step 3: Wire Cleanup Job to Vercel Cron

The cleanup function is already defined in `supabase/functions/cleanup-tts-cache/index.ts`. To run it daily:

**Option A: Vercel Cron (Production)**
Add to `vercel.json` (already done in this repo):
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-tts-cache",
      "schedule": "0 2 * * *"
    }
  ]
}
```

Create `pages/api/cron/cleanup-tts-cache.ts`:
```ts
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const secret = req.headers.get('x-vercel-cron-secret')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const res = await fetch(
    `${process.env.SUPABASE_URL}/functions/v1/cleanup-tts-cache`,
    {
      method: 'POST',
      headers: {
        'x-cron-secret': cronSecret,
        'Content-Type': 'application/json',
      },
    }
  )

  return NextResponse.json(await res.json())
}
```

**Option B: Local Testing**
```bash
curl -X POST http://localhost:54321/functions/v1/cleanup-tts-cache \
  -H "x-cron-secret: your-cron-secret-here" \
  -H "Content-Type: application/json"
```

### Step 4: Restart Dev Server

The frontend now calls `generate-tts` instead of `immerse-tts`:

```bash
npm run dev
```

---

## End-to-End Test Flow

### Test 1: First Listen (Cache Miss → Generation)

1. Open the app and navigate to **Immerse → Books → [Any Book]**
2. **Play the first sentence**
   - Expected: ~5-10s delay (OpenAI TTS generation)
   - Console should show: `[TTS] cache miss (5.2s)`
   - A new row appears in `tts_cache` table with `status='ready'`
   - Audio file stored in `tts-cache` bucket

3. **Verify in Supabase:**
   ```sql
   SELECT cache_key, voice_id, status, duration_ms, access_count
   FROM tts_cache
   ORDER BY created_at DESC
   LIMIT 1;
   ```
   Expected: One row with `status='ready'`, `access_count=1`, `duration_ms=~5200`

### Test 2: Re-listen to Same Sentence (Cache Hit)

1. **Pause, then replay the same sentence**
   - Expected: <100ms (signed URL lookup only, no generation)
   - Console should show: `[TTS] cache hit (5.2s)`
   - `access_count` increments in database

2. **Verify:**
   ```sql
   SELECT access_count FROM tts_cache WHERE cache_key = '...' LIMIT 1;
   ```
   Expected: `access_count` increased (e.g., 1 → 2)

### Test 3: Same Text, Different Voice (Voice-Specific Cache)

1. **Play the same sentence in a different voice** (e.g., Aurora instead of Nova)
   - Expected: ~5-10s delay (generation for new voice variant)
   - Console: `[TTS] cache miss (5.1s)` (different cache key because voice differs)
   - New row in `tts_cache` with different `cache_key` and `voice_id`

2. **Verify:**
   ```sql
   SELECT DISTINCT voice_id FROM tts_cache WHERE text_hash = '...' ORDER BY created_at DESC LIMIT 2;
   ```
   Expected: Two rows with same `text_hash` but different `voice_id` (nova, shimmer, fable)

### Test 4: Credits Deduction (Based on Actual Duration)

1. **Check starting credits:**
   ```sql
   SELECT balance_mins FROM reader_credits WHERE user_id = '...' LIMIT 1;
   ```

2. **Play one sentence (duration ~5s = 0.083 min)**
   - Expected: Credits decrease by ~0.083 min
   - Verify:
     ```sql
     SELECT balance_mins FROM reader_credits WHERE user_id = '...' LIMIT 1;
     ```

3. **Replay same sentence (cache hit, still costs the duration)**
   - Expected: Credits decrease again by ~0.083 min
   - The second playback still costs credits — it's tracked in `onSentencePlayed(duration)` callback

### Test 5: Concurrent Requests (Two Users, Same Sentence)

1. **User A plays Sentence 1** → generation starts, `status='generating'`
2. **User B plays Sentence 1** simultaneously
   - Expected: User B gets `{ status: 'generating' }` response (waits without regenerating)
3. **Generation completes** (User A)
   - Expected: `status='ready'`, both users get the same signed URL
   - Only one OpenAI call was made (concurrent protection works)

### Test 6: Zero Credits Gate

1. **Deplete all credits** (via admin panel or SQL):
   ```sql
   UPDATE reader_credits SET balance_mins = 0 WHERE user_id = '...';
   ```

2. **Try to play a sentence**
   - Expected: Modal appears: "Out of listening credits. Contact your admin to get more."
   - No TTS generation happens

3. **Verify in edge function logs:**
   - Should see `402 Insufficient credits` error

### Test 7: Cleanup Job (Manual Test)

1. **Manually trigger cleanup:**
   ```bash
   curl -X POST http://localhost:54321/functions/v1/cleanup-tts-cache \
     -H "x-cron-secret: your-cron-secret-here"
   ```

2. **Verify response:**
   ```json
   {
     "ok": true,
     "markedFailed": 0,
     "deletedFailed": 0,
     "deletedLru": 0
   }
   ```

3. **Create a stale row to test cleanup:**
   ```sql
   INSERT INTO tts_cache (cache_key, voice_id, text_hash, status, updated_at)
   VALUES ('test-key', 'nova', 'test-hash', 'failed', now() - interval '25 hours')
   ON CONFLICT DO NOTHING;
   ```
   Then re-run cleanup — should show `deletedFailed: 1`

---

## Troubleshooting

### "Insufficient credits" even with credits remaining
**Cause:** Credit check happens at generation time, not playback  
**Fix:** Generate must happen (or be attempted) before the zero-credit gate kicks in

### "Could not generate signed URL"
**Cause:** Storage upload succeeded, but signed URL generation failed  
**Fix:** Check `tts-cache` bucket exists and RLS policies are correct

### "Audio is generating, please retry in a moment"
**Cause:** Another request is already generating the same sentence  
**Fix:** Frontend should retry after 2-5s; edge function handles concurrency

### "OpenAI API error: 401"
**Cause:** `OPENAI_API_KEY` env var not set or invalid  
**Fix:** Verify secret exists in Supabase → Settings → Secrets, restart edge functions

### Console shows "cache miss" repeatedly
**Cause:** Signed URLs expire after 1 hour; new URL is generated on each request  
**Fix:** This is expected behavior. The cache *database entry* is reused, but signed URLs are short-lived

---

## Monitoring

**Cache hit rate:**
```sql
SELECT 
  COUNT(*) FILTER (WHERE access_count > 1) AS reused,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE access_count > 1) / COUNT(*), 1) AS hit_rate_percent
FROM tts_cache
WHERE status = 'ready' AND created_at > now() - interval '7 days';
```

**Storage usage:**
```sql
SELECT 
  voice_id,
  COUNT(*) as file_count,
  ROUND(SUM(size_bytes) / 1024.0 / 1024.0, 1) AS size_mb
FROM tts_cache
WHERE status = 'ready'
GROUP BY voice_id;
```

**Failed generations:**
```sql
SELECT cache_key, voice_id, error_message, updated_at
FROM tts_cache
WHERE status = 'failed'
ORDER BY updated_at DESC
LIMIT 10;
```

---

## Future Improvements

### Pre-generation for Popular Books
Once a book has 50+ reads, pre-generate all sentences in top 3 voices to warm the cache.

### Per-Voice Cache Statistics
Track which voices are most popular to prioritize pre-generation.

### Full-Book Export
Concatenate all cached sentences into a single `.mp3` file for download (real audiobook).

### Audio Quality Settings
Add `speed` parameter to cache key; let users choose 1.0x vs 0.9x (slower, easier to follow).

---

## Environment Variables Summary

| Variable | Source | Used By |
|----------|--------|---------|
| `OPENAI_API_KEY` | Supabase Secrets | `generate-tts` edge function |
| `CRON_SECRET` | Supabase Secrets | `cleanup-tts-cache` edge function + Vercel cron |
| `VITE_SUPABASE_URL` | `.env.local` | Frontend, edge functions |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` | Frontend auth |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` | Edge functions |
| `SUPABASE_DB_PASSWORD` | `.env.local` (optional) | `supabase db push` |

---

## Summary

✅ Migrations: `20260806000001_tts_cache.sql` + `20260806000002_tts_storage_bucket.sql`  
✅ Edge functions: `generate-tts` + `cleanup-tts-cache`  
✅ Frontend: `openai-tts.js` wired to `generate-tts`  
✅ Credits: Deducted on actual playback duration (via `onSentencePlayed` callback)  
✅ Concurrency: Atomic cache lookup + stale row reclamation  
✅ Cleanup: Daily LRU eviction + failure cleanup  

You're ready to test end-to-end. Start with **Test 1** and work through the flow.
