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
    ? `\n\nNOTE: This is part ${chunkIndex + 1} of ${totalChunks} from one continuous meeting recording, split only because of length. Extract only what appears in THIS portion — do not assume content from other parts. The parts will be merged programmatically after extraction, so do not reference "part ${chunkIndex + 1}" in your output.`
    : "";

  return `SYSTEM PROMPT — extract-meeting-data (v2.1, merged classification + space validation)

You are processing a transcript. First validate participant data, then classify content,
then extract accordingly.

=== DATA VALIDATION (before processing) ===
Validate participant data integrity:
- Any participant with 2+ spaces MUST have a "primary" field defined
- If a participant has 2+ spaces but primary is missing, null, or not in their
  spaces array, flag it as a data integrity issue

Add any validation failures to a "data_issues" array in your response.

When you encounter a task assigned to a person with a missing/invalid primary_space
during extraction:
- Set suggested_space: null
- Set space_confidence: "ambiguous"
- Do NOT try to guess their primary space or default to their first space
- Continue extraction normally — the downstream review process will handle manual
  intervention

=== STEP 1 — Classify Content Type ===
Determine content_type: "meeting" | "raw_note" | "list_data" | "other"
- "meeting" = multiple speakers in dialogue, OR single speaker narrating meeting-like
  content (updates, plans, assignments, decisions)
- "raw_note" = single-voice notes/journaling, no discussion structure, internal
  reflection
- "list_data" = structured data read aloud (e.g. birthday lists, roster reads,
  inventory reads) — NOT a meeting even if names and dates appear together
- "other" = anything else (scripture reading, song lyrics, random audio, stray
  recordings, etc.)

=== STEP 2 — Extract Based on Classification ===
- If content_type is NOT "meeting", OR confidence < 0.6:
    → Only return cleaned_transcript, chapters, and content_type fields.
    → Leave summary, decisions, action_items, key_topics, detailed_notes,
      scripture_references as empty/null.
    → This prevents forced meeting structure for non-meeting content.
- If content_type IS "meeting" with confidence >= 0.6:
    → Populate all fields including summary, decisions, action_items, key_topics,
      detailed_notes, and scripture_references.

=== DETAILED NOTES RULES (only apply if content_type = meeting, confidence >= 0.6) ===
- "detailed_notes" is the full-detail record layer — NOT a second summary.
  * "summary" stays a short compressed synthesis (unchanged behavior).
  * "detailed_notes" is a near-verbatim, cleaned-up account of the meeting in
    markdown: chronological, organized under topic headings (## Heading).
  * Remove filler, false starts, crosstalk, and repetition — but cut NOTHING
    substantive. Preserve every decision, number, name, commitment, and nuance.
  * Attribute statements to speakers where the transcript makes the speaker clear
    (e.g. "**Amber:** proposed moving the launch to Friday").
- Reference any scripture inline in the detailed_notes prose at the point it comes
  up (e.g. "opened with **John 3:16**"), AND list it in scripture_references.

=== SCRIPTURE RULES (only apply if content_type = meeting, confidence >= 0.6) ===
- Populate "verse_text" ONLY when you are certain of the exact wording. If there
  is ANY doubt, set verse_text to null and confidence to "unconfirmed".
- NEVER reconstruct or paraphrase scripture from memory to fill verse_text. An
  unconfirmed citation with null verse_text is REQUIRED over a fluent but
  possibly-wrong quote — this is treated as an official ministry record.
- "citation" is always required (Book Chapter:Verse). "confidence" is "confirmed"
  only when verse_text is exact; otherwise "unconfirmed".

=== SPACE SUGGESTION RULES (only apply if content_type = meeting) ===
- Only suggest spaces from the meeting's linked_spaces: ${linkedSpacesJson}
- Base suggested_space on TASK CONTENT ONLY:
  * "coordinate media team" → Media
  * "approve budget line" → Admin
  * "prayer team ushering" → PFCC
  → Do NOT default to the owner's known primary space just because it's convenient.
- Set space_confidence based on clarity of task content:
  * "high" = task content clearly and specifically points to one space
  * "low" = task is generic/could fit multiple spaces but one is plausible
  * "ambiguous" = genuinely unclear which space owns this, don't force a guess
- Participants and their space memberships (provided for context only):
  ${participantsJson}

=== RETURN SCHEMA ===
Return ONLY valid JSON (no markdown, no extra text):

{
  "content_type": "meeting" | "raw_note" | "list_data" | "other",
  "confidence": 0.0 to 1.0,
  "data_issues": [
    {
      "type": "missing_primary_space" | "invalid_primary_space" | "other",
      "participant_name": "string",
      "spaces": ["array of space names"],
      "action": "string — brief explanation"
    }
  ],
  "cleaned_transcript": "string with filler removed, or null if content_type != meeting",
  "chapters": [{ "title": "string", "start_marker": "string" }],
  "summary": "string or null",
  "detailed_notes": "markdown string (chronological, topic-headed, near-verbatim) or null if content_type != meeting",
  "scripture_references": [
    {
      "verse_text": "string or null — full verse text ONLY when certain of exact wording",
      "citation": "string — Book Chapter:Verse",
      "confidence": "confirmed" | "unconfirmed"
    }
  ],
  "decisions": [{ "decision": "string", "context": "string" }],
  "action_items": [
    {
      "title": "string",
      "owner": "string or null",
      "owner_confidence": "explicit" | "inferred" | "unassigned",
      "suggested_space": "string or null",
      "space_confidence": "high" | "low" | "ambiguous",
      "due_date": "string or null",
      "priority": "high" | "medium" | "low"
    }
  ],
  "open_items": [
    {
      "item_text": "string — clear, concise description of the open item",
      "item_type": "question" | "exploration" | "blocker" | "decision_point" | "future_consideration",
      "confidence_score": 0.0 to 1.0,
      "transcript_excerpt": "string — exact quote from transcript where item was mentioned",
      "notes": "string or null — optional context"
    }
  ],
  "key_topics": ["string"]
}

=== OPEN ITEMS EXTRACTION RULES (only apply if content_type = meeting, confidence >= 0.6) ===
Open items are discussion points, questions, or considerations that are NOT action items.

ACTION ITEM: Someone commits to DO something → goes in action_items
OPEN ITEM: Discussion, consideration, or question NOT explicitly assigned → goes in open_items

Types:
- "question": Unresolved question needing an answer
- "exploration": Future exploration idea, no commitment made
- "blocker": Blocked on external dependency or response
- "decision_point": Decision that needs further discussion
- "future_consideration": Vague future idea flagged for later

Rules:
1. Only extract items explicitly mentioned in the transcript
2. Ignore casual mentions ("we could," "maybe") unless part of clear decision discussion
3. Include questions that need answering
4. Include blockers/dependencies (waiting on someone external)
5. Include items flagged for future meetings ("discuss this in Friday's sync")
6. Do NOT extract action items — those go in action_items only
7. Confidence scores:
   - 0.85+: Clear open item (explicit question, named exploration, stated blocker)
   - 0.65-0.84: Likely open item (vague consideration with enough context)
   - Below 0.65: Very soft mention (probably not worth tracking)

=== ASSIGNMENT INFERENCE RULES ===
- owner_confidence = "explicit" when directly named ("Amber will build the form")
- owner_confidence = "inferred" when implied by acceptance ("Can you take that?" / "Yeah I got it")
- owner_confidence = "unassigned" when no owner can be determined

=== DEDUPLICATION RULES ===
- If task is mentioned then merged ("fold that into what you're already doing"), output ONE item
- If task is proposed then declined/ruled out, do NOT include it
- If same deliverable discussed multiple times, consolidate into single item

=== DATE NORMALIZATION ===
- Meeting date: ${meeting_date}
- Convert clear relative references ("by Friday", "next Tuesday", "in two weeks") to actual dates
- Keep vague references as-is ("before the event", "well before the day")
- Never guess a due date — null is better than a wrong date

Meeting context: ${context || "None"}${chunkNote}

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
      summary: text,
      detailed_notes: null,
      scripture_references: [],
      decisions: [],
      action_items: [],
      open_items: [],
      key_topics: [],
    };
  }
}

async function extractChunk(prompt: string, anthropicKey: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
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

// Merge per-chunk extraction results into one meeting-level result. `summary`
// is left off (callers should combine `summaries` via synthesizeSummary) since
// naively concatenating short summaries reads poorly.
function mergeExtractions(parts: any[]): any {
  const nonNull = (v: any) => v !== null && v !== undefined && v !== "";
  const meetingParts = parts.filter((p) => p.content_type === "meeting" && (p.confidence ?? 0) >= 0.6);
  const isMeeting = meetingParts.length > 0;

  return {
    content_type: isMeeting ? "meeting" : (parts[0]?.content_type ?? null),
    confidence: isMeeting
      ? Math.max(...meetingParts.map((p) => p.confidence ?? 0))
      : Math.max(0, ...parts.map((p) => p.confidence ?? 0)),
    data_issues: parts.flatMap((p) => p.data_issues ?? []),
    cleaned_transcript: parts.map((p) => p.cleaned_transcript).filter(nonNull).join("\n\n") || null,
    chapters: parts.flatMap((p) => p.chapters ?? []),
    summaries: parts.map((p) => p.summary).filter(nonNull),
    detailed_notes: parts.map((p) => p.detailed_notes).filter(nonNull).join("\n\n") || null,
    scripture_references: mergeScriptureRefs(parts.flatMap((p) => p.scripture_references ?? [])),
    decisions: parts.flatMap((p) => p.decisions ?? []),
    action_items: parts.flatMap((p) => p.action_items ?? []),
    open_items: parts.flatMap((p) => p.open_items ?? []),
    key_topics: dedupeTopics(parts.flatMap((p) => p.key_topics ?? [])),
  };
}

// Combine per-chunk summaries into one meeting-level summary. Cheap extra
// call — only fires for genuinely multi-chunk (long) meetings.
async function synthesizeSummary(summaries: string[], anthropicKey: string): Promise<string | null> {
  if (summaries.length === 0) return null;
  if (summaries.length === 1) return summaries[0];

  const prompt = `These are summaries of sequential parts of one continuous meeting. Combine them into a single short summary (2-4 sentences) of the whole meeting, in prose. Do not reference "part 1", "part 2", etc.\n\n${summaries.map((s, i) => `Part ${i + 1}: ${s}`).join("\n\n")}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) return summaries.join(" ");
    const result = await resp.json();
    return result.content?.[0]?.text?.trim() || summaries.join(" ");
  } catch {
    return summaries.join(" ");
  }
}

function applyContentGate(extracted: any) {
  if (extracted.content_type !== "meeting" || (extracted.confidence ?? 0) < 0.6) {
    extracted.detailed_notes = null;
    extracted.scripture_references = [];
    extracted.open_items = [];
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

  // ── AUTH: Verify JWT ──────────────────────────────────────────────────────
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

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.substring(7)
  );

  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    const body = await req.json();
    const { transcript, context, stream: wantStream, linked_spaces = [], participants = [], meeting_date = new Date().toISOString() } = body;

    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "Missing transcript" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        const upstreamResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "messages-2023-12-15",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            // 8192: detailed_notes is near-verbatim and is the dominant output-token
            // driver; 4096 truncated long meetings mid-JSON. See costLimits note.
            max_tokens: 8192,
            stream: true,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!upstreamResp.ok) {
          const err = await upstreamResp.json();
          throw new Error(`Claude API error: ${err.error?.message || upstreamResp.status}`);
        }

        const responseStream = new ReadableStream({
          async start(controller) {
            const reader = upstreamResp.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
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
            } catch (err) {
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
      // deliver the merged JSON as a single SSE burst using the same event
      // shape the client already parses (text deltas + done) — no client change needed.
      const responseStream = new ReadableStream({
        async start(controller) {
          try {
            const parts = await Promise.all(chunks.map((c, i) => extractChunk(promptFor(c, i), anthropicKey)));
            const merged = mergeExtractions(parts);
            merged.summary = await synthesizeSummary(merged.summaries, anthropicKey);
            delete merged.summaries;
            applyContentGate(merged);
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ text: JSON.stringify(merged) })}\n\n`)
            );
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ done: true, truncated })}\n\n`)
            );
          } catch (err) {
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

    // ── NON-STREAMING path (unchanged + context support) ──────────────────
    const transcriptHash = await hashTranscript(
      transcript + (context || "") + linkedSpacesJson + participantsJson + meeting_date
    );
    const cached = await getCachedExtraction(transcriptHash);
    if (cached) {
      const outputMode = cached.content_type === "meeting" && cached.confidence >= 0.6 ? "organized" : "full_transcript";
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
      extracted.summary = await synthesizeSummary(extracted.summaries, anthropicKey);
      delete extracted.summaries;
    }

    // Gate detailed_notes and scripture_references: only populate for qualified meetings
    applyContentGate(extracted);

    await setCachedExtraction(transcriptHash, extracted);

    const outputMode = extracted.content_type === "meeting" && extracted.confidence >= 0.6 ? "organized" : "full_transcript";

    return new Response(JSON.stringify({ success: true, extracted, transcript, output_mode: outputMode, cached: false, truncated }), {
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
