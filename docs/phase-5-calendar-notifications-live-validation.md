# Phase 5 â€” Calendar + Notifications Live Validation

## Purpose

Validate the Phase 5 calendar and notifications patch against the live Supabase project before marking the phase production-complete.

This phase is not new feature work. It validates the migration, RLS, calendar CRUD, event type display, MiniCalendar embeds, notification bell behavior, realtime delivery, notification triggers, dashboard widget behavior, and related regression coverage added in Phase 5.

---

## 1. Pre-migration backup

Complete these steps before applying `20260615_phase5_calendar_notifications.sql`.

### Backup checklist

- Create a Supabase backup/export from the Supabase dashboard if that option is available on the current plan.
- Run a local SQL dump:
  - `supabase db dump -f supabase-backup-pre-phase5.sql`
- Confirm the current migration state:
  - `supabase migration list`
- Confirm the local git branch is clean:
  - `git status`
- Confirm the target Supabase project is the correct production or staging project before applying anything.

### Pre-migration sign-off

- [ ] Dashboard backup/export created or confirmed unavailable
- [ ] `supabase db dump` completed
- [ ] Current migration version recorded
- [ ] Local branch clean
- [ ] Correct Supabase project confirmed

---

## 2. Migration apply checklist

Apply and verify the Phase 5 migration.

### Apply

- `supabase db push`

### Verify migration application

- Confirm `supabase/migrations/20260615_phase5_calendar_notifications.sql` is included in the applied migration set.
- Re-run:
  - `supabase migration list`
- Check CLI output for any migration errors, duplicate-policy errors, or constraint failures.

### Post-apply verification

- Confirm new table exists:
  - `calendar_events`
- Confirm new indexes exist:
  - `calendar_events_start_idx`
  - `calendar_events_type_idx`
  - `notifications_user_id_idx`
  - `notifications_read_idx`
  - `notifications_created_at_idx`
- Confirm RLS policies exist on `calendar_events` and `notifications`.
- Confirm `notifications` is added to the `supabase_realtime` publication in the Supabase dashboard for realtime validation.

### Migration result

- [ ] `supabase db push` completed
- [ ] Migration listed as applied
- [ ] No migration errors
- [ ] Table exists
- [ ] Indexes exist
- [ ] RLS policies exist
- [ ] Realtime publication confirmed

---

## 3. Schema validation

Verify the live schema matches the migration.

### Required tables

- `public.calendar_events`
- `public.notifications` (existing, confirmed with new indexes/policies)

### Required `calendar_events` columns

- `id`
- `title`
- `description`
- `event_type`
- `start_date`
- `end_date`
- `all_day`
- `location`
- `space_id`
- `sprint_id`
- `created_by`
- `created_at`

### Required indexes

- `calendar_events_start_idx`
- `calendar_events_type_idx`
- `notifications_user_id_idx`
- `notifications_read_idx`
- `notifications_created_at_idx`

### Required RLS policies

#### `calendar_events`
- `calendar_events_select_all`
- `calendar_events_write`

#### `notifications`
- `notifications_select_own`
- `notifications_update_own`
- `notifications_insert_system`

### Validation notes

- Confirm `calendar_events.event_type` allows exactly:
  - `conference`
  - `program`
  - `training`
  - `prayer`
  - `graduation`
  - `event`
  - `deadline`
- Confirm `space_id` references `public.departments(id)` with `on delete set null`.
- Confirm `sprint_id` references `public.sprints(id)` with `on delete set null`.

### Schema result

- [ ] Tables verified
- [ ] Columns verified
- [ ] Indexes verified
- [ ] Policies verified
- [ ] Constraints verified

---

## 4. RLS validation matrix

Expected behavior must match the Phase 5 calendar and notifications access rules.

| Role | View calendar events | Create calendar events | Edit/delete calendar events | View own notifications | Mark own notifications read | Receive inserted notifications |
|---|---|---|---|---|---|---|
| `super_admin` | Yes | Yes | Yes | Yes | Yes | Yes |
| `dept_lead` | Yes | Yes | Yes | Yes | Yes | Yes |
| `pastor` | Yes | No | No | Yes | Yes | Yes |
| `member` | Yes | No | No | Yes | Yes | Yes |

### Validation notes

- All four roles should be able to read `calendar_events`.
- Only `super_admin` and `dept_lead` should be able to create or modify events through UI and direct access.
- Notifications must remain scoped to the logged-in user for select/update.
- Test both UI behavior and direct Supabase access where possible.

### RLS result

- [ ] `super_admin` validated
- [ ] `dept_lead` validated
- [ ] `pastor` validated
- [ ] `member` validated

---

## 5. UI smoke tests

Verify the app behavior after the migration.

- [ ] Main Ministry Calendar page loads
- [ ] Event modal opens
- [ ] All seven event types appear in the selector
- [ ] Event type colour coding renders
- [ ] MiniCalendar renders in `DeptSpace` calendar tab
- [ ] MiniCalendar renders in `SprintOverview` calendar tab
- [ ] Notification bell renders
- [ ] Notification dropdown opens and closes
- [ ] Unread badge/count renders correctly
- [ ] Dashboard upcoming events widget loads

---

## 6. Calendar event CRUD test cases

### Create event for each supported event type

**Preconditions**
- Logged in as `super_admin` or `dept_lead`

**Steps**
- Create one event for each type:
  - `conference`
  - `program`
  - `training`
  - `prayer`
  - `graduation`
  - `event`
  - `deadline`

**Expected result**
- Each event saves successfully in `public.calendar_events`
- Each event renders with the expected colour coding

**Pass/Fail:** __________  
**Notes:** __________

### Edit calendar event

**Preconditions**
- Existing event created by allowed role

**Steps**
- Open event modal
- Change title, type, date, or location
- Save

**Expected result**
- Event updates persist after refresh

**Pass/Fail:** __________  
**Notes:** __________

### Delete calendar event

**Preconditions**
- Existing event created by allowed role

**Steps**
- Open event
- Delete it

**Expected result**
- Event disappears from calendar views
- Row is removed from `public.calendar_events`

**Pass/Fail:** __________  
**Notes:** __________

### Unauthorized role cannot create or edit event

**Preconditions**
- Logged in as `pastor` or `member`

**Steps**
- Attempt to open create flow or submit write through UI/direct query

**Expected result**
- Write is blocked

**Pass/Fail:** __________  
**Notes:** __________

---

## 7. Notification UI and realtime test cases

### Notification bell unread count

**Preconditions**
- At least one unread notification exists

**Steps**
- Load app header

**Expected result**
- Bell shows unread count matching DB state

**Pass/Fail:** __________  
**Notes:** __________

### Notification dropdown open/close

**Preconditions**
- Logged in user with notifications

**Steps**
- Click bell to open
- Click outside or re-click to close

**Expected result**
- Dropdown opens and closes correctly

**Pass/Fail:** __________  
**Notes:** __________

### Mark one notification as read

**Preconditions**
- At least one unread notification exists

**Steps**
- Open dropdown
- Mark a single notification as read

**Expected result**
- `read = true` in `public.notifications`
- Unread count decrements

**Pass/Fail:** __________  
**Notes:** __________

### Mark all notifications as read

**Preconditions**
- Multiple unread notifications exist

**Steps**
- Open dropdown
- Use mark-all-read action

**Expected result**
- All current user notifications set `read = true`
- Unread badge clears

**Pass/Fail:** __________  
**Notes:** __________

### Supabase Realtime notification without page refresh

**Preconditions**
- `notifications` added to Supabase realtime publication
- Two sessions or one active session plus external insert method

**Steps**
- Keep app open
- Insert a notification for the current user from another session/tool

**Expected result**
- Notification appears without page refresh
- Unread count increments live

**Pass/Fail:** __________  
**Notes:** __________

---

## 8. Notification trigger and embed test cases

### Task assigned trigger

**Preconditions**
- Existing task
- Assignee different from current operator

**Steps**
- Assign task to target user

**Expected result**
- Notification row created for assignee
- Notification appears in bell and dropdown

**Pass/Fail:** __________  
**Notes:** __________

### Sprint member added trigger

**Preconditions**
- Existing sprint
- User not already in sprint

**Steps**
- Add user to sprint

**Expected result**
- Notification row created for added user

**Pass/Fail:** __________  
**Notes:** __________

### Invitation accepted trigger

**Preconditions**
- Valid invitation acceptance path available

**Steps**
- Complete invitation activation

**Expected result**
- `invitation_accepted` notification row created for the relevant admin/lead audience

**Pass/Fail:** __________  
**Notes:** __________

### MiniCalendar embed in `DeptSpace`

**Preconditions**
- Existing department with at least one event

**Steps**
- Open department space calendar tab

**Expected result**
- MiniCalendar renders and reflects upcoming event state

**Pass/Fail:** __________  
**Notes:** __________

### MiniCalendar embed in `SprintOverview`

**Preconditions**
- Existing sprint with linked event

**Steps**
- Open sprint overview

**Expected result**
- MiniCalendar renders and reflects sprint-linked event state

**Pass/Fail:** __________  
**Notes:** __________

### Dashboard upcoming events widget

**Preconditions**
- Multiple upcoming events exist

**Steps**
- Load dashboard

**Expected result**
- Widget shows upcoming events in correct order

**Pass/Fail:** __________  
**Notes:** __________

---

## 9. Regression checks

- [ ] My Work still loads
- [ ] Department task boards still load
- [ ] Sprint pages still load
- [ ] People module still loads
- [ ] Invitation flows still load
- [ ] Meeting pages still load
- [ ] Dashboard widgets still load
- [ ] Existing task visibility still works

---

## 10. Defect policy

- Fix only defects related to the Phase 5 migration, calendar flows, or notification flows.
- Do not add new feature scope during validation.
- Any RLS defect blocks production completion.
- Any migration failure blocks production completion.
- Realtime publication misconfiguration blocks live notification validation until corrected.
- UI defects that do not affect data integrity can be triaged.

---

## 11. Sign-off matrix

| Area | Tester | Date | Result | Defects linked | Approved by |
|---|---|---|---|---|---|
| Migration apply |  |  |  |  |  |
| Schema validation |  |  |  |  |  |
| RLS validation |  |  |  |  |  |
| Calendar CRUD |  |  |  |  |  |
| Event colour coding |  |  |  |  |  |
| MiniCalendar embeds |  |  |  |  |  |
| Notification UI |  |  |  |  |  |
| Realtime delivery |  |  |  |  |  |
| Trigger validation |  |  |  |  |  |
| Regression |  |  |  |  |  |

---

## 12. Exit criteria

Phase 5 is production-complete when:

- [ ] Migration applies cleanly
- [ ] Calendar table/indexes/policies exist
- [ ] RLS behavior matches the expected read/write boundaries
- [ ] Calendar event CRUD passes for all seven event types
- [ ] Event colour coding and MiniCalendar embeds pass
- [ ] Notification bell, unread state, and mark-read flows pass
- [ ] Realtime notifications work without page refresh
- [ ] Dashboard upcoming events widget is correct
- [ ] No critical RLS or migration defects remain
