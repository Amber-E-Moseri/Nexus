import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Redis } from "https://esm.sh/@upstash/redis";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Redis is optional — if secrets aren't set, caching is skipped but extraction still works
let _redis: Redis | null = null;
function getRedis(): Redis | null {
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL") || "";
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN") || "";
  if (!url || !token) return null;
  if (!_redis) _redis = new Redis({ url, token });
  return _redis;
}

async function hashTranscript(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}

async function getCachedExtraction(transcriptHash: string) {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const cached = await redis.get(`extraction:${transcriptHash}`);
    if (cached) {
      console.log(`Cache hit for extraction:${transcriptHash}`);
      return JSON.parse(cached as string);
    }
  } catch (error) {
    console.warn("Failed to get cache:", error);
  }
  return null;
}

async function setCachedExtraction(transcriptHash: string, extracted: any) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.setex(`extraction:${transcriptHash}`, 2592000, JSON.stringify(extracted));
    console.log(`Cached extraction for ${transcriptHash}`);
  } catch (error) {
    console.warn("Failed to set cache:", error);
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
    const { transcript } = await req.json();

    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "Missing transcript" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check cache first
    const transcriptHash = await hashTranscript(transcript);
    const cached = await getCachedExtraction(transcriptHash);
    if (cached) {
      return new Response(JSON.stringify({ success: true, extracted: cached, cached: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Extract the following from this meeting transcript. Return ONLY valid JSON with no markdown or extra text.

TRANSCRIPT:
${transcript.slice(0, 8000)}

Return JSON:
{
  "summary": "2-3 sentence summary",
  "decisions": ["decision 1", "decision 2"],
  "action_items": [
    {"title": "action description", "owner": "name or TBD", "due_date": "YYYY-MM-DD or null"}
  ],
  "key_topics": ["topic1", "topic2"]
}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Claude API error: ${err.error?.message || response.status}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text ?? "";

    let extracted;
    try {
      extracted = JSON.parse(text);
    } catch {
      // Claude sometimes wraps JSON in ```json ... ``` — strip it
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      extracted = match ? JSON.parse(match[1]) : { summary: text, decisions: [], action_items: [], key_topics: [] };
    }

    // Cache the extraction result
    await setCachedExtraction(transcriptHash, extracted);

    return new Response(JSON.stringify({ success: true, extracted, cached: false }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-meeting-data error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Extraction failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
