import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Same chunking approach as extract-meeting-data — most calls are short
// enough to never hit this, but a long pastoral call shouldn't silently
// truncate instead of being extracted in full.
const MAX_TRANSCRIPT_CHARS = Number(Deno.env.get("MAX_TRANSCRIPT_CHARS")) || 60000;
const MAX_CHUNKS = Number(Deno.env.get("MAX_TRANSCRIPT_CHUNKS")) || 6;

// Without a bound, a hung/slow Anthropic call lets the Supabase platform
// kill this function outright before it ever reaches its own catch block —
// the client gets a truly empty response body and "Unexpected end of JSON
// input" trying to parse it, instead of the proper JSON error response the
// catch block would otherwise return. Same fix already applied to
// extract-meeting-data after hitting the identical failure mode there.
const ANTHROPIC_TIMEOUT_MS = Number(Deno.env.get("ANTHROPIC_TIMEOUT_MS")) || 240000;

async function fetchAnthropic(body: unknown, anthropicKey: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);
  try {
    return await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Claude API call timed out after ${ANTHROPIC_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

interface ExtractedTodo {
  text: string;
  due_date_hint: string | null;
}

interface ExtractionResponse {
  result: string | null;
  summary: string;
  decisions: string[];
  suggested_todos: ExtractedTodo[];
  next_action: string | null;
}

const RESULT_VALUES = ["Reached", "No Answer", "Left Message", "Rescheduled Call"];

function splitIntoChunks(text: string, maxChars: number, maxChunks: number): { chunks: string[]; truncated: boolean } {
  if (text.length <= maxChars) return { chunks: [text], truncated: false };
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0 && chunks.length < maxChunks) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      remaining = "";
      break;
    }
    const window = remaining.slice(0, maxChars);
    const candidates = [window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". ")]
      .filter((i) => i > maxChars * 0.5);
    const cut = candidates.length > 0 ? Math.max(...candidates) + 1 : maxChars;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  return { chunks, truncated: remaining.length > 0 };
}

function buildPrompt(transcript: string, contactName: string, chunkIndex: number, totalChunks: number): string {
  const chunkNote = totalChunks > 1
    ? `\n\nNOTE: This is part ${chunkIndex + 1} of ${totalChunks} from one continuous call, split only because of length. Extract only what appears in THIS portion — do not assume content from other parts.`
    : "";

  return `You are analyzing a voice note from a pastoral care worker about their interaction with a contact in a Flock CRM system.

Contact name: ${contactName}
Voice note transcript:

"""
${transcript}
"""${chunkNote}

Return ONLY valid JSON (no markdown, no extra text) with this structure:

{
  "result": "Reached" | "No Answer" | "Left Message" | "Rescheduled Call" | null,
  "summary": "1-2 sentence summary of what was discussed or what happened",
  "decisions": ["key things discussed, agreed, committed to, or prayer/follow-up items raised — short phrases, empty array if none"],
  "suggested_todos": [
    {
      "text": "Clear, actionable todo text (e.g., 'Follow up about prayer needs', 'Send baptism info')",
      "due_date_hint": "null or a natural language hint like 'this Friday', 'next week', '3 days'"
    }
  ],
  "next_action": "One sentence about the next logical step, or null if interaction is complete"
}

Guidelines:
- "result": classify the call outcome from the transcript itself — was the contact actually reached, was it voicemail/no answer, did the call get rescheduled? null only if genuinely unclear from the transcript.
- "decisions": short factual phrases, not full sentences — e.g. "Agreed to attend Sunday service", "Prayer request: job interview Friday". Extract ONLY what's stated, don't infer.
- Suggested todos should be specific and actionable, 2-3 maximum (fewer is fine if the note doesn't warrant more).
- due_date_hint should be null unless a specific timeframe is mentioned.
- Keep todo text concise (under 50 chars ideally).
- Don't guess or add assumptions anywhere in this response.`;
}

function parseExtractionJSON(text: string): Partial<ExtractionResponse> {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try { return JSON.parse(match[1]); } catch { /* fall through */ }
    }
    return { summary: text, decisions: [], suggested_todos: [], next_action: null, result: null };
  }
}

async function extractChunk(prompt: string, anthropicKey: string): Promise<Partial<ExtractionResponse>> {
  const response = await fetchAnthropic({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1536,
    messages: [{ role: "user", content: prompt }],
  }, anthropicKey);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Claude API error: ${err.error?.message || response.status}`);
  }
  const result = await response.json();
  const text = result.content?.[0]?.text ?? "";
  return parseExtractionJSON(text);
}

function mergeParts(parts: Partial<ExtractionResponse>[]): ExtractionResponse {
  const nonNull = (v: unknown) => v !== null && v !== undefined && v !== "";
  const results = parts.map((p) => p.result).filter((r) => r && RESULT_VALUES.includes(r));
  return {
    // First chunk's result generally reflects how the call started/connected —
    // reasonable default when a call spans multiple chunks (rare).
    result: results[0] ?? null,
    summary: parts.map((p) => p.summary).filter(nonNull).join(" ") || "",
    decisions: parts.flatMap((p) => p.decisions ?? []),
    suggested_todos: parts.flatMap((p) => p.suggested_todos ?? []).slice(0, 3),
    next_action: parts.map((p) => p.next_action).filter(nonNull).pop() ?? null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // ── AUTH: Verify JWT (previously missing entirely — anyone with the anon
  // key could call this function) ────────────────────────────────────────
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
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.substring(7));
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // ─────────────────────────────────────────────────────────────────────

  try {
    const { transcript, contactName } = await req.json();

    if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "transcript is required and must be non-empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!contactName || typeof contactName !== "string") {
      return new Response(
        JSON.stringify({ error: "contactName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    const { chunks } = splitIntoChunks(transcript, MAX_TRANSCRIPT_CHARS, MAX_CHUNKS);

    let extracted: ExtractionResponse;
    if (chunks.length === 1) {
      const part = await extractChunk(buildPrompt(chunks[0], contactName, 0, 1), anthropicKey);
      extracted = mergeParts([part]);
    } else {
      const parts = await Promise.all(
        chunks.map((c, i) => extractChunk(buildPrompt(c, contactName, i, chunks.length), anthropicKey)),
      );
      extracted = mergeParts(parts);
    }

    return new Response(JSON.stringify(extracted), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error extracting Flock voice:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        result: null,
        summary: "",
        decisions: [],
        suggested_todos: [],
        next_action: null,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
