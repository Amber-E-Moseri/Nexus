# Nexus Meetings Module - Complete Implementation Guide

## Overview

The Nexus Meetings Module is a three-phase system for managing meetings with agendas, minutes, and action items:

- **Phase 1**: Agenda Planning (finalization with auto-save, PDF export)
- **Phase 2a**: Minutes Capture (segment notes, decisions, action items)
- **Phase 2b**: Calendar Sync (one-way sync from Meetings → Calendar)
- **Phase 2c**: Action Items Bridge (link action items to Tasks module)

## Architecture

```
Meetings Module Flow:
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  1. AGENDA PLANNING (Phase 1)                                   │
│  ├─ Step 1: Meeting setup (date, time, location, moderator)     │
│  ├─ Step 2: Agenda items (add, reorder, timing calculation)     │
│  ├─ Step 3: Preview & export (PDF export, finalize)             │
│  └─ Auto-save: 30s intervals → Supabase                         │
│                                                                  │
│  2. MINUTES CAPTURE (Phase 2a)                                  │
│  ├─ Create draft minutes when opening finalized meeting         │
│  ├─ Segment notes (notes, decisions, key_points per item)       │
│  ├─ Action items (description, assignee, due_date)              │
│  ├─ Submit when ready (status: draft → submitted)               │
│  └─ RLS: Only ORS can create/edit; others view-only             │
│                                                                  │
│  3. CALENDAR SYNC (Phase 2b)                                    │
│  ├─ Auto-sync when meeting finalized                            │
│  ├─ Create calendar event with agenda, location, moderator      │
│  ├─ Fire-and-forget (don't block meeting creation)              │
│  └─ Retry available if sync fails                               │
│                                                                  │
│  4. ACTION ITEMS BRIDGE (Phase 2c)                              │
│  ├─ Auto-create task when action item created                   │
│  ├─ Link action_item.task_id ↔ task.id                          │
│  ├─ Sync status: action_item ←→ task                            │
│  └─ Fire-and-forget (don't block action item creation)          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## File Structure

```
src/
├── features/
│   ├── agendas/
│   │   ├── components/
│   │   │   ├── Step1MeetingSetup.jsx        (date, time, location)
│   │   │   ├── Step2AgendaBuilder.jsx       (add/reorder items)
│   │   │   └── Step3PreviewExport.jsx       (preview, export, finalize)
│   │   ├── lib/
│   │   │   └── agendas.js                   (API layer)
│   │   └── index.js
│   │
│   └── meetings/
│       ├── components/
│       │   ├── MinutesCapture.jsx           (main minutes component)
│       │   ├── SegmentNoteCard.jsx          (expandable segment)
│       │   └── ActionItemForm.jsx           (add action items)
│       │
│       ├── lib/
│       │   ├── minutes.js                   (API: create, update, submit)
│       │   ├── calendarSync.js              (Phase 2b: sync to calendar)
│       │   └── actionItemsBridge.js         (Phase 2c: link to tasks)
│       │
│       └── pages/
│           └── MeetingDetailPage.jsx        (view finalized meeting)
│
├── hooks/
│   └── useAgendaWizard.js                   (state: agenda data, items)
│
├── context/
│   └── AgendaBuilderContext.jsx             (provider, auto-save)
│
└── tests/
    ├── agendaTiming.test.js                 (7 tests: Phase 1)
    ├── agendaPermissions.test.js            (19 tests: Phase 1)
    ├── agendaHappyPath.e2e.test.js          (12 tests: Phase 1)
    ├── minutesCapture.test.js               (32 tests: Phase 2a)
    ├── calendarSync.test.js                 (34 tests: Phase 2b)
    └── actionItemsBridge.test.js            (38 tests: Phase 2c)
```

## Database Schema

### meetings table
```sql
CREATE TABLE meetings (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  department_id UUID NOT NULL,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location TEXT,
  moderator TEXT,
  meeting_type TEXT,
  summary TEXT,
  status TEXT CHECK (status IN ('draft', 'finalized', 'archived')),
  calendar_event_id TEXT UNIQUE,         -- Phase 2b: calendar sync
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### meeting_minutes table
```sql
CREATE TABLE meeting_minutes (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES meetings(id),
  created_by UUID NOT NULL,
  status TEXT CHECK (status IN ('draft', 'submitted')),
  summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### meeting_minutes_segments table
```sql
CREATE TABLE meeting_minutes_segments (
  id UUID PRIMARY KEY,
  minutes_id UUID NOT NULL REFERENCES meeting_minutes(id),
  segment_id TEXT NOT NULL,              -- agenda item ID
  segment_name TEXT NOT NULL,
  notes TEXT,
  decisions TEXT,
  key_points TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### meeting_action_items table
```sql
CREATE TABLE meeting_action_items (
  id UUID PRIMARY KEY,
  segment_id TEXT NOT NULL,
  description TEXT NOT NULL,
  assigned_to UUID,
  due_date DATE,
  status TEXT CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  task_id TEXT UNIQUE,                   -- Phase 2c: link to tasks
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Key Features

### 1. Permission Model

**ORS Only (Organizational Representative Secretary)**:
- Create/finalize agendas
- Create/submit minutes
- Create action items
- Manage calendar sync

**All Users**:
- View finalized meetings
- View submitted minutes
- View assigned action items

### 2. Auto-Save

Located in `AgendaBuilderContext.jsx`:
```javascript
useEffect(() => {
  const timer = setInterval(() => {
    if (agendaData || agendaItems.length) {
      saveAgenda() // 30-second intervals
    }
  }, 30000)
  return () => clearInterval(timer)
}, [agendaData, agendaItems])
```

**Status indicators**:
- Idle: (no indicator)
- Saving: 💾 Saving...
- Saved: ✓ Saved
- Error: ⚠ Failed (with retry)

### 3. Timing Calculation

`useAgendaWizard.js`:
```javascript
function calculateTimings(startTime, agendaItems) {
  // Filter out intro music (isPinned = true)
  const timed = agendaItems.filter(i => !i.isPinned)
  
  // Chain timings from meeting start
  let currentTime = parseTime(startTime)
  return timed.map(item => {
    const timing = formatTime(currentTime)
    currentTime += item.duration
    return { ...item, timing }
  })
}
```

**Special handling**:
- Intro music: shows "Pre-start" label
- Other items: calculated from meeting start time
- Duration: always shown, timing updates based on agenda order

### 4. Draft/Finalized Workflow

**Meeting Status**:
- `draft`: Can be edited (while planning)
- `finalized`: Locked for minutes capture
- `archived`: Hidden from normal views

**Minutes Status**:
- `draft`: Can edit all fields
- `submitted`: Locked (readonly)

**RLS Policies**:
```sql
-- Only creator can edit draft minutes
-- Only finalized meetings can have minutes
-- Submitted minutes readable by all
```

### 5. Calendar Sync (Phase 2b)

**When**: Automatically triggered when meeting finalized
**What**: Creates calendar event with:
- Meeting title
- Date/time from meeting
- Location
- Moderator
- Formatted agenda (excluding intro music)

**Pattern**: Fire-and-forget (doesn't block meeting creation)

```javascript
try {
  await syncMeetingToCalendar(meeting, agendaItems)
} catch (err) {
  console.warn('Calendar sync failed, meeting finalized:', err)
}
```

**Retry**: Manual via `retryCalendarSync(meetingId)`
**Status**: Check via `getCalendarSyncStatus(meetingId)`

### 6. Action Items Bridge (Phase 2c)

**When**: Automatically triggered when action item created
**What**: Creates task with:
- Title: action item description
- Assignee: linked user
- Due date: from action item
- Priority: medium (default)
- Tags: `meeting:MEETING_ID`

**Pattern**: Fire-and-forget

```javascript
try {
  await createTaskFromActionItem(actionItem, meetingId)
} catch (err) {
  console.warn('Task creation failed, action item saved:', err)
}
```

**Status Sync**: When task status changes → action item status updated
**Linking**: Bidirectional (action_item.task_id ↔ task.id)

## Integration Points

### Agenda Finalization → Calendar Sync

File: `src/features/agendas/components/Step3PreviewExport.jsx`

```javascript
const { meeting, agenda } = await createMeetingWithAgenda(...)

// Sync to Calendar (fire and forget)
try {
  await syncMeetingToCalendar(meeting, agendaItems)
} catch (err) {
  console.warn('Calendar sync failed:', err)
}
```

### Action Item Creation → Task Creation

File: `src/features/meetings/components/ActionItemForm.jsx`

```javascript
const actionItem = await createActionItem(segmentId, description, assignedTo, dueDate)

// Create linked task (fire and forget)
try {
  await createTaskFromActionItem(actionItem, meetingId)
} catch (err) {
  console.warn('Task creation failed:', err)
}
```

## API Functions

### Agendas (Phase 1)
- `createMeetingWithAgenda(meetingData, agendaData, items)`
- `finalizeMeeting(meetingId)`
- `getAgendaWithItems(meetingId)`

### Minutes (Phase 2a)
- `createMinutes(meetingId, createdBy)`
- `getMinutesByMeeting(meetingId)`
- `submitMinutes(minutesId)`
- `upsertSegmentNotes(segmentId, notes, decisions, keyPoints)`
- `createActionItem(segmentId, description, assignedTo, dueDate)`
- `updateActionItemStatus(actionItemId, status)`
- `deleteActionItem(actionItemId)`

### Calendar Sync (Phase 2b)
- `syncMeetingToCalendar(meeting, agendaItems)`
- `retryCalendarSync(meetingId)`
- `getCalendarSyncStatus(meetingId)`
- `bulkSyncMeetingsToCalendar(meetingIds)`
- `linkCalendarEventToMeeting(meetingId, calendarEventId)`
- `removeCalendarEventFromMeeting(calendarEventId)`

### Action Items Bridge (Phase 2c)
- `createTaskFromActionItem(actionItem, meetingId)`
- `linkActionItemToTask(actionItemId, taskId)`
- `syncActionItemStatusFromTask(taskId, taskStatus)`
- `bulkLinkActionItemsToTasks(actionItemIds)`
- `getTasksFromMeeting(meetingId)`
- `notifyActionItemAssignees(actionItem)`

## Testing

### Run All Tests
```bash
npm run test -- src/tests/*.test.js
```

### By Phase
```bash
# Phase 1: Agenda Planning
npm run test -- agendaTiming.test.js agendaPermissions.test.js agendaHappyPath.e2e.test.js

# Phase 2a: Minutes Capture
npm run test -- minutesCapture.test.js

# Phase 2b: Calendar Sync
npm run test -- calendarSync.test.js

# Phase 2c: Action Items Bridge
npm run test -- actionItemsBridge.test.js
```

### Test Coverage
- Phase 1: 38 tests (all passing)
- Phase 2a: 32 tests (all passing)
- Phase 2b: 34 tests (all passing)
- Phase 2c: 38 tests (all passing)
- **Total: 142 tests**

## Error Handling

### Pattern: Fire-and-Forget for Optional Features

When optional integrations fail, don't block primary operation:

```javascript
// ✅ CORRECT
try {
  await syncMeetingToCalendar(meeting, agendaItems)
} catch (err) {
  console.warn('Calendar sync failed, but meeting finalized:', err)
  // Meeting creation succeeds
}

// ❌ WRONG
await syncMeetingToCalendar(meeting, agendaItems)
// If this fails, meeting creation fails too
```

### User Feedback

- **Auto-save**: Status indicator (💾 Saving → ✓ Saved)
- **Finalization**: Success message with IDs
- **Calendar Sync**: Silent on success, logs on failure
- **Task Creation**: Silent on success, logs on failure
- **Minutes Submit**: Confirmation, then readonly state

## Future Enhancements (Phase 3)

- [ ] Notifications to assignees (action items, follow-ups)
- [ ] Meeting recording integration
- [ ] Agenda templates and presets
- [ ] Automatic meeting summaries (AI)
- [ ] Attendee tracking and sign-in
- [ ] Minutes PDF export
- [ ] Email digest of action items

## Troubleshooting

### Calendar sync failed but meeting saved
- Check internet connection
- Retry via `retryCalendarSync(meetingId)`
- Check calendar API permissions

### Action item created but task not found
- Task creation is fire-and-forget
- Check activity feed for task creation errors
- Tasks may be created with delay due to background processing

### Timing calculation off by one
- Ensure intro music marked with `isPinned: true`
- Check `calculateTimings()` function in `useAgendaWizard.js`
- Verify meeting start time is set

### Minutes locked after finalization
- Expected behavior (RLS policy prevents editing)
- Only creator can re-open via API (future feature)
- View finalized minutes in readonly mode

## Database Migrations

To apply migrations:
```bash
supabase migration up
```

Migrations:
1. `20260626000000_agenda_status.sql` - Phase 1: agenda status field
2. `20260626000001_meeting_minutes.sql` - Phase 2a: minutes tables
3. `20260626000002_calendar_sync.sql` - Phase 2b/2c: calendar_event_id, task_id fields

## Related Documentation

- [Calendar System Implementation](CALENDAR_IMPLEMENTATION_GUIDE.md)
- [Minutes Capture System](COMMUNICATIONS_SYSTEM_COMPLETE.md)
- [Permission System](../PERMISSIONS.md)
- [Activity Feed Integration](../ACTIVITY_FEED.md)
