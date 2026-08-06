# Meetings — AI-Powered Meeting Intelligence

## Problem

Meeting minutes at the organization were inconsistent — structured notes existed for some meetings, nothing for most, and action items were scattered across email threads. The coordination cost was real: decisions made in meetings had to be re-communicated by memory or not at all. The organization needed a system that could capture meetings in real time, generate structured minutes automatically, and route action items to the right people without requiring anyone to transcribe or manually sort notes afterward.

## Key Technical Decisions

**Tiptap v3 as the minutes editor.** Minutes are stored as ProseMirror JSON (Tiptap's document format), not as flat HTML. This enables: reliable re-rendering across clients, programmatic block insertion (the AI extraction step injects structured content blocks into the document), and format-agnostic export (the same JSON can be serialized to Google Docs XML, Markdown, or print-ready HTML). Minutes created manually and minutes generated from AI extraction share the same document model.

**Hybrid transcription pipeline with three paths.** (1) Synchronous direct upload for short recordings processed inline. (2) Async Deepgram webhook for longer audio: the client receives a job ID immediately, then polls for completion while the Deepgram service processes and webhooks the result back via the `deepgram-webhook` edge function. (3) Browser-side WASM Whisper for offline or privacy-sensitive captures. All three paths produce a raw transcript that feeds the same AI extraction step.

**Anthropic Claude for structured extraction.** The `extract-meeting-data` edge function sends the transcript to Claude with a schema-defined output prompt. The response is validated and written to structured tables: attendees, key decisions, action items (each with an assignee and due date extracted from context). Action item assignees receive inbox notifications. Items can be bridged to the task system via `ActionItemBridge` without manually re-entering them.

**Google Drive integration for finalized minutes.** The `generate-meeting-doc` + `upload-document-to-drive` edge function pair converts finalized minutes to a formatted Google Doc and uploads it to a shared Drive folder. Meeting records store the Drive file ID for future reference.

## Schema Highlights

- `meetings`: `type` enum (General, Managers, Regional, Group, Team, 1:1, and others), `share_token` for public report links, `google_doc_id`
- `meeting_attendees`: expected vs. actual attendance — tracks who was expected and whether they showed
- `action_items`: `assignee_id`, `due_date`, `completed_at` — separate from tasks but linkable via `ActionItemBridge`
- Attendance import from CSV (exported from the organization's previous attendance tracking system) via an attendance parser

## Engineering Challenge: Real-Time Status During Long AI Operations

Audio upload, transcription, and AI extraction can each take 15–60 seconds. A silent spinner for that duration causes users to assume the process failed and retry — creating duplicate submissions and wasted compute.

The solution: the edge function emits Server-Sent Events (SSE) as each stage completes (`uploading → transcribing → extracting → done`). The `AudioTranscriptionPanel` component opens an `EventSource` connection to the function URL and updates the UI step-by-step. Implementing this in Deno required using `TransformStream` and `ReadableStream` with manual flushing — the Deno runtime buffers responses by default and had to be explicitly told to stream. The result is a processing UI that shows which stage is running, how long it has taken, and a preview of the raw transcript before AI extraction begins.
