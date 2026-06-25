# Calendar Admin Workflows & Regional Sync

## Overview

The calendar system now supports:
1. **Admin/Programs Direct Creation** – Super admins and Programs managers can create events that bypass approval
2. **Regional Ministry Calendar Sync** – Import calendars from regional offices via iCal URLs
3. **Directional Syncing** – Control data flow: pull, push, or bidirectional

---

## 1. Admin/Programs Direct Event Creation (Bypass Approval)

### Who Can Do This?
- **Super Admin** (`user.role = 'super_admin'`)
- **Programs Manager** (role = `dept_lead` + assigned to Programs space)

### How It Works

When a super admin or Programs manager creates an event via EventModal:

```javascript
// EventModal.jsx - handleSave()
const saved = await createEventDirectly(payload, profile.id, role)
```

The `createEventDirectly` function checks the user's role:

```javascript
export async function createEventDirectly(eventData, createdBy, userRole) {
  const isAuthorized = userRole === 'super_admin' || userRole === 'dept_lead'

  const payload = {
    ...eventData,
    status: isAuthorized ? 'approved' : 'pending',  // ✅ Auto-approved
    approved_by: isAuthorized ? createdBy : null,
    approved_at: isAuthorized ? new Date().toISOString() : null,
    is_admin_created: true,  // Audit trail
  }
  
  // Event is created with status='approved'
  // Event immediately syncs to Google Calendar (if connected)
}
```

### Result
- ✅ Event created with status = `approved`
- ✅ Event immediately visible in calendar
- ✅ Event immediately syncs to Google Calendar
- ✅ No approval queue needed
- ✅ Audit trail recorded via `is_admin_created` flag

### Example Flow
```
Programs Manager creates Sprint Planning event
  ↓
EventModal → createEventDirectly()
  ↓
Status set to 'approved' (not 'pending')
  ↓
Event visible immediately in calendar
  ↓
Auto-syncs to Google Calendar (if configured)
```

---

## 2. Regional Ministry Calendar Sync

### Setup in Programs Dashboard

1. **Navigate to Programs space**
2. **Click "Calendar" tab**
3. **Scroll to "🌍 Regional Ministry Calendars"**
4. **Click "+ Add Regional Calendar"**

### Connection Steps

```
Form Fields:
├─ Calendar Name (e.g., "Greater Toronto Ministry")
├─ Calendar URL (iCal/ICS format)
├─ Sync Direction (pull/push/bidirectional)
├─ Color (for visual differentiation)
└─ Description (optional notes)
```

**Example iCal URLs:**
- Google Calendar public: `https://calendar.google.com/calendar/ical/{calendar-id}/public/basic.ics`
- Microsoft Exchange: `https://outlook.office365.com/owa/calendar.ics`
- CalDAV server: `https://calendar.example.com/user/calendar.ics`

### Sync Direction Options

| Direction | Data Flow | Use Case |
|-----------|-----------|----------|
| `from_google` | ← Regional → BLW | Read-only regional events |
| `to_google` | BLW → Regional | Push local events to regional |
| `both` | ↔ Bidirectional | Two-way sync with regional |

### How Regional Sync Works

```
Step 1: Regional Calendar Connected
  └─ Store URL + sync config in regional_calendar_syncs table

Step 2: Manual or Scheduled Sync
  └─ Fetch iCal from regional URL

Step 3: Parse iCal Events
  └─ Extract VEVENT blocks with title, date, location, etc.

Step 4: Import to Local Calendar
  └─ Create calendar_events with:
     - is_regional = true
     - status = 'approved' (auto-approved)
     - regional_sync_id = (link to sync config)
     - color = (regional calendar color)

Step 5: Display in Calendar
  └─ Events appear in ministry calendar
  └─ Color-coded for regional source
  └─ Marked as org-wide (visible to all)
```

### Regional Events Database Schema

```sql
table: calendar_events
├─ is_regional BOOLEAN          -- Flag this as regional import
├─ regional_sync_id UUID        -- Link to regional_calendar_syncs
├─ status = 'approved'          -- Always approved (no workflow)
├─ color TEXT                   -- Regional calendar color
├─ is_org_wide = TRUE          -- Visible org-wide
└─ created_by = (system user)  -- Auto-created

table: regional_calendar_syncs
├─ regional_calendar_name       -- Display name
├─ regional_calendar_url        -- iCal feed URL
├─ sync_direction              -- from_google | to_google | both
├─ is_active                   -- Enable/disable sync
├─ last_synced_at              -- Timestamp of last import
└─ synced_count                -- How many events imported
```

---

## 3. Calendar Event Approval Workflow

### For Regular Users

```
Create Event
  ↓
Status = 'pending'
  ↓
Event appears in Approval Queue
  ↓
Approval needed before display
  ↓
On Approve → Status = 'approved', notification sent
On Reject  → Status = 'rejected', notification sent
```

### For Admin/Programs Managers

```
Create Event (via EventModal)
  ↓
Status = 'approved' (immediately)
  ↓
Event displays right away
  ↓
No approval queue
  ↓
Auto-syncs to Google Calendar
```

### Database Flags

```javascript
calendar_events:
├─ status: 'pending' | 'approved' | 'rejected'
├─ approved_by: user_id (who approved)
├─ approved_at: timestamp (when approved)
├─ is_admin_created: boolean (audit: was this admin-created)
├─ is_regional: boolean (was this imported from regional calendar)
└─ regional_sync_id: uuid (link to regional import)
```

---

## 4. Google Calendar Two-Way Sync

### Sync Constraints

**Only one Google Calendar per space:**
- Media → Media's Google Calendar
- ORS → ORS's Google Calendar
- Pastors → Pastors's Google Calendar

(Each space can have different sync directions)

### When Events Auto-Sync to Google

✅ Events automatically sync to Google Calendar when:
1. **Super admin or Programs manager creates event** (via EventModal)
2. **Event is approved** (in Approval Queue)
3. **Space has Google Calendar connected** with sync enabled

Example:
```
Programs Manager creates event in Media space
  ↓
EventModal.createEventDirectly()
  ↓
Event status = 'approved'
  ↓
triggerSpaceSync() called
  ↓
Sync checks: Is Google Calendar connected to Media space?
  ↓
Yes → Pushes event to Media's Google Calendar
```

---

## 5. Permissions & RLS

### Calendar Event Permissions

| Role | Create | Approve | View Pending | Create Regional |
|------|--------|---------|-------------|-----------------|
| Super Admin | ✓ (auto-approve) | ✓ | ✓ | ✓ |
| Programs Manager | ✓ (auto-approve) | ✓ | ✓ | ✓ |
| Dept Lead | ✗ | Depends | - | - |
| Regular User | ✓ (pending) | ✗ | ✗ | ✗ |
| Regional Secretary | ✗ | ✗ | ✓ (read-only) | ✗ |

### Row-Level Security Policies

```sql
-- Super admin full access
CREATE POLICY "super_admin_calendar" ON calendar_events
  USING (auth.jwt() ->> 'user_role' = 'super_admin');

-- Programs managers manage Programs space events
CREATE POLICY "programs_manager_events" ON calendar_events
  USING (
    space_id IN (SELECT id FROM departments WHERE name = 'Programs')
    AND (auth.jwt() ->> 'user_role' = 'super_admin'
         OR has_calendar_permission(auth.uid(), space_id))
  );

-- Everyone sees approved events
CREATE POLICY "everyone_approved" ON calendar_events
  FOR SELECT
  USING (status = 'approved' OR is_org_wide = TRUE);

-- Regional events auto-approved
CREATE POLICY "regional_events" ON calendar_events
  FOR SELECT
  USING (is_regional = TRUE AND status = 'approved');
```

---

## 6. API Reference

### Direct Event Creation (Admin Bypass)

```javascript
import { createEventDirectly } from '@/features/calendar'

const event = await createEventDirectly(
  {
    title: "Sprint Planning",
    start_date: "2026-07-01T10:00:00Z",
    end_date: "2026-07-01T12:00:00Z",
    space_id: "media-space-id",
    sprint_id: null,
  },
  userId,
  userRole  // 'super_admin' or 'dept_lead'
)

// Result: event.status = 'approved'
```

### Regional Calendar Management

```javascript
import {
  createRegionalCalendarSync,
  getRegionalCalendarSyncs,
  syncRegionalCalendar,
  disconnectRegionalCalendar,
} from '@/features/calendar'

// Add regional calendar
const sync = await createRegionalCalendarSync({
  org_id: orgId,
  regional_calendar_name: "Greater Toronto Ministry",
  regional_calendar_url: "https://calendar.example.com/ical",
  sync_direction: "from_google",
  color: "#FF6B6B",
})

// Get all syncs for org
const syncs = await getRegionalCalendarSyncs(orgId)

// Manual sync (fetch + import events)
const result = await syncRegionalCalendar(sync.id)
// result = { synced: 24, events: [...] }

// Disconnect and remove events
await disconnectRegionalCalendar(sync.id)
```

### Regular Event Submission (With Approval)

```javascript
import { submitEvent, getPendingApprovals, approveEvent } from '@/features/calendar'

// Regular user submits for approval
const event = await submitEvent(eventData, userId)
// event.status = 'pending'

// Get pending events
const pending = await getPendingApprovals()

// Approve event
await approveEvent(eventId)
// Notification sent, event.status = 'approved'
```

---

## 7. Programs Dashboard Components

### Regional Calendar Manager Widget

```jsx
import RegionalCalendarManager from '@/features/calendar/components/RegionalCalendarManager'

<RegionalCalendarManager orgId={orgId} />
```

Features:
- View all connected regional calendars
- Add new regional calendar via form
- Manual sync trigger (with event count)
- Disconnect and remove events
- Last sync timestamp and event count
- Color indicators for each regional calendar

---

## 8. Audit Trail

### Admin-Created Events
```javascript
calendar_events {
  is_admin_created: true,    // Easily filter admin events
  approved_by: admin_user_id,
  approved_at: timestamp,
  created_by: admin_user_id,
}
```

### Regional Imported Events
```javascript
calendar_events {
  is_regional: true,
  regional_sync_id: uuid,
  status: 'approved',
  created_by: system_user_id,  // System/function user
}

regional_calendar_syncs {
  last_synced_at: timestamp,
  synced_count: 24,
  connected_by: user_id,
  connected_at: timestamp,
}
```

### Activity Log
```javascript
activity_log {
  action: 'calendar_event_created' | 'calendar_event_approved' | 'calendar_google_sync',
  entity_type: 'calendar_event' | 'regional_calendar_sync',
  metadata: {
    space_id, sprint_id, is_admin_created, sync_direction, ...
  }
}
```

---

## 9. Troubleshooting

### Regional Calendar Not Syncing

**Check:**
1. Is the iCal URL public and accessible?
2. Is sync enabled (`is_active = true`)?
3. Check `last_synced_at` — when was it last attempted?
4. Check event count — are events being parsed?

**Fix:**
- Verify URL returns valid iCal format
- Try manual sync via "Refresh" button in Programs dashboard
- Check browser console for parsing errors

### Events Not Showing in Google Calendar

**Check:**
1. Is Google Calendar connected to the space?
2. Is sync_direction set to `to_google` or `both`?
3. Was event created by admin (auto-sync) or approved by queue?
4. Check `synced_to_google` flag on event

### Approval Queue Empty for Regional Events

**Expected behavior:** Regional events don't go in approval queue.
- Regional events have `status = 'approved'` automatically
- They appear immediately in calendar
- They're not awaiting approval

---

## 10. Future Enhancements

- [ ] Scheduled/recurring regional sync (cron job)
- [ ] Webhook support (Google Calendar → BLW push)
- [ ] Conflict resolution for bidirectional syncs
- [ ] iCal parser library integration (vs. basic regex)
- [ ] Regional calendar event filtering (by type, date range)
- [ ] Sync error notifications
- [ ] Event mapping/transformation rules
