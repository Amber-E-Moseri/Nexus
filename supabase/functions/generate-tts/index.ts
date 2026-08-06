import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const VOICE_MAP: Record<string, string> = {
  Nova: "nova",
  Aurora: "shimmer",
  Sage: "fable",
};

const STALE_GENERATING_MS = 120_000; // 120s — same threshold used by cleanup job
const TTS_VERSION = "v1";
const BUCKET = "tts-cache";

// ── helpers ─────────────────────────────────────────────────────────────────

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function computeKeys(text: string, openaiVoice: string) {
  const normalized = text.trim().replace(/\s+/g, " ");
  const canonical = [normalized, openaiVoice, "openai", "tts-1", "en", "1.0", TTS_VERSION].join("|");
  const cacheKey = await sha256hex(canonical);
  const textHash = await sha256hex(normalized);
  return { cacheKey, textHash, normalized };
}

function storagePath(cacheKey: string, voiceId: string): string {
  // Content-addressable, sharded by first 4 hex chars to avoid hot-folder issues
  return `${cacheKey.slice(0, 2)}/${cacheKey.slice(2, 4)}/${voiceId}/${cacheKey}.mp3`;
}

async function generateAndUpload(
  text: string,
  openaiVoice: string,
  path: string,
  openaiKey: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{ durationMs: number; sizeBytes: number }> {
  const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: openaiVoice,
      input: text,
      response_format: "mp3",
    }),
  });

  if (!ttsRes.ok) {
    const errText = await ttsRes.text();
    throw new Error(`OpenAI TTS error ${ttsRes.status}: ${errText}`);
  }

  const buffer = await ttsRes.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: "audio/mpeg", upsert: true });

  if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

  // Rough duration: ~128 kbps MP3 → bytes / 16000 = seconds
  const durationMs = Math.round((buffer.byteLength / 16000) * 1000);
  return { durationMs, sizeBytes: buffer.byteLength };
}

// ── main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.substring(7),
  );
  if (authErr || !user) return json({ error: "Invalid token" }, 401);

  // ── credit check ─────────────────────────────────────────────────────────
  const { data: creditRow } = await supabase
    .from("reader_credits")
    .select("balance_mins")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creditRow || creditRow.balance_mins <= 0) {
    return json({ status: "failed", message: "Insufficient credits" }, 402);
  }

  // ── validate input ───────────────────────────────────────────────────────
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return json({ error: "OPENAI_API_KEY not configured" }, 500);

  let text: string, voice: string, bookId: string | undefined, segmentId: string | undefined;
  try {
    ({ text, voice, bookId, segmentId } = await req.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!text || !voice) return json({ error: "text and voice are required" }, 400);

  const openaiVoice = VOICE_MAP[voice] ?? "nova";
  const { cacheKey, textHash, normalized } = await computeKeys(text, openaiVoice);
  const path = storagePath(cacheKey, openaiVoice);

  // ── read current cache row ───────────────────────────────────────────────
  const { data: row } = await supabase
    .from("tts_cache")
    .select("id, status, storage_path, duration_ms, updated_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  // ── CASE A: ready ────────────────────────────────────────────────────────
  if (row?.status === "ready" && row.storage_path) {
    // Increment access_count atomically via RPC (defined in migration)
    const { error: rpcErr } = await supabase.rpc("increment_tts_access", { p_cache_key: cacheKey });
    if (rpcErr) console.error("[generate-tts] increment_tts_access failed", rpcErr.message);

    const { data: signedData, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path, 3600);

    if (signErr || !signedData?.signedUrl) {
      console.error("[generate-tts] signed URL error", signErr);
      return json({ error: "Could not generate signed URL" }, 500);
    }

    return json({
      status: "ready",
      audioUrl: signedData.signedUrl,
      duration: (row.duration_ms ?? 0) / 1000,
      cached: true,
    });
  }

  // ── CASE B: generating (possibly stale) ─────────────────────────────────
  if (row?.status === "generating") {
    const age = Date.now() - new Date(row.updated_at).getTime();
    if (age < STALE_GENERATING_MS) {
      return json({ status: "generating" });
    }
    // Stale — try to atomically reclaim via CAS UPDATE
    const { data: reclaimed } = await supabase
      .from("tts_cache")
      .update({ status: "generating", updated_at: new Date().toISOString(), error_message: null })
      .eq("cache_key", cacheKey)
      .eq("status", "generating")
      .lt("updated_at", new Date(Date.now() - STALE_GENERATING_MS).toISOString())
      .select("id");

    if (!reclaimed?.length) return json({ status: "generating" }); // concurrent reclaim won
    // fall through to GENERATE
  }

  // ── CASE C: failed — try to atomically reclaim ──────────────────────────
  else if (row?.status === "failed") {
    const { data: retried } = await supabase
      .from("tts_cache")
      .update({ status: "generating", updated_at: new Date().toISOString(), error_message: null })
      .eq("cache_key", cacheKey)
      .eq("status", "failed")
      .select("id");

    if (!retried?.length) return json({ status: "generating" }); // concurrent retry won
    // fall through to GENERATE
  }

  // ── CASE D: not found — insert ───────────────────────────────────────────
  else if (!row) {
    const { data: inserted, error: insertErr } = await supabase
      .from("tts_cache")
      .insert({
        cache_key: cacheKey,
        text_hash: textHash,
        voice_id: openaiVoice,
        book_id: bookId ?? null,
        segment_id: segmentId ?? null,
        provider: "openai",
        model: "tts-1",
        language: "en",
        speed: 1.0,
        tts_version: TTS_VERSION,
        status: "generating",
        storage_path: path,
      })
      .select("id");

    if (insertErr) {
      console.error("[generate-tts] cache insert error", insertErr.code, insertErr.message);
      return json({ status: "failed", message: "Cache initialization failed" }, 500);
    }
    if (!inserted?.length) return json({ status: "generating" }); // concurrent insert won
    // fall through to GENERATE
  }

  // ── GENERATE ─────────────────────────────────────────────────────────────
  try {
    const { durationMs, sizeBytes } = await generateAndUpload(
      normalized,
      openaiVoice,
      path,
      openaiKey,
      supabase,
    );

    await supabase
      .from("tts_cache")
      .update({
        status: "ready",
        storage_path: path,
        duration_ms: durationMs,
        size_bytes: sizeBytes,
        updated_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("cache_key", cacheKey);

    const { data: signedData, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);

    if (signErr || !signedData?.signedUrl) {
      return json({ error: "Generated but could not create signed URL" }, 500);
    }

    return json({
      status: "ready",
      audioUrl: signedData.signedUrl,
      duration: durationMs / 1000,
      cached: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-tts] generation error", message);

    await supabase
      .from("tts_cache")
      .update({
        status: "failed",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("cache_key", cacheKey);

    return json({ status: "failed", message }, 500);
  }
});
