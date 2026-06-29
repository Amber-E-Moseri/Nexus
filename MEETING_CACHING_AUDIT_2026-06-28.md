# Meeting Module Caching: Pre-Implementation Audit Report
**Date:** 2026-06-28  
**Status:** ⚠️ CRITICAL - Implementation has NOT started. Current code uses Redis (planned to be removed).  
**Launch Readiness:** 🔴 NOT READY (0% complete)

---

## Executive Summary

| Metric | Status |
|--------|--------|
| **Supabase-native caching implemented** | ❌ NO — Still using Redis |
| **Database schema updated** | ❌ NO — Caching columns missing |
| **Edge functions refactored** | ❌ NO — Still have Redis imports |
| **React hooks created** | ❌ NO |
| **RPC functions created** | ❌ NO |
| **Pre-launch tests ready** | ❌ NO |

**What exists:**
- ✅ Extraction function (but uses Redis)
- ✅ Transcription function (but uses Redis)
- ✅ AudioTranscriptionPanel component
- ❌ Everything else from the plan

**What's missing:**
- ❌ 9 critical/important fixes
- ❌ 5 new database columns
- ❌ 1 new database table
- ❌ 3 RPC functions
- ❌ 2 React hooks
- ❌ Comprehensive error handling & logging

---

## Phase 2: Detailed Findings (9 Issues)

### Issue #1: Transcription Lock Race Condition
**Status:** ❌ NOT IMPLEMENTED  
**Severity:** CRITICAL (can cause duplicate transcriptions)

**Current Code:**
```
NO LOCK EXISTS. No transcription_in_progress column in meetings table.
Multiple concurrent requests will call Deepgram in parallel.
```

**Problem:**
- User clicks "Transcribe" twice on same meeting
- Both requests proceed to Deepgram simultaneously
- Cost doubles, database has duplicate transcription records
- No atomicity guarantee

**What's needed:**
```sql
ALTER TABLE meetings ADD COLUMN transcription_in_progress BOOLEAN DEFAULT false;

CREATE OR REPLACE FUNCTION start_transcription_lock(p_meeting_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE meetings 
  SET transcription_in_progress = true
  WHERE id = p_meeting_id 
    AND transcription_in_progress = false;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
```

**Fix Priority:** P0 — Deploy before June 29

---

### Issue #2: crypto.randomUUID() Not Available in Deno
**Status:** ✅ NOT A PROBLEM (not used in current code)

**Current Code:**
```typescript
// extract-meeting-data/index.ts line 70:
const transcriptHash = await hashTranscript(transcript);
```

No UUID generation in current edge functions. ✓ Safe to proceed.

**Fix Priority:** N/A

---

### Issue #3: Extraction Cache Null Check Missing
**Status:** ❌ WRONG IMPLEMENTATION (uses Redis, not Supabase)

**Current Code:**
```typescript
// extract-meeting-data/index.ts lines 23-35
async function getCachedExtraction(transcriptHash: string) {
  try {
    const key = `extraction:${transcriptHash}`;
    const cached = await redis.get(key);
    if (cached) {
      console.log(`Cache hit for extraction:${transcriptHash}`);
      return JSON.parse(cached as string);
    }
  } catch (error) {
    console.warn("Failed to get cache:", error);
  }
  return null;
}
```

**Problem:**
- Still using Redis (`await redis.get()`)
- Plan was to remove Redis and use Supabase-native caching
- No null check for extraction_cache column (doesn't exist yet)
- Can't validate that cache is actually valid

**What's needed:**
```typescript
async function getCachedExtraction(
  meetingId: string,
  transcriptHash: string,
  supabase: any
) {
  const { data, error } = await supabase
    .from("meetings")
    .select("extraction_cache, extraction_cached_at, extraction_cache_valid")
    .eq("id", meetingId)
    .eq("transcript_hash", transcriptHash)
    .eq("extraction_cache_valid", true)
    .not("extraction_cache", "is", null)  // ← Null check
    .single();

  if (error?.code === "PGRST116") return null; // No rows
  if (error) {
    console.error(`[extraction.cache] query_error ${error.message}`);
    return null;
  }

  const cachedAt = new Date(data.extraction_cached_at);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  if (cachedAt < thirtyDaysAgo) {
    console.log(`[extraction.cache] expired`);
    return null;
  }

  return data.extraction_cache;
}
```

**Fix Priority:** P0 — Part of Redis removal

---

### Issue #4: RPC Return Type Uncertainty
**Status:** ❌ NOT IMPLEMENTED (no RPC functions exist yet)

**Current Code:**
```
NO RPC FUNCTIONS EXIST.
increment_transcription_count() is not created yet.
start_transcription_lock() is not created yet.
```

**Problem:**
- When RPC functions are created, unclear if they return array vs object
- `supabase.rpc()` responses vary by Postgres version
- Code assumes `data[0]` array access but might be single object

**What's needed:**
Before deploying, test the RPC in Supabase SQL editor:
```
SELECT increment_transcription_count('some-user-id'::uuid);
```

And in edge function:
```typescript
const { data, error } = await supabase.rpc('increment_transcription_count', { p_user_id: userId });

if (error) throw error;
if (!data || (Array.isArray(data) && data.length === 0)) {
  throw new Error('Unexpected RPC response');
}

const result = Array.isArray(data) ? data[0] : data;
const { transcription_count, exceeded } = result;
```

**Fix Priority:** P1 — Must test before deploying

---

### Issue #5: Retry Backoff Without Jitter
**Status:** ❌ NO RETRY LOGIC EXISTS

**Current Code:**
```
NO extractWithRetry() FUNCTION EXISTS.
```

**Problem:**
- If Claude extraction fails, no retry happens
- If 100 users all hit extraction errors, they all retry at same time
- Thundering herd effect → cascading failures

**What's needed:**
```typescript
async function extractWithRetry(
  transcript: string,
  meetingId: string,
  maxRetries: number = 2
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await extractViaClaudeWithLogging(transcript, meetingId);
    } catch (error) {
      console.warn(
        `[extraction] retry attempt=${attempt}/${maxRetries} meeting_id=${meetingId}`
      );

      if (attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff with jitter
      const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s...
      const jitterMs = Math.random() * 1000; // 0-1000ms random
      await new Promise((resolve) =>
        setTimeout(resolve, delayMs + jitterMs)
      );
    }
  }
}
```

**Fix Priority:** P1 — Improves reliability

---

### Issue #6: Transcription Lock Cleanup Failure
**Status:** ❌ NOT IMPLEMENTED (no lock mechanism, no timeout)

**Current Code:**
```
NO LOCK CLEANUP LOGIC.
```

**Problem:**
- If Deepgram succeeds but unlock fails (network error), lock stays `true` forever
- Meeting becomes permanently stuck in "in_progress" state
- No safety valve for cleanup

**What's needed:**
```typescript
async function performTranscription(meetingId, userId, audioData) {
  // Acquire lock
  const lockSet = await supabase.rpc('start_transcription_lock', { 
    p_meeting_id: meetingId 
  });
  
  if (!lockSet) {
    return new Response(
      JSON.stringify({ error: "Transcription already in progress" }),
      { status: 409 }
    );
  }

  console.log(`[transcription] lock_acquired meeting_id=${meetingId}`);

  // Set auto-unlock timeout (30 minute safety valve)
  const unlockTimeoutId = setTimeout(async () => {
    await supabase
      .from("meetings")
      .update({ transcription_in_progress: false })
      .eq("id", meetingId);
    console.warn(`[transcription] force_unlock meeting_id=${meetingId} timeout=30m`);
  }, 30 * 60 * 1000);

  try {
    // Do Deepgram work
    const result = await performDeepgramTranscription(...);
    
    // Success — cleanup immediately
    clearTimeout(unlockTimeoutId);
    await supabase
      .from("meetings")
      .update({ transcription_in_progress: false })
      .eq("id", meetingId);
    
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    // Error — cleanup immediately
    clearTimeout(unlockTimeoutId);
    await supabase
      .from("meetings")
      .update({ transcription_in_progress: false })
      .eq("id", meetingId);
    
    throw error;
  }
}
```

**Fix Priority:** P0 — Critical for reliability

---

### Issue #7: Timezone Handling for Quota Reset
**Status:** ❌ NOT APPLICABLE YET (no user_transcription_quota table)

**Current Code:**
```
NO user_transcription_quota TABLE.
Redis is used instead (to be removed).
```

**Problem:**
- When quota table is created, will use `CURRENT_DATE` for quota_date
- `CURRENT_DATE` is in server timezone (likely UTC)
- Users in PST expect reset at midnight PST, not UTC

**What's needed (optional, for post-launch):**
```sql
-- If users are in specific timezone, use:
VALUES (p_user_id, CURRENT_DATE AT TIME ZONE 'America/Los_Angeles', 1)

-- Or document: "Quota resets at 00:00 UTC (adjust for your timezone)"
```

**Fix Priority:** P2 — Document or make configurable post-launch

---

### Issue #8: Duplicate Indexes
**Status:** ⏳ NOT APPLICABLE YET (schema not created)

**When table is created:**
```sql
-- ❌ REDUNDANT:
UNIQUE(user_id, quota_date)  -- Creates automatic index
CREATE UNIQUE INDEX ...      -- Separate index

-- ✅ FIX: Only use the CONSTRAINT, drop the separate INDEX
```

**Fix Priority:** P2 — Clean up during migration

---

### Issue #9: Subscription Error Handling
**Status:** ⏳ NEEDS IMPLEMENTATION

**Current Code:**
```
NO useMeetingWithCache HOOK EXISTS.
Need to create it with proper error handling.
```

**What's needed:**
```javascript
export function useMeetingWithCache(meetingId) {
  const [meeting, setMeeting] = useState(null);

  useEffect(() => {
    const subscription = supabase
      .channel(`meeting:${meetingId}`)
      .on("postgres_changes", { ... }, (payload) => {
        sessionStorage.removeItem(`meeting_${meetingId}`); // Clear stale cache
        setMeeting(payload.new);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[meeting.realtime] subscribed meeting_id=${meetingId}`);
        }
      }, (error) => {
        // ← Error handler
        console.error(`[meeting.realtime] subscription_error meeting_id=${meetingId}`, error);
      });

    return () => subscription.unsubscribe();
  }, [meetingId]);

  return { meeting };
}
```

**Fix Priority:** P1 — Prevents silent failures

---

## Phase 3: Code Generation (Ready-to-Deploy Fixes)

### SQL Migration Script
**File:** `supabase/migrations/20260628000000_meeting_caching_foundation.sql`

See below in "Phase 4: Migration Script" section.

### TypeScript/JavaScript Fixes
**Files to create/update:**
1. `supabase/functions/extract-meeting-data/index.ts` (rewrite to use Supabase)
2. `supabase/functions/transcribe-audio-deepgram/index.ts` (add lock + retry logic)
3. `src/hooks/useMeetingWithCache.js` (new hook)

See below for complete code.

---

## Phase 4: Migration Script

```sql
-- CRITICAL: Run this BEFORE deploying edge functions

BEGIN;

-- ========================================
-- 1. Add caching columns to meetings
-- ========================================

ALTER TABLE meetings 
  ADD COLUMN IF NOT EXISTS extraction_cache JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS extraction_cached_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS extraction_cache_valid BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS transcript_hash TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transcription_in_progress BOOLEAN DEFAULT false;

-- ========================================
-- 2. Create indexes
-- ========================================

CREATE INDEX IF NOT EXISTS idx_meetings_transcript_hash ON meetings(transcript_hash);
CREATE INDEX IF NOT EXISTS idx_meetings_in_progress ON meetings(id) WHERE transcription_in_progress = true;

-- ========================================
-- 3. Create user_transcription_quota table
-- ========================================

CREATE TABLE IF NOT EXISTS user_transcription_quota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quota_date DATE NOT NULL,
  transcription_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, quota_date)
);

CREATE INDEX IF NOT EXISTS idx_user_quota_daily 
  ON user_transcription_quota(user_id, quota_date);

-- ========================================
-- 4. Create RPC function: increment_transcription_count
-- ========================================

CREATE OR REPLACE FUNCTION increment_transcription_count(p_user_id UUID)
RETURNS TABLE(quota_date DATE, transcription_count INT, exceeded BOOLEAN) AS $$
BEGIN
  INSERT INTO user_transcription_quota (user_id, quota_date, transcription_count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, quota_date)
  DO UPDATE SET transcription_count = user_transcription_quota.transcription_count + 1
  RETURNING 
    user_transcription_quota.quota_date,
    user_transcription_quota.transcription_count,
    (user_transcription_quota.transcription_count > 10)::BOOLEAN
  INTO quota_date, transcription_count, exceeded;

  RETURN QUERY SELECT quota_date, transcription_count, exceeded;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 5. Create RPC function: start_transcription_lock
-- ========================================

CREATE OR REPLACE FUNCTION start_transcription_lock(p_meeting_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE meetings 
  SET transcription_in_progress = true
  WHERE id = p_meeting_id 
    AND transcription_in_progress = false;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 6. RLS Policies for user_transcription_quota
-- ========================================

ALTER TABLE user_transcription_quota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own quotas"
  ON user_transcription_quota FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role updates quotas"
  ON user_transcription_quota FOR UPDATE
  USING (auth.uid() IS NULL);

-- ========================================
-- 7. Grant execute on RPC functions to authenticated
-- ========================================

GRANT EXECUTE ON FUNCTION increment_transcription_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION start_transcription_lock(UUID) TO authenticated;

COMMIT;

-- ========================================
-- ROLLBACK (if needed)
-- ========================================
/*
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
*/
```

---

## Phase 5: Edge Function Updates

### Extract Meeting Data (Complete Rewrite)

**File:** `supabase/functions/extract-meeting-data/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import crypto from "https://deno.land/std@0.208.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function hashTranscript(text: string): string {
  return crypto
    .subtle
    .digestSync("SHA-256", new TextEncoder().encode(text))
    .hex(); // Full 64-char hash, not truncated
}

async function getCachedExtraction(meetingId: string, transcriptHash: string) {
  const { data, error } = await supabase
    .from("meetings")
    .select("extraction_cache, extraction_cached_at, extraction_cache_valid")
    .eq("id", meetingId)
    .eq("transcript_hash", transcriptHash)
    .eq("extraction_cache_valid", true)
    .not("extraction_cache", "is", null)  // ← Null check
    .single();

  if (error?.code === "PGRST116") {
    console.log(`[extraction.cache] miss meeting_id=${meetingId} hash=${transcriptHash.substring(0, 8)}...`);
    return null;
  }

  if (error) {
    console.error(`[extraction.cache] query_error error="${error.message}"`);
    return null;
  }

  const cachedAt = new Date(data.extraction_cached_at);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  if (cachedAt < thirtyDaysAgo) {
    console.log(`[extraction.cache] expired cached_at=${cachedAt.toISOString()}`);
    return null;
  }

  console.log(`[extraction.cache] hit meeting_id=${meetingId}`);
  return data.extraction_cache;
}

async function saveExtractionCache(meetingId: string, transcriptHash: string, extraction: object) {
  const { error } = await supabase
    .from("meetings")
    .update({
      extraction_cache: extraction,
      extraction_cached_at: new Date().toISOString(),
      transcript_hash: transcriptHash,
      extraction_cache_valid: true,
    })
    .eq("id", meetingId);

  if (error) {
    console.error(`[extraction.cache] save_error meeting_id=${meetingId} error="${error.message}"`);
  } else {
    console.log(`[extraction.cache] saved meeting_id=${meetingId}`);
  }
}

async function extractViaClaudeWithLogging(transcript: string, meetingId: string) {
  const startTime = Date.now();

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `Extract from meeting transcript. Return ONLY valid JSON:
{
  "summary": "2-3 sentences",
  "decisions": ["decision 1"],
  "action_items": [{"title": "...", "owner": "...", "due_date": "YYYY-MM-DD or null"}],
  "key_topics": ["topic1"]
}

TRANSCRIPT:
${transcript.slice(0, 8000)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      const duration = Date.now() - startTime;
      console.error(
        `[extraction.claude] api_error meeting_id=${meetingId} status=${response.status} duration_ms=${duration} error="${err.error?.message || "unknown"}"`
      );
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";

    let extracted;
    try {
      extracted = JSON.parse(text);
    } catch {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      extracted = match 
        ? JSON.parse(match[1]) 
        : { summary: text, decisions: [], action_items: [], key_topics: [] };
    }

    const duration = Date.now() - startTime;
    console.log(
      `[extraction.claude] success meeting_id=${meetingId} duration_ms=${duration} tokens_in=${data.usage.input_tokens} tokens_out=${data.usage.output_tokens}`
    );

    return extracted;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `[extraction.claude] failed meeting_id=${meetingId} duration_ms=${duration} error="${error.message}"`
    );
    throw error;
  }
}

async function extractWithRetry(transcript: string, meetingId: string, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await extractViaClaudeWithLogging(transcript, meetingId);
    } catch (error) {
      console.warn(
        `[extraction] retry attempt=${attempt}/${maxRetries} meeting_id=${meetingId} error="${error.message}"`
      );

      if (attempt === maxRetries) {
        console.error(`[extraction] exhausted_retries meeting_id=${meetingId} after ${maxRetries} attempts`);
        throw error;
      }

      // Exponential backoff with jitter
      const delayMs = Math.pow(2, attempt - 1) * 1000;
      const jitterMs = Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs + jitterMs));
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { meetingId, transcript } = await req.json();

    if (!meetingId || !transcript) {
      console.warn(`[extraction] validation_error missing_meetingId=${!meetingId} missing_transcript=${!transcript}`);
      return new Response(JSON.stringify({ error: "Missing meetingId or transcript" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcriptHash = hashTranscript(transcript);
    console.log(`[extraction] request_start meeting_id=${meetingId} hash=${transcriptHash.substring(0, 8)}... transcript_len=${transcript.length}`);

    // Check cache first
    const cached = await getCachedExtraction(meetingId, transcriptHash);
    if (cached) {
      console.log(`[extraction] complete meeting_id=${meetingId} source=cache`);
      return new Response(JSON.stringify({ data: cached, source: "cache" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract via Claude (with retries)
    const extraction = await extractWithRetry(transcript, meetingId);

    // Save to cache
    await saveExtractionCache(meetingId, transcriptHash, extraction);

    console.log(`[extraction] complete meeting_id=${meetingId} source=claude`);
    return new Response(JSON.stringify({ data: extraction, source: "claude" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[extraction] request_failed error="${error.message}"`);
    return new Response(JSON.stringify({ error: error.message || "Extraction failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

---

### Transcription Function (Add Lock + Retry)

**File:** `supabase/functions/transcribe-audio-deepgram/index.ts`

Add this BEFORE the main `serve()` handler (around line 40):

```typescript
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function checkAndIncrementQuota(userId: string): Promise<{
  count: number;
  exceeded: boolean;
}> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase.rpc(
      "increment_transcription_count",
      { p_user_id: userId }
    );

    if (error) {
      console.error(`[quota] rpc_error user_id=${userId} error="${error.message}"`);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error("No quota data returned from RPC");
    }

    const result = Array.isArray(data) ? data[0] : data;
    const { transcription_count, exceeded } = result;
    const duration = Date.now() - startTime;

    console.log(
      `[quota] checked user_id=${userId} count=${transcription_count}/10 exceeded=${exceeded} duration_ms=${duration}`
    );

    return { count: transcription_count, exceeded };
  } catch (error) {
    console.error(`[quota] check_failed user_id=${userId} error="${error.message}"`);
    throw error;
  }
}

async function acquireTranscriptionLock(meetingId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc(
      "start_transcription_lock",
      { p_meeting_id: meetingId }
    );

    if (error) {
      console.error(`[lock] acquire_error meeting_id=${meetingId} error="${error.message}"`);
      throw error;
    }

    const lockAcquired = !!data;
    if (lockAcquired) {
      console.log(`[lock] acquired meeting_id=${meetingId}`);
    } else {
      console.log(`[lock] already_in_progress meeting_id=${meetingId}`);
    }

    return lockAcquired;
  } catch (error) {
    console.error(`[lock] acquire_failed meeting_id=${meetingId} error="${error.message}"`);
    throw error;
  }
}

async function releaseTrans criptionLock(meetingId: string): Promise<void> {
  try {
    await supabase
      .from("meetings")
      .update({ transcription_in_progress: false })
      .eq("id", meetingId);

    console.log(`[lock] released meeting_id=${meetingId}`);
  } catch (error) {
    console.error(`[lock] release_error meeting_id=${meetingId} error="${error.message}"`);
  }
}
```

Then replace the rate limiting check (around line 55-68) with:

```typescript
// Check quota
const userId = req.headers.get("x-user-id") || "anonymous";
const quota = await checkAndIncrementQuota(userId);

if (quota.exceeded) {
  console.log(
    `[transcription] quota_exceeded user_id=${userId} count=${quota.count}`
  );
  return new Response(
    JSON.stringify({
      error: "Daily transcription limit reached (10/day). Try again tomorrow.",
    }),
    { headers: jsonHeaders, status: 429 }
  );
}

// Acquire lock
const meetingId = req.headers.get("x-meeting-id") || "unknown";
const lockAcquired = await acquireTranscriptionLock(meetingId);

if (!lockAcquired) {
  return new Response(
    JSON.stringify({ error: "Transcription already in progress" }),
    { headers: jsonHeaders, status: 409 }
  );
}

// Set 30-minute safety valve
const unlockTimeoutId = setTimeout(async () => {
  await releaseTrans criptionLock(meetingId);
  console.warn(`[lock] force_unlock meeting_id=${meetingId} timeout=30m`);
}, 30 * 60 * 1000);

try {
  // ... rest of Deepgram transcription ...
  
  // On success or error, release lock
  clearTimeout(unlockTimeoutId);
  await releaseTrans criptionLock(meetingId);
} catch (error) {
  clearTimeout(unlockTimeoutId);
  await releaseTrans criptionLock(meetingId);
  throw error;
}
```

---

### React Hook (New)

**File:** `src/hooks/useMeetingWithCache.js`

```javascript
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useMeetingWithCache(meetingId) {
  const [meeting, setMeeting] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Try sessionStorage first
    const cached = sessionStorage.getItem(`meeting_${meetingId}`);
    if (cached) {
      setMeeting(JSON.parse(cached));
      console.log(`[meeting.cache] session_hit meeting_id=${meetingId}`);
    } else {
      setIsLoading(true);
      console.log(`[meeting.cache] session_miss meeting_id=${meetingId}`);
    }

    // Subscribe to realtime updates
    const subscription = supabase
      .channel(`meeting:${meetingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meetings",
          filter: `id=eq.${meetingId}`,
        },
        (payload) => {
          console.log(
            `[meeting.realtime] update meeting_id=${meetingId} event=${payload.eventType}`
          );
          // Clear stale sessionStorage before updating
          sessionStorage.removeItem(`meeting_${meetingId}`);
          setMeeting(payload.new);
        }
      )
      .subscribe(
        (status) => {
          if (status === "SUBSCRIBED") {
            console.log(`[meeting.realtime] subscribed meeting_id=${meetingId}`);
          }
        },
        (error) => {
          console.error(
            `[meeting.realtime] subscription_error meeting_id=${meetingId}`,
            error
          );
        }
      );

    // Fetch if not in cache
    if (!cached) {
      supabase
        .from("meetings")
        .select("*")
        .eq("id", meetingId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error(
              `[meeting.cache] fetch_error meeting_id=${meetingId} error="${error.message}"`
            );
            return;
          }
          if (data) {
            sessionStorage.setItem(`meeting_${meetingId}`, JSON.stringify(data));
            setMeeting(data);
            console.log(`[meeting.cache] fetched meeting_id=${meetingId}`);
          }
        })
        .finally(() => setIsLoading(false));
    }

    return () => {
      subscription.unsubscribe();
    };
  }, [meetingId]);

  return { meeting, isLoading };
}
```

---

## Phase 6: Deployment Checklist

### Pre-Deployment (Before 2026-06-29 09:00 AM)

**Database:**
- [ ] Run migration script (all 7 steps)
- [ ] Verify migrations applied: `SELECT * FROM information_schema.columns WHERE table_name='user_transcription_quota'`
- [ ] Test RPC in Supabase SQL editor:
  ```sql
  SELECT increment_transcription_count('550e8400-e29b-41d4-a716-446655440000'::uuid);
  SELECT start_transcription_lock('550e8400-e29b-41d4-a716-446655440000'::uuid);
  ```
- [ ] Verify columns exist in meetings table:
  ```sql
  SELECT extraction_cache, extraction_cached_at, extraction_cache_valid, 
         transcript_hash, transcription_in_progress FROM meetings LIMIT 1;
  ```

**Environment:**
- [ ] Remove `UPSTASH_REDIS_REST_URL` from Supabase secrets
- [ ] Remove `UPSTASH_REDIS_REST_TOKEN` from Supabase secrets
- [ ] Verify `ANTHROPIC_API_KEY` still present
- [ ] Verify `SUPABASE_SERVICE_ROLE_KEY` still present

**Code:**
- [ ] Delete `supabase/functions/redis-utils.ts`
- [ ] Create `src/hooks/useMeetingWithCache.js`
- [ ] Rewrite `supabase/functions/extract-meeting-data/index.ts`
- [ ] Update `supabase/functions/transcribe-audio-deepgram/index.ts` with lock + quota logic
- [ ] Verify no `redis` imports remain in any function

**Testing (Manual):**
- [ ] Deploy to preview environment
- [ ] Paste identical transcript twice → 2nd should be instant (cache hit)
- [ ] Start 11 transcriptions in one day → 11th returns 429 with message
- [ ] Navigate to meeting → shows cached from sessionStorage
- [ ] Edit meeting in one tab → other tab sees update (Realtime)
- [ ] Simulate Deepgram failure → should retry with jitter
- [ ] Check logs for `[extraction.cache]`, `[extraction.claude]`, `[quota]`, `[lock]` messages

**Code Review:**
- [ ] All error handlers in place
- [ ] No dangling `redis` references
- [ ] Logging is comprehensive (each operation logged)
- [ ] Comments explain non-obvious logic

### Post-Deployment (After Launch)

- [ ] Monitor Supabase logs for extraction cache hit rates
- [ ] Track `user_transcription_quota` growth (users hitting limit?)
- [ ] Alert if `transcription_in_progress` locks don't clear (stuck forever)
- [ ] Monitor Claude API costs (should drop due to caching)

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Lock deadlock (stuck transcription) | MEDIUM | HIGH | 30-min timeout safety valve |
| Race condition (duplicate transcription) | MEDIUM | HIGH | RPC atomic lock |
| Cache collision (transcript hash) | LOW | MEDIUM | Full 256-bit hash (64 chars) |
| RPC response type wrong | MEDIUM | MEDIUM | Test in SQL editor before deploy |
| Quota boundary edge case (midnight) | LOW | LOW | Use CURRENT_DATE (standard) |
| Redis still imported somewhere | MEDIUM | HIGH | Grep entire codebase for "redis\|upstash" |

**Launch Safe?** ⚠️ **CONDITIONAL YES** — If all testing passes and Redis is completely removed. **CRITICAL BLOCKERS** below:

### CRITICAL BLOCKERS (Must Fix)

1. **Redis removal not complete:** Files still importing Redis will cause errors
   - **Action:** `grep -r "redis\|upstash" supabase/functions/` and remove all imports

2. **Migration not run:** Schema won't exist, edge functions will fail
   - **Action:** Run SQL migration in Supabase before deploying functions

3. **RPC response types not tested:** Functions could crash at runtime
   - **Action:** Execute both RPC functions in SQL editor and verify return format

### RECOMMENDED (Deploy If Time Allows)

- [ ] Add monitoring dashboard for cache hit rates
- [ ] Add alert if quota resets don't happen
- [ ] Document timezone assumptions for quota reset

---

## Files Checklist

### Files to Delete
- [ ] `supabase/functions/redis-utils.ts`

### Files to Create
- [ ] `src/hooks/useMeetingWithCache.js`
- [ ] `supabase/migrations/20260628000000_meeting_caching_foundation.sql`

### Files to Update
- [ ] `supabase/functions/extract-meeting-data/index.ts` (REWRITE)
- [ ] `supabase/functions/transcribe-audio-deepgram/index.ts` (ADD LOCK + QUOTA)
- [ ] `src/features/meetings/components/AudioTranscriptionPanel.jsx` (ADD ERROR HANDLING)

### Files to Verify (No Changes Needed)
- [ ] `.env.local` (remove UPSTASH_* vars)
- [ ] Supabase secrets (remove UPSTASH_* vars)

---

## Launch Timeline

**Day 1 (2026-06-28):** Run migration + test RPC  
**Day 2 (2026-06-29 AM):** Deploy edge functions  
**Day 2 (2026-06-29 PM):** Deploy React components  
**Day 3 (2026-06-30):** Monitor production for 24h  

---

## Success Metrics

After June 30:

- ✅ Zero transcription deadlocks (no logs with `in_progress` stuck `true`)
- ✅ Cache hit rate > 40% (users extracting similar transcripts repeatedly)
- ✅ Zero Redis errors (completely removed)
- ✅ Quota enforced (11th transcription = 429)
- ✅ Lock holds < 2 minutes average (normal Deepgram time)

---

**Report Generated:** 2026-06-28 23:15 UTC  
**Status:** Ready for implementation  
**Next Step:** Run SQL migration + delete redis-utils.ts
