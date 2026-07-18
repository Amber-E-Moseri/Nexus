import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ExtractedTodo {
  text: string;
  due_date_hint: string | null;
}

interface ExtractionResponse {
  summary: string;
  suggested_todos: ExtractedTodo[];
  next_action: string | null;
}

function buildPrompt(transcript: string, contactName: string): string {
  return `You are analyzing a voice note from a pastoral care worker about their interaction with a contact in a Flock CRM system.

Extract actionable follow-ups from this voice note and suggest 2-3 concrete todos.

Contact name: ${contactName}
Voice note transcript:

"""
${transcript}
"""

Return ONLY valid JSON (no markdown, no extra text) with this structure:

{
  "summary": "1-2 sentence summary of what was discussed or what happened",
  "suggested_todos": [
    {
      "text": "Clear, actionable todo text (e.g., 'Follow up about prayer needs', 'Send baptism info')",
      "due_date_hint": "null or a natural language hint like 'this Friday', 'next week', '3 days'"
    }
  ],
  "next_action": "One sentence about the next logical step, or null if interaction is complete"
}

Guidelines:
- Suggested todos should be specific and actionable
- Extract ONLY what's implied or stated in the transcript
- Don't guess or add assumptions
- Return 2-3 todos maximum (fewer is fine if the note doesn't warrant more)
- due_date_hint should be null unless a specific timeframe is mentioned
- Keep todo text concise (under 50 chars ideally)`;
}

function parseExtractionJSON(text: string): ExtractionResponse {
  try {
    return JSON.parse(text) as ExtractionResponse;
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1]) as ExtractionResponse;
      } catch { /* fall through to default */ }
    }
    return {
      summary: text,
      suggested_todos: [],
      next_action: null,
    };
  }
}

async function extractFromTranscript(
  transcript: string,
  contactName: string,
  anthropicKey: string
): Promise<ExtractionResponse> {
  const prompt = buildPrompt(transcript, contactName);

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
  return parseExtractionJSON(text);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

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

    const extracted = await extractFromTranscript(transcript, contactName, anthropicKey);

    return new Response(JSON.stringify(extracted), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error extracting Flock voice:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        summary: "",
        suggested_todos: [],
        next_action: null,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
