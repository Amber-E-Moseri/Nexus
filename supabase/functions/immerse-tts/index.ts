import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const audioHeaders = { ...corsHeaders, "Content-Type": "audio/mpeg" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // AUTH: Verify JWT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
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
      headers: jsonHeaders,
    });
  }
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { headers: jsonHeaders, status: 500 }
      );
    }

    const { text, voice } = await req.json();
    if (!text || !voice) {
      return new Response(
        JSON.stringify({ error: "text and voice required" }),
        { headers: jsonHeaders, status: 400 }
      );
    }

    // Map UI voice names to OpenAI TTS voices
    const voiceMap: Record<string, string> = {
      Nova: "nova",
      Aurora: "shimmer",
      Sage: "fable",
    };
    const openaiVoice = voiceMap[voice] || "nova";

    // Call OpenAI TTS API
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
      const err = await ttsRes.text();
      console.error("OpenAI TTS error:", err);
      return new Response(
        JSON.stringify({ error: `OpenAI error: ${ttsRes.status}` }),
        { headers: jsonHeaders, status: ttsRes.status }
      );
    }

    // Stream audio binary back to client
    const buffer = await ttsRes.arrayBuffer();
    return new Response(buffer, { headers: audioHeaders });
  } catch (err) {
    console.error("TTS error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: jsonHeaders, status: 500 }
    );
  }
});
