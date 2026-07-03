import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Redis } from "https://esm.sh/@upstash/redis";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  // ── AUTH: Verify JWT ──────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.substring(7)
  );

  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    const body = await req.json();
    const { transcript, context, stream: wantStream } = body;

    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "Missing transcript" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contextLine = context
      ? `Meeting Context: ${context}`
      : "Meeting Context: No additional context provided";

    const prompt = `${contextLine}

Meeting transcript:
${transcript.slice(0, 8000)}

Extract and return ONLY valid JSON (no markdown, no extra text):
{
  "summary": "2-3 sentence summary",
  "decisions": ["decision 1", "decision 2"],
  "action_items": [
    {"title": "action description", "owner": "name or TBD", "due_date": "YYYY-MM-DD or null"}
  ],
  "key_topics": ["topic1", "topic2"]
}`;

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    // ── STREAMING path (WIN 3) ────────────────────────────────────────────
    if (wantStream) {
      const upstreamResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "messages-2023-12-15",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          stream: true,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!upstreamResp.ok) {
        const err = await upstreamResp.json();
        throw new Error(`Claude API error: ${err.error?.message || upstreamResp.status}`);
      }

      const responseStream = new ReadableStream({
        async start(controller) {
          const reader = upstreamResp.body!.getReader();
          const decoder = new TextDecoder();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value);
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const raw = line.slice(6).trim();
                if (raw === "[DONE]") continue;
                try {
                  const evt = JSON.parse(raw);
                  if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                    const text = evt.delta.text || "";
                    if (text) {
                      controller.enqueue(
                        new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`)
                      );
                    }
                  }
                } catch {
                  // skip malformed SSE lines
                }
              }
            }
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ done: true })}\n\n`)
            );
          } catch (err) {
            controller.error(err);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(responseStream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // ── NON-STREAMING path (unchanged + context support) ──────────────────
    const transcriptHash = await hashTranscript(transcript + (context || ""));
    const cached = await getCachedExtraction(transcriptHash);
    if (cached) {
      return new Response(JSON.stringify({ success: true, extracted: cached, cached: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        messages: [{ role: "user", content: prompt }],
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
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      extracted = match ? JSON.parse(match[1]) : { summary: text, decisions: [], action_items: [], key_topics: [] };
    }

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
