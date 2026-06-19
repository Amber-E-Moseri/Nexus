# Meetings Module - UAT Checklist & Bug Fixes

## UAT Overview

**Scope:** Elvanto CSV import, absence follow-ups, mobile responsiveness, accessibility  
**Duration:** 2 hours  
**Tester Role:** Product owner, stakeholder, or QA lead  
**Success Criteria:** All blockers passed, critical bugs fixed, known issues logged

---

## Priority 1: Critical Functionality

### CSV Import Pipeline
- [ ] Upload Elvanto CSV file (test data provided)
- [ ] Preview shows correct record count (5 records expected)
- [ ] Click Import → records created in database
- [ ] Verify attendance_percentage calculated correctly
- [ ] Toast message confirms success
- [ ] Mismatches (if any) listed by person name

**Expected Result:** ✅ All 5 records imported, 0 mismatches

**If it fails:**
- Check CSV column headers match (Meeting, Date, PersonName, Status)
- Verify test users exist in database
- Check RLS policies allow INSERT

### Person Matching
- [ ] Test matching by external ID (PersonID)
- [ ] Test matching by exact name
- [ ] Test fuzzy matching (initials "A.D." matches "Amara D.")
- [ ] Verify mismatch logged for unknown person
- [ ] Import continues after mismatch (partial import)

**Expected Result:** ✅ Matching works for 3/4 test people

**If it fails:**
- Check users table has external_id values
- Verify fuzzy match logic handles whitespace
- Check database logs for query errors

### Attendance Trends
- [ ] After import, user attendance % is calculated
- [ ] Watch list (<75%) updated
- [ ] Meeting detail shows attendance for imported people
- [ ] Trends persist across sessions

**Expected Result:** ✅ Attendance % shows 80-100% for imported records

**If it fails:**
- Check `recalculateAttendanceTrends()` called after import
- Verify users.attendance_percentage updated in DB
- Check aggregation math (present / total)

### Absence Follow-up Emails
- [ ] Create meeting with absent person
- [ ] Click "Send absence emails"
- [ ] Confirm recipients shown
- [ ] Click "Send Emails" → success
- [ ] Check email logged to absence_follow_ups table
- [ ] Verify email_status = 'sent'

**Expected Result:** ✅ Email logged, status='sent', sent_at populated

**If it fails:**
- Check RLS policies on absence_follow_ups table
- Verify department_id passed correctly
- Check email function returns success

---

## Priority 2: User Experience

### Mobile Responsiveness
**Device:** iPhone 12 (375px) or browser dev tools

- [ ] List view: meetings displayed as scrollable list
- [ ] Click meeting → shows detail (list hidden)
- [ ] Back button visible in detail
- [ ] Click back → returns to list
- [ ] Filters work in list view
- [ ] Date/time readable (no overlap)
- [ ] Buttons 44px+ (easy tap)
- [ ] No horizontal scroll

**Expected Result:** ✅ Touch-friendly, one pane at a time

**If it fails:**
- Check useMediaQuery detecting 640px breakpoint
- Verify back button styling (min 44px)
- Check padding for mobile viewport (12px added)

### Tablet (768px)
- [ ] Both list and detail visible
- [ ] Side-by-side layout
- [ ] List width adequate (not too narrow)
- [ ] Detail scrollable without list
- [ ] Card gallery shows 2 columns

**Expected Result:** ✅ Split-screen layout works

**If it fails:**
- Check flex ratios (list: 0 0 340px, detail: flex 1)
- Verify overflow auto on both panes

### Desktop (1280px)
- [ ] List on left (340px), detail on right
- [ ] Card gallery shows 3+ columns
- [ ] View toggle visible (List/Grid icons)
- [ ] Switch between list and card view
- [ ] Start live button visible
- [ ] No overlap or cutoff

**Expected Result:** ✅ Full 2-pane layout, toggle works

**If it fails:**
- Check viewMode state
- Verify CardGalleryView renders correctly
- Check grid template columns (minmax 280px)

---

## Priority 3: Accessibility

### Keyboard Navigation
- [ ] Tab through all buttons
- [ ] Focus ring visible (blue outline)
- [ ] Tab order logical (left to right, top to bottom)
- [ ] No keyboard traps
- [ ] Escape closes modals
- [ ] Enter activates buttons

**Expected Result:** ✅ Full keyboard control, no traps

**If it fails:**
- Check focus-visible styles applied
- Verify tabindex not breaking order
- Check modal has trap logic for Escape

### Screen Reader (Test with NVDA or JAWS)
- [ ] Modal announced as "dialog"
- [ ] Modal title announced
- [ ] "Import Attendance from Elvanto" heard
- [ ] "Upload" button announced clearly
- [ ] Decorative icons ignored
- [ ] Error messages announced
- [ ] "Imported 5 records" toast announced

**Expected Result:** ✅ Content navigable by screen reader

**If it fails:**
- Check aria-modal="true" on dialog
- Verify aria-labelledby linked to title
- Check aria-hidden on decorative elements
- Verify role="dialog" present

### Color Contrast
Test with [WAVE Browser Extension](https://wave.webaim.org/)

- [ ] Text: contrast ratio >4.5:1
- [ ] UI components: >3:1
- [ ] Type badges (purple, blue, orange): pass contrast
- [ ] Status indicators: not color-only

**Expected Result:** ✅ All elements AA compliant

**If it fails:**
- Check color values in CSS
- Adjust background/text colors
- Use color + icon for status (not color alone)

---

## Known Issues & Fixes

### Issue 1: Modal doesn't close on Escape key
**Status:** ✅ FIXED (Key press handler added)
**Fix Commit:** 175f8e6
**Test:** Press Escape in import modal → closes

### Issue 2: Meeting list jumps after import
**Status:** ⏳ PENDING FIX
**Workaround:** Reload page
**Fix Plan:** Add loading state, preserve scroll position

### Issue 3: Card gallery shows too many columns on ultra-wide screens
**Status:** ✅ FIXED (minmax 280px constraint added)
**Fix Commit:** a5a6690
**Test:** View on 2560px monitor → max 8-9 columns

### Issue 4: Back button missing aria-label
**Status:** ✅ FIXED (aria-label added)
**Fix Commit:** 175f8e6
**Test:** Screen reader announces "Back to meetings list"

---

## Bug Report Template

If you find an issue during UAT, please document:

```
**Title:** [Component] Bug description
Example: [AttendanceImportModal] "Import" button doesn't disable when CSV invalid

**Priority:** Critical / High / Medium / Low

**Steps to Reproduce:**
1. Step 1
2. Step 2
3. Step 3

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happens (include error messages)

**Screenshots:**
[Attach screenshot or screencast]

**Browser/Device:**
- Browser: Chrome 120
- OS: Windows 11
- Device: Desktop / iPhone 12 / iPad

**Status:**
- [ ] New
- [ ] Investigating
- [ ] Fixed
- [ ] Won't Fix (if deferred)

**Fix Notes:**
[If already fixed, note the commit hash]
```

---

## Sign-Off

After completing UAT, stakeholder confirms:

- [ ] Critical functionality works end-to-end
- [ ] Mobile/tablet layouts responsive
- [ ] Accessibility passes (keyboard, screen reader)
- [ ] Known issues are acceptable or fixed
- [ ] Ready for production deployment

**Tester Name:** ___________________  
**Date:** ___________________  
**Status:** ☐ Pass ☐ Pass with fixes ☐ Fail

---

## Quick Reference: Test Data

### Test CSV
```csv
Meeting,Date,Time,PersonName,PersonID,Status,Percentage
Q2 Planning,2024-06-20,10:00,Amara D.,person_123,Present,100%
Q2 Planning,2024-06-20,10:00,Grace M.,person_456,Present,96%
Q2 Planning,2024-06-20,10:00,Joel O.,person_789,Present,88%
Q2 Planning,2024-06-20,10:00,David T.,person_101,Absent,92%
Q2 Planning,2024-06-20,10:00,Unknown Person,,Absent,50%
```

### Test Users (Must exist in DB)
- Amara D. (external_id: person_123)
- Grace M. (external_id: person_456)
- Joel O. (external_id: person_789)
- David T. (external_id: person_101)
- Sarah E. (external_id: person_202)

### Test Meeting
- Title: Q2 Planning
- Date: 2024-06-20
- Type: General

---

## Post-UAT Checklist

After sign-off:

- [ ] Document all findings in this checklist
- [ ] Create issues for any bugs not fixed
- [ ] Update known issues section
- [ ] Get stakeholder sign-off
- [ ] Deploy to staging
- [ ] Run smoke tests
- [ ] Deploy to production
- [ ] Monitor error logs (24 hours)
- [ ] Collect user feedback

---

**Last Updated:** June 19, 2024  
**Version:** 1.0  
**Related Docs:** [MEETINGS_TESTING_GUIDE.md](./MEETINGS_TESTING_GUIDE.md), [ELVANTO_ATTENDANCE_IMPORT.md](./ELVANTO_ATTENDANCE_IMPORT.md)
