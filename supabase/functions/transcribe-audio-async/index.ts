import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY");
    if (!deepgramKey) throw new Error("DEEPGRAM_API_KEY not configured");

    const webhookSecret = Deno.env.get("DEEPGRAM_WEBHOOK_SECRET");
    if (!webhookSecret) throw new Error("DEEPGRAM_WEBHOOK_SECRET not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get authenticated user from JWT
    const token = req.headers.get("Authorization")?.split(" ")[1];
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { headers: jsonHeaders, status: 401 });
    }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { headers: jsonHeaders, status: 401 });
    }

    const { audioPath, meetingId } = await req.json();
    if (!audioPath || !meetingId) {
      return new Response(JSON.stringify({ error: "Missing audioPath or meetingId" }), { headers: jsonHeaders, status: 400 });
    }

    // Generate a signed URL valid for 2 hours (Deepgram fetches it asynchronously)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("meeting-audio")
      .createSignedUrl(audioPath, 7200);
    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${signedUrlError?.message}`);
    }

    // Insert a pending record — webhook fills in the transcript when Deepgram finishes
    const fileName = audioPath.split("/").pop() || audioPath;
    const { data: record, error: insertErr } = await supabase
      .from("meeting_transcriptions")
      .insert([{
        meeting_id: meetingId,
        input_type: "audio",
        input_file_name: fileName,
        summary: null,
        status: "transcribing",
        tokens_used: 0,
        created_by: user.id,
      }])
      .select()
      .single();
    if (insertErr || !record) {
      throw new Error(`Failed to create transcription record: ${insertErr?.message}`);
    }

    // Build callback URL — shared secret prevents unauthorized POSTs
    const callbackUrl =
      `${supabaseUrl}/functions/v1/deepgram-webhook` +
      `?secret=${encodeURIComponent(webhookSecret)}` +
      `&record_id=${record.id}` +
      `&meeting_id=${encodeURIComponent(meetingId)}`;

    // Submit async job to Deepgram — returns request_id immediately, no transcription wait
    const dgResp = await fetch(
      `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&detect_language=true` +
      `&callback=${encodeURIComponent(callbackUrl)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${deepgramKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: signedUrlData.signedUrl }),
      }
    );

    if (!dgResp.ok) {
      const err = await dgResp.json().catch(() => ({}));
      // Mark record failed so frontend doesn't poll forever
      await supabase
        .from("meeting_transcriptions")
        .update({ status: "failed", error_message: `Deepgram rejected the job: ${JSON.stringify(err)}` })
        .eq("id", record.id);
      throw new Error(`Deepgram job submission failed: ${JSON.stringify(err)}`);
    }

    const dgData = await dgResp.json();
    const jobId: string = dgData.request_id || dgData.job_id || "";

    // Store job ID for reference
    await supabase
      .from("meeting_transcriptions")
      .update({ deepgram_job_id: jobId })
      .eq("id", record.id);

    return new Response(
      JSON.stringify({ success: true, transcriptionId: record.id, jobId, status: "transcribing" }),
      { headers: jsonHeaders }
    );
  } catch (error) {
    console.error("Async transcription error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Failed to queue transcription" }),
      { headers: jsonHeaders, status: 500 }
    );
  }
});
