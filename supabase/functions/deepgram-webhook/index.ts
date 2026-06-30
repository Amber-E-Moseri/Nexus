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
    const transcript: string =
      payload.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

    await supabase
      .from("meeting_transcriptions")
      .update({
        status: "complete",
        full_transcript: transcript,
        summary: transcript.slice(0, 500) || null,
        tokens_used: Math.ceil(transcript.length / 4),
        processed_at: new Date().toISOString(),
      })
      .eq("id", recordId);

    // Update meeting summary so the AI Extract tab has the text ready
    if (transcript) {
      await supabase
        .from("meetings")
        .update({ summary: transcript })
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
