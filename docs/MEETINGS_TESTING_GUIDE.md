# Meetings Module Testing Guide

## Overview

Comprehensive testing guide for the Meetings module, covering unit tests, component tests, integration tests, and manual testing procedures.

**Test Coverage Goals:**
- Unit tests: CSV parser, matching, database functions
- Component tests: Modal, workspace, cards
- Integration tests: CSV import pipeline
- Accessibility tests: WCAG AA compliance
- Performance tests: Large datasets

---

## Unit Tests

### CSV Parser Testing

**File:** `src/lib/csv/elvanto-attendance-parser.test.ts`

**Test Coverage:**
- ✅ Valid CSV with required columns
- ✅ Multiple date formats (ISO, MM/DD/YYYY, DD/MM/YYYY)
- ✅ Status normalization (Present, Absent, Late, Excused)
- ✅ Optional fields (time, person_id, percentage)
- ✅ Missing required columns error handling
- ✅ Invalid dates (skip row, log error)
- ✅ Empty CSV handling
- ✅ Case-insensitive headers
- ✅ Percentage parsing and capping (0-100)
- ✅ Whitespace trimming

**Run Tests:**
```bash
npm test -- elvanto-attendance-parser
```

**Test Data:**
```csv
Meeting,Date,PersonName,Status
Test Meeting,2024-06-16,John Doe,Present
Test Meeting,06/16/2024,Jane Smith,Absent
Test Meeting,2024-06-17,Bob Wilson,Late
Test Meeting,2024-06-18,Alice Brown,Excused
```

### Person Matching Testing

**File:** `src/lib/csv/attendanceImportLib.test.ts`

**Test Coverage:**
- ✅ External ID matching (PersonID)
- ✅ Exact name match
- ✅ Fuzzy matching (initials, last name, substring)
- ✅ No match handling (log mismatch)
- ✅ Database query performance
- ✅ Batch matching efficiency

**Run Tests:**
```bash
npm test -- attendanceImportLib
```

**Matching Test Cases:**
| CSV Name | User Name | Expected | Reason |
|----------|-----------|----------|--------|
| John Doe | John Doe | ✅ Match | Exact |
| J.D. | John Doe | ✅ Match | Initials |
| Doe | John Doe | ✅ Match | Last name (3+ chars) |
| John | John Michael Doe | ✅ Match | Substring |
| Unknown | — | ❌ Mismatch | Not found |

---

## Component Tests

### AttendanceImportModal

**Manual Testing Checklist:**

**Upload Step:**
- [ ] File input accepts `.csv` files only
- [ ] Error shown for non-CSV files
- [ ] File name displayed after selection
- [ ] Escape key closes modal
- [ ] Click outside modal closes it

**Preview Step:**
- [ ] Summary shows valid/invalid record counts
- [ ] Preview table shows first 5 records
- [ ] Date format correct (YYYY-MM-DD)
- [ ] Status badges color-coded (present/absent/late/excused)
- [ ] Error list shows invalid rows with reasons
- [ ] Back button returns to upload step

**Import Step:**
- [ ] Loading state shown during import
- [ ] Import button disabled if no valid records
- [ ] Success message shows imported count
- [ ] Mismatches listed with person name
- [ ] Toast notification appears
- [ ] Modal closes after success

**Error Handling:**
- [ ] Missing columns → Error message
- [ ] Invalid date format → Row skipped
- [ ] Empty CSV → Error message
- [ ] Database error → Error message + retry

**Accessibility:**
- [ ] Tab navigation works
- [ ] Focus visible on all buttons
- [ ] ARIA labels present
- [ ] Dialog marked as modal
- [ ] Escape key closes modal
- [ ] Screen reader announces button purposes

### MeetingsWorkspace

**Manual Testing Checklist:**

**List View:**
- [ ] Meetings sorted by date (newest first)
- [ ] Active meeting highlighted
- [ ] Filter buttons work (All, General, Team, Media, Dept)
- [ ] Meeting count updates on filter change
- [ ] Click meeting selects and shows detail
- [ ] Hover effect visible

**Card Gallery View:**
- [ ] Grid layout responsive (3 cols desktop, 2 tablet, 1 mobile)
- [ ] Card shows title, date, type badge
- [ ] Card shows attendance count (if enabled)
- [ ] Card shows "Has notes" indicator
- [ ] Card shows "Upcoming" status (if date > today)
- [ ] Active card highlighted
- [ ] Click card selects and shows detail
- [ ] Hover effect (shadow + lift)
- [ ] Empty state message shown

**View Toggle:**
- [ ] List/Grid icons visible on desktop
- [ ] Toggle hidden on mobile
- [ ] Buttons accessible via Tab
- [ ] aria-pressed state correct
- [ ] Switch views smoothly

**Mobile Responsive:**
- [ ] On mobile: Show list OR detail (not both)
- [ ] Back button visible in detail view
- [ ] Back button returns to list
- [ ] Touch targets 44px+ (buttons, list items)
- [ ] Text readable (no overflow)
- [ ] Grid collapses to single column

**Detail View (RecordPane):**
- [ ] Meeting title, date, type shown
- [ ] Start live button visible (desktop only)
- [ ] Tabs load correctly (Attendance, Notes, Tasks)
- [ ] Scroll works for long content
- [ ] Mobile back button visible and functional

**Keyboard Navigation:**
- [ ] Tab moves between buttons
- [ ] Enter/Space activates buttons
- [ ] Escape closes modals
- [ ] Filter buttons: arrow keys cycle through
- [ ] Meeting list: arrow keys navigate
- [ ] Focus visible on all elements

---

## Integration Tests

### CSV Import to Database

**Test Scenario 1: Successful Import**

1. **Setup:**
   - Create test meeting in database
   - Prepare CSV with 5 test people
   - Ensure people exist in users table

2. **Execute:**
   - Upload CSV via modal
   - Click Import
   - Wait for completion

3. **Verify:**
   - [ ] 5 rows created in `meeting_attendance` table
   - [ ] `source` field set to `'elvanto_import'`
   - [ ] `marked_at` timestamp is recent
   - [ ] Attendance %ages accurate (present count / total)
   - [ ] Watch list (<75%) updated
   - [ ] Toast shows "Imported 5 records"

**SQL Verification:**
```sql
SELECT * FROM meeting_attendance 
WHERE meeting_id = 'test-meeting-id' 
  AND source = 'elvanto_import'
ORDER BY created_at DESC;
```

**Test Scenario 2: Partial Import (Mismatches)**

1. **Setup:**
   - CSV with 5 people: 3 exist, 2 don't

2. **Execute:**
   - Upload CSV via modal
   - Preview shows 3 valid, 2 mismatches
   - Click Import

3. **Verify:**
   - [ ] 3 rows created (matched people)
   - [ ] 2 mismatches listed by name
   - [ ] Toast shows "Imported 3, 2 mismatches"
   - [ ] No partial rows created for mismatches

**Test Scenario 3: Duplicate Import**

1. **Setup:**
   - CSV with 5 people already imported

2. **Execute:**
   - Upload same CSV again
   - Click Import

3. **Verify:**
   - [ ] No duplicate rows created
   - [ ] Existing rows updated (marked_at refreshed)
   - [ ] Toast shows "Updated 5 records"
   - [ ] Total rows still = 5 (not 10)

**Test Scenario 4: Large File (100+ Records)**

1. **Setup:**
   - Generate CSV with 500 test records

2. **Execute:**
   - Upload CSV via modal
   - Measure import time
   - Check performance

3. **Verify:**
   - [ ] Import completes in <2 seconds
   - [ ] All 500 rows created
   - [ ] Database responsive after import
   - [ ] No memory leaks

---

## Accessibility Testing

### WCAG AA Compliance

**Keyboard Navigation:**
- [ ] All interactive elements focusable (Tab)
- [ ] Focus order logical
- [ ] Focus visible on all buttons
- [ ] Escape closes modals
- [ ] No keyboard traps

**Screen Reader (NVDA/JAWS):**
- [ ] Modal announced as dialog
- [ ] Modal title announced
- [ ] Buttons have clear labels
- [ ] Decorative icons hidden (aria-hidden)
- [ ] Icon-only buttons have aria-label
- [ ] Form inputs have labels
- [ ] Error messages announced
- [ ] Status updates announced

**Color Contrast:**
- [ ] Text: >4.5:1 (AA standard)
- [ ] UI components: >3:1 (AA standard)
- [ ] Type badges: check contrast against background
- [ ] Status indicators: don't rely on color alone

**Touch Targets:**
- [ ] Buttons: 44px × 44px minimum
- [ ] List items: 44px minimum height
- [ ] Spacing: 8px gap between targets
- [ ] Mobile: all interactive elements 44px+

**Test Tools:**
- WAVE Browser Extension
- axe DevTools
- Lighthouse (Chrome)
- Color contrast checker

---

## Manual Testing Checklist

### Before Each Release

**Desktop (1280px):**
- [ ] Chrome latest
- [ ] Firefox latest
- [ ] Safari latest
- [ ] Edge latest

**Mobile (375px - iPhone 12):**
- [ ] Chrome Mobile
- [ ] Safari Mobile
- [ ] List/detail toggle works
- [ ] Touch targets 44px+

**Tablet (768px - iPad):**
- [ ] Landscape and portrait
- [ ] Both panes visible
- [ ] Responsive grid working
- [ ] Touch targets adequate

### Test Workflows

**Workflow 1: Create & View Meeting**
1. [ ] Create test meeting
2. [ ] Check in list view
3. [ ] Check in card gallery
4. [ ] Click to open detail
5. [ ] Verify info displays

**Workflow 2: Import Attendance**
1. [ ] Create test meeting
2. [ ] Export CSV from test data
3. [ ] Upload via modal
4. [ ] Review preview
5. [ ] Click Import
6. [ ] Verify attendance created
7. [ ] Check attendance %ages
8. [ ] Verify watch list updated

**Workflow 3: Email Follow-up**
1. [ ] Create meeting with absences
2. [ ] Click "Send absence emails"
3. [ ] Confirm recipients
4. [ ] Verify email sent
5. [ ] Check follow-up logged in DB
6. [ ] Verify email_status = 'sent'

**Workflow 4: Mobile Navigation**
1. [ ] Open on mobile (375px)
2. [ ] See meeting list
3. [ ] Click meeting → detail view
4. [ ] Click back button → list view
5. [ ] Filter works in list view
6. [ ] Detail scrollable
7. [ ] Touch targets big enough

---

## Performance Testing

### Load Time Benchmarks

**CSV Parsing:**
- [ ] 100 records: <100ms
- [ ] 500 records: <200ms
- [ ] 1000 records: <500ms

**Person Matching:**
- [ ] Single match: <50ms
- [ ] 100 matches: <2 sec
- [ ] Fuzzy matching: <100ms per person

**Batch Import:**
- [ ] 50 records: <1 sec
- [ ] 500 records: <2 sec
- [ ] 1000 records: <5 sec

**Database Queries:**
- [ ] getAbsenceFollowupsByMeeting: <100ms
- [ ] getDeptMeetings (50 meetings): <200ms
- [ ] recalculateAttendanceTrends: <1 sec

**Monitor with:**
```javascript
console.time('import-csv')
await importElvantoAttendance(records, meetingId)
console.timeEnd('import-csv')
```

---

## Test Data

### Sample CSV for Testing

```csv
Meeting,Date,Time,PersonName,PersonID,Status,Percentage
Foundation School Leads,2024-06-16,14:00,Amara D.,person_123,Present,100%
Foundation School Leads,2024-06-16,14:00,Grace M.,person_456,Present,96%
Foundation School Leads,2024-06-16,14:00,Joel O.,person_789,Present,88%
Pastors Cell Leaders,2024-06-15,18:00,David T.,person_101,Absent,92%
Media Production,2024-06-13,10:00,Sarah E.,person_202,Absent,64%
```

### Test Users (Database)

Create these test users for matching tests:

| ID | Name | External ID |
|----|------|-------------|
| user-1 | Amara D. | person_123 |
| user-2 | Grace M. | person_456 |
| user-3 | Joel O. | person_789 |
| user-4 | David T. | person_101 |
| user-5 | Sarah E. | person_202 |

---

## Known Issues & Workarounds

### Issue 1: Modal Closes on Backdrop Click
**Status:** Expected behavior
**Workaround:** Click only on modal content, not overlay

### Issue 2: CSV Parser Doesn't Handle "," in Values
**Status:** Known limitation
**Workaround:** Use quotes in CSV: `"Smith, John"` if names contain commas

### Issue 3: Large CSV Files (10000+) Slow
**Status:** Normal (browsers have memory limits)
**Workaround:** Split into smaller batches (500 records each)

---

## Continuous Integration

### CI/CD Tests to Run

```bash
# Build
npm run build

# Unit tests (if configured)
npm test

# Lint
npm run lint

# Type check
npm run type-check
```

### Pre-deployment Checklist

- [ ] npm run build passes
- [ ] No console errors
- [ ] All manual tests pass
- [ ] Accessibility tests pass
- [ ] Performance benchmarks met
- [ ] Database migrations applied
- [ ] RLS policies enabled
- [ ] Environment variables configured

---

## Reporting Bugs

**Template:**

```
**Title:** [Component] Brief description

**Steps to Reproduce:**
1. Step 1
2. Step 2
3. Step 3

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happened

**Environment:**
- Browser: Chrome 120
- OS: Windows 11
- Device: Desktop

**Screenshots/Logs:**
Paste any error messages
```

---

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Testing Library Docs](https://testing-library.com/)
- [Vitest Docs](https://vitest.dev/)

---

**Last Updated:** June 2024  
**Maintained By:** Development Team  
**Related Docs:** [ELVANTO_ATTENDANCE_IMPORT.md](./ELVANTO_ATTENDANCE_IMPORT.md), [Meetings Architecture](./MEETINGS.md)
