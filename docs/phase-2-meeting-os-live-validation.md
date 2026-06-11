# Phase 2 — Meeting OS Live Validation

## Purpose

Validate the Meeting OS implementation against the live Supabase environment before marking Phase 2 production-complete.

## Scope

This phase validates:

- Meeting creation
- Meeting permissions
- Agenda management
- Attendance tracking
- Minutes
- Action items
- Meeting files
- Meeting-to-task workflow
- Meeting visibility
- Dashboard integration

This is not feature work.

Do not add new functionality during validation unless required to fix a defect discovered during testing.

---

## 1. Pre-validation Preparation

### Backup recommendations

- Create a Supabase dashboard backup/export if available on the current plan.
- Run a local database dump before testing:
  - `supabase db dump -f supabase-backup-pre-phase2-validation.sql`
- Record the active project ref and environment being tested.

### Current migration verification

- Confirm the required migrations are applied:
  - `20260608_phase1_blw_canada_os.sql`
  - `20260609_phase1_5_user_lifecycle.sql`
  - `20260610_phase1_6_invitation_delivery.sql`
  - `20260612_phase2_meeting_task_fk.sql`
- Run:
  - `supabase migration list`

### Environment verification

- Confirm the frontend is pointed at the correct Supabase project.
- Confirm the app environment variables are correct.
- Confirm `VITE_MEETING_OS_URL` resolves to the correct standalone Meeting OS instance if used in validation.

### Branch verification

- Confirm local branch is clean:
  - `git status`
- Confirm the exact commit or branch under validation.

### Test account preparation

Prepare and verify these accounts:

- `super_admin`
- `dept_lead`
- `pastor`
- `member`

For each account, record:

- Email
- Role
- Department
- Expected access level

---

## 2. Meeting Creation Validation

### Create meeting

**Preconditions**
- Logged in as authorized role
- Target department/space exists

**Steps**
- Open meetings UI
- Create a meeting
- Save

**Expected Result**
- Meeting is created successfully
- Meeting appears in the correct space/department

**Pass/Fail:** __________  
**Notes:** __________

### Edit meeting

**Preconditions**
- Existing meeting visible to user

**Steps**
- Open meeting
- Edit fields
- Save

**Expected Result**
- Changes persist
- Updated meeting remains visible to authorized users

**Pass/Fail:** __________  
**Notes:** __________

### Cancel meeting

**Preconditions**
- Existing editable meeting

**Steps**
- Start editing
- Cancel/close without saving

**Expected Result**
- Unsaved changes are not persisted

**Pass/Fail:** __________  
**Notes:** __________

### Delete meeting if supported

**Preconditions**
- Existing meeting

**Steps**
- Attempt delete through supported UI or workflow

**Expected Result**
- Delete succeeds only if supported and permitted
- Meeting is removed from visible lists

**Pass/Fail:** __________  
**Notes:** __________

### Visibility checks

Verify:

- Meeting appears in correct space
- Meeting appears for authorized users
- Meeting does not appear for unauthorized users

**Pass/Fail:** __________  
**Notes:** __________

---

## 3. Agenda Validation

### Add agenda item

**Preconditions**
- Existing editable meeting

**Steps**
- Add agenda item
- Save

**Expected Result**
- Agenda item is stored and shown correctly

**Pass/Fail:** __________  
**Notes:** __________

### Edit agenda item

**Preconditions**
- Existing agenda item

**Steps**
- Edit item
- Save

**Expected Result**
- Updated agenda item persists

**Pass/Fail:** __________  
**Notes:** __________

### Remove agenda item

**Preconditions**
- Existing agenda item

**Steps**
- Remove item
- Save

**Expected Result**
- Agenda item is removed

**Pass/Fail:** __________  
**Notes:** __________

### Reorder agenda items if supported

**Preconditions**
- Multiple agenda items

**Steps**
- Reorder items
- Save

**Expected Result**
- Order persists after refresh

**Pass/Fail:** __________  
**Notes:** __________

### Persistence and access

Verify:

- Agenda persists after refresh
- Agenda visible to authorized users only

**Pass/Fail:** __________  
**Notes:** __________

---

## 4. Attendance Validation

### Mark attendee present

**Preconditions**
- Existing meeting
- Attendance UI available

**Steps**
- Mark user present
- Save

**Expected Result**
- Status saved correctly

**Pass/Fail:** __________  
**Notes:** __________

### Mark attendee absent

**Preconditions**
- Existing meeting

**Steps**
- Mark user absent
- Save

**Expected Result**
- Status saved correctly

**Pass/Fail:** __________  
**Notes:** __________

### Save attendance

**Preconditions**
- Attendance changes made

**Steps**
- Save

**Expected Result**
- Attendance persists after refresh
- Attendance updates correctly

**Pass/Fail:** __________  
**Notes:** __________

### Permission check

Verify:

- Unauthorized users cannot modify attendance

**Pass/Fail:** __________  
**Notes:** __________

---

## 5. Minutes Validation

### Create minutes

**Preconditions**
- Existing meeting

**Steps**
- Add minutes
- Save

**Expected Result**
- Minutes saved successfully

**Pass/Fail:** __________  
**Notes:** __________

### Edit minutes

**Preconditions**
- Existing saved minutes

**Steps**
- Edit minutes
- Save

**Expected Result**
- Changes persist

**Pass/Fail:** __________  
**Notes:** __________

### Refresh validation

**Preconditions**
- Minutes saved

**Steps**
- Refresh page
- Reopen meeting

**Expected Result**
- Minutes remain intact

**Pass/Fail:** __________  
**Notes:** __________

### Permission check

Verify:

- Permission rules are respected for viewing/editing minutes

**Pass/Fail:** __________  
**Notes:** __________

---

## 6. Action Item Validation

### Create action item

**Preconditions**
- Existing meeting

**Steps**
- Add action item
- Save

**Expected Result**
- Action item is created successfully

**Pass/Fail:** __________  
**Notes:** __________

### Edit action item

**Preconditions**
- Existing action item

**Steps**
- Edit action item
- Save

**Expected Result**
- Changes persist

**Pass/Fail:** __________  
**Notes:** __________

### Assign action item

**Preconditions**
- Existing action item
- Valid assignee exists

**Steps**
- Assign user
- Save

**Expected Result**
- Assignee saved correctly

**Pass/Fail:** __________  
**Notes:** __________

### Due date assignment

**Preconditions**
- Existing action item

**Steps**
- Add due date
- Save

**Expected Result**
- Due date persists

**Pass/Fail:** __________  
**Notes:** __________

### Status updates

**Preconditions**
- Existing action item or linked task

**Steps**
- Update status

**Expected Result**
- Status reflects correctly in meeting/task flow

**Pass/Fail:** __________  
**Notes:** __________

### End-to-end workflow

Validate this complete chain:

```text
Meeting
↓
Action Item
↓
Task Creation
↓
Task Assigned
↓
Visible in My Work
```

**Preconditions**
- Existing meeting
- Valid assignee with task visibility

**Steps**
- Create action item
- Convert or sync to task
- Assign to user
- Open assigned user’s My Work view

**Expected Result**
- Task is created correctly
- Task is assigned correctly
- Task appears in My Work

**Pass/Fail:** __________  
**Notes:** __________

---

## 7. Meeting Files Validation

### Upload/add file

**Preconditions**
- Existing meeting
- Files workflow available

**Steps**
- Add file or file link

**Expected Result**
- File record is created and visible

**Pass/Fail:** __________  
**Notes:** __________

### Open file

**Preconditions**
- Existing meeting file

**Steps**
- Open file/link

**Expected Result**
- File opens correctly

**Pass/Fail:** __________  
**Notes:** __________

### Remove file if supported

**Preconditions**
- Existing removable file

**Steps**
- Remove file

**Expected Result**
- File is removed successfully

**Pass/Fail:** __________  
**Notes:** __________

### Refresh validation

**Preconditions**
- File added

**Steps**
- Refresh page
- Reopen meeting

**Expected Result**
- File persists if not removed

**Pass/Fail:** __________  
**Notes:** __________

### Permission checks

Verify:

- Authorized users can access
- Unauthorized users cannot access

**Pass/Fail:** __________  
**Notes:** __________

---

## 8. Permission & RLS Validation

Validate both UI access and direct API/RPC access.

### `super_admin`

- Full access

**Pass/Fail:** __________  
**Notes:** __________

### `dept_lead`

- Own department meetings only

**Pass/Fail:** __________  
**Notes:** __________

### `pastor`

- Appropriate read access

**Pass/Fail:** __________  
**Notes:** __________

### `member`

- Limited access according to role rules

**Pass/Fail:** __________  
**Notes:** __________

### RLS validation summary

- [ ] UI access matches role rules
- [ ] Direct API/RPC access matches role rules
- [ ] No unauthorized cross-department access

---

## 9. Dashboard Integration Validation

Verify:

- Upcoming meetings widget
- Meeting counts
- Meeting status indicators
- Recent activity updates

Ensure dashboard values match actual data.

For each validated item:

- **Pass/Fail:** __________
- **Notes:** __________

---

## 10. Regression Testing

Verify:

- [ ] Tasks still work
- [ ] My Work still works
- [ ] People module still works
- [ ] Invitations still work
- [ ] Dashboard still loads
- [ ] Navigation still works

### Build verification

- `npm run build`

- [ ] Build passes

---

## 11. Defect Policy

- Fix only defects discovered during validation.
- Do not add new Meeting OS features.
- Any RLS defect blocks production completion.
- Any Meeting → Task failure blocks production completion.
- Cosmetic issues may be triaged separately.

---

## 12. Sign-Off Matrix

| Area | Tester | Date | Result | Defects Linked | Approved By |
|---|---|---|---|---|---|
| Meeting Creation |  |  |  |  |  |
| Agenda |  |  |  |  |  |
| Attendance |  |  |  |  |  |
| Minutes |  |  |  |  |  |
| Action Items |  |  |  |  |  |
| Meeting Files |  |  |  |  |  |
| Permissions |  |  |  |  |  |
| Dashboard Integration |  |  |  |  |  |
| Regression Testing |  |  |  |  |  |

---

## 13. Exit Criteria

Phase 2 is production-complete when:

- [ ] Meeting creation passes
- [ ] Agenda passes
- [ ] Attendance passes
- [ ] Minutes pass
- [ ] Action Item → Task workflow passes
- [ ] Permissions pass
- [ ] Dashboard integration passes
- [ ] Regression testing passes
- [ ] No critical RLS defects remain
- [ ] No critical Meeting → Task defects remain
