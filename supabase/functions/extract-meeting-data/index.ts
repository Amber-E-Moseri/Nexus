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
    const { transcript, context, stream: wantStream, linked_spaces = [], participants = [], meeting_date = new Date().toISOString() } = body;

    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "Missing transcript" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Format participant data for validation
    const participantsJson = JSON.stringify(participants);
    const linkedSpacesJson = JSON.stringify(linked_spaces);

    // Step 2: Build v2.1 system prompt with data validation + classification + extraction
    const systemPrompt = `SYSTEM PROMPT — extract-meeting-data (v2.1, merged classification + space validation)

You are processing a transcript. First validate participant data, then classify content,
then extract accordingly.

=== DATA VALIDATION (before processing) ===
Validate participant data integrity:
- Any participant with 2+ spaces MUST have a "primary" field defined
- If a participant has 2+ spaces but primary is missing, null, or not in their
  spaces array, flag it as a data integrity issue

Add any validation failures to a "data_issues" array in your response.

When you encounter a task assigned to a person with a missing/invalid primary_space
during extraction:
- Set suggested_space: null
- Set space_confidence: "ambiguous"
- Do NOT try to guess their primary space or default to their first space
- Continue extraction normally — the downstream review process will handle manual
  intervention

=== STEP 1 — Classify Content Type ===
Determine content_type: "meeting" | "raw_note" | "list_data" | "other"
- "meeting" = multiple speakers in dialogue, OR single speaker narrating meeting-like
  content (updates, plans, assignments, decisions)
- "raw_note" = single-voice notes/journaling, no discussion structure, internal
  reflection
- "list_data" = structured data read aloud (e.g. birthday lists, roster reads,
  inventory reads) — NOT a meeting even if names and dates appear together
- "other" = anything else (scripture reading, song lyrics, random audio, stray
  recordings, etc.)

=== STEP 2 — Extract Based on Classification ===
- If content_type is NOT "meeting", OR confidence < 0.6:
    → Only return cleaned_transcript, chapters, and content_type fields.
    → Leave summary, decisions, action_items, key_topics as empty/null.
    → This prevents forced meeting structure for non-meeting content.
- If content_type IS "meeting" with confidence >= 0.6:
    → Populate all fields including summary, decisions, action_items, key_topics.

=== SPACE SUGGESTION RULES (only apply if content_type = meeting) ===
- Only suggest spaces from the meeting's linked_spaces: ${linkedSpacesJson}
- Base suggested_space on TASK CONTENT ONLY:
  * "coordinate media team" → Media
  * "approve budget line" → Admin
  * "prayer team ushering" → PFCC
  → Do NOT default to the owner's known primary space just because it's convenient.
- Set space_confidence based on clarity of task content:
  * "high" = task content clearly and specifically points to one space
  * "low" = task is generic/could fit multiple spaces but one is plausible
  * "ambiguous" = genuinely unclear which space owns this, don't force a guess
- Participants and their space memberships (provided for context only):
  ${participantsJson}

=== RETURN SCHEMA ===
Return ONLY valid JSON (no markdown, no extra text):

{
  "content_type": "meeting" | "raw_note" | "list_data" | "other",
  "confidence": 0.0 to 1.0,
  "data_issues": [
    {
      "type": "missing_primary_space" | "invalid_primary_space" | "other",
      "participant_name": "string",
      "spaces": ["array of space names"],
      "action": "string — brief explanation"
    }
  ],
  "cleaned_transcript": "string with filler removed, or null if content_type != meeting",
  "chapters": [{ "title": "string", "start_marker": "string" }],
  "summary": "string or null",
  "decisions": [{ "decision": "string", "context": "string" }],
  "action_items": [
    {
      "title": "string",
      "owner": "string or null",
      "owner_confidence": "explicit" | "inferred" | "unassigned",
      "suggested_space": "string or null",
      "space_confidence": "high" | "low" | "ambiguous",
      "due_date": "string or null",
      "priority": "high" | "medium" | "low"
    }
  ],
  "key_topics": ["string"]
}

=== ASSIGNMENT INFERENCE RULES ===
- owner_confidence = "explicit" when directly named ("Amber will build the form")
- owner_confidence = "inferred" when implied by acceptance ("Can you take that?" / "Yeah I got it")
- owner_confidence = "unassigned" when no owner can be determined

=== DEDUPLICATION RULES ===
- If task is mentioned then merged ("fold that into what you're already doing"), output ONE item
- If task is proposed then declined/ruled out, do NOT include it
- If same deliverable discussed multiple times, consolidate into single item

=== DATE NORMALIZATION ===
- Meeting date: ${meeting_date}
- Convert clear relative references ("by Friday", "next Tuesday", "in two weeks") to actual dates
- Keep vague references as-is ("before the event", "well before the day")
- Never guess a due date — null is better than a wrong date

Meeting context: ${context || "None"}

Transcript:
${transcript.slice(0, 8000)}`;

    // Step 3: Call Claude with v2.1 prompt (single call, no classification pre-pass)
    const classifyPrompt = systemPrompt;

    // v2.1 handles classification + extraction in one call
    const prompt = classifyPrompt;

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
      const outputMode = cached.content_type === "meeting" && cached.confidence >= 0.6 ? "organized" : "full_transcript";
      return new Response(JSON.stringify({ success: true, extracted: cached, transcript, output_mode: outputMode, cached: true }), {
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

    const outputMode = extracted.content_type === "meeting" && extracted.confidence >= 0.6 ? "organized" : "full_transcript";

    return new Response(JSON.stringify({ success: true, extracted, transcript, output_mode: outputMode, cached: false }), {
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
