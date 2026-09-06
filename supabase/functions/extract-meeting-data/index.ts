import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Redis } from "https://esm.sh/@upstash/redis";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Max characters sent to Claude per call. Longer transcripts are split into
// multiple chunks (see splitIntoChunks) rather than truncated outright.
const MAX_TRANSCRIPT_CHARS = Number(Deno.env.get("MAX_TRANSCRIPT_CHARS")) || 60000;
// Safety ceiling on chunk count so a pathological paste can't fan out into
// unbounded API calls. 6 chunks × 60k chars ≈ 360k chars, well beyond any
// real meeting length — only hit by degenerate input.
const MAX_CHUNKS = Number(Deno.env.get("MAX_TRANSCRIPT_CHUNKS")) || 6;

// A hung Anthropic call (no timeout, network stall, upstream never
// responding) previously left the meeting's extraction_status stuck at
// 'processing' forever — nothing downstream ever ran to write a terminal
// state, and the client's realtime subscription just waits indefinitely.
// Every direct Anthropic fetch below is bounded so a stall surfaces as a
// normal thrown error (caught by the handler's outer try/catch, which
// persists extraction_status='failed') instead of hanging.
//
// 90s (the original value here) was too aggressive and immediately started
// killing legitimate long-running calls: max_tokens is 12288 and
// detailed_notes is near-verbatim, so a genuinely long meeting transcript
// can take several minutes to generate — confirmed live ("Claude API call
// timed out after 90000ms" on a real extraction that was still actively
// generating, not hung). 4 minutes gives real generations room to finish
// while still being a bounded number instead of "forever".
const ANTHROPIC_TIMEOUT_MS = Number(Deno.env.get("ANTHROPIC_TIMEOUT_MS")) || 240000;

// Lets trusted background jobs (e.g. the Zoom recording-intelligence cron
// worker) call this function without a real end-user session. Matches the
// same Authorization-header convention already used by zoom-recording-sync
// and other internal job targets.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NOVA_JOBS_SECRET = Deno.env.get("NOVA_JOBS_SECRET") ?? "";

async function fetchAnthropic(body: unknown, anthropicKey: string, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);
  try {
    return await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        ...extraHeaders,
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

// Split a long transcript into sequential chunks, each ≤ maxChars. Prefers
// breaking at a paragraph/sentence boundary near the limit so a chunk edge
// doesn't land mid-sentence. Returns truncated:true only if the transcript
// is so long it still exceeds maxChunks worth of chunks.
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

function buildSystemPrompt({ transcriptChunk, chunkIndex, totalChunks, context, linkedSpacesJson, participantsJson, meeting_date }: {
  transcriptChunk: string;
  chunkIndex: number;
  totalChunks: number;
  context: string;
  linkedSpacesJson: string;
  participantsJson: string;
  meeting_date: string;
}) {
  const chunkNote = totalChunks > 1
    ? `\n\nNOTE: Part ${chunkIndex + 1} of ${totalChunks}. Extract only this portion. Parts merged programmatically — do not reference part numbers in output.`
    : "";
  const isFinalChunk = totalChunks > 1 && chunkIndex === totalChunks - 1;
  const finalSummaryNote = isFinalChunk
    ? "\n\nFINAL CHUNK ONLY: Include a 'final_summary' field in your JSON: a 4-6 sentence synthesis combining all chunk summaries into one coherent meeting overview. For non-final chunks, omit this field."
    : "";

  return `SYSTEM PROMPT — extract-meeting-data (v3.1, performance optimized)

Classify content type, then extract meeting data accordingly.

=== CONTENT CLASSIFICATION ===
content_type: "meeting" | "raw_note" | "list_data" | "other"
- "meeting" = dialogue or single speaker addressing attendees present
- "raw_note" = single-voice personal dictation (still extract in full if substantive)
- "list_data" = structured data read aloud (birthdays, rosters, inventory)
- "other" = scripture, songs, random audio

If content_type is "meeting" or "raw_note" AND confidence >= 0.6: extract all fields.
Otherwise: return summary, content_type, confidence, decisions, action_items, open_items only.

=== EXTRACTION RULES ===
- **summary**: 4-6 sentences contextual synthesis (why, main topics, outcomes, tone)
- **detailed_notes**: markdown, chronological, topic-headed, near-verbatim (omit if low confidence)
- **decisions**: list with context
- **action_items**: title, owner (explicit/inferred/unassigned), suggested_space (from ${linkedSpacesJson}), due_date, priority
- **open_items**: item_text, type (question/exploration/blocker/decision_point/future_consideration), confidence_score, transcript_excerpt
- **scripture_references**: citation, verse_text (null if uncertain), confidence (confirmed/unconfirmed)
- **key_topics**: deduplicated, no generic labels
- **data_issues**: if participants have 2+ spaces without "primary" field defined
- **detected_entities**: ONLY include if found (testimonies, pledges, teaching_sessions, announcements, attendance_metrics, recognition_segments, campaigns, strategic_initiatives, budget_discussions, q_and_a, other)

=== SPACE MAPPING ===
Base action_item.suggested_space on task CONTENT alone, not assignee's known spaces.
Examples: "coordinate media" → Media; "approve budget" → Admin; "prayer team" → PFCC.
Set space_confidence: "high" (clear), "low" (plausible), "ambiguous" (genuinely unclear).

=== DATE NORMALIZATION ===
Meeting date: ${meeting_date}
Convert "Friday", "next Tuesday", "in two weeks" to actual dates.
Keep vague refs ("before the event") as-is. Never guess — null is better than wrong.

=== DEDUPLICATION ===
One output item per distinct deliverable. Fold merged tasks into one. Omit declined tasks.

=== RETURN JSON SCHEMA ===
{
  "content_type": "meeting" | "raw_note" | "list_data" | "other",
  "confidence": 0.0-1.0,
  "summary": "string or null",
  "detailed_notes": "markdown or null",
  "decisions": [{ "decision": "string", "context": "string" }],
  "action_items": [{ "title": "string", "owner": "string|null", "owner_confidence": "explicit"|"inferred"|"unassigned", "suggested_space": "string|null", "space_confidence": "high"|"low"|"ambiguous", "due_date": "string|null", "priority": "high"|"medium"|"low" }],
  "open_items": [{ "item_text": "string", "item_type": "question"|"exploration"|"blocker"|"decision_point"|"future_consideration", "confidence_score": 0.0-1.0, "transcript_excerpt": "string", "notes": "string|null" }],
  "scripture_references": [{ "citation": "string", "verse_text": "string|null", "confidence": "confirmed"|"unconfirmed" }],
  "key_topics": ["string"],
  "chapters": [{ "title": "string", "start_marker": "string" }],
  "cleaned_transcript": "string|null",
  "data_issues": [{ "type": "string", "participant_name": "string", "spaces": ["string"], "action": "string" }],
  "detected_entities": { "<type>": { "detected": true, "count": number, "confidence": 0.0-1.0, "items": [], "ambiguities": [] } }${isFinalChunk ? ",\n  \"final_summary\": \"string — synthesis of all parts into one meeting overview (4-6 sentences)\"" : ""}
}

Meeting context: ${context || "None"}
Participants: ${participantsJson}
Linked spaces: ${linkedSpacesJson}${chunkNote}${finalSummaryNote}

Transcript:
${transcriptChunk}`;
}

function parseExtractionJSON(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch { /* fall through to default */ }
    }
    return {
      content_type: null,
      confidence: 0,
      data_issues: [],
      cleaned_transcript: null,
      chapters: [],
      summary: null,
      detailed_notes: null,
      scripture_references: [],
      decisions: [],
      action_items: [],
      open_items: [],
      key_topics: [],
      detected_entities: {},
    };
  }
}

async function extractChunk(prompt: string, anthropicKey: string) {
  const response = await fetchAnthropic({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 12288,
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

function dedupeTopics(topics: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of topics) {
    const key = (t || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t.trim());
  }
  return out;
}

function mergeScriptureRefs(refs: any[]): any[] {
  const map = new Map<string, any>();
  for (const r of refs) {
    if (!r?.citation) continue;
    const key = r.citation.trim();
    const existing = map.get(key);
    if (!existing) { map.set(key, r); continue; }
    const existingConfirmed = existing.confidence === "confirmed" && existing.verse_text;
    const rConfirmed = r.confidence === "confirmed" && r.verse_text;
    if (!existingConfirmed && rConfirmed) map.set(key, r);
  }
  return [...map.values()];
}

function mergeDetectedEntities(parts: any[]): any {
  const merged: any = {};
  for (const part of parts) {
    const entities = part.detected_entities ?? {};
    for (const [type, data] of Object.entries(entities) as [string, any][]) {
      if (!data?.detected) continue;
      if (!merged[type]) {
        merged[type] = { detected: true, count: 0, confidence: 0, items: [], ambiguities: [] };
      }
      merged[type].count += data.count ?? 0;
      merged[type].confidence = Math.max(merged[type].confidence, data.confidence ?? 0);
      merged[type].items.push(...(data.items ?? []));
      merged[type].ambiguities.push(...(data.ambiguities ?? []));
    }
  }
  return merged;
}

// This platform's Meetings module only ever records actual meetings/staff
// addresses, so "raw_note" (single-voice guidance/teaching with no formal
// meeting structure) still gets full extraction, same as "meeting" — only
// list_data/other/low-confidence content is genuinely gated. See STEP 2 of
// buildSystemPrompt for the extraction-side half of this rule.
function isExtractableType(contentType: string | null | undefined): boolean {
  return contentType === "meeting" || contentType === "raw_note";
}

// Merge per-chunk extraction results into one meeting-level result.
// The final chunk includes final_summary (synthesized by Claude in the final extraction call)
function mergeExtractions(parts: any[]): any {
  const nonNull = (v: any) => v !== null && v !== undefined && v !== "";
  const meetingParts = parts.filter((p) => isExtractableType(p.content_type) && (p.confidence ?? 0) >= 0.6);
  const isMeeting = meetingParts.length > 0;
  const finalPart = parts[parts.length - 1];

  return {
    content_type: isMeeting ? "meeting" : (parts[0]?.content_type ?? null),
    confidence: isMeeting
      ? Math.max(...meetingParts.map((p) => p.confidence ?? 0))
      : Math.max(0, ...parts.map((p) => p.confidence ?? 0)),
    summary: finalPart?.final_summary || parts.map((p) => p.summary).filter(nonNull)[0] || null,
    data_issues: parts.flatMap((p) => p.data_issues ?? []),
    cleaned_transcript: parts.map((p) => p.cleaned_transcript).filter(nonNull).join("\n\n") || null,
    chapters: parts.flatMap((p) => p.chapters ?? []),
    detailed_notes: parts.map((p) => p.detailed_notes).filter(nonNull).join("\n\n") || null,
    scripture_references: mergeScriptureRefs(parts.flatMap((p) => p.scripture_references ?? [])),
    decisions: parts.flatMap((p) => p.decisions ?? []),
    action_items: parts.flatMap((p) => p.action_items ?? []),
    open_items: parts.flatMap((p) => p.open_items ?? []),
    key_topics: dedupeTopics(parts.flatMap((p) => p.key_topics ?? [])),
    detected_entities: mergeDetectedEntities(parts),
  };
}


function applyContentGate(extracted: any) {
  if (!isExtractableType(extracted.content_type) || (extracted.confidence ?? 0) < 0.6) {
    extracted.detailed_notes = null;
    extracted.scripture_references = [];
    extracted.open_items = [];
    extracted.detected_entities = {};
  }
}

// Read-only access check under the CALLER's own RLS (not the service-role
// client) — confirms this caller can actually see the target meeting before
// we persist anything against it, so a guessed meetingId can't be used to
// overwrite another meeting's extraction state.
async function userCanAccessMeeting(authHeader: string, meetingId: string): Promise<boolean> {
  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data, error } = await userClient.from("meetings").select("id").eq("id", meetingId).maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}

// Persistence writes MUST go through the service-role `supabase` client
// (constructed below with SUPABASE_SERVICE_ROLE_KEY), never the short-lived
// caller client above. The enforce_meetings_summary_only_update trigger's
// extraction-column exemption is keyed on auth.uid() IS NULL, which is only
// true for a service-role JWT — a write through the caller's own client
// would resolve auth.uid() to the real (often non-editor) user and get
// silently rejected by the trigger's ordinary-viewer branch.
async function persistExtraction(supabase: ReturnType<typeof createClient>, meetingId: string | undefined, patch: Record<string, unknown>) {
  if (!meetingId) return;
  try {
    await supabase.from("meetings").update(patch).eq("id", meetingId);
  } catch (err) {
    console.warn("extract-meeting-data: failed to persist extraction:", err);
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

  // ── AUTH: Verify JWT, or accept an internal service-role/shared-secret call ─
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Background jobs (no end-user session to resolve via auth.getUser) present
  // the service-role key or the shared NOVA_JOBS_SECRET instead of a user JWT.
  // Ordinary browser callers never send either, so this never short-circuits
  // the normal per-user path below.
  const isServiceCall =
    (!!NOVA_JOBS_SECRET && authHeader.includes(NOVA_JOBS_SECRET)) ||
    (!!SUPABASE_SERVICE_ROLE_KEY && authHeader.includes(SUPABASE_SERVICE_ROLE_KEY));

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!isServiceCall) {
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.substring(7)
    );

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  let canPersist = false;
  let meetingId: string | undefined;
  try {
    const body = await req.json();
    const { transcript, context, stream: wantStream, linked_spaces = [], participants = [], meeting_date = new Date().toISOString() } = body;
    meetingId = body.meetingId;

    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "Missing transcript" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (meetingId) {
      canPersist = isServiceCall ? true : await userCanAccessMeeting(authHeader, meetingId);
      if (canPersist) {
        await persistExtraction(supabase, meetingId, {
          extraction_status: "processing",
          extraction_started_at: new Date().toISOString(),
          extraction_error: null,
        });
      }
    }

    // Step 1: Format participant data for validation
    const participantsJson = JSON.stringify(participants);
    const linkedSpacesJson = JSON.stringify(linked_spaces);

    // Long transcripts are split into sequential chunks rather than truncated —
    // each chunk is extracted independently, then merged into one result.
    const { chunks, truncated } = splitIntoChunks(transcript, MAX_TRANSCRIPT_CHARS, MAX_CHUNKS);

    const promptFor = (chunkText: string, chunkIndex: number) =>
      buildSystemPrompt({
        transcriptChunk: chunkText,
        chunkIndex,
        totalChunks: chunks.length,
        context: context || "",
        linkedSpacesJson,
        participantsJson,
        meeting_date,
      });

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    // ── STREAMING path (WIN 3) ────────────────────────────────────────────
    if (wantStream) {
      // Single chunk (the common case): proxy Claude's own token stream live,
      // exactly as before — no change in UX for normal-length meetings.
      if (chunks.length === 1) {
        const prompt = promptFor(chunks[0], 0);
        const upstreamResp = await fetchAnthropic({
          model: "claude-haiku-4-5-20251001",
          // 8192: detailed_notes is near-verbatim and is the dominant output-token
          // driver; 4096 truncated long meetings mid-JSON. See costLimits note.
          max_tokens: 12288,
          stream: true,
          messages: [{ role: "user", content: prompt }],
        }, anthropicKey, { "anthropic-beta": "messages-2023-12-15" });

        if (!upstreamResp.ok) {
          const err = await upstreamResp.json();
          throw new Error(`Claude API error: ${err.error?.message || upstreamResp.status}`);
        }

        const responseStream = new ReadableStream({
          async start(controller) {
            const reader = upstreamResp.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let accumulated = "";
            try {
              while (true) {
                // Bounded read: the initial connect fetch above already timed
                // out via AbortController, but that controller only guards
                // establishing the connection — a stream that connects fine
                // and then stalls mid-transfer (no more chunks, connection
                // never closes) needs its own guard, or this loop hangs
                // forever and the meeting's extraction_status never leaves
                // 'processing'.
                const { done, value } = await Promise.race([
                  reader.read(),
                  new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Stream stalled — no data for ${ANTHROPIC_TIMEOUT_MS}ms`)), ANTHROPIC_TIMEOUT_MS)
                  ),
                ]);
                if (done) break;
                const combined = buffer + decoder.decode(value);
                const lines = combined.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                  if (!line.startsWith("data: ")) continue;
                  const raw = line.slice(6).trim();
                  if (raw === "[DONE]") continue;
                  try {
                    const evt = JSON.parse(raw);
                    if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                      const text = evt.delta.text || "";
                      if (text) {
                        accumulated += text;
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
                new TextEncoder().encode(`data: ${JSON.stringify({ done: true, truncated })}\n\n`)
              );
              if (canPersist) {
                let parsed: any = null;
                try { parsed = JSON.parse(accumulated); } catch {
                  const m = accumulated.match(/```(?:json)?\s*([\s\S]*?)```/);
                  if (m) { try { parsed = JSON.parse(m[1]); } catch { /* fall through */ } }
                }
                if (parsed) {
                  applyContentGate(parsed);
                  await persistExtraction(supabase, meetingId, {
                    extraction_result: parsed, extraction_status: "complete",
                    extraction_completed_at: new Date().toISOString(), extraction_error: null,
                  });
                } else {
                  await persistExtraction(supabase, meetingId, {
                    extraction_status: "failed", extraction_error: "Could not parse streamed extraction result",
                  });
                }
              }
            } catch (err) {
              // Previously this only called controller.error(err) — the DB
              // row was never told the run failed, so a stalled/aborted
              // stream left extraction_status stuck at 'processing'
              // permanently (the exact "runs indefinitely" symptom).
              if (canPersist) {
                await persistExtraction(supabase, meetingId, {
                  extraction_status: "failed",
                  extraction_error: String((err as Error)?.message || err),
                });
              }
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

      // Multi-chunk (long meeting): extract each chunk in parallel, merge, then
      // deliver merged JSON as single SSE burst. Final chunk includes final_summary
      // synthesized by Claude, eliminating the separate synthesizeSummary call.
      const responseStream = new ReadableStream({
        async start(controller) {
          try {
            const parts = await Promise.all(chunks.map((c, i) => extractChunk(promptFor(c, i), anthropicKey)));
            const merged = mergeExtractions(parts);
            applyContentGate(merged);
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ text: JSON.stringify(merged) })}\n\n`)
            );
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ done: true, truncated })}\n\n`)
            );
            if (canPersist) {
              await persistExtraction(supabase, meetingId, {
                extraction_result: merged, extraction_status: "complete",
                extraction_completed_at: new Date().toISOString(), extraction_error: null,
              });
            }
          } catch (err) {
            if (canPersist) {
              await persistExtraction(supabase, meetingId, {
                extraction_status: "failed",
                extraction_error: String((err as Error)?.message || err),
              });
            }
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

    // ── NON-STREAMING path ───────────────────────────────────────────────────
    // Cache key is transcript only; context/participants changes should trigger re-extraction
    const transcriptHash = await hashTranscript(transcript);
    const cached = await getCachedExtraction(transcriptHash);
    if (cached) {
      const outputMode = isExtractableType(cached.content_type) && cached.confidence >= 0.6 ? "organized" : "full_transcript";
      if (canPersist) {
        await persistExtraction(supabase, meetingId, {
          extraction_result: cached, extraction_status: "complete",
          extraction_completed_at: new Date().toISOString(), extraction_error: null,
        });
      }
      return new Response(JSON.stringify({ success: true, extracted: cached, transcript, output_mode: outputMode, cached: true, truncated }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extracted;
    if (chunks.length === 1) {
      extracted = await extractChunk(promptFor(chunks[0], 0), anthropicKey);
    } else {
      const parts = await Promise.all(chunks.map((c, i) => extractChunk(promptFor(c, i), anthropicKey)));
      extracted = mergeExtractions(parts);
    }

    applyContentGate(extracted);

    await setCachedExtraction(transcriptHash, extracted);

    if (canPersist) {
      await persistExtraction(supabase, meetingId, {
        extraction_result: extracted, extraction_status: "complete",
        extraction_completed_at: new Date().toISOString(), extraction_error: null,
      });
    }

    const outputMode = isExtractableType(extracted.content_type) && extracted.confidence >= 0.6 ? "organized" : "full_transcript";

    return new Response(JSON.stringify({ success: true, extracted, transcript, output_mode: outputMode, cached: false, truncated }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-meeting-data error:", error);
    if (canPersist) {
      await persistExtraction(supabase, meetingId, {
        extraction_status: "failed", extraction_error: String(error?.message || error),
      });
    }
    return new Response(
      JSON.stringify({ error: error.message || "Extraction failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
