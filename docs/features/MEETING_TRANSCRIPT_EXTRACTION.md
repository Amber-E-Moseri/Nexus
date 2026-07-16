# AI Meeting Transcript Extraction

Covers `extract-meeting-data`, the edge function that turns a raw meeting
transcript (audio-transcribed or pasted) into structured data: summary,
decisions, action items, detailed notes, and scripture references. This is a
separate subsystem from the agenda/minutes workflow described in
[NEXUS_MEETINGS_IMPLEMENTATION.md](NEXUS_MEETINGS_IMPLEMENTATION.md) — it
powers the "AI Extract" step after a transcript is captured.

## Overview

```
AudioTranscriptionPanel.jsx
  └─ record / upload / paste → transcript text
       └─ streamExtractMeetingData(transcript)
            └─ POST /functions/v1/extract-meeting-data  (stream: true)
                 └─ chunk transcript → extract per chunk → merge → gate
                      └─ SSE: { text } deltas … { done, truncated }
       └─ applyExtractedResult() → setExtractedData()
            └─ TranscriptCard renders summary / decisions / action items / notes
```

Client: [src/features/meetings/components/AudioTranscriptionPanel.jsx](../../src/features/meetings/components/AudioTranscriptionPanel.jsx)
Server: [supabase/functions/extract-meeting-data/index.ts](../../supabase/functions/extract-meeting-data/index.ts)

## The long-meeting problem

Claude extraction runs on `claude-haiku-4-5-20251001` with `max_tokens: 8192`.
The 8192 output ceiling — not the model's 200k-token input context — is the
real constraint: `detailed_notes` is a near-verbatim account of the meeting,
so it's the dominant driver of output length. A single call over a very long
transcript risks the JSON getting cut off mid-object.

The original fix was a hard input cap: transcripts over `MAX_TRANSCRIPT_CHARS`
(60,000 chars, ~15k tokens) were silently truncated before being sent to
Claude, and the UI showed a "this meeting was long" warning. A 2-hour meeting
(~78k transcript chars at typical speaking pace) would lose the back half of
its content to this cutoff.

## Chunk + merge

Long transcripts are now split into sequential chunks and extracted in
parallel, then merged into one result — instead of truncating.

**`splitIntoChunks(text, maxChars, maxChunks)`**
- If the transcript fits in one `MAX_TRANSCRIPT_CHARS` chunk, returns it as-is
  — this is the common case and is untouched by any of the logic below.
- Otherwise splits at the nearest paragraph/newline/sentence boundary before
  each `maxChars` cutoff (never mid-word).
- `MAX_CHUNKS` (default 6, ≈360k chars / ~9 hours of speech) is a safety
  ceiling. Only transcripts longer than that still get `truncated: true` and
  show the UI warning — normal meetings, including multi-hour ones, no longer
  hit it.

**Per chunk:** each chunk gets the full extraction prompt (classification,
scripture rules, space-suggestion rules, etc. — see `buildSystemPrompt` in the
edge function) plus a note when `totalChunks > 1` telling the model it's
seeing one part of a longer recording and shouldn't assume context from parts
it hasn't seen. Chunks are extracted **in parallel** via `Promise.all`.

**`mergeExtractions(parts)`** combines the per-chunk results:
| Field | Merge rule |
|---|---|
| `content_type` / `confidence` | "meeting" if any chunk qualified (confidence ≥ 0.6); confidence = max across qualifying chunks |
| `decisions`, `action_items`, `chapters`, `data_issues` | concatenated |
| `key_topics` | concatenated, de-duped case-insensitively |
| `scripture_references` | concatenated, de-duped by citation (a `confirmed` match wins over an `unconfirmed` one for the same citation) |
| `detailed_notes`, `cleaned_transcript` | joined with blank-line separators |
| `summary` | **not** naively concatenated — see below |

**`synthesizeSummary(summaries)`** — concatenating three chunk summaries reads
like disjointed fragments, so for multi-chunk meetings only, one extra small
Claude call combines the per-chunk summaries into a single 2–4 sentence
summary of the whole meeting. Skipped entirely for single-chunk meetings.

**`applyContentGate(extracted)`** — runs once on the final (merged or
single-chunk) result: if it doesn't qualify as a meeting at ≥0.6 confidence,
`detailed_notes` and `scripture_references` are nulled out. Same gate as
before, just applied after merge instead of per-call.

## Streaming behavior

The client only understands one SSE shape: `{ text }` deltas followed by
`{ done, truncated }`. Both paths emit exactly that, so **no frontend changes
were needed**:

- **Single chunk (typical meeting):** unchanged — Claude's own token stream is
  proxied live to the client, so the UI still shows progressive extraction.
- **Multi-chunk (long meeting):** all chunk calls + merge + summary synthesis
  happen server-side first, then the final merged JSON is emitted as one
  `text` event immediately followed by `done`. The UI shows the "Extracting…"
  spinner for longer (parallel Claude calls + one synthesis call), then the
  full result appears at once rather than streaming in token-by-token.

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `MAX_TRANSCRIPT_CHARS` | `60000` | Max chars sent to Claude per chunk |
| `MAX_TRANSCRIPT_CHUNKS` | `6` | Max chunks before falling back to `truncated: true` |

Both are read via `Deno.env.get(...)` in the edge function; override via
Supabase project secrets if needed.

## Known limitations

- **Action item dedup is per-chunk, not cross-chunk.** The prompt's
  deduplication rules ("fold into existing item", "consolidate repeated
  discussion") only see one chunk at a time, so if the same task is discussed
  in two different chunks it may appear twice in the merged result. Low risk
  in practice (chunk boundaries fall ~30-45 min apart), but reviewers should
  scan for near-duplicate action items on very long meetings.
- **Multi-chunk extraction costs more:** N parallel Claude calls instead of
  1, plus one small summary-synthesis call. Only triggers above ~60k
  transcript chars (~2 hours of speech), so typical meetings are unaffected.
- Redis caching (when configured) keys on a hash of the *whole* transcript,
  so a cache hit still returns the correctly merged result — chunking is
  invisible to the cache layer.

## Related Documentation

- [Nexus Meetings Implementation](NEXUS_MEETINGS_IMPLEMENTATION.md) — agenda/minutes/calendar-sync module this feature sits alongside
