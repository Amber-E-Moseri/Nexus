import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-client-info, apikey, x-meeting-id, x-user-id, x-audio-content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

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
    const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY");
    if (!deepgramKey) {
      return new Response(
        JSON.stringify({ error: "DEEPGRAM_API_KEY not configured" }),
        { headers: jsonHeaders, status: 500 }
      );
    }

    // Use caller-supplied content type, fall back to octet-stream so Deepgram
    // auto-detects via FFmpeg rather than strict container parsing.
    const audioContentType =
      req.headers.get("x-audio-content-type") || "audio/octet-stream";

    // Stream the request body directly to Deepgram — no local buffering.
    const deepgramResponse = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&detect_language=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${deepgramKey}`,
          "Content-Type": audioContentType,
        },
        body: req.body,
        // @ts-ignore — Deno requires duplex for streaming request bodies
        duplex: "half",
      }
    );

    const deepgramData = await deepgramResponse.json();

    if (!deepgramResponse.ok) {
      throw new Error(
        `Deepgram error: ${deepgramData?.err_msg || JSON.stringify(deepgramData)}`
      );
    }

    const transcript =
      deepgramData.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    const tokensUsed = Math.ceil(transcript.length / 4);

    return new Response(
      JSON.stringify({ success: true, transcript, tokensUsed }),
      { headers: jsonHeaders }
    );
  } catch (error) {
    console.error("Direct transcription error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Transcription failed" }),
      { headers: jsonHeaders, status: 500 }
    );
  }
});
