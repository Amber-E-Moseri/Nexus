# Meeting Processing End-to-End Test

## Overview

The meeting processing pipeline handles the complete lifecycle from transcript input through AI extraction and task creation. This document describes the end-to-end test (`src/tests/meetingProcessing.e2e.test.js`) that validates this flow.

## Test Architecture

### Key Components Tested

1. **Transcript Input** — Pasting transcripts and creating `meeting_transcriptions` records
2. **Edge Function Integration** — Calling the `extract-meeting-data` edge function
3. **AI Extraction** — Structured extraction of action items, decisions, and key topics
4. **Task Creation** — Converting extracted action items into `tasks` table records
5. **Real-time Subscriptions** — Database changes via Postgres changefeeds
6. **Multi-audio Support** — Sequencing and concatenating multiple transcript segments
7. **Status Tracking** — Monitoring `extraction_status` field progression

---

## Test Cases

### Test 1: Paste Transcript and Create Meeting Transcriptions Record

**Purpose:** Verify the basic transcript capture flow.

**Steps:**
1. Create a test meeting via `meetings` table insert
2. Add a pasted transcript as a `meeting_transcriptions` row
3. Update `meetings.summary` with the full transcript
4. Verify the transcription record has correct fields:
   - `input_type = 'text'` (not audio)
   - `status = 'complete'`
   - `full_transcript` contains the raw text
   - `sequence_number = 1` for first segment

**Expected Result:** Meeting created with linked transcription, ready for extraction.

---

### Test 2: Call Extract-Meeting-Data Edge Function

**Purpose:** Verify the edge function endpoint is available and callable.

**Notes:**
- This test validates the edge function infrastructure exists
- Actual function calls are commented out to avoid rate limiting and cost in CI
- In production, the edge function is called from `AudioTranscriptionPanel` with:
  ```javascript
  await fetch(`${supabaseUrl}/functions/v1/extract-meeting-data`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      meeting_id: meetingId,
      transcript: summary,
      context: meetingContext,
      spaces: [departmentId],
      participants: attendeeNames
    })
  })
  ```

**Edge Function Behavior:**
- Sets `extraction_status = 'processing'` immediately (persists to DB for real-time subscription)
- Chunks transcript if > 60,000 characters (max 6 chunks)
- Calls Claude Haiku for each chunk (streaming SSE response)
- Merges chunk results with dedup and synthesis
- Caches result in Upstash Redis (30-day TTL)
- Stores final result in `meetings.extraction_result` (JSONB)
- Sets `extraction_status = 'complete'` or `'failed'`

---

### Test 3: Extract Action Items Structure from Transcript

**Purpose:** Validate the parsing logic for action items.

**Sample Transcript Patterns:**
```
"Sarah will lead the architecture by September 30"
"David: API endpoints ready by August 20"
"Alex will submit vendor quotes for review by Thursday"
```

**Extracted Items:**
- Assignee name (Sarah, David, Alex)
- Task description
- Due date (if mentioned)
- Optional confidence score (AI-provided, 0-1 scale)

**Expected Result:** Array of action items with assignee, task, and due date fields.

---

### Test 4: Update Meeting Extraction Status

**Purpose:** Verify the extraction result is stored in the database.

**Fields Updated:**
- `extraction_status = 'complete'`
- `extraction_result` — JSONB containing:
  ```json
  {
    "summary": "Meeting summary text",
    "action_items": [
      {
        "text": "Task description",
        "assigned_to": "Person name",
        "due_date": "2026-09-30",
        "confidence": 0.95
      }
    ],
    "decisions": [
      "Decision text"
    ],
    "key_topics": [
      "Topic 1",
      "Topic 2"
    ]
  }
  ```
- `extraction_completed_at` — ISO timestamp

**Expected Result:** Meeting row reflects completed extraction with rich structured data.

---

### Test 5: Multi-Audio Support — Sequential Transcriptions

**Purpose:** Verify support for multiple audio files in a single meeting.

**Setup:**
- First segment: initial meeting transcript (sequence_number=1)
- Second segment: continuation of discussion (sequence_number=2)

**Database Records:**
```
meeting_transcriptions[1]:
  - sequence_number: 1
  - summary: "Q3 planning discussion..."
  - full_transcript: [first segment]

meeting_transcriptions[2]:
  - sequence_number: 2
  - summary: "Testing strategy and infrastructure..."
  - full_transcript: [second segment]
```

**Expected Result:** Both segments linked to same meeting with sequential ordering preserved.

---

### Test 6: Concatenate Multi-Audio Transcripts

**Purpose:** Verify transcripts are properly concatenated for extraction.

**Logic:**
1. Fetch all `meeting_transcriptions` for the meeting, ordered by `sequence_number`
2. Join `full_transcript` fields with separator: `\n\n--- Additional Audio Segment ---\n\n`
3. Pass concatenated text to extraction edge function

**Expected Result:**
```
Full text: 
"Good morning... [segment 1] 
--- Additional Audio Segment ---
Continuing... [segment 2]"
```

The concatenated text preserves both segments in order for AI extraction.

---

### Test 7: Real-time Extraction Status Subscription

**Purpose:** Verify clients can subscribe to extraction progress via Postgres changefeeds.

**Subscription Setup (client-side):**
```javascript
supabase
  .from('meetings')
  .on('*', payload => {
    if (payload.new.extraction_status === 'complete') {
      // Update UI with extracted data
      setExtractedData(payload.new.extraction_result)
    }
  })
  .subscribe()
```

**Database Configuration:**
- `meetings` table is in `supabase_realtime` publication
- `extraction_status` and `extraction_result` changes trigger events
- Clients see status progression: `idle` → `processing` → `complete`

**Expected Result:** Real-time updates allow UI to show extraction progress without polling.

---

## Running the Test

### Local Development

With Supabase service role key configured:
```bash
SUPABASE_SERVICE_ROLE_KEY=your-key npm test -- meetingProcessing
```

### CI/CD Pipeline

The test is designed to:
- Skip gracefully if `SUPABASE_SERVICE_ROLE_KEY` is not set
- Avoid hitting rate limits (commented-out actual edge function calls)
- Clean up test data via CASCADE deletes

### Output Example

```
✓ should paste transcript and create meeting_transcriptions record
✓ should call extract-meeting-data edge function
✓ should extract action items structure from transcript
✓ should update meeting extraction_status
✓ should create tasks from action items
✓ should handle multi-audio concatenation
✓ should concatenate multi-audio transcripts for extraction
✓ should verify real-time extraction status subscription
✓ cleanup: delete test meeting and related records
```

---

## Integration Points

### Frontend (AudioTranscriptionPanel.jsx)

1. **Paste transcript mode:**
   - User pastes text from Zoom/Teams transcript
   - Component calls `handleTranscribe()` → `appendSegmentToMeeting()`
   - Creates `meeting_transcriptions` row with `input_type='text'`
   - Updates `meetings.summary` with concatenated transcripts

2. **Streaming extraction:**
   - Calls `streamExtractMeetingData(transcript)`
   - Opens SSE connection to `/functions/v1/extract-meeting-data`
   - Processes tokens in real-time, updating UI
   - On completion: `applyExtractedResult()` pre-selects high-confidence items

3. **Action item confirmation:**
   - Shows extracted action items with checkboxes
   - User selects items and assignees
   - On confirm: calls `createTasksFromActionItems()`

### Backend (Supabase)

1. **Edge Functions:**
   - `extract-meeting-data` — Claude-based extraction with streaming
   - `notify-action-item-assignees` — Queue notifications for assignees
   - `generate-meeting-doc` — Export meeting to Google Drive

2. **Database Triggers:**
   - `trig_sync_meeting_notes_text` — Keeps `notes_text` in sync with `notes_blocks`
   - Automatic `extraction_status` update on completion

3. **RLS Policies:**
   - Only meeting editors can update `extraction_result`
   - Cross-dept meetings visible via `meeting_spaces` junction table

---

## Error Handling

### Transcript Too Long

- Chunks transcript at 60,000 chars (paragraph boundaries)
- Max 6 chunks to stay within Claude token limits
- Merges chunk results with dedup

### No Speech Detected

- Deepgram returns empty transcript
- Edge function catches and returns appropriate error
- UI shows "No speech detected" message

### API Rate Limiting

- Redis-backed daily limit: 10 transcriptions/user, $1.50/day spend limit
- Edge function returns `{ error: 'Daily limit exceeded' }`
- UI shows "You've reached today's transcription limit"

### Extraction Timeout

- Client-side stale-run detection: > 8 minutes processing
- `useExtractionStatus` hook treats as `'failed'` without DB write
- User can retry or proceed without extraction

---

## Performance Characteristics

### Database Operations

- `meeting_transcriptions` insert: ~5ms
- `meetings` update (summary + extraction_result): ~10ms
- Multi-segment concatenation: ~1ms per segment
- Real-time subscription: < 100ms latency

### Edge Function

- Small transcript (< 10K chars): ~2s (Deepgram) + ~5s (Claude)
- Large transcript (> 100K chars, chunked): ~15s total
- Streaming SSE: tokens arrive incrementally (10-20ms per token)

### Storage

- `meeting-audio` bucket: audio files (private namespace)
- `extraction_result` JSONB: typical size 2-5KB per meeting
- Upstash Redis cache: 30-day retention, ~100 bytes per cache entry

---

## Future Enhancements

1. **Async Extraction Queue** — For meetings > 200KB
2. **Extraction Feedback** — User corrections stored for future model fine-tuning
3. **Multi-language Support** — Claude extraction already multilingual
4. **Custom Extraction Templates** — Department-specific extraction prompts
5. **Extraction Analytics** — Track accuracy, latency, cost per department

---

## Related Documentation

- **[Meeting Architecture](./meetings.md)** — Database schema and RLS policies
- **[Edge Functions](./edge-functions.md)** — Extraction and integration details
- **[Real-time Subscriptions](./realtime.md)** — Postgres changefeeds setup
- **[Action Items](./action-items.md)** — Task creation from meetings
