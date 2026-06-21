# Report Generation & Sharing Architecture

## Overview
This document describes the complete flow of meeting attendance report generation, sharing via public links, and subgroup filtering.

---

## 1. Report Generation Flow

### Location
`src/features/meetings/components/MeetingReportTab.jsx`

### Steps

#### Phase 1: Input Setup
1. User selects **Meeting Label** (defaults to today's date)
2. User selects **Report Mode**:
   - Regional view (shows all subgroups with breakdowns)
   - Per-Subgroup Reports (separate report per subgroup)
   - All Subgroups (aggregate only)
3. User selects **Subgroups** to include
4. User uploads **Attended List** (CSV, optional)
5. User reviews **Unexpected Preview** (new attendees)

#### Phase 2: Generate
- Button: "Generate Report"
- Calls `handleGenerate()` which processes attendance data
- Builds report object with:
  - `present`, `absent`, `unexpected` arrays
  - `bySubgroup` breakdown (if Regional mode)
  - `expectedCount`, `attendedCount`, `absentCount`
  - `reachPct` (calculated percentage)

#### Phase 3: Save to Database
```javascript
// Line 1228-1245: Insert into meeting_attendance_reports
const { data, error } = await supabase
  .from('meeting_attendance_reports')
  .insert({
    label: report.label,
    report_date: new Date().toISOString().slice(0, 10),
    expected_count: report.expectedCount,
    attended_count: report.attendedCount,
    absent_count: report.absentCount,
    unexpected_count: report.unexpectedCount,
    reach_pct: report.reachPct,
    present_names: report.present.map(p => p.name),
    absent_names: report.absent.map(p => p.name),
    unexpected_names: report.unexpected.map(p => p.name),
    subgroup_filter: report.subgroupFilter,
    created_by: profile?.id ?? null,
  })
  .select('id, share_token')  // ← Fetch generated share_token
  .single()
```

**Key: Database auto-generates `share_token` (UUID) for new reports**

#### Phase 4: Display Report
Report shows in "report" phase with:
- KPI tiles (Expected, Attended, Absent, Attendance %, Unexpected)
- Attendance breakdown tables (Who Attended, Who Was Absent)
- Per-subgroup breakdown (if Regional mode)
- Action buttons: Share Report, Email Absent, Print/PDF, Save to Drive, New Report

---

## 2. Share Report (Copy Link) Flow

### Internal Report View
**Location:** `src/features/meetings/components/MeetingReportTab.jsx` (line 1567-1585)

```javascript
// Button in report header
{report.id && report.share_token ? (
  <button onClick={() => setShowShareModal(true)}>
    <Link2 size={13} /> Share Report
  </button>
) : null}
```

**When clicked:**
1. Opens modal displaying public share URL
2. URL format: `http://localhost:5173/reports/{share_token}`
3. Example: `http://localhost:5173/reports/73ea9b86-72f7-4474-b9ea-b8c1b89186f3`

**Modal has "Copy Link" button with dual-fallback copy:**
```javascript
// Primary: Clipboard API (modern browsers, HTTPS)
navigator.clipboard.writeText(url)

// Fallback: execCommand('copy') (older browsers)
document.execCommand('copy')

// Manual: Text field in modal for manual selection
```

---

## 3. Public Report View

### Location
`src/pages/reports/MeetingReportPublicPage.jsx`

### Route
```
/reports/:share_token
Example: /reports/73ea9b86-72f7-4474-b9ea-b8c1b89186f3
```

### Access Control
- **No authentication required** - RLS policy allows public access via share_token
- Anyone with the link can view the report
- Database query:
```javascript
.from('meeting_attendance_reports')
.select(...)
.eq('share_token', share_token)  // ← Filter by share_token
.single()
```

### Display
- Same KPI tiles as internal view
- Same attendance breakdown tables
- **Subgroup navigation tabs** (if report has regional mode data)
  - "All Subgroups" button (default)
  - Individual subgroup tabs (if multiple subgroups)

---

## 4. Subgroup Filtering & URL Persistence

### Available When
Report created in **Regional mode** with **multiple subgroups**

### Architecture

#### State Management
```javascript
const [activeSubgroup, setActiveSubgroup] = useState(() => {
  return searchParams.get('subgroup') || '' // Initialize from URL
})

// Extract available subgroups from report.bySubgroup
const availableSubgroups = useMemo(() => {
  if (report.bySubgroup) {
    return Object.keys(report.bySubgroup).sort()
  }
  return []
}, [report])
```

#### Data Filtering
```javascript
// Calculate visible report based on activeSubgroup
const visibleReport = useMemo(() => {
  if (!activeSubgroup) {
    // Show aggregate data
    return {
      expectedCount: report.expected_count,
      attendedCount: report.attended_count,
      // ...
      reachPct: report.reach_pct,
    }
  }
  
  // Show subgroup-specific data
  const subgroupData = report.bySubgroup[activeSubgroup]
  return {
    expectedCount: subgroupData.expected?.length || 0,
    attendedCount: subgroupData.present?.length || 0,
    reachPct: (present / expected) * 100,
    // ...
  }
}, [report, activeSubgroup])
```

#### URL Persistence
```javascript
// When activeSubgroup changes, update URL
useEffect(() => {
  const currentPath = `/reports/${share_token}`
  if (activeSubgroup) {
    navigate(`${currentPath}?subgroup=${encodeURIComponent(activeSubgroup)}`, 
      { replace: true })
  } else {
    navigate(currentPath, { replace: true })
  }
}, [activeSubgroup, share_token, navigate])
```

**Result:**
- Click "Youth" subgroup → URL becomes `/reports/{token}?subgroup=Youth`
- Share this URL → Opens with Youth subgroup pre-selected
- Click "All Subgroups" → URL becomes `/reports/{token}` (query param removed)

---

## 5. Database Schema

### meeting_attendance_reports Table
```sql
CREATE TABLE public.meeting_attendance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL,
  
  -- Report content
  label text NOT NULL,
  report_date date,
  summary text,
  
  -- Attendance counts
  expected_count integer,
  attended_count integer,
  absent_count integer,
  unexpected_count integer,
  reach_pct numeric, -- 0-100
  
  -- Names (JSON arrays)
  present_names text[],
  absent_names text[],
  unexpected_names text[],
  
  -- Sharing & filtering
  share_token uuid UNIQUE DEFAULT gen_random_uuid(),  -- ← For public access
  subgroup_filter text,  -- Which subgroup this report is for
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  
  INDEX meeting_attendance_reports_share_token_idx (share_token)
)

-- RLS Policy for public access
CREATE POLICY "Public access via share_token"
  ON public.meeting_attendance_reports
  FOR SELECT USING (share_token IS NOT NULL)
```

---

## 6. Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ INTERNAL MEETING VIEW (MeetingReportTab.jsx)                     │
│                                                                   │
│ 1. Input Setup Phase                                             │
│    - Select label, mode, subgroups, upload attendance            │
│                                                                   │
│ 2. Generate Phase                                                │
│    - Process attendance data                                     │
│    - Build report object with bySubgroup breakdown              │
│                                                                   │
│ 3. Save Phase                                                    │
│    - Insert into database                                        │
│    - Receive auto-generated share_token (UUID)                  │
│                                                                   │
│ 4. Display Phase                                                 │
│    - Show report with all data                                   │
│    - "Share Report" button opens modal                          │
│    - Modal shows: /reports/{share_token}                        │
│    - "Copy Link" button (Clipboard API + fallback)              │
│                                                                   │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   │ User copies link and shares
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ PUBLIC REPORT VIEW (MeetingReportPublicPage.jsx)                 │
│ Route: /reports/:share_token                                     │
│                                                                   │
│ 1. Load Phase                                                    │
│    - Query database: WHERE share_token = URL param              │
│    - Fetch meeting_attendance_reports row                       │
│    - No authentication required (public via RLS)                │
│                                                                   │
│ 2. Display Phase                                                 │
│    - Show KPI tiles                                              │
│    - Show attendance tables                                      │
│    - IF report.bySubgroup exists:                               │
│      Show subgroup tabs for navigation                          │
│                                                                   │
│ 3. Filtering Phase (if subgroups available)                      │
│    - User clicks subgroup tab                                    │
│    - activeSubgroup state updates                               │
│    - URL updates to /reports/{token}?subgroup=Name             │
│    - Data re-filters by subgroup                                │
│    - Share this URL → Opens with subgroup pre-selected          │
│                                                                   │
│ 4. Copy Link Phase                                               │
│    - User clicks "Copy Link" button                             │
│    - Current URL (with or without ?subgroup param) copied       │
│    - Can share with subgroup selection preserved               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Key Features

### Report Generation
- ✅ Three report modes (Regional, Per-Subgroup, All Subgroups)
- ✅ Automatic UUID generation for each report
- ✅ Per-subgroup breakdown (Regional mode)
- ✅ Attendance and absence tracking
- ✅ Unexpected attendee detection

### Sharing
- ✅ Permanent public links (share_token based)
- ✅ No authentication required to view shared reports
- ✅ Clipboard API with automatic fallback
- ✅ Modal UI showing the shareable link
- ✅ Manual copy option always available

### Subgroup Navigation
- ✅ Tabs to filter by subgroup (Regional mode only)
- ✅ URL persistence with query parameters
- ✅ Deep linking support (share link with subgroup selection)
- ✅ "All Subgroups" to view aggregate

### Data Display
- ✅ KPI tiles (Expected, Attended, Absent, Attendance %)
- ✅ Who Attended list
- ✅ Who Was Absent list
- ✅ Unexpected Attendees list
- ✅ Per-subgroup breakdowns (if Regional mode)

---

## 8. Troubleshooting

### Report doesn't have subgroup tabs
**Cause:** Report wasn't created in Regional mode
**Solution:** Generate new report, select "Regional view"

### Reach % showing 4 digits
**Status:** ✅ Fixed - now shows 0-100 format

### URL not persisting subgroup selection
**Status:** ✅ Fixed - uses `navigate()` with `replace: true`
**Test:** Click subgroup tab → check URL for `?subgroup=Name`

### Copy link shows modal but copy doesn't work
**Status:** Uses dual fallback:
1. Clipboard API (modern browsers/HTTPS)
2. execCommand fallback (older browsers)
3. Manual selection in modal (always available)

