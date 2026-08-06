import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Called daily by Vercel cron (see vercel.json / api/cron/cleanup-tts-cache).
// Auth: x-cron-secret header must match CRON_SECRET env var.
// Operations:
//   1. Mark 'generating' rows stuck >120s as 'failed' (same threshold as generate-tts reclaim)
//   2. Delete 'failed' rows older than 24h + their storage objects
//   3. Delete 'ready' rows not accessed in 90 days (LRU eviction) + their storage objects

const BUCKET = "tts-cache";
const STALE_MS = 120_000;
const FAILED_TTL_HOURS = 24;
const LRU_DAYS = 90;

serve(async (req) => {
  // ── auth: shared secret header ───────────────────────────────────────────
  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");
  if (!cronSecret || incoming !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Record<string, unknown> = {};

  // ── 1. Mark stale 'generating' rows as 'failed' ──────────────────────────
  const staleThreshold = new Date(Date.now() - STALE_MS).toISOString();
  const { data: markedFailed, error: markErr } = await supabase
    .from("tts_cache")
    .update({ status: "failed", error_message: "Timed out during generation", updated_at: new Date().toISOString() })
    .eq("status", "generating")
    .lt("updated_at", staleThreshold)
    .select("id");

  results.markedFailed = markedFailed?.length ?? 0;
  if (markErr) results.markError = markErr.message;

  // ── 2. Delete 'failed' rows older than 24h ───────────────────────────────
  const failedThreshold = new Date(Date.now() - FAILED_TTL_HOURS * 3600 * 1000).toISOString();
  const { data: failedRows, error: failedFetchErr } = await supabase
    .from("tts_cache")
    .select("id, storage_path")
    .eq("status", "failed")
    .lt("updated_at", failedThreshold);

  if (!failedFetchErr && failedRows?.length) {
    const paths = failedRows.map((r) => r.storage_path).filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);

    const ids = failedRows.map((r) => r.id);
    const { error: delErr } = await supabase.from("tts_cache").delete().in("id", ids);
    results.deletedFailed = ids.length;
    if (delErr) results.deleteFailedError = delErr.message;
  } else {
    results.deletedFailed = 0;
    if (failedFetchErr) results.failedFetchError = failedFetchErr.message;
  }

  // ── 3. LRU eviction: 'ready' rows not accessed in 90 days ───────────────
  const lruThreshold = new Date(Date.now() - LRU_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: lruRows, error: lruFetchErr } = await supabase
    .from("tts_cache")
    .select("id, storage_path")
    .eq("status", "ready")
    .lt("last_accessed_at", lruThreshold);

  if (!lruFetchErr && lruRows?.length) {
    const paths = lruRows.map((r) => r.storage_path).filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);

    const ids = lruRows.map((r) => r.id);
    const { error: delErr } = await supabase.from("tts_cache").delete().in("id", ids);
    results.deletedLru = ids.length;
    if (delErr) results.deleteLruError = delErr.message;
  } else {
    results.deletedLru = 0;
    if (lruFetchErr) results.lruFetchError = lruFetchErr.message;
  }

  console.log("[cleanup-tts-cache]", results);
  return new Response(JSON.stringify({ ok: true, ...results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
