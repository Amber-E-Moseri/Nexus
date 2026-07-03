import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// No JWT verification — Deepgram calls this endpoint. Auth is via shared secret in query string.
serve(async (req) => {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    const recordId = url.searchParams.get("record_id");
    const meetingId = url.searchParams.get("meeting_id");

    const expectedSecret = Deno.env.get("DEEPGRAM_WEBHOOK_SECRET");
    if (!secret || secret !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (!recordId || !meetingId) {
      return new Response("Missing record_id or meeting_id", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload = await req.json();
    console.log("Deepgram webhook received for record:", recordId, "status:", payload.error ? "error" : "ok");

    if (payload.error) {
      await supabase
        .from("meeting_transcriptions")
        .update({ status: "failed", error_message: String(payload.error) })
        .eq("id", recordId);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // Extract transcript from Deepgram's callback payload
    const fullTranscript: string =
      payload.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

    // Polish the transcript with Claude (WIN 1)
    let polishedTranscript = fullTranscript;
    if (fullTranscript && fullTranscript.length > 0) {
      try {
        const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
        if (anthropicKey) {
          const polishResp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": anthropicKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 4000,
              messages: [
                {
                  role: "user",
                  content: `Clean up this transcription for readability.

Fix grammar and spelling. Remove filler words (um, like, uh, you know, basically, actually, etc.). Fix stuttering and repetition. Preserve exact names, technical terms, and original meaning.

Do NOT add commentary, do NOT summarize, do NOT change meaning.
Return ONLY the cleaned transcription.

Transcription:
${fullTranscript}`,
                },
              ],
            }),
          });

          if (polishResp.ok) {
            const polishData = await polishResp.json();
            const polished = polishData.content?.[0]?.text;
            if (polished) polishedTranscript = polished;
          }
        }
      } catch (err) {
        console.error("Failed to polish transcript:", err);
        // Fall back to raw transcript
      }
    }

    await supabase
      .from("meeting_transcriptions")
      .update({
        status: "complete",
        full_transcript: fullTranscript,
        summary: polishedTranscript.slice(0, 500) || null,
        tokens_used: Math.ceil(fullTranscript.length / 4),
        processed_at: new Date().toISOString(),
      })
      .eq("id", recordId);

    // Update meeting with raw summary and polished transcript
    if (fullTranscript) {
      await supabase
        .from("meetings")
        .update({
          summary: fullTranscript,
          polished_transcript: polishedTranscript,
        })
        .eq("id", meetingId);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Deepgram webhook error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
