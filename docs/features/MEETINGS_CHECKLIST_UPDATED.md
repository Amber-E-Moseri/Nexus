# Meetings Module — Sprint Checklist (UPDATED)

**Status:** MVP Phase (Weeks 1-6 largely complete, Phases 7-8 in progress)  
**Current Date:** 2026-06-19  
**Owner:** Amber  

---

## Quick Reference
**Primary UI Layout:** Timeline Ledger + Workspace (2-panel layout operational)  
**Key Integrations:** Department board (action items), Resend (emails), Department filters  
**Core Data Models:** Meetings, Segments, Attendance, Actions, Minutes, EmailLogs  

---

## MVP Sprint: Phase 1–5 (✅ LARGELY COMPLETE)

### Week 1: Foundation & Meetings CRUD ✅
- [x] Database schema: meetings, meeting_segments, meeting_attendance
- [x] RLS policies (moderator can edit own meeting, all users read)
- [x] Create meeting form (title, dept, date, moderator, location, description)
- [x] Fetch meetings from DB (paginated, sorted by date DESC)
- [x] Update meeting (edit all fields)
- [x] Delete/archive meeting (soft delete)
- [x] Auth check (user is moderator or admin)

**Status:** ✅ DONE  
**Files:** `src/lib/meetings.js`, `src/modules/meetings/MeetingModal.jsx`

---

### Week 2: Overview Layout (Timeline Ledger) ✅
- [x] Main Meetings page container
- [x] Timeline vertical layout (CSS grid or absolute positioning)
- [x] Date column (position absolute -74px, show "Jun 16")
- [x] Timeline gradient line component
- [x] Meeting card component (title, summary, footer with attendees + action count)
- [x] Department filter chip row (All, General, Admin, Media, Pastors)
- [x] Stats strip (6 logged, 9 actions, 5 minutes, 5 depts)
- [x] Fetch & render meetings based on selected department
- [x] Pagination (load more / infinite scroll)

**Status:** ✅ DONE  
**Files:** `src/pages/meetings/MeetingsModule.jsx`, `src/modules/meetings/MeetingsList.jsx`  
**Layout:** Category-based filtering with type chips (general, team, media, department)

---

### Week 3: Agenda Builder ✅
- [x] Agenda builder page/modal
- [x] Progress stepper (Setup ✓ → Agenda → Preview)
- [x] Agenda table (4 columns: Segment, Anchor, Timing, Mins)
- [x] Drag-reorder segments (integrate @dnd-kit)
- [x] Intro Music pinned row (uneditable, 0 mins)
- [x] "+ Add segment" button (creates new row)
- [x] Timing auto-calculation (sum of all segment durations)
- [x] Overtime warning banner (show if total > planned)
- [x] Save agenda to meeting record
- [x] agenda_items table in DB

**Status:** ✅ DONE  
**Files:** `src/pages/meetings/MeetingWizardPage.jsx`, `src/modules/agendas/Step2BuildAgenda.jsx`  
**Database:** `agendas`, `agenda_items` tables with RLS policies

---

### Week 4: Attendance Tracking ⚠️ PARTIAL
- [x] Attendance roster component (list of expected attendees)
- [x] Status badges (Present/Absent)
- [ ] "Mark all present" button
- [x] "Edit roster" (add/remove people)
- [x] Attendance trend component (bar chart, last 6 meetings)
- [x] Average % display
- [x] Watch list (people with <80% attendance)
- [x] meeting_attendance table in DB
- [x] Query last N meetings, calculate attendance trends

**Status:** ⚠️ MOSTLY DONE (missing batch mark-present)  
**Files:** `src/modules/meetings/MeetingReportTab.jsx`  
**Database:** `meeting_attendance_reports`, `attendance_trends` with RLS

---

### Week 5: Live Meeting Mode ✅
- [x] Live meeting entry point ("Start live" button)
- [x] Live top bar (dark, LIVE badge, timer, Pause + End buttons)
- [x] Timer component (elapsed time, updates every 1s)
- [x] Three-column layout:
  - [x] Left: Agenda checklist (mark items done)
  - [x] Center: Live notes textarea (auto-save to sessionStorage)
  - [x] Right: Attendance + Captured Actions
- [x] "Capture action item" button (dialog to enter task + assignee + due)
- [x] Real-time action list (right panel)
- [x] "Next item →" button (advance agenda)
- [x] "End & save minutes" button

**Status:** ✅ DONE  
**Files:** `src/modules/meetings/LiveMinutesMode.jsx`

---

### Week 6: Minutes & Email Follow-up ⚠️ PARTIAL
- [x] Generate minutes from notes + action items
- [x] minutes stored in meeting.minutes field
- [x] Absence follow-up component (detect no-shows)
- [x] Auto-draft email (subject + body template)
- [x] Recipient chip (person + avatar)
- [x] Attachments preview (Minutes.pdf) — *Stub only*
- [x] "Send now" button (call Resend API)
- [x] "Edit draft" (modify before send)
- [ ] absence_follow_ups table (need to create)
- [x] Integrate Resend API (test key, email sending)
- [x] "End & save minutes" workflow

**Status:** ⚠️ MOSTLY DONE (need absence_follow_ups table for tracking)  
**Files:** `src/modules/meetings/MeetingReportTab.jsx`, `ActionItemBridge.jsx`

---

## Post-MVP Enhancements: Phase 6–8 (IN PROGRESS)

### Week 7: Workspace Layout & Polish ✅
- [x] Two-Pane Workspace layout (alternative view)
  - [x] Left list rail (260px, sectioned "This week"/"Last week")
  - [x] Right detail panel with tabs (Summary, Agenda, Attendance, Actions, Minutes)
  - [x] Tab switching logic
  - [x] "Switch layout" toggle (Timeline vs Workspace)
- [x] UI polish (hover states, transitions, shadows)

**Status:** ✅ DONE  
**Files:** `src/modules/meetings/MeetingsWorkspace.jsx`, `src/modules/meetings/MeetingRecordTabs.jsx`  
**Latest Commit:** `46d6e03` - Workspace 2-panel layout with planning and logging workflows

---

### Week 8: Card Gallery Layout 📋 TODO
- [ ] Card Gallery layout (2-column grid)
- [ ] Card component with 6px color bar
- [ ] Color bar mapping (dept → color)
- [ ] Attendee stack + action count footer
- [ ] Filter persistence (remember selected dept)

**Status:** 📋 NOT STARTED

---

### Week 9: Department Board Integration ⚠️ PARTIAL
- [x] API call to post action items to department board when meeting ends
- [x] Verify action items appear on board after "End & save minutes"
- [x] Link action items back to originating meeting
- [x] Test with board module

**Status:** ⚠️ IMPLEMENTED (ActionItemBridge.jsx)  
**Files:** `src/modules/meetings/ActionItemBridge.jsx`

---

### Week 10: Reports & Analytics ⚠️ PARTIAL
- [x] Meeting count widget (all-time, last 30 days) — **KPI tiles on main page**
- [x] Department breakdown (5 depts)
- [x] Action completion rate (% done) — **Partial, in MeetingReportTab**
- [x] Attendance trends chart (org-wide)
- [x] Most-missed people list (watch list)

**Status:** ⚠️ MOSTLY DONE (Attendance trends full, analytics partial)  
**Files:** `src/modules/meetings/MeetingReportTab.jsx` (94KB, comprehensive)

---

### Week 11: Mobile & Accessibility 📋 TODO
- [ ] Mobile responsive (hamburger sidebar, stack columns)
- [ ] Touch-friendly buttons (44px+ min)
- [ ] Keyboard navigation (Tab, Enter, Escape)
- [ ] ARIA labels (buttons, headings, lists)
- [ ] Focus indicators (outline on all interactive)
- [ ] Color contrast check (WCAG AA)
- [ ] Test with screen reader

**Status:** 📋 NOT STARTED  
**Note:** Current workspace layout may need responsive adjustments

---

### Week 12: Testing & Launch 📋 PARTIAL
- [ ] Unit tests (agenda timing calc, attendance %)
- [ ] Integration tests (create meeting → live → email)
- [ ] E2E tests (full user workflow)
- [ ] Manual testing (all layouts, tabs, live mode)
- [x] Performance testing (50+ meetings load time)
- [ ] User guide / documentation
- [ ] Soft launch (pilot group feedback)
- [ ] Full rollout

**Status:** 📋 NEEDS WORK

---

## Immediate Blockers & Open Items

### 1. **Attendance Batch Actions**
   - Missing: "Mark all present" button
   - Location: `MeetingReportTab.jsx`
   - Effort: ~30 min

### 2. **Absence Follow-up Table**
   - Need to create `absence_follow_ups` table in Supabase
   - Track sent emails, status, timestamps
   - Add RLS policies
   - Effort: ~45 min

### 3. **Mobile Responsiveness**
   - Workspace 2-panel layout needs testing on mobile
   - May need hamburger toggle for left sidebar
   - Button sizes (44px+ min)
   - Effort: ~2-3 hours

### 4. **Card Gallery Layout**
   - Alternative view option (Timeline, Workspace, Gallery)
   - Not started
   - Effort: ~4-5 hours

### 5. **Accessibility Audit**
   - ARIA labels, focus indicators, keyboard nav
   - Screen reader testing
   - Color contrast check
   - Effort: ~3-4 hours

### 6. **Testing & Documentation**
   - Unit tests for agenda timing
   - E2E test suite
   - User guide
   - Effort: ~6-8 hours

---

## Database Schema Summary

```sql
-- Core Tables
- meetings (id, title, department_id, date, meeting_type, agenda, minutes, transcript, summary, zoom_join_url, drive_url, created_by, created_at)
- agendas (id, name, meeting_type, theme, created_by, created_at, status)
- agenda_items (id, agenda_id, sequence, title, type, duration_minutes, notes, created_at)
- meeting_attendance (id, meeting_id, user_id, status, attendance_percentage, marked_at)
- tasks (id, title, meeting_id, assigned_to_id, due_date, status_id, ...) — linked to meetings

-- Reporting Tables
- meeting_attendance_reports (meeting_id, dept_id, present_count, absent_count, total, attendance_pct)
- attendance_trends (user_id, dept_id, last_6_meetings, avg_attendance_pct, watch_list)

-- Email Tracking (NEED TO CREATE)
- absence_follow_ups (id, meeting_id, recipient_id, subject, body, status, sent_at)
```

---

## File Structure

```
src/
├── pages/meetings/
│   ├── MeetingsModule.jsx          ✅ Main container, KPI tiles, dept filters
│   ├── MeetingWizardPage.jsx       ✅ 3-step agenda planner
│   └── ExpectedAttendeesPage.jsx   ✅ Roster management
├── modules/meetings/
│   ├── MeetingsList.jsx            ✅ Category-based list view
│   ├── MeetingsWorkspace.jsx       ✅ 2-panel workspace layout
│   ├── MeetingCard.jsx             ✅ Card component
│   ├── MeetingModal.jsx            ✅ Create/edit modal
│   ├── MeetingRecordTabs.jsx       ✅ Tabbed detail view (Summary, Agenda, Attendance, Actions, Minutes)
│   ├── MeetingReportTab.jsx        ✅ Analytics & reporting (94KB)
│   ├── LiveMinutesMode.jsx         ✅ Live meeting workspace
│   ├── ActionItemBridge.jsx        ✅ Post to board integration
│   └── MeetingsContext.jsx         ✅ State management
├── modules/agendas/
│   ├── Step1MeetingSetup.jsx       ✅ Meeting details form
│   ├── Step2BuildAgenda.jsx        ✅ Agenda item builder
│   └── Step3PreviewExport.jsx      ✅ Preview & export
└── lib/
    └── meetings.js                  ✅ CRUD operations
```

---

## Completed Features

### ✅ CRUD Operations
- Create meetings (quick-add or form)
- Read & filter by department
- Update meeting details
- Soft delete (archive)

### ✅ Agenda Planning
- 3-step wizard with validation
- Drag-reorder agenda items
- Auto-calculate total duration
- Overtime warning
- Save to meeting record

### ✅ Attendance Tracking
- Mark attendees present/absent
- Roster view with avatars
- Attendance % by person
- Trends over last 6 meetings
- Watch list (below 80%)
- Batch operations (missing: mark all present)

### ✅ Live Meeting Mode
- Timer & LIVE badge
- Agenda checklist
- Live notes (sessionStorage)
- Capture action items on-the-fly
- Next item navigation
- End & save workflow

### ✅ Reporting & Analytics
- KPI tiles (logged, actions, minutes, depts)
- Meeting count by type
- Department breakdown
- Action completion tracking
- Attendance trends
- Most-missed people

### ✅ Workspace Features
- 2-panel layout (list + detail)
- Tabbed record view
- Quick dept switching
- Filter by type
- Plan/Log/Live buttons

### ✅ Email Integrations
- Absence follow-up drafting
- Resend API integration
- Template-based emails
- Edit before send

---

## Next Steps (Priority Order)

1. **[HIGH]** Create `absence_follow_ups` table + RLS (~30 min)
2. **[HIGH]** Add "Mark all present" batch action (~30 min)
3. **[MEDIUM]** Mobile responsiveness testing & fixes (~2 hrs)
4. **[MEDIUM]** Accessibility audit + fixes (~3-4 hrs)
5. **[LOW]** Card Gallery layout (alternative view) (~4-5 hrs)
6. **[LOW]** Unit & E2E tests (~6-8 hrs)
7. **[LOW]** User guide & soft launch prep (~4 hrs)

---

## Estimated Remaining Effort

| Task | Effort | Complexity |
|------|--------|-----------|
| Database cleanup | 30 min | Low |
| Batch actions | 30 min | Low |
| Mobile responsiveness | 2 hrs | Medium |
| Accessibility | 3-4 hrs | Medium |
| Card Gallery | 4-5 hrs | Medium |
| Testing + docs | 6-8 hrs | Medium |
| **TOTAL** | **~16-18 hours** | **Medium** |

---

## Done Criteria (MVP)

✅ **MVP Done when:**
- [x] Can create a meeting (title, date, moderator, department, location)
- [x] Can see all meetings in Timeline/Workspace view (date-sorted, dept-filtered)
- [x] Can build an agenda (add segments, set anchor person & timing)
- [x] Can mark attendance (roster, present/absent)
- [x] Can run a live meeting (notes, actions, agenda checklist)
- [x] Can save minutes and send absence follow-up email
- [x] All visible in UI without console errors
- [ ] Mobile-responsive (basic)
- [ ] User guide written

✅ **Launch Ready when:**
- All above + mobile & accessibility fixes
- Tested with 2–3 pilot users
- Performance acceptable (50+ meetings load <2s)
- No critical bugs
- Full test coverage

---

## Commits Since Phase Start

| Commit | Date | Feature |
|--------|------|---------|
| 46d6e03 | Jun 19 | Workspace 2-panel layout + planning workflows |
| 6852ef3 | Jun 18 | Category-based Meetings Log redesign |
| b041370 | Jun 9 | Workspace + Live Minutes + Tabbed records |
| 5a52bc8 | Jun 8 | KPI tiles + Log/Workspace toggle |

---

**Last Updated:** 2026-06-19 by Claude Code  
**Review Status:** Ready for team review & next sprint planning
