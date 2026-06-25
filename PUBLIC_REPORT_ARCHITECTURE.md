# Public Report Architecture

## Overview
Public shareable attendance reports via token-protected links. Anyone with a share token can view meeting attendance data filtered by subgroup.

## Routes
- `GET /reports/:token` — Render public report with all subgroups
- `GET /reports/:token?subgroup=xyz` — Filter by specific subgroup

## Database Schema

### Table: `meeting_attendance_reports`
- `id` (UUID) — primary key
- `share_token` (VARCHAR) — unique public link token
- `meeting_id` (UUID) — foreign key to meetings table
- `label` (VARCHAR) — report title
- `report_date` (TIMESTAMP) — when report was generated
- `expected_count` (INT) — total expected attendees
- `attended_count` (INT) — total who attended
- `absent_count` (INT) — total absent
- `unexpected_count` (INT) — unexpected attendees
- `reach_pct` (NUMERIC) — reach percentage (0-100)
- `present_names` (TEXT[]) — array of present attendee names
- `absent_names` (TEXT[]) — array of absent attendee names
- `unexpected_names` (TEXT[]) — array of unexpected attendee names
- `by_subgroup` (JSONB) — nested data per subgroup (regional breakdown)
- `subgroup_filter` (VARCHAR) — default subgroup to lock on shared link (optional)

### Related Tables
- `meetings` — meeting details (title, date, description)

## Frontend Component

### File: `src/pages/reports/MeetingReportPublicPage.jsx`

#### State
- `activeSubgroup` (string) — currently selected subgroup filter
- `report` (object) — loaded report data from Supabase
- `loading` (boolean) — data fetch status
- `showLinkModal` (boolean) — share link modal visibility
- `copiedLink` (boolean) — copy feedback state
- `isInitialMount` (ref) — tracks first render for URL sync

#### Effects
1. **Read URL on mount** — Extract `?subgroup=` param and set state
2. **Lock to subgroup_filter** — If shared link has a default subgroup AND activeSubgroup wasn't set from URL, lock to it
3. **Sync state to URL** — When activeSubgroup changes (user action), update browser history
4. **Fetch report data** — Load report from Supabase by share_token

#### Components
- **Header** — Title, date, share button, subgroup tabs
- **KPI Tiles** — Expected, Attended, Absent, Attendance %, Unexpected
- **Subgroup Info Panel** — Shows active subgroup stats (if filtered)
- **ListTables** — Present, Absent, Unexpected attendee lists
- **Share Modal** — Copy link to clipboard
- **Footer** — Report generated date, report ID

## Permissions & Security
- **Token-based access** — Anyone with valid `share_token` can view
- **Read-only** — No modifications allowed (view-only interface)
- **No authentication** — Public access, no login required
- **One-way sharing** — Token cannot be used to create/edit reports, only view

## URL Parameter Behavior

### Initial Load
```
/reports/abc123
→ Shows all subgroups (or default if subgroup_filter set)

/reports/abc123?subgroup=Boston
→ Shows Boston subgroup data only
```

### Refresh & Navigation
- **F5 Refresh** — Maintains current subgroup filter via URL param
- **Back/Forward** — Browser history preserves subgroup navigation
- **Manual URL edit** — Direct URL params respected (e.g., manually append `?subgroup=NYC`)

## State Synchronization Flow

```
User visits URL with ?subgroup=Boston
    ↓
First Effect: Read URL param → set activeSubgroup = 'Boston'
    ↓
Report data loads from Supabase
    ↓
Second Effect: Check if should lock to subgroup_filter
    - Only locks if: isSharedLink AND report.subgroup_filter AND !activeSubgroup
    - Does NOT override if activeSubgroup already set from URL param
    ↓
Third Effect: Sync state to URL
    - Updates browser history with current activeSubgroup
    ↓
Page renders with Boston data
```

## Known Issues

### [FIXED] URL Persistence Bug
- **Issue** — Filter would revert to default on page refresh (F5), despite URL param being present
- **Root Cause** — Second effect was unconditionally overriding `activeSubgroup` with `subgroup_filter` from database, ignoring URL param
- **Fix** — Added `!activeSubgroup` condition to second effect; only locks if activeSubgroup wasn't already set from URL
- **Status** — ✅ Fixed in commit [COMMIT_HASH]

## Testing Checklist

- ✅ Initial load with `?subgroup=xyz` shows correct data
- ✅ F5 refresh preserves subgroup filter
- ✅ Dropdown filter changes update URL immediately
- ✅ Browser back/forward navigation works with filtered views
- ✅ Direct URL params (`?subgroup=...`) are respected on first load
- ✅ No URL param loads default/all subgroups view

## Performance Notes
- Report data fetched once per share_token (uses cleanup pattern for stale requests)
- Available subgroups extracted from `by_subgroup` object
- List sorting done in frontend (useMemo optimized)
- Reach percentage calculations cached via useMemo

## Future Enhancements
- Export to PDF with current filter applied
- Print optimization already in place (media print styles)
- Share link expiration (not yet implemented)
- Password protection for sensitive reports (not yet implemented)
- Email share with auto-expiring tokens (not yet implemented)
