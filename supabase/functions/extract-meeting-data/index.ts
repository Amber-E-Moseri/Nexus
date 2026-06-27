import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    return new Response(JSON.stringify({ success: true, extracted }), {
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
