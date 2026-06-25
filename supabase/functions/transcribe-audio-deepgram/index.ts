import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  // Only POST allowed
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
    });
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    const meetingId = formData.get("meetingId") as string;

    if (!audioFile || !meetingId) {
      return new Response(
        JSON.stringify({ error: "Missing audio file or meetingId" }),
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = [
      "audio/mpeg",
      "audio/wav",
      "audio/mp4",
      "audio/m4a",
      "audio/webm",
    ];
    if (!allowedTypes.includes(audioFile.type)) {
      return new Response(
        JSON.stringify({
          error: "Invalid audio format. Allowed: MP3, WAV, M4A, WebM",
        }),
        { status: 400 }
      );
    }

    // Validate file size (100 MB max)
    const maxSize = 100 * 1024 * 1024;
    if (audioFile.size > maxSize) {
      return new Response(
        JSON.stringify({
          error: "File too large (max 100 MB)",
        }),
        { status: 400 }
      );
    }

    // Convert File to ArrayBuffer
    const audioBuffer = await audioFile.arrayBuffer();

    // Call Deepgram API
    const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY");
    if (!deepgramKey) {
      throw new Error("DEEPGRAM_API_KEY not configured");
    }

    const deepgramResponse = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${deepgramKey}`,
          "Content-Type": audioFile.type,
        },
        body: audioBuffer,
      }
    );

    if (!deepgramResponse.ok) {
      const error = await deepgramResponse.json();
      console.error("Deepgram error:", error);
      throw new Error(
        `Deepgram API error: ${deepgramResponse.status} ${error.error?.message || ""}`
      );
    }

    const deepgramData = await deepgramResponse.json();

    // Extract transcript
    const transcript =
      deepgramData.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
      "";

    if (!transcript) {
      return new Response(
        JSON.stringify({ error: "No speech detected in audio" }),
        { status: 400 }
      );
    }

    // Calculate tokens used (estimate: 1 token ≈ 4 characters)
    const tokensUsed = Math.ceil(transcript.length / 4);

    // Get user ID from headers
    const userId = req.headers.get("x-user-id");

    // Save to Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error: dbError } = await supabase
      .from("meeting_transcriptions")
      .insert([
        {
          meeting_id: meetingId,
          input_type: "audio",
          input_file_name: audioFile.name,
          summary: transcript.substring(0, 500),
          status: "complete",
          tokens_used: tokensUsed,
          created_by: userId,
          processed_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (dbError) {
      throw dbError;
    }

    // Return transcript + stored record
    return new Response(
      JSON.stringify({
        success: true,
        transcript,
        transcriptionRecord: data,
        tokensUsed,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Transcription error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Transcription failed",
      }),
      { status: 500 }
    );
  }
});
