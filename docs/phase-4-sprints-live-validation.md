# Phase 4 â€” Sprints Live Validation

## Purpose

Validate the Phase 4 sprints patch against the live Supabase project before marking the phase production-complete.

This phase is not new feature work. It validates the migration, RLS, sprint lifecycle flows, sprint review, sprint task behavior, sprint members, sprint teams, sidebar navigation, dashboard KPI behavior, and related regression coverage added in Phase 4.

---

## 1. Pre-migration backup

Complete these steps before applying `20260614_phase4_sprints.sql`.

### Backup checklist

- Create a Supabase backup/export from the Supabase dashboard if that option is available on the current plan.
- Run a local SQL dump:
  - `supabase db dump -f supabase-backup-pre-phase4.sql`
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

Apply and verify the Phase 4 migration.

### Apply

- `supabase db push`

### Verify migration application

- Confirm `supabase/migrations/20260614_phase4_sprints.sql` is included in the applied migration set.
- Re-run:
  - `supabase migration list`
- Check CLI output for any migration errors, duplicate-policy errors, or constraint failures.

### Post-apply verification

- Confirm new tables exist:
  - `sprints`
  - `sprint_teams`
  - `sprint_members`
  - `sprint_reviews`
- Confirm altered task columns exist:
  - `tasks.sprint_id`
  - `tasks.task_type`
- Confirm new indexes exist:
  - `sprints_status_idx`
  - `sprints_created_by_idx`
  - `sprint_members_user_idx`
  - `sprint_members_sprint_idx`
  - `tasks_sprint_id_idx`
- Confirm helper function exists:
  - `public.is_sprint_member(uuid)`
- Confirm RLS policies exist on the new tables and task sprint policies exist.

### Migration result

- [ ] `supabase db push` completed
- [ ] Migration listed as applied
- [ ] No migration errors
- [ ] Tables exist
- [ ] Task columns exist
- [ ] Indexes exist
- [ ] Helper function exists
- [ ] RLS policies exist

---

## 3. Schema validation

Verify the live schema matches the migration.

### Required tables

- `public.sprints`
- `public.sprint_teams`
- `public.sprint_members`
- `public.sprint_reviews`

### Required task columns

- `public.tasks.sprint_id`
- `public.tasks.task_type`

### Required indexes

- `sprints_status_idx`
- `sprints_created_by_idx`
- `sprint_members_user_idx`
- `sprint_members_sprint_idx`
- `tasks_sprint_id_idx`

### Required functions

- `public.is_sprint_member(uuid)`

### Required RLS policies

#### `sprints`
- `sprints_select`
- `sprints_insert`
- `sprints_update`

#### `sprint_teams`
- `sprint_teams_select`
- `sprint_teams_write`

#### `sprint_members`
- `sprint_members_select`
- `sprint_members_write`

#### `sprint_reviews`
- `sprint_reviews_select`
- `sprint_reviews_write`

#### `tasks`
- `tasks_select_sprint_member`
- `tasks_insert_sprint_manager`
- `tasks_update_delete_sprint_manager`

### Validation notes

- Confirm `sprint_members` primary key is `(sprint_id, user_id)`.
- Confirm `sprint_reviews.sprint_id` is unique.
- Confirm `tasks.task_type` supports `space`, `sprint`, and `personal`.
- Confirm existing personal tasks were migrated to `task_type = 'personal'`.
- Confirm `tasks.sprint_id` references `public.sprints(id)` with `on delete set null`.

### Schema result

- [ ] Tables verified
- [ ] Task columns verified
- [ ] Indexes verified
- [ ] Policies verified
- [ ] Constraints verified
- [ ] Helper function verified

---

## 4. RLS validation matrix

Expected behavior must match the sprint visibility and manager/lead editing rules introduced in Phase 4.

| Role | View sprints | Create sprint | Edit sprint | View sprint tasks | Create sprint tasks | Edit sprint tasks | Manage sprint members | Manage sprint teams | Submit sprint review |
|---|---|---|---|---|---|---|---|---|---|
| `super_admin` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `dept_lead` | Yes if creator or sprint member | Yes | Yes if creator or sprint `manager`/`lead` | Yes if sprint member | Yes if sprint `manager`/`lead` | Yes if sprint creator/manager/lead | Yes | Yes if sprint `manager`/`lead` | Yes if sprint `manager`/`lead` |
| `pastor` | Yes only if sprint member | No by default | No unless assigned `manager`/`lead` in that sprint | Yes only if sprint member | No unless sprint `manager`/`lead` | No unless sprint creator/manager/lead | No unless sprint `manager`/`lead` | No unless sprint `manager`/`lead` | No unless sprint `manager`/`lead` |
| `member` | Yes only if sprint member | No | No unless assigned `manager`/`lead` in that sprint | Yes only if sprint member | No unless sprint `manager`/`lead` | No unless sprint creator/manager/lead | No unless sprint `manager`/`lead` | No unless sprint `manager`/`lead` | No unless sprint `manager`/`lead` |

### Validation notes

- View access is member-based, not department-based.
- Sprint write access is role-in-sprint aware.
- Test both UI behavior and direct Supabase access where possible.
- Confirm non-members cannot query sprint rows or sprint tasks.

### RLS result

- [ ] `super_admin` validated
- [ ] `dept_lead` validated
- [ ] `pastor` validated
- [ ] `member` validated

---

## 5. UI smoke tests

Verify the app behavior after the migration.

- [ ] Sprints list page loads
- [ ] Sprint overview page loads
- [ ] Sprint create modal opens
- [ ] Sprint sidebar navigation renders
- [ ] Sprint review form renders
- [ ] Sprint task board renders
- [ ] Sprint members panel renders
- [ ] Sprint teams panel renders
- [ ] Dashboard sprint KPI/cards load
- [ ] Existing non-sprint task flows still work

---

## 6. Sprint lifecycle test cases

### Create sprint

**Preconditions**
- Logged in as `super_admin` or `dept_lead`

**Steps**
- Open sprints page
- Create a sprint with name, description, and goal

**Expected result**
- Sprint is created in `public.sprints`
- Creator is added to `public.sprint_members`
- Initial status is `planning`

**Pass/Fail:** __________  
**Notes:** __________

### Planning â†’ active

**Preconditions**
- Existing sprint in `planning`

**Steps**
- Advance sprint status to `active`

**Expected result**
- Status updates to `active`
- Sprint appears correctly in sprint views and KPI surfaces

**Pass/Fail:** __________  
**Notes:** __________

### Active â†’ completed

**Preconditions**
- Existing sprint in `active`

**Steps**
- Advance sprint status to `completed`

**Expected result**
- Status updates to `completed`

**Pass/Fail:** __________  
**Notes:** __________

### Completed â†’ review

**Preconditions**
- Existing sprint in `completed`

**Steps**
- Advance sprint status to `review`

**Expected result**
- Status updates to `review`
- Sprint review form remains available

**Pass/Fail:** __________  
**Notes:** __________

### Review â†’ archived

**Preconditions**
- Existing sprint in `review`

**Steps**
- Archive sprint

**Expected result**
- Status updates to `archived`
- `is_archived = true`
- `archived_at` is populated

**Pass/Fail:** __________  
**Notes:** __________

### Restore archived sprint

**Preconditions**
- Existing archived sprint

**Steps**
- Use restore action

**Expected result**
- Sprint status returns to `planning`
- `is_archived = false`
- `archived_at = null`

**Pass/Fail:** __________  
**Notes:** __________

### Duplicate sprint

**Preconditions**
- Existing sprint with content

**Steps**
- Use duplicate action

**Expected result**
- New sprint is created with copied core metadata
- New sprint status is `planning`
- Historical original sprint remains unchanged

**Pass/Fail:** __________  
**Notes:** __________

---

## 7. Sprint review form test cases

### Save sprint review

**Preconditions**
- Sprint in `review`
- Logged in as allowed manager/lead/admin

**Steps**
- Open sprint review form
- Fill `goals_achieved`, `outstanding_items`, `lessons_learned`, `wins_testimonies`, `recommendations`, `final_decisions`
- Save

**Expected result**
- Row stored in `public.sprint_reviews`
- `completed_by` and `completed_at` populated

**Pass/Fail:** __________  
**Notes:** __________

### Edit sprint review

**Preconditions**
- Existing sprint review

**Steps**
- Reopen review form
- Edit one or more fields
- Save

**Expected result**
- Existing review row is updated
- Sprint review persists after refresh

**Pass/Fail:** __________  
**Notes:** __________

### Unauthorized user blocked from sprint review write

**Preconditions**
- Sprint visible to a non-manager member

**Steps**
- Attempt review submission via UI or direct query

**Expected result**
- Write is denied

**Pass/Fail:** __________  
**Notes:** __________

---

## 8. Sprint workstream test cases

### Sprint task create/edit/delete on kanban

**Preconditions**
- Existing sprint
- Logged in as allowed sprint manager/lead/admin

**Steps**
- Create sprint task on board
- Edit task
- Delete task

**Expected result**
- Task rows use `task_type = 'sprint'`
- `sprint_id` is set
- Board updates correctly after each action

**Pass/Fail:** __________  
**Notes:** __________

### Sprint member add/remove/role change

**Preconditions**
- Existing sprint
- At least one active user available

**Steps**
- Add member
- Change member role
- Remove member

**Expected result**
- `public.sprint_members` updates correctly
- Membership changes persist after refresh
- Removed member loses sprint visibility

**Pass/Fail:** __________  
**Notes:** __________

### Sprint team create/rename/delete

**Preconditions**
- Existing sprint

**Steps**
- Create sprint team
- Rename sprint team
- Delete sprint team

**Expected result**
- `public.sprint_teams` updates correctly
- Deleted team removes assignment or sets member team link to null as expected

**Pass/Fail:** __________  
**Notes:** __________

### Sidebar sprint nav updates

**Preconditions**
- Existing active and planning sprints

**Steps**
- Refresh app
- Inspect sidebar sprint section

**Expected result**
- Active/planning sprints appear
- Click opens correct sprint overview route

**Pass/Fail:** __________  
**Notes:** __________

### Dashboard sprint KPI updates

**Preconditions**
- Existing sprints in different statuses

**Steps**
- Create or update sprint status
- Refresh dashboard

**Expected result**
- Sprint KPI/cards reflect current live data

**Pass/Fail:** __________  
**Notes:** __________

---

## 9. Regression checks

- [ ] My Work still loads
- [ ] Department task boards still load
- [ ] Pastor flock view still loads
- [ ] People module still loads
- [ ] Meetings still load
- [ ] Dashboard widgets still load
- [ ] Existing task visibility still works
- [ ] Archived and personal tasks remain unaffected

---

## 10. Defect policy

- Fix only defects related to the Phase 4 migration or sprint workflows.
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
| Sprint lifecycle |  |  |  |  |  |
| Sprint review |  |  |  |  |  |
| Sprint tasks |  |  |  |  |  |
| Sprint members |  |  |  |  |  |
| Sprint teams |  |  |  |  |  |
| Sidebar/dashboard |  |  |  |  |  |
| Regression |  |  |  |  |  |

---

## 12. Exit criteria

Phase 4 is production-complete when:

- [ ] Migration applies cleanly
- [ ] Sprint tables/columns/indexes exist
- [ ] RLS behavior matches sprint visibility and manager rules
- [ ] Sprint lifecycle transitions pass
- [ ] Sprint review flows pass
- [ ] Sprint task/member/team workflows pass
- [ ] Sidebar sprint navigation and dashboard KPI checks pass
- [ ] No critical RLS or migration defects remain
