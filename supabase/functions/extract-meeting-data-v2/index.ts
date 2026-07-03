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
    .hex(); // Full 64-char hash
}

async function getCachedExtraction(meetingId: string, transcriptHash: string) {
  const { data, error } = await supabase
    .from("meetings")
    .select("extraction_cache, extraction_cached_at, extraction_cache_valid")
    .eq("id", meetingId)
    .eq("transcript_hash", transcriptHash)
    .eq("extraction_cache_valid", true)
    .not("extraction_cache", "is", null)
    .single();

  if (error?.code === "PGRST116") {
    console.log(
      `[extraction.cache] miss meeting_id=${meetingId} hash=${transcriptHash.substring(0, 8)}...`
    );
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
    console.log(
      `[extraction.cache] expired cached_at=${cachedAt.toISOString()}`
    );
    return null;
  }

  console.log(`[extraction.cache] hit meeting_id=${meetingId}`);
  return data.extraction_cache;
}

async function saveExtractionCache(
  meetingId: string,
  transcriptHash: string,
  extraction: object
) {
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
    console.error(
      `[extraction.cache] save_error meeting_id=${meetingId} error="${error.message}"`
    );
  } else {
    console.log(`[extraction.cache] saved meeting_id=${meetingId}`);
  }
}

async function extractViaClaudeWithLogging(
  transcript: string,
  meetingId: string
) {
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
        : {
            summary: text,
            decisions: [],
            action_items: [],
            key_topics: [],
          };
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

async function extractWithRetry(
  transcript: string,
  meetingId: string,
  maxRetries = 2
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await extractViaClaudeWithLogging(transcript, meetingId);
    } catch (error) {
      console.warn(
        `[extraction] retry attempt=${attempt}/${maxRetries} meeting_id=${meetingId} error="${error.message}"`
      );

      if (attempt === maxRetries) {
        console.error(
          `[extraction] exhausted_retries meeting_id=${meetingId} after ${maxRetries} attempts`
        );
        throw error;
      }

      // Exponential backoff with jitter
      const delayMs = Math.pow(2, attempt - 1) * 1000;
      const jitterMs = Math.random() * 1000;
      await new Promise((resolve) =>
        setTimeout(resolve, delayMs + jitterMs)
      );
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // AUTH: Verify JWT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.substring(7)
  );

  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  try {
    const { meetingId, transcript } = await req.json();

    if (!meetingId || !transcript) {
      console.warn(
        `[extraction] validation_error missing_meetingId=${!meetingId} missing_transcript=${!transcript}`
      );
      return new Response(
        JSON.stringify({ error: "Missing meetingId or transcript" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const transcriptHash = hashTranscript(transcript);
    console.log(
      `[extraction] request_start meeting_id=${meetingId} hash=${transcriptHash.substring(0, 8)}... transcript_len=${transcript.length}`
    );

    // Check cache first
    const cached = await getCachedExtraction(meetingId, transcriptHash);
    if (cached) {
      console.log(`[extraction] complete meeting_id=${meetingId} source=cache`);
      return new Response(
        JSON.stringify({ data: cached, source: "cache" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Extract via Claude (with retries)
    const extraction = await extractWithRetry(transcript, meetingId);

    // Save to cache
    await saveExtractionCache(meetingId, transcriptHash, extraction);

    console.log(`[extraction] complete meeting_id=${meetingId} source=claude`);
    return new Response(
      JSON.stringify({ data: extraction, source: "claude" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error(`[extraction] request_failed error="${error.message}"`);
    return new Response(
      JSON.stringify({ error: error.message || "Extraction failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
