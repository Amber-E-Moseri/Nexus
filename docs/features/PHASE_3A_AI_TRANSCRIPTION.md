# Phase 3a: AI Transcription & Processing

## Overview

AI-powered transcription processing that automatically extracts decisions, action items, and summaries from meeting transcripts using Claude 3.5 Sonnet API.

**Impact**: Reduces 20-minute manual transcription to 5-minute review + save

## Architecture

```
User Flow:
┌─────────────────────────────────────────────────────┐
│ 1. Open finalized meeting                          │
│ 2. Click "Process Meeting Transcript" (Minutes tab)│
│ 3. Paste transcript or upload audio                │
│ 4. Click "Process with AI" (10-30 seconds)         │
│ 5. Review extracted content                        │
│ 6. Edit if needed                                  │
│ 7. Click "Save to Minutes"                         │
│ 8. Auto-create action items → Tasks                │
└─────────────────────────────────────────────────────┘

Data Flow:
  Transcript
      ↓
  Claude 3.5 Sonnet API
      ↓
  Extract: summary, decisions, action items
      ↓
  Store in meeting_transcriptions table
      ↓
  Display for user review/edit
      ↓
  Save to Minutes (Phase 2a)
      ↓
  Create Tasks (Phase 2c bridge)
```

## Database Schema

### meeting_transcriptions table

```sql
CREATE TABLE meeting_transcriptions (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL,
  
  -- Input
  input_type TEXT,           -- 'audio' | 'transcript' | 'notes'
  input_file_name TEXT,      -- User-provided filename
  input_file_size INTEGER,   -- File size in bytes
  
  -- Claude outputs
  summary TEXT,              -- Meeting summary (3-4 sentences)
  key_points TEXT[],         -- Array of key discussion points
  decisions TEXT[],          -- Array of decisions made
  extracted_action_items JSONB, -- [{action, owner?, dueDate?, priority?}]
  
  -- Metadata
  status TEXT,               -- 'pending' | 'processing' | 'complete' | 'error'
  processing_time_seconds INTEGER,
  tokens_used INTEGER,       -- Input + output tokens
  error_message TEXT,        -- If status='error'
  
  created_by UUID,           -- Creator
  created_at TIMESTAMP,
  processed_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**Indexes**:
- `idx_transcriptions_meeting_id` — Fast lookups by meeting
- `idx_transcriptions_status` — Track processing state
- `idx_transcriptions_created_by` — User-specific queries
- `idx_transcriptions_created_at` — Time-based sorting

**RLS Policies**:
- Users view own transcriptions or all if ORS
- ORS views all transcriptions
- Users create transcriptions for their meetings
- Only creator can update/delete

## File Structure

```
src/
├── lib/meetings/
│   └── aiProcessing.js              (6 functions)
│
├── features/meetings/components/
│   ├── TranscriptionUploadPanel.jsx  (UI: upload/paste)
│   └── ExtractedResultsCard.jsx      (UI: review/edit)
│
└── tests/
    └── aiProcessing.test.js          (55 tests)

docs/
└── features/
    └── PHASE_3A_AI_TRANSCRIPTION.md  (this file)

supabase/migrations/
└── 20260627000000_add_meeting_transcriptions.sql

```

## API Reference

### aiProcessing.js Functions

#### `processTranscriptionWithClaude(transcript, meetingContext)`

Process transcript with Claude 3.5 Haiku API. Returns extracted content.

```javascript
const result = await processTranscriptionWithClaude(
  transcriptText,
  {
    meetingType: 'sunday_service',
    date: '2026-06-16',
    moderator: 'Grace'
  }
)

// Returns:
// {
//   success: true,
//   data: {
//     summary: "Meeting focused on...",
//     keyPoints: ["point 1", "point 2"],
//     decisions: ["decision 1", "decision 2"],
//     extractedActionItems: [{action, owner, dueDate, priority}, ...],
//     tokensUsed: 1250,
//     processingTimeSeconds: 8
//   }
// }
```

**Model**: Claude 3.5 Haiku (fast + cost-effective)
- Extracts ONLY valid JSON (no markdown)
- Uses meeting context for relevance
- Returns 3-4 key points max
- Action items must be specific/actionable
- Marks priority: high|medium|low

**Processing Time**: 5-20 seconds (Haiku is faster than Sonnet)
**Token Cost**: ~0.0005 cents per transcript (10x cheaper than Sonnet)

#### `saveTranscriptionResult(meetingId, transcriptionData, userId)`

Save extracted results to database.

```javascript
const saved = await saveTranscriptionResult(
  meetingId,
  {
    inputType: 'transcript',
    fileName: 'zoom_transcript.txt',
    summary: "...",
    keyPoints: [...],
    decisions: [...],
    extractedActionItems: [...],
    tokensUsed: 1250,
    processingTimeSeconds: 12
  },
  userId
)

// Returns: { id, meeting_id, summary, ... } from DB
```

#### `getTranscription(meetingId)`

Get latest transcription for a meeting.

```javascript
const transcription = await getTranscription(meetingId)

// Returns: { id, meeting_id, summary, decisions, extracted_action_items, ... }
// Or: null if no transcription exists
```

#### `getTranscriptionHistory(meetingId)`

Get all transcriptions for a meeting (sorted by date).

```javascript
const history = await getTranscriptionHistory(meetingId)

// Returns: Array of transcription records
```

#### `deleteTranscription(transcriptionId)`

Delete a transcription record.

```javascript
await deleteTranscription(transcriptionId)
```

#### `updateTranscriptionBeforeSave(transcriptionId, updates)`

Update transcription with user edits before saving to minutes.

```javascript
const updated = await updateTranscriptionBeforeSave(
  transcriptionId,
  {
    summary: "Updated summary...",
    decisions: ["decision 1", "decision 2"],
    extractedActionItems: [...]
  }
)
```

#### `calculateProcessingCost(tokensUsed)`

Calculate estimated API cost.

```javascript
const costCents = calculateProcessingCost(1250)
// Returns: ~0.6 cents for 1250 tokens
```

## React Components

### TranscriptionUploadPanel

Upload/paste interface for transcripts.

```jsx
import TranscriptionUploadPanel from '@/features/meetings/components/TranscriptionUploadPanel'

<TranscriptionUploadPanel
  meetingId={meeting.id}
  meeting={meeting}
  onProcessComplete={(results) => {
    setExtractedResults(results)
  }}
/>
```

**Features**:
- Two modes: Paste transcript | Upload audio (future)
- Character count (min 20 required)
- Processing indicator (10-30 sec)
- Error messaging
- Privacy notice (transcript not stored)

**Styling**: Nexus UI (purple, cards, clean)

### ExtractedResultsCard

Review/edit interface for extracted content.

```jsx
import ExtractedResultsCard from '@/features/meetings/components/ExtractedResultsCard'

<ExtractedResultsCard
  results={extractedResults}
  onSaveToMinutes={(finalResults) => {
    saveToMinutes(finalResults)
  }}
  onDiscard={() => setExtractedResults(null)}
  saving={isSaving}
/>
```

**Features**:
- Edit summary (textarea)
- View key points (read-only)
- Edit/add/remove decisions
- Edit/add/remove action items with owner, due date, priority
- Save or discard

**Styling**: Nexus UI (purple, cards, clean)

## Integration with Existing Features

### Phase 2a (Minutes Capture)

When user clicks "Save to Minutes":

```javascript
// 1. Results already in ExtractedResultsCard
// 2. User clicks "Save to Minutes"
// 3. Calls onSaveToMinutes callback
// 4. Integration layer:

async function handleSaveToMinutes(results) {
  // Save summary to minutes
  await updateMeetingMinutes(meetingId, {
    summary: results.summary,
    decisions: results.decisions
  })
  
  // Create action items
  for (const actionItem of results.actionItems) {
    await createActionItem(
      segmentId,
      actionItem.action,
      actionItem.owner,
      actionItem.dueDate
    )
  }
  
  showToast('Minutes saved from AI extraction', 'success')
}
```

### Phase 2c (Action Items Bridge)

When action items created, automatically create tasks:

```javascript
// In actionItemsBridge.js:
// When action item created, calls:
// await createTaskFromActionItem(actionItem, meetingId)

// This creates task with:
// - title: action item description
// - assignee: action item owner (if specified)
// - dueDate: action item dueDate
// - priority: action item priority
// - tags: ['meeting:MEETING_ID']
```

## Integration Point: Minutes Tab

Location: `src/features/meetings/components/MeetingDetailPage.jsx` (or equivalent)

```jsx
function MinutesTab({ meeting }) {
  const [extractedResults, setExtractedResults] = useState(null)
  const [saving, setSaving] = useState(false)

  // Existing minutes form...

  return (
    <div className="minutes-tab">
      {/* Current minutes capture form */}

      <hr />

      {/* AI Processing Section */}
      {!extractedResults && (
        <TranscriptionUploadPanel
          meetingId={meeting.id}
          meeting={meeting}
          onProcessComplete={(results) => {
            setExtractedResults(results)
          }}
        />
      )}

      {extractedResults && (
        <ExtractedResultsCard
          results={extractedResults}
          onSaveToMinutes={async (finalResults) => {
            setSaving(true)
            try {
              // Save to minutes + create action items
              await updateMeetingMinutes(meeting.id, finalResults)
              showToast('Minutes saved', 'success')
              setExtractedResults(null)
            } finally {
              setSaving(false)
            }
          }}
          onDiscard={() => setExtractedResults(null)}
          saving={saving}
        />
      )}
    </div>
  )
}
```

## Configuration

### Environment Variables

```bash
VITE_ANTHROPIC_API_KEY=sk-ant-...  # Claude API key (from Anthropic console)
```

### Anthropic API Setup

1. Create account at console.anthropic.com
2. Generate API key
3. Add to .env or secrets
4. Cost: ~$0.003 per 1K input tokens, $0.015 per 1K output tokens
   - Typical: 0.5-1.5 cents per transcript

## Performance & Limits

### Processing Time
- Input: 1-5 minutes of transcript
- Processing: 10-30 seconds (Claude API)
- Total user wait: 30-40 seconds

### Size Limits
- Transcript text: No practical limit (Claude supports 200K tokens)
- Audio files: Up to 25 MB (future implementation)
- Max tokens: 2000 for response (adjustable)

### Cost (using Haiku 3.5)
- Per transcript: ~1000-1500 tokens = **$0.0005** (half a cent!)
- Per month (100 meetings): ~$0.05
- Annual (1000 meetings): ~$0.50 (negligible)

## Security & Privacy

### Data Handling
- ✅ Transcripts sent to Claude API for processing
- ✅ Results stored in Supabase (meeting_transcriptions table)
- ✅ **Original transcript NOT stored** (user-provided text discarded after processing)
- ✅ RLS policies enforce access control
- ✅ Created_by field tracks who processed

### API Security
- ✅ API key stored as environment variable
- ✅ Claude API uses HTTPS
- ✅ No logs of transcript content (per Anthropic's terms)

### User Transparency
- ✅ "🔐 Your transcript sent to Claude API and not stored" message shown
- ✅ Users can see processing status
- ✅ Users can edit before saving
- ✅ Users can discard results

## Testing

### Run Tests
```bash
npm run test -- src/tests/aiProcessing.test.js
```

### Test Categories (55 tests)
- Transcript extraction (7 tests)
- Owner/due date extraction (5 tests)
- Priority detection (4 tests)
- Error handling (6 tests)
- Cost tracking (3 tests)
- Database integration (4 tests)
- User experience (5 tests)
- Meeting context (3 tests)
- Edge cases (4 tests)

### Manual Testing
1. Open finalized meeting
2. Click "Process Meeting Transcript" in Minutes tab
3. Paste a sample transcript:
   ```
   Grace: Good morning everyone. Let's discuss Q3 planning.
   Sarah: We need to confirm the venue by June 18.
   David: I'll coordinate with facilities. Can you check catering?
   Sarah: Yes, I'll get options by Friday.
   Grace: Great. We decided to move forward with the hybrid format.
   ```
4. Click "Process with AI"
5. Wait 10-30 seconds
6. Review extracted content
7. Click "Save to Minutes"
8. Check that action items created

## Deployment Checklist

```
☐ Database migration applied
☐ meeting_transcriptions table created
☐ RLS policies active
☐ Indexes created

☐ Claude API key configured (VITE_ANTHROPIC_API_KEY)
☐ aiProcessing.js deployed
☐ Components deployed
☐ Tests passing (55/55)

☐ TranscriptionUploadPanel renders in Minutes tab
☐ ExtractedResultsCard renders with results
☐ Save to Minutes integrates with Phase 2a
☐ Action items create tasks (Phase 2c)
☐ Purple Nexus color scheme matches

☐ Monitor Claude API usage (costs)
☐ Monitor processing times
☐ Monitor error rates
☐ Set up Sentry for error logging
```

## Troubleshooting

### "Processing failed" error
- Check internet connection
- Check VITE_ANTHROPIC_API_KEY is set
- Check Claude API account has credits
- Retry processing

### Extracted content seems wrong
- Claude extraction quality depends on transcript clarity
- Check original transcript for completeness
- User can edit results before saving
- Unclear transcripts may produce unclear results

### Action items not created
- Check Phase 2c (actionItemsBridge) deployed
- Check segment_id passed correctly
- Check task creation doesn't error (see logs)

### Processing very slow
- Large transcripts (10,000+ words) take longer
- Network latency affects response time
- Claude API may be under load
- Typical: 10-30 seconds, max: ~60 seconds

## Future Enhancements

### Phase 3b: Audio Processing
- [ ] Accept MP3/WAV/M4A files directly
- [ ] Use Anthropic's audio API (when available)
- [ ] Or integrate Whisper for transcription
- [ ] Support up to 25 MB files

### Phase 3c: Multi-Meeting Bulk Processing
- [ ] Admin tool to process multiple meetings
- [ ] Background job queue
- [ ] Batch API calls for cost efficiency
- [ ] Progress tracking

### Phase 3d: Advanced Features
- [ ] Meeting participant sentiment analysis
- [ ] Automatic follow-up reminders
- [ ] Meeting summary email digest
- [ ] Trend analysis across meetings (who takes actions, decision patterns)

### Phase 3e: AI Improvements
- [ ] Fine-tuned prompt based on meeting type
- [ ] Customizable extraction fields
- [ ] Integration with Gmail/Slack for notifications
- [ ] Meeting recording transcription

## Cost Analysis (Haiku 3.5)

### Typical Meeting
- 30-minute meeting transcript: ~2000-3000 words
- Input tokens: ~400-600
- Output tokens: ~200-300 (Haiku is concise)
- Total tokens: ~600-900
- Cost: ~**$0.0003-$0.0005 per meeting** (Haiku pricing)

### Monthly Budget (100 meetings)
- **$0.03-$0.05 per month** (less than a penny!)
- Annual: ~**$0.50**

### Annual Projection (1000 meetings)
- **$0.50 per year** (essentially free)
- Compare: Human transcription = $10,000-20,000/year
- Savings: 99.99% cost reduction

## Related Documentation

- [Phase 2a: Minutes Capture](NEXUS_MEETINGS_IMPLEMENTATION.md#phase-2a-minutes-capture)
- [Phase 2c: Action Items Bridge](NEXUS_MEETINGS_IMPLEMENTATION.md#phase-2c-action-items-bridge)
- [Anthropic API Reference](https://docs.anthropic.com)
- [Claude Models](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)

## Support

For issues or questions:
1. Check this documentation
2. Review test cases in `aiProcessing.test.js`
3. Check Claude API status at status.anthropic.com
4. Review error logs in browser console and Sentry
