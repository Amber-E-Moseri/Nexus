# Phase 3 — Task Maturity Live Validation

## Purpose

Validate the Phase 3 task maturity patch against the live Supabase project before marking the phase production-complete.

This phase is not new feature work. It validates the migration, RLS, UI panels, and task maturity flows added in Phase 3.

---

## 1. Pre-migration backup

Complete these steps before applying `20260613_phase3_task_maturity.sql`.

### Backup checklist

- Create a Supabase backup/export from the Supabase dashboard if that option is available on the current plan.
- Run a local SQL dump:
  - `supabase db dump -f supabase-backup-pre-phase3.sql`
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

Apply and verify the Phase 3 migration.

### Apply

- `supabase db push`

### Verify migration application

- Confirm `supabase/migrations/20260613_phase3_task_maturity.sql` is included in the applied migration set.
- Re-run:
  - `supabase migration list`
- Check CLI output for any migration errors, duplicate-policy errors, or constraint failures.

### Post-apply verification

- Confirm new tables exist:
  - `task_dependencies`
  - `task_files`
  - `task_comments` (existing or confirmed intact)
- Confirm new indexes exist:
  - `task_dependencies_task_id_idx`
  - `task_dependencies_depends_on_idx`
  - `task_files_task_id_idx`
  - `task_comments_task_id_idx`
- Confirm RLS policies exist on the new tables.

### Migration result

- [ ] `supabase db push` completed
- [ ] Migration listed as applied
- [ ] No migration errors
- [ ] Tables exist
- [ ] Indexes exist
- [ ] RLS policies exist

---

## 3. Schema validation

Verify the live schema matches the migration.

### Required tables

- `public.task_comments`
- `public.task_files`
- `public.task_dependencies`

### Required indexes

- `task_dependencies_task_id_idx`
- `task_dependencies_depends_on_idx`
- `task_files_task_id_idx`
- `task_comments_task_id_idx`

### Required RLS policies

#### `task_dependencies`
- `task_dependencies_select`
- `task_dependencies_write`

#### `task_files`
- `task_files_select`
- `task_files_write`

#### `task_comments`
- `task_comments_select`
- `task_comments_write`

### Validation notes

- Confirm `task_dependencies.task_id <> task_dependencies.depends_on_id` is enforced.
- Confirm `(task_id, depends_on_id)` uniqueness is enforced.
- Confirm `task_comments` still references `public.tasks(id)` with `on delete cascade`.
- Confirm `task_files` references `public.tasks(id)` with `on delete cascade`.

### Schema result

- [ ] Tables verified
- [ ] Indexes verified
- [ ] Policies verified
- [ ] Constraints verified

---

## 4. RLS validation matrix

Expected behavior must match existing task visibility boundaries.

| Role | View comments | Create comments | Delete own comments | View file links | Add file links | Remove file links | View dependencies | Add dependencies | Remove dependencies |
|---|---|---|---|---|---|---|---|---|---|
| `super_admin` | Yes, within all visible tasks | Yes | Yes | Yes, within all visible tasks | Yes | Yes | Yes, within all visible tasks | Yes | Yes |
| `dept_lead` | Yes, within department-visible tasks | Yes, on visible tasks | Yes, own only | Yes, within department-visible tasks | Yes, on visible tasks | Yes, own only | Yes, within department-visible tasks | Yes, on visible tasks | Yes, own only |
| `pastor` | Yes, only for tasks already visible through flock rules | Yes, on visible tasks | Yes, own only | Yes, only for tasks already visible through flock rules | Yes, on visible tasks | Yes, own only | Yes, only for tasks already visible through flock rules | Yes, on visible tasks | Yes, own only |
| `member` | Yes, only for tasks already visible through existing task rules | Yes, on visible tasks | Yes, own only | Yes, only for tasks already visible through existing task rules | Yes, on visible tasks | Yes, own only | Yes, only for tasks already visible through existing task rules | Yes, on visible tasks | Yes, own only |

### Validation notes

- The migration does not introduce broader visibility than the underlying `tasks` table.
- Test both UI behavior and direct Supabase access where possible.
- Confirm restricted tasks remain restricted for comments, file links, and dependencies.

### RLS result

- [ ] `super_admin` validated
- [ ] `dept_lead` validated
- [ ] `pastor` validated
- [ ] `member` validated

---

## 5. UI smoke tests

Verify the app behavior after the migration.

- [ ] Task modal opens normally
- [ ] Inline tabs render in edit mode
- [ ] Comments tab works
- [ ] Files tab works
- [ ] Dependencies tab works
- [ ] Card count indicators display correctly
- [ ] Existing task creation still works
- [ ] Existing task editing still works
- [ ] Existing kanban view still works
- [ ] Existing list view still works

---

## 6. Comment flow test cases

### Add comment

**Preconditions**
- Existing visible task
- Logged in as a role allowed to see that task

**Steps**
- Open task modal in edit mode
- Go to `Comments`
- Enter a valid comment
- Submit

**Expected result**
- Comment appears immediately
- Comment persists after modal close/reopen
- Comment is stored in `task_comments`

**Pass/Fail:** __________  
**Notes:** __________

### Empty comment rejected

**Preconditions**
- Existing visible task

**Steps**
- Open `Comments`
- Leave input blank
- Attempt submit

**Expected result**
- Submit does not proceed
- No comment row is created

**Pass/Fail:** __________  
**Notes:** __________

### Comment persists after refresh

**Preconditions**
- Comment already added

**Steps**
- Refresh app
- Reopen same task

**Expected result**
- Comment still appears

**Pass/Fail:** __________  
**Notes:** __________

### Unauthorized user cannot see restricted task comments

**Preconditions**
- Task not visible to the test role

**Steps**
- Attempt access via UI or direct query

**Expected result**
- Restricted task comments are not visible

**Pass/Fail:** __________  
**Notes:** __________

### Comment count updates on card

**Preconditions**
- Visible task on board or list

**Steps**
- Add comment
- Close modal

**Expected result**
- Card shows updated comment indicator/count

**Pass/Fail:** __________  
**Notes:** __________

---

## 7. File link flow test cases

### Add Google Drive link

**Preconditions**
- Existing visible task

**Steps**
- Open `Files`
- Add valid Google Drive document URL

**Expected result**
- Link saved and rendered

**Pass/Fail:** __________  
**Notes:** __________

### Add Google Sheet link

**Preconditions**
- Existing visible task

**Steps**
- Add valid Google Sheets URL

**Expected result**
- Link saved and rendered with the correct label

**Pass/Fail:** __________  
**Notes:** __________

### Add generic URL

**Preconditions**
- Existing visible task

**Steps**
- Add non-Google valid URL

**Expected result**
- Link saved and rendered

**Pass/Fail:** __________  
**Notes:** __________

### Invalid/empty link rejected

**Preconditions**
- Existing visible task

**Steps**
- Try saving with empty label or empty URL

**Expected result**
- Attach action blocked
- No `task_files` row created

**Pass/Fail:** __________  
**Notes:** __________

### File link persists after refresh

**Preconditions**
- File link already added

**Steps**
- Refresh app
- Reopen task

**Expected result**
- File link still appears

**Pass/Fail:** __________  
**Notes:** __________

### File count updates on card

**Preconditions**
- Visible task on board or list

**Steps**
- Add file link
- Close modal

**Expected result**
- Card shows updated file indicator/count

**Pass/Fail:** __________  
**Notes:** __________

### Unauthorized user cannot see restricted task file links

**Preconditions**
- Task not visible to the test role

**Steps**
- Attempt access via UI or direct query

**Expected result**
- Restricted task file links are not visible

**Pass/Fail:** __________  
**Notes:** __________

---

## 8. Dependency flow test cases

### Link task as dependency

**Preconditions**
- Two visible tasks in the same allowed scope

**Steps**
- Open task modal
- Go to `Dependencies`
- Add another task as dependency

**Expected result**
- Dependency row saved and rendered

**Pass/Fail:** __________  
**Notes:** __________

### Prevent task depending on itself

**Preconditions**
- Existing task

**Steps**
- Attempt self-link

**Expected result**
- Self-dependency is blocked by schema and/or UI

**Pass/Fail:** __________  
**Notes:** __________

### Prevent duplicate dependency

**Preconditions**
- Dependency already exists

**Steps**
- Attempt to add same dependency again

**Expected result**
- Duplicate dependency prevented

**Pass/Fail:** __________  
**Notes:** __________

### Dependency persists after refresh

**Preconditions**
- Dependency already added

**Steps**
- Refresh app
- Reopen task

**Expected result**
- Dependency still appears

**Pass/Fail:** __________  
**Notes:** __________

### Dependency count updates on card

**Preconditions**
- Visible task on board or list

**Steps**
- Add dependency
- Close modal

**Expected result**
- Card shows updated dependency indicator/count

**Pass/Fail:** __________  
**Notes:** __________

### Restricted task does not appear as linkable if user cannot access it

**Preconditions**
- Task exists outside the role’s allowed visibility

**Steps**
- Open dependency selector as restricted role

**Expected result**
- Restricted task is not available as a linkable option

**Pass/Fail:** __________  
**Notes:** __________

---

## 9. Regression checks

- [ ] My Work still loads
- [ ] Department/space task views still load
- [ ] Pastor/member task visibility still works
- [ ] Dashboard widgets still load
- [ ] Invitation/People pages still load
- [ ] Build still passes

### Build check

- `npm run build`

---

## 10. Defect policy

- Fix only defects related to the Phase 3 migration or task maturity flows.
- Do not add new feature scope during validation.
- Any RLS defect blocks production completion.
- Any migration failure blocks production completion.
- UI defects that do not affect data integrity can be triaged.

---

## 11. Sign-off matrix

| Area | Tester | Date | Result | Defects linked | Approved by |
|---|---|---|---|---|---|
| Migration apply |  |  |  |  |  |
| Schema validation |  |  |  |  |  |
| RLS validation |  |  |  |  |  |
| Comments |  |  |  |  |  |
| File links |  |  |  |  |  |
| Dependencies |  |  |  |  |  |
| UI regression |  |  |  |  |  |
| Role regression |  |  |  |  |  |

---

## 12. Exit criteria

Phase 3 is production-complete when:

- [ ] Migration applies cleanly
- [ ] New tables/columns/indexes exist
- [ ] RLS behavior matches task visibility rules
- [ ] Comment/file/dependency flows pass
- [ ] Card counts update correctly
- [ ] Existing task flows still work
- [ ] No critical RLS or migration defects remain
