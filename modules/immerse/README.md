# Immerse — PDF E-Reader with AI Text-to-Speech

## Problem

The organization wanted to share educational materials and books with its members in a unified reading experience, but email attachments and shared folders scattered documents. More importantly, not everyone could sit down and read — field representatives needed to consume material while traveling or during downtime. The organization needed a reader that could render PDFs, track reading progress, and allow asynchronous consumption via audio playback without requiring members to use their own e-reader apps or subscriptions.

## Key Technical Decisions

**PDF.js for client-side rendering.** PDFs are parsed and rendered in the browser using PDF.js, not served as static files. This enables programmatic access to text content for highlighting and note extraction, as well as fine-grained caching at the page level. Users don't download the entire PDF upfront; pages stream on demand.

**AI text-to-speech with usage tracking.** The `immerse-tts` edge function accepts text segments (sentences, paragraphs, or full pages) and returns audio via OpenAI's TTS API. Audio is cached by segment hash so repeated playback doesn't re-request. A credit system tracks seconds of TTS consumed per user; admins can allocate budgets per department. This allows the organization to offer audio reading without unbounded API costs.

**Synchronized highlighting and playback.** As audio plays, the corresponding text is highlighted in real-time. The app segments text into sentences pre-computation; playback position is mapped back to character offsets in the document. This requires coordinating PDF text extraction with TTS output timing — solved by storing segment boundaries (`start_char`, `end_char`, `audio_duration`) in a lookup table per document.

**Margin notes and highlights as persistent data.** User annotations are stored in a separate `reader_highlights` table (not in the PDF itself), keyed by `user_id`, `document_id`, and text offset. This allows the same PDF to be annotated differently by different users without conflicts, and enables exporting annotations as a separate study guide.

## Schema Highlights

- `reader_documents`: `title`, `file_path`, `original_filename`, `shared_with_roles TEXT[]`, `created_by_user_id`
- `reader_segments`: `document_id`, `text`, `start_char`, `end_char`, `audio_url`, `duration_seconds` (pre-computed for all documents)
- `reader_highlights`: `user_id`, `document_id`, `start_char`, `end_char`, `text`, `highlight_color`, `note` (optional margin note)
- `reader_credits`: `user_id`, `seconds_allocated`, `seconds_consumed`, `month` (enforces monthly budgets)
- localStorage keys: `immerse-*` (reading progress, current page, playback speed, font size, line height preferences)

## Engineering Challenge: Audio Synchronization Across Variable Playback Speeds

TTS audio is generated at normal playback speed, but users can adjust speed (0.75x, 1x, 1.25x, 1.5x). Synchronizing highlighting with text as the audio plays at variable speed requires knowing the actual elapsed audio time, not just the TTS-generated duration.

The solution: store both the original TTS duration and the playback speed multiplier in the audio playback state. As the audio element's `currentTime` advances, calculate `adjusted_time = currentTime / playback_speed`. Use this adjusted time to query which segment should be highlighted. A small tolerance window (±100ms) accounts for browser timing variance. This works because the underlying audio file's timing is always consistent; only the perceived duration changes with speed.
