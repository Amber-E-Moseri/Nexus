# Calendar System Implementation Guide
## BLW Canada Ministry Calendar & Sprint Management

**Status**: Week 1-2 Foundation & API Layer Complete  
**Updated**: 2026-06-25  
**Timeline**: 3-4 weeks total

---

## Table of Contents
1. [Completed Work](#completed-work)
2. [In Progress](#in-progress)
3. [Architecture Overview](#architecture-overview)
4. [Database Schema](#database-schema)
5. [API Reference](#api-reference)
6. [Frontend Components](#frontend-components)
7. [Configuration](#configuration)
8. [Deployment Checklist](#deployment-checklist)

---

## Completed Work

### Week 1: Foundation ✅

#### Database Migrations
- **20260625000000_calendar_system_foundation.sql**
  - Creates `google_calendar_sync` table for OAuth and sync config
  - Adds Google sync fields to `calendar_events`
  - Enhances `calendar_subscriptions` with filtering and analytics
  - Creates `calendar_permissions` table for role-based access
  - Sets up RLS policies for space-based access control

- **20260625000001_calendar_roles_and_permissions.sql**
  - Implements role permission functions
  - Creates helper views for analytics and permissions
  - Provides RPC functions for permission management

#### TypeScript Types ✅
- `src/types/calendar.types.ts` - Complete type definitions for all calendar entities

#### API Layer ✅
- `src/lib/calendar/api.js` - Full API integration layer with:
  - Calendar events CRUD
  - Google Calendar OAuth and sync
  - Subscription management
  - Permission management
  - Analytics and utilities

#### React Hooks ✅
- `useCalendarEvents` - Event management with auto-fetch
- `useCalendarEvent` - Single event details
- `usePendingApprovals` - Approval workflow
- `useGoogleCalendarSync` - OAuth and sync state
- `useCalendarSubscriptions` - iCal feed management
- `useCalendarPermissions` - Role and permission management

#### Frontend Components ✅
- `CalendarEventForm` - Create/edit events
- `GoogleCalendarConnect` - OAuth setup and sync UI
- `SubscriptionManager` - iCal subscription creation and management

---

## In Progress

### Week 2: Frontend Components
- [ ] CalendarEventList - Display events with filtering
- [ ] CalendarGrid - Month/week view
- [ ] ApprovalQueue - Pending event approvals
- [ ] ProgramsManagerDashboard - Complete manager view
- [ ] RegionalSecretaryView - Read-only analytics view

### Week 3: Google Calendar Integration
- [ ] Edge function for OAuth callback
- [ ] Sync scheduler (every 15 minutes)
- [ ] Conflict resolution logic
- [ ] iCal feed generator endpoint

### Week 4: Polish & Testing
- [ ] End-to-end testing
- [ ] Permission verification
- [ ] Google sync testing
- [ ] iCal subscription testing
- [ ] Performance optimization

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│         Frontend (React/Vite)           │
├─────────────────────────────────────────┤
│ Pages/Components                        │
│ ├── ProgramsManagerView                 │
│ ├── AdminManagerView                    │
│ └── RegionalSecretaryView               │
└──────────────────┬──────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼──────────┐  ┌──────▼─────────────┐
│   React Hooks    │  │   API Functions    │
├──────────────────┤  ├────────────────────┤
│ useCalendarEvents│  │ Supabase Client    │
│ useGoogle...Sync │  │ Edge Functions     │
│ usePermissions   │  │ RPC Functions      │
└───────┬──────────┘  └──────┬─────────────┘
        │                     │
        └─────────────────────┴──────────────┐
                                             │
                    ┌────────────────────────▼─────────────┐
                    │     Supabase (PostgreSQL)            │
                    ├──────────────────────────────────────┤
                    │ Tables:                              │
                    │ ├── calendar_events                  │
                    │ ├── google_calendar_sync             │
                    │ ├── calendar_subscriptions           │
                    │ ├── calendar_permissions             │
                    │ ├── calendar_rsvps                   │
                    │ └── calendar_permissions_summary     │
                    │                                      │
                    │ Functions:                           │
                    │ ├── get_pending_calendar_events()    │
                    │ ├── approve_calendar_event()         │
                    │ ├── reject_calendar_event()          │
                    │ ├── grant_calendar_permission()      │
                    │ └── revoke_calendar_permission()     │
                    └──────────────────────────────────────┘
```

---

## Database Schema

### calendar_events
Stores all calendar events with approval workflow.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| title | TEXT | Event name |
| description | TEXT | Event details |
| event_type | TEXT | conference, program, training, etc |
| start_date | TIMESTAMPTZ | Event start |
| end_date | TIMESTAMPTZ | Event end |
| all_day | BOOLEAN | All-day flag |
| location | TEXT | Event location |
| space_id | UUID FK | Programs or Admin space |
| sprint_id | UUID FK | Linked sprint |
| priority | TEXT | high, medium, low |
| duration_days | INT | Multi-day events |
| status | TEXT | pending, approved, rejected |
| is_org_wide | BOOLEAN | Visible to all |
| recurrence_rule | TEXT | RFC 5545 format |
| google_event_id | TEXT | Google Calendar ID |
| synced_to_google | BOOLEAN | Sync status |
| created_by | UUID FK | Creator |
| created_at | TIMESTAMPTZ | Creation time |

### google_calendar_sync
OAuth credentials and sync configuration.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| org_id | UUID FK | Organization |
| space_id | UUID FK | Space (Programs/Admin) |
| google_calendar_id | TEXT | Google Calendar ID |
| google_access_token | TEXT | OAuth token (encrypted) |
| sync_enabled | BOOLEAN | Enable/disable sync |
| sync_direction | TEXT | to_google, from_google, both |
| last_sync_at | TIMESTAMPTZ | Last sync time |
| connected_by | UUID FK | User who connected |

### calendar_subscriptions
iCal feed subscriptions for public sharing.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| user_id | UUID FK | Creator |
| token | TEXT UNIQUE | Public feed token |
| space_id | UUID FK | Space |
| name | TEXT | Feed name |
| description | TEXT | Feed description |
| filter_priority | TEXT | Filter high/medium/low |
| filter_status | TEXT | Filter confirmed/cancelled |
| is_public | BOOLEAN | Publicly shareable |
| access_count | INT | Analytics |
| last_accessed_at | TIMESTAMPTZ | Last access |

### calendar_permissions
Role-based access control.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| user_id | UUID FK | User |
| space_id | UUID FK | Space |
| can_manage | BOOLEAN | Manager vs Viewer |
| granted_by | UUID FK | Grantor |
| granted_at | TIMESTAMPTZ | Grant time |

---

## API Reference

### Calendar Events

#### Fetch Events
```javascript
const events = await fetchCalendarEvents({
  space_id: 'uuid',
  status: 'approved',
  priority: 'high',
  start_date: '2026-04-01',
  end_date: '2026-04-30',
});
```

#### Create Event
```javascript
const event = await createCalendarEvent({
  title: 'Easter Celebration',
  description: 'Campus-wide event',
  event_type: 'event',
  start_date: '2026-04-15T00:00:00Z',
  end_date: '2026-04-20T23:59:59Z',
  space_id: 'programs-space-id',
  priority: 'high',
  is_org_wide: true,
});
```

#### Approve Event
```javascript
await approveCalendarEvent(eventId);
```

#### Reject Event
```javascript
await rejectCalendarEvent(eventId, 'Conflicts with another event');
```

### Google Calendar

#### Connect OAuth
```javascript
const oauthUrl = await getGoogleOAuthUrl(spaceId);
window.location.href = oauthUrl; // Redirects to Google login
```

#### Get Sync Status
```javascript
const status = await getGoogleSyncStatus(orgId, spaceId);
// Returns: { connected: true, sync_enabled: true, last_sync_at: ... }
```

#### Trigger Manual Sync
```javascript
const result = await triggerGoogleSync(orgId, spaceId);
// Returns: { synced_events: 5, created: 2, updated: 3, ... }
```

### Calendar Subscriptions

#### Create Subscription
```javascript
const sub = await createCalendarSubscription({
  name: 'Ministry Calendar 2026',
  space_id: 'programs-space-id',
  filter_priority: 'high',
  is_public: true,
});
// Returns subscription with token for iCal URL
```

#### Fetch Subscriptions
```javascript
const subs = await fetchCalendarSubscriptions();
```

#### Get iCal Feed URL
```javascript
const url = getICalFeedUrl(token);
// Returns: https://app.blwcanada.org/api/calendar/subscribe/token123
```

### Permissions

#### Grant Permission
```javascript
await grantCalendarPermission(userId, spaceId, canManage);
// canManage: true = Manager, false = Viewer
```

#### Get User Role
```javascript
const role = await getUserCalendarRole(userId, spaceId);
// Returns: 'super_admin' | 'manager' | 'viewer' | null
```

---

## Frontend Components

### CalendarEventForm
Create/edit calendar events.

```jsx
<CalendarEventForm
  eventId={null} // null for create, UUID for edit
  spaceId="programs-space-id"
  onSave={() => console.log('Saved')}
  onCancel={() => console.log('Cancelled')}
/>
```

### GoogleCalendarConnect
Manage Google Calendar connection.

```jsx
<GoogleCalendarConnect
  spaceId="programs-space-id"
  orgId="org-id"
/>
```

### SubscriptionManager
Create and manage iCal subscriptions.

```jsx
<SubscriptionManager
  spaceId="programs-space-id"
/>
```

---

## Configuration

### Environment Variables
```env
# Frontend
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx

# Backend (Edge Functions)
GOOGLE_CLIENT_SECRET=your-secret-key
ENCRYPTION_KEY=your-32-char-secret-key-here
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### Google Cloud Setup
1. Create Google Cloud project
2. Enable Google Calendar API
3. Create OAuth 2.0 credentials (Web application)
4. Add authorized redirect URI: `https://app.blwcanada.org/api/calendar/google/callback`
5. Store credentials in environment variables

---

## Deployment Checklist

### Pre-Deployment
- [ ] Run database migrations
- [ ] Set environment variables
- [ ] Test OAuth flow locally
- [ ] Test RLS policies
- [ ] Run test suite

### Deployment
- [ ] Deploy migrations to production DB
- [ ] Deploy edge functions
- [ ] Deploy frontend
- [ ] Monitor sync scheduler
- [ ] Verify RLS policies active

### Post-Deployment
- [ ] Test with real Google account
- [ ] Verify sync is working
- [ ] Check iCal feeds
- [ ] Monitor error logs
- [ ] Gather user feedback

---

## Testing Strategy

### Unit Tests
```javascript
test('createCalendarEvent creates pending event', async () => {
  const event = await createCalendarEvent({ ... });
  expect(event.status).toBe('pending');
});

test('approveCalendarEvent updates status', async () => {
  await approveCalendarEvent(eventId);
  const event = await fetchCalendarEvent(eventId);
  expect(event.status).toBe('approved');
});
```

### Integration Tests
- Create event → Approve → Sync to Google → Verify in Google Calendar
- Create subscription → Add to calendar app → Verify auto-update
- Test all role combinations with RLS

### Manual Testing
- [ ] Programs Manager creates event
- [ ] Regional Secretary sees it (pending)
- [ ] Approves it in manager dashboard
- [ ] Event appears in Google Calendar
- [ ] iCal subscription shows it
- [ ] Edit event → Google syncs update
- [ ] Delete event → removed from Google

---

## Success Criteria

✅ **Week 1: Foundation**
- [x] Database tables created
- [x] RLS policies configured
- [x] TypeScript types defined
- [x] API layer complete
- [x] React hooks implemented

⏳ **Week 2: Frontend**
- [ ] All core components built
- [ ] Event list/grid views working
- [ ] Approval queue functional
- [ ] Manager dashboard complete

⏳ **Week 3: Google Integration**
- [ ] OAuth flow complete
- [ ] 15-min sync scheduler running
- [ ] iCal feeds generating
- [ ] Conflict resolution working

⏳ **Week 4: Testing & Polish**
- [ ] All tests passing
- [ ] Permission tests verified
- [ ] Performance optimized
- [ ] Documentation complete

---

## Quick Start for Development

1. **Create an event**:
```jsx
import { CalendarEventForm } from './features/calendar/components';

function MyComponent() {
  return <CalendarEventForm spaceId="..." onSave={() => {}} />;
}
```

2. **Fetch events**:
```jsx
import { useCalendarEvents } from './hooks';

function EventList() {
  const { events, loading } = useCalendarEvents({ space_id: '...' });
  return <div>{events.map(e => <div>{e.title}</div>)}</div>;
}
```

3. **Connect Google Calendar**:
```jsx
import { GoogleCalendarConnect } from './features/calendar/components';

function Settings() {
  return <GoogleCalendarConnect spaceId="..." orgId="..." />;
}
```

---

## Next Steps

1. **Complete Week 2 Components**
   - [ ] CalendarEventList component
   - [ ] CalendarGrid (month/week view)
   - [ ] ApprovalQueue component
   - [ ] Manager dashboards

2. **Implement Week 3 Backend**
   - [ ] Edge function for OAuth callback
   - [ ] Sync scheduler (Supabase cron)
   - [ ] iCal feed generator endpoint
   - [ ] Conflict resolution logic

3. **Testing & Documentation**
   - [ ] Integration tests
   - [ ] Manual testing in all apps
   - [ ] User documentation
   - [ ] API documentation

---

## Support & Questions

For questions about the calendar system implementation:
1. Check this guide first
2. Review NEXUS_PROGRAMS_CALENDAR_SYSTEM.md (original spec)
3. Check type definitions in `src/types/calendar.types.ts`
4. Review API in `src/lib/calendar/api.js`

---

**Last Updated**: 2026-06-25  
**Maintained By**: Development Team
