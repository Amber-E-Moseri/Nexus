# Migration Log

## 20270720000022 — tasks_realtime_publication

**Date:** 2026-07-20
**Status:** ✅ Applied directly to linked remote during diagnosis (`alter publication supabase_realtime add table public.tasks`); this migration file makes it tracked/idempotent going forward — safe to `supabase db push` (guarded, no-ops if already applied).
**Tables affected:** `tasks` (realtime publication membership only — no schema change)
**Functions added/changed:** none

### Background
While investigating "reassigning a task away from myself didn't show it as Delegated in My Tasks," added a second realtime channel to `useMyTasks.ts` filtered on `created_by` (see `20270720000021`-adjacent work). Verifying that fix against the live DB via a throwaway test task + direct channel subscription showed **neither** the new `created_by` channel nor the pre-existing `assignee_id` channel received any event. Checked `pg_publication_tables` on the linked project: `public.tasks` was never a member of the `supabase_realtime` publication — only `campuses`, `flock_contacts/interactions/todos`, `meeting_transcriptions`, `notifications`, `prayer_logs/requests` were. Every `postgres_changes` subscription against `tasks` anywhere in the app (My Tasks, Kanban boards, Sprint boards, `TasksContext`'s dept/sprint realtime sync) has been silently dead in production — the app has only ever appeared to sync live because of explicit refetches after saves (`handleSaved`, `handleTaskStatusChange`, page navigation), not because of the realtime channels.

### Fix
- Added `public.tasks` to the `supabase_realtime` publication (guarded with an existence check so replaying this migration after the manual diagnostic ALTER is a no-op, not an error).
- Re-ran the verification script after the publication change: the `created_by` channel now fires correctly on reassignment-away; the `assignee_id` channel correctly does not (documented, deferred, separate gap — see `useMyTasks.ts` comments).

### Follow-up audit — smoke-testing every other tasks-realtime consumer
Previously-inert code suddenly going live is exactly the kind of change that can surface latent bugs elsewhere, so before calling this done, audited every `postgres_changes` subscription against `public.tasks` in the codebase and live-tested the two most consequential ones (dept and sprint boards):

| Consumer | Filter | Idempotent under repeat fire? | Verified live |
|---|---|---|---|
| `useMyTasks.ts` (My Tasks) | `assignee_id`, `created_by` | Yes — full refetch + `setTasks` replace | ✅ INSERT/UPDATE/DELETE (this fix's target) |
| `TasksContext.jsx` (dept/sprint boards, Kanban) | `department_id` or `sprint_id` | Yes — DELETE filters array by id; INSERT/UPDATE trigger a full `loadTasks()`/`silentSync()` | ✅ INSERT/UPDATE/DELETE, both dept and sprint scoped |
| `usePersonalList.js` | `assignee_id` | Yes — full refetch | Not separately live-tested; same refetch pattern as the two above, which were |
| `useMyTaskCounts.ts` (sidebar badge) | `assignee_id` | Yes — full refetch | Not separately live-tested; same pattern |
| `useTaskSync`/`useTaskSyncAll` (`src/features/tasks/hooks/useTaskSync.ts`) | `assignee_id`, and **no filter at all** for `useTaskSyncAll` | **Not currently a risk — neither hook is imported/called anywhere in `src/`.** Dead code. Flagging because `useTaskSyncAll`'s unfiltered subscription would push every task change org-wide to every client if it were ever wired up, and its callback passes `payload.new` straight through, which is `undefined` on DELETE — a latent bug for whoever picks this up later. | N/A — unused |

**Second gap found during this smoke-test, now also fixed:** `public.tasks` had `REPLICA IDENTITY DEFAULT` (old row = primary key only for UPDATE/DELETE). Realtime's server-side column filters need the filtered column present in the old row to evaluate a DELETE — without `FULL`, every filtered DELETE subscription on `tasks` silently never fired, even after the publication fix got INSERT/UPDATE working. Confirmed via live test (dept-board and sprint-board channels saw INSERT+UPDATE but not DELETE) before applying `ALTER TABLE public.tasks REPLICA IDENTITY FULL` (same pattern already used for `app_notifications`). Re-verified after: dept and sprint channels now see all three event types; the My Tasks `created_by` channel also confirmed to catch DELETE.

No UX regression found beyond one minor, non-blocking nit: `TasksContext.jsx`'s INSERT handler calls `loadTasks()` (not the silent variant), so a teammate creating a task on a shared dept/sprint board will now flash a brief loading spinner for everyone else watching that board live — previously invisible because the channel never fired. Not a correctness bug; noted here in case it's worth switching to a silent refresh later.

## 20270720000023 — reactivate_null_dept_todo_status

**Date:** 2026-07-20
**Status:** ⏳ NOT YET PUSHED — push with `supabase db push`.
**Tables affected:** `task_status_definitions` (data fix, no schema/policy change)
**Functions added/changed:** none

### Background
User reported "as I create a task it doesn't go to To Do." Queried live data directly
(`supabase db query`) rather than assuming: for `department_id IS NULL` task contexts
(personal tasks, multi-team "All Teams" sprint tasks), the only null-department status
rows are two legacy duplicates — 'To Do' (`id=ca924b42-5163-4912-8d31-c494e4191dce`)
and 'Not Started'/backlog — and both were `active = false`, unlike the null-department
'Cancelled' row, which is active. 22 live tasks already had `status_id` pointing at the
inactive 'To Do' row.

Traced the mechanism: `TasksContext.jsx`'s "ensure an open-category status is always
included" fallback (`src/features/tasks/TasksContext.jsx:59-81`, prior to this session's
fix) queries with `includeInactive: true` when no active 'open' status exists for the
department, finds this inactive row, and copied it into local state with `active`
force-overridden to `true` — so the create-task flow assigned its real id as
`status_id`. Every *other* status query (Kanban columns, `get_space_statuses`,
`listTaskStatuses` elsewhere) correctly filters on the real `active = false`, so those
tasks were invisible in the "To Do" column everywhere except the dropdown that created
them.

### Fix
- **Data:** reactivate the null-department 'To Do' row so it's a genuine, consistently
  visible default (mirrors 'Cancelled', already active for `department_id IS NULL`).
  This also retroactively fixes the 22 existing tasks with no remap needed, since they
  already reference this row's id.
- **Frontend defense-in-depth:** `TasksContext.jsx:59-81` no longer force-overrides
  `active: true` on whatever row it finds — it now only accepts a genuinely active
  status (`s.category === 'open' && s.active`), so a future deactivation elsewhere
  can't silently leak through as a phantom "active" status again.

## 20270720000021 — backfill_sprint_task_department_id

**Date:** 2026-07-20
**Status:** ⏳ NOT YET PUSHED — push with `supabase db push`.
**Tables affected:** `tasks` (data backfill only, no policy changes)
**Functions added/changed:** none

### Background
User asked how sprint completions tie into a space's completion rate, noting a sprint-heavy
week for a team looked like "not much happened" on Space Overview. Traced to
`getSpaceTasks(departmentId)` (`src/features/spaces/lib/spaces.js:413-435`), which filters on
`.or(department_id.eq.<dept>, list_id.in.(<space lists>))`. Sprint tasks were created with
`department_id` forced to `null` in two places even when the sprint's own `department_id` was
already available in scope:
- `src/features/sprints/components/TaskDetailSidebar.jsx:489` (task detail modal)
- `src/features/tasks/TasksContext.jsx:218` (`addTask`, used by the sprint board's quick-add
  composer)

So sprint tasks matched neither `.or()` condition and never appeared in Space Overview's status
breakdown, despite `SpaceOverview.jsx`'s breakdown logic (`SpaceOverview.jsx:456-474`) having no
`task_type` filter that would otherwise exclude them.

### Fix
- Frontend: both call sites now pass through `department_id: departmentId ?? null` unconditionally
  instead of nulling it for sprint tasks. For multi-team "All Teams" sprints, `departmentId` is
  legitimately null (`sprints.department_id` — see `20260715000001_sprints_department_id.sql`), so
  those tasks correctly still don't attach to one space.
- Migration: one-time backfill sets `department_id` from `sprints.department_id` on existing sprint
  tasks that were created under the old (buggy) behavior, so historical sprint work surfaces too.
  Only touches single-team sprints; multi-team sprints are left alone by the `s.department_id is
  not null` guard.
- No RLS changes: `tasks_select_member`/`tasks_select_lead`/`tasks_select_admin` already gate purely
  on `t.department_id`, not `sprint_id`/`task_type` (verified via
  `20270101000001_user_can_view_task.sql:39-59`), so backfilled rows are immediately visible to dept
  members.

## 20270720000019 — retire_blocked_status

**Date:** 2026-07-20
**Status:** ⏳ NOT YET PUSHED — push with `supabase db push`.
**Tables affected:** `task_status_definitions`, `tasks` (data remap only, no policy changes)
**Functions added/changed:** none

### Background
User asked to remove "Blocked" as a task status. Verified against live data before writing: 1 task on
the org-wide Blocked row, 0 on the 4 unused dept-scoped Blocked duplicates, no `automations` row
referencing `'blocked'` in `conditions`/`actions`/`trigger_config`.

### Fix
Same pattern as `20270720000008`'s backlog retirement: remap the 1 live task and re-point the 4
dept-scoped duplicates' `org_status_id` onto "In Progress" (same `category='in_progress'`, so no
semantic category change), deactivate all `legacy_key='blocked'` rows, assert nothing is left
referencing an inactive status before commit. `get_space_statuses()` already filters `active = true`.

### Frontend
- `TaskModal.jsx` / `TaskDetailSidebar.jsx`: removed the dead `selectedStatus?.legacy_key === 'blocked'`
  branch from the status-change notification trigger (only `category === 'completed'` now fires it).
- `TaskModal.jsx`: the "🚫 Blocked by: …" dependency-blockers banner no longer requires the task's
  *status* to literally be named "Blocked" — it now shows whenever `blockers.length > 0`, decoupling
  the task-dependency-blocking feature from the now-retired status.
- `CLAUDE.md` and `HelpPage.jsx` updated to describe 5 canonical statuses instead of 6.

## 20270720000018 — flock_crm_remove_regional_sec_read

**Date:** 2026-07-20
**Status:** ⏳ NOT YET PUSHED — push with `supabase db push`.
**Tables affected:** `flock_contacts`, `flock_interactions`, `flock_todos`, `flock_settings` (policy change)
**Functions added/changed:** none (RLS policy only)

### Background
User reported "flock crm i still see all pastors contacts each pastor should have their unique one."
Traced to `20270718000009_flock_crm_regional_sec_read.sql`, which gave `regional_secretary` an
unrestricted full-row SELECT (name, phone, email, notes) across every pastor's `flock_contacts` —
confirmed live via `pg_policies`, and confirmed the reporting account
(`blwcan.elvanto@gmail.com`, "Tester") is `role='regional_secretary'`. User confirmed the intended
model: each pastor's flock is theirs alone; regional_secretary should have no read access into it at
all (stricter than the "workload only" aggregate view suggested in project memory).

### Fix
- Dropped all four `*_regional_sec_read` policies added by `20270718000009`. The pre-existing
  `flock_*_own` policies (`pastor_id = auth.uid() OR super_admin`) are now the only read path.

### Frontend
- `src/lib/permissions.js`: removed `regional_secretary` from `FLOCK_CRM_CONFIG.checkAccess`.
- `src/App.jsx`: removed `regional_secretary` from the `/flock-crm` route's `ProtectedRoute` roles.
- Sidebar's "Flock CRM — Pastoral Outreach" item (gated by the same config) now correctly hides for
  regional_secretary.
- Note: this only affects `/flock-crm` (Flock CRM pastoral-outreach tool). The separate `/flock`
  ("My Flock") feature and its ORS/Admin-workload-only visibility model (per project memory) is
  untouched.

## 20270720000020 — tasks_update_regional_secretary

**Date:** 2026-07-20
**Status:** ⏳ NOT YET PUSHED — push with `supabase db push`.
**Tables affected:** `tasks` (policy change)
**Functions added/changed:** none (RLS policy only)

### Background
Reported as "drag-and-drop broken on boards" for a regional_secretary account. Root cause: `tasks_update`
(rebuilt in `20270720000007`) and `tasks_update_delete_sprint_manager` (sprint boards) check
`super_admin`/`created_by`/`has_space_role(dept_lead)`/`can_manage_sprint()` but never got
`regional_secretary` added, unlike `tasks_insert` (`20270719000008`) and `tasks_delete`
(`20270720000016`). `20270720000016`'s own comment incorrectly assumed `tasks_update` already covered
it — it didn't, so the gap went unnoticed. A drag on a board (status/position change on a task the
regional_secretary didn't create and isn't dept_lead of) is an UPDATE, so it hit RLS silently. Not
isolated to one account: any regional_secretary hits this on any task outside their own created/lead
scope, on both regular and sprint boards.

### Fix
- `tasks_update` and `tasks_update_delete_sprint_manager` now also allow
  `current_user_role() = 'regional_secretary'`, matching the org-wide role pattern used elsewhere.

## 20270720000017 — task_trash

**Date:** 2026-07-20
**Status:** ⏳ NOT YET PUSHED — push with `supabase db push`.
**Tables affected:** `tasks` (no policy changes)
**Functions added/changed:** `soft_delete_task(uuid)` (adds `regional_secretary`), `restore_task(uuid)` (new), `hard_delete_task(uuid)` (new, replaces raw client `.delete()`), `get_trash_tasks()` (new)

### Background
Follow-up to `20270720000016` (regional_secretary added to the `tasks_delete` RLS policy). Clarified
intent: delete access should stay broad (anyone who can already soft-delete keeps that ability), and
the real safety net is a Trash — soft-deleted tasks are recoverable via `restore_task`, and only
super_admin/regional_secretary/dept_lead-of-space can permanently purge via `hard_delete_task`.

### Fix
- `soft_delete_task` gains `regional_secretary` in its authorization union (was missing, inconsistent
  with `tasks_insert`/`tasks_update`/`tasks_delete`).
- New `restore_task(uuid)` mirrors `soft_delete_task`'s broad authorization (undo of a trusted action).
- New `hard_delete_task(uuid)` replaces the client's raw `.from('tasks').delete()` (previously gated
  only by a stale client-side `users.role` check that didn't match DB truth). Requires the task
  already be soft-deleted (enforces delete → trash → purge server-side) and nulls `parent_task_id` on
  subtasks first (that FK has no `ON DELETE` clause — would otherwise raise a restrict violation).
- New `get_trash_tasks()` returns `deleted_at IS NOT NULL` tasks scoped by the same authorization
  union as soft-delete/restore. Implemented as an RPC rather than an 8th `tasks_select_*` policy,
  since that policy surface has a documented leak history (`20270719000014`).
- **No RLS policy changes** — all four functions are SECURITY DEFINER and authorize internally.

### Frontend
- `src/features/tasks/lib/tasks.js`: `deleteTask`'s permanent path now calls `hard_delete_task` RPC
  instead of raw `.delete()`; removed the stale client-side `users.role` pre-check. Added
  `restoreTask()` and `getTrashTasks()` (the latter enriches raw RPC rows with department/creator/
  assignee names via follow-up batched queries, since `get_trash_tasks()` returns bare `tasks` rows).
- New `src/features/tasks/hooks/useTrash.js` (React Query, follows `useWeeklyWins.js`'s pattern).
- New `src/pages/tasks/TrashPage.jsx` + `/trash` route (`src/App.jsx`) + Sidebar entry
  (`src/components/layout/Sidebar.jsx`, below "Personal List").
- Deleted dead `src/features/tasks/components/DeleteTaskDialog.jsx` (unused, stale permission logic
  conflicting with the new two-step trash model).

## 20270720000016 — tasks_delete_regional_secretary

**Date:** 2026-07-20
**Status:** ⏳ NOT YET PUSHED — push with `supabase db push`.
**Tables affected:** `tasks` (policy change)
**Functions added/changed:** none (RLS policy only)

### Background
Regional secretary reported being unable to delete tasks. The `tasks_delete` RLS policy (from
`20270720000005`'s L3 fix) checked `super_admin`/`has_space_role(dept_lead)`/`created_by` but never
got `regional_secretary` added as an org-wide role, unlike `tasks_insert` (`20270719000008`).

### Fix
- `tasks_delete` now also allows `current_user_role() = 'regional_secretary'`, matching the org-wide
  role pattern used elsewhere.

## 20270720000009 — soft_delete_task_rpc

**Date:** 2026-07-20
**Status:** ⏳ NOT YET PUSHED — push with `supabase db push`.
**Tables affected:** `tasks` (no policy changes)
**Functions added/changed:** `soft_delete_task(uuid)` (new, SECURITY DEFINER)

### Background
User reported `42501 new row violates row-level security policy for table "tasks"` when deleting
tasks. Initial hypothesis was a re-drifted `deleted_at IS NULL` clause in `tasks_update` WITH CHECK
(same regression 20270720000007 fixed). **Live `pg_policy` check disproved this** — all four
update/delete policies (`tasks_update`, `tasks_update_assignee`, `tasks_delete`,
`tasks_update_delete_sprint_manager`) match their last-known-good repo definitions. The reported
user is super_admin + task creator + assignee, so every policy should pass.

**Most likely cause:** stale error from a prior save attempt displayed on the delete UI because
`handleDelete()` did not clear error state on first click (sets `confirmDelete=true` but leaves
the error banner). Fixed in `TaskModal.jsx` and `TaskDetailSidebar.jsx`.

### Fix
- **Frontend (UI bug):** `handleDelete` in `TaskModal.jsx` and `TaskDetailSidebar.jsx` now clears
  stale errors (`setError(null)`) when the user clicks Delete (before showing Confirm delete).
- **Defense-in-depth (RPC):** New `soft_delete_task(uuid)` SECURITY DEFINER RPC does its own
  authorization and writes `deleted_at`, so soft-delete bypasses WITH CHECK entirely. Prevents the
  class of regression where an out-of-band policy edit breaks soft-delete (as happened before 007).
  Frontend `deleteTask()` soft branch now calls the RPC instead of a direct `.update()`.
- **No policy changes** — policies are confirmed clean; no drop/recreate needed.

## 20270720000005 — permissions_audit_fixes

**Date:** 2026-07-20  
**Status:** ✅ Applied to remote 2026-07-18 via `supabase db push` — applied cleanly, no errors. Slot re-verified at push time (local `20270720000005` present, remote empty — no collision).  
**Tables affected:** `tasks`, `task_follows`, `task_checklists`, `task_checklist_items`, `sprints`  
**Functions added/changed:** `task_created_by()`, `approve_sprint_access_request()`

### Fixes

| ID | Severity | Description |
|----|----------|-------------|
| C1 | Critical | `approve_sprint_access_request` inserted `role='member'` which violates the sprint_members CHECK constraint — every approval call failed at runtime. Changed to `'contributor'`. |
| H1 | High | `tasks_select_follower` had no meeting-privacy gate — watchers on private-meeting tasks could see those tasks even if not in `allowed_viewers`. Added same meeting-privacy clause as `tasks_select_member`. |
| H2 | High | `tasks_select_lead` had no meeting-privacy gate — dept_leads could see private-meeting tasks from their department. Added same meeting-privacy clause. |
| M1 | Medium | `task_follows_insert` used a raw EXISTS subquery on `tasks` through RLS, creating a potential recursion path mirroring the SELECT cycle fixed in `20270720000001`. Added `task_created_by()` SECURITY DEFINER helper (mirrors `task_department_id()`); updated INSERT policy to use helpers instead of raw subquery. |
| M2 | Medium | `tasks_insert_sprint_member` was dead code after `20270720000002` simplified `tasks_insert` — dropped the policy. |
| L1 | Low | `checklists_update` and `checklist_items_update` policies had no `WITH CHECK` — a user could change `task_id` to a task they don't own. Added `WITH CHECK` matching `USING`. |
| L2 | Low | All six checklist policies had no `deleted_at IS NULL` guard on the task lookup — checklists on soft-deleted tasks remained writable. Added the guard. |
| L3 | Low | `tasks_delete` used `current_user_department() = department_id` while `tasks_update` uses `has_space_role()` — inconsistency could allow update but not delete for cross-dept space leads. Unified to `has_space_role()`. |

### Note: H3 was a no-op
The audit flagged `sprints_update` for using stale role name `lead`. Confirmed: the live policy (since `20260621000000_spaces_rls_security.sql`) delegates to `can_manage_sprint()` which already checks `role in ('owner', 'manager')`. No change needed.

### Frontend
- `src/features/tasks/components/WatchersPopover.jsx`: added `canRemove` prop (defaults `true`); wrapped `addWatcher`/`removeWatcher` in try/catch with toast error on failure; remove button is now hidden unless `canRemove || user.id === currentUser.id`.
- `src/features/tasks/components/TaskModal.jsx`: passes `canRemove` based on `role in (super_admin, regional_secretary, dept_lead)` or task creator.

## 20270721000000 — idea_bank_items

**Date:** 2026-07-20
**Status:** ⏳ NOT YET PUSHED — local migration only, on branch `feature/idea-bank`.
**Tables affected:** `idea_bank_items` (new table only — no existing table altered)
**Functions added/changed:** none

### Background
New "Idea Bank" feature: a space-scoped, hierarchical (`parent_item_id` self-FK) list of ideas/questions/blockers that can be converted into tasks, built as Option B (standalone table) so it never touches the live `meeting_open_items` feature. Modeled directly on `meeting_open_items` (`20270715000003_meeting_open_items.sql`) for schema/RLS conventions, but with no `meeting_id` linkage (this table isn't meeting-scoped) and an added `parent_item_id` self-reference plus `title`/`implementation_plan` columns not present on `meeting_open_items`.

### Schema
`idea_bank_items`: `id`, `space_id → departments(id) ON DELETE SET NULL`, `parent_item_id → idea_bank_items(id) ON DELETE CASCADE`, `title`, `item_text`, `item_type` (check: question/exploration/blocker/decision_point/future_consideration), `status` (check: open/in_progress/resolved), `implementation_plan`, `converted_to_task_id → tasks(id) ON DELETE SET NULL`, `user_id → auth.users(id)`, `created_at`, `updated_at`. Indexes on `(space_id, status)`, `(parent_item_id)`, `(updated_at)`.

### RLS
Matches the live `meeting_open_items` policy style exactly (raw `EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() ...)` subqueries, not the newer `current_user_role()`/`current_user_department()` helper functions used by tables audited after `20270720000005`):
- select: `super_admin`/`regional_secretary` unrestricted, OR `space_id IS NULL`, OR `u.department_id = space_id`.
- insert: `user_id = auth.uid()`.
- update/delete: creator, OR `super_admin`/`regional_secretary`, OR `dept_lead` of `space_id`. (Note: live `meeting_open_items_delete` omits `regional_secretary` — an existing asymmetry left untouched on that table. `idea_bank_items_delete` includes `regional_secretary` per this feature's own spec, not as a retroactive fix to `meeting_open_items`.)

### Frontend
- `src/features/ideaBank/lib/ideaBank.js` — new, fully independent data layer (no import from `openItems.js` or `tasks.js`).
- `src/features/ideaBank/components/IdeaBankPanel.jsx`, `IdeaBankTab.jsx` — new UI.
- `src/pages/spaces/SpaceOverview.jsx` — additive only: one import, one `TABS` array entry, one new `activeTab === 'Idea Bank'` conditional block, mirroring the existing `Open Items` tab wiring.

## 20270724000000 — tasks_delete_department_members

**Date:** 2027-07-24
**Status:** ⏳ NOT YET PUSHED — push with `supabase db push`.
**Tables affected:** `tasks` (RLS policy only)
**Functions added/changed:** `soft_delete_task`, `restore_task` (both `create or replace`, adding one authorization clause each), `tasks_delete` policy (`drop`/`create`)

### Background
Task deletion was gated to creator/assignee/dept_lead/sprint-manager/super_admin/regional_secretary — a regular member of a space couldn't trash a task in their own space unless they created or were assigned it, producing RLS 403s. Per product decision, broadened to "any member of the task's own space" for soft-delete/restore (reversible via Trash), while intentionally leaving `hard_delete_task` (permanent purge, no undo) at the narrower gate. The added membership check — `current_user_department()` or a bare `exists()` against `space_roles` — is copied verbatim from `get_trash_tasks()` (`20270720000024_scope_trash_to_space_membership.sql`); confirmed against the `space_roles` schema (`20261215000000_phase3_space_roles_schema.sql`) that the table has no `is_active`/`expires_at`/revoked-flag column to drop, so the copy is exact, not just similar.

## 20270724000001 — meeting_attendance_atomic_rpc

**Date:** 2027-07-24
**Status:** ⏳ NOT YET PUSHED — push with `supabase db push`.
**Tables affected:** `meeting_attendance` (no schema change — access pattern only)
**Functions added/changed:** `set_meeting_attendance` (new, `SECURITY DEFINER`)

### Background
`MeetingModal.jsx`/`MeetingDetailView.jsx` saved attendance via an unguarded client-side DELETE immediately followed by an INSERT, no transaction — a failed insert after a successful delete silently wiped attendees. Replaced with one `SECURITY DEFINER` RPC doing both steps inside a single function body (atomic by construction).

### ⚠️ Authorization duplication — must stay in sync with `20270722000006`
Because `SECURITY DEFINER` bypasses RLS, `set_meeting_attendance` re-implements the `meetings_update` policy's authorization union as application code (creator, `allowed_editors`, super_admin except regional-secretary-private meetings, ORS/dept_lead on published meetings only, or a `meetings_manager` grant) rather than relying on the caller's RLS. **If `meetings_update` in `20270722000006_exclude_super_admin_from_regionalsecretary_private_meetings.sql` (or any later migration that redefines that policy) ever changes, `set_meeting_attendance`'s copy in `20270724000001_meeting_attendance_atomic_rpc.sql` must be updated in the same change** — otherwise the two silently diverge and attendance-edit authorization drifts out of sync with meeting-edit authorization generally. Check this entry whenever touching meeting RLS.

## 20270724000002 — dashboard_presets_regional_updates

**Date:** 2027-07-24
**Status:** ⏳ NOT YET PUSHED — push with `supabase db push`.
**Tables affected:** `dashboard_role_defaults` (data only)
**Functions added/changed:** `get_dashboard_presets` (`create or replace`)

### Background
`get_dashboard_presets(p_role)` only included `'regional_updates'` in the `super_admin` branch — `member`/`dept_lead`/`pastor` omitted it, and there was no `regional_secretary` case at all (fell through to the generic 4-widget `else`), so even the Regional Secretary who posts updates never saw the widget by default. Added `regional_updates` to the front of `member`/`dept_lead`/`pastor`'s widget lists and added a `regional_secretary` case modeled on `dept_lead`'s list (per product decision), plus matching `dashboard_role_defaults` seed rows for the "reset to default" path.
