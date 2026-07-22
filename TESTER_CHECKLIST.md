# Tester Checklist — fix/board-list-sprint-mismatch

Covers everything committed in this session (12 commits, `a6b5ee4`..`5ad62c2`). All DB migrations are already live on the linked Supabase project — no `db push` needed before testing.

## 🔴 Priority 1 — the reported blockers

**Board/List drag-and-drop revert + "infinite recursion" error**
- [ ] Open any space's Board view. Drag a task from one column to another. Refresh the page — the task should **stay** in the new column (previously reverted).
- [ ] Repeat on List view (drag within/between status sections).
- [ ] Repeat on a Sprint board.
- [ ] Try this as a few different roles (member, dept_lead, regional_secretary, super_admin) and in the Pastors space specifically.
- [ ] Confirm no "infinite recursion detected in policy for relation tasks" error appears in the browser console or as a toast.

**Assignee picker hidden/clipped in List view**
- [ ] In List view, click **+ Add task** on any status section, then click **Assign to**. Confirm the member list is fully visible (not cut off), for a section near the bottom of the page especially.

## Idea Bank (new feature)
- [ ] Open a space → **Idea Bank** tab (new, next to Open Items).
- [ ] Create an idea (try each type: question, exploration, blocker, decision point, future consideration).
- [ ] Nest a sub-idea under a parent idea.
- [ ] Convert an idea to a task; confirm the task is created and linked back.
- [ ] Confirm dept_lead/regional_secretary/super_admin can edit/delete any idea in their scope; a regular member can only edit their own.

## Task Trash (new feature)
- [ ] Delete a task (soft delete) — confirm it disappears from the board/list.
- [ ] Go to **Trash** in the sidebar (new nav item, below Personal List). Confirm the deleted task appears there.
- [ ] **Restore** it — confirm it reappears on its original board/list.
- [ ] As super_admin/regional_secretary/dept_lead, permanently delete a trashed task ("Delete Forever") — confirm it's gone for good.
- [ ] As a regular member, confirm you can soft-delete/restore your own space's tasks but do **not** see a "Delete Forever" option.
- [ ] Filter Trash by space using the space dropdown (only shows if trash spans 2+ spaces).

## Task status hierarchy
- [ ] Check any space's status settings / Kanban — should show exactly **5** canonical statuses worth of mapping (To Do, In Progress, Review, Completed, Cancelled), no lingering "Not Started" or "Blocked" duplicates.
- [ ] Create a new task — confirm it defaults to **To Do** (not "Not Started").
- [ ] Create a new custom dept-scoped status in Space Settings — confirm it's created without error and its parent status resolves correctly (not silently mapped to a retired status).
- [ ] Create a personal task (no department) — confirm it lands in its real status column, not lumped into "Other."

## Sprints
- [ ] Invite an external person to a sprint as a regular sprint member (not owner/manager) — should now succeed.
- [ ] Add an existing platform user to a sprint as a regular member — should now succeed.
- [ ] Create a sprint from a template — confirm it doesn't error and team-based task linking works.
- [ ] Tag a sprint as "group" or "regional" and confirm the label shows where relevant.
- [ ] Set a per-team goal on a multi-team sprint; confirm it's scoped to that team only.
- [ ] Create a sprint with no end date — confirm it still shows up in the sidebar's active-sprints quick list.
- [ ] Create a task inside a sprint — confirm it shows up in that sprint's home space's Space Overview completion stats.
- [ ] Check "My Team" view for a member on multiple sprint teams — task cards should show a team-label badge.

## Meetings privacy
- [ ] Create a meeting as regional_secretary — confirm it's automatically private.
- [ ] As dept_lead/ORS/meetings_manager-grant holder, confirm you can see **published** meetings from other departments but **not** other people's private meetings.
- [ ] As the meeting owner, share notes with a specific attendee on a 1-on-1 meeting; confirm only that attendee (not the whole department) can see the shared notes.
- [ ] Edit attendance on a meeting, refresh — confirm changes persisted (previously only visible to the record owner).
- [ ] As a non-editor viewer of a meeting, confirm you can view but cannot rename/delete/edit agenda or attendees.
- [ ] Create a meeting via the lightweight agenda editor (Schedule/Log meeting) — confirm agenda items save without error.
- [ ] Check Open Items tab in a space — now a flat list grouped by meeting (no more kanban/drag or inline convert-to-task; that flow moved to Idea Bank).

## Dashboard
- [ ] Confirm "Absent Members Alert" and "Team Availability" widgets are gone from every role's dashboard (removed, not just hidden).
- [ ] Check Team Velocity Trend widget — bars should never exceed 100% height even if underlying data is off.
- [ ] Confirm dashboard loads reasonably fast (perf indexes added).

## Automations
- [ ] Trigger a department-scoped automation that mutates a task (status change/assign/field/list-move) targeting a task in a **different** department — should now be blocked/no-op instead of silently applying cross-department.
- [ ] Use a template with a dotted variable like `{{task.title}}` — confirm it renders correctly.
- [ ] Check `automation_run_log` — new runs should show `triggered_by`/`automation_owner_id`.

## Flock CRM (My Flock)
- [ ] Log a voice interaction via FlockVoiceInteractionLogger — confirm AI summary/log panel displays correctly.
- [ ] Check My Flock task view — tasks should bucket under the correct flock member even for sprint/co-assigned tasks; subtasks should not double-count in per-member totals.

## Meeting AI extraction / doc generation
- [ ] Run AI extraction on a long meeting transcript — confirm it completes without hitting a stuck "processing" state (previously could hang indefinitely on a slow/stalled upstream call).
- [ ] Generate a meeting doc/PDF — confirm it generates correctly.

## Task detail panel (watchers/checklists/files)
- [ ] Add/remove a watcher on a task you don't own — confirm permission matches your role (creator/admin can manage others; regular members can only remove themselves).
- [ ] Edit a checklist as a secondary assignee (via task_assignees, not the primary assignee) — should now succeed (previously blocked).
- [ ] Edit a checklist as regional_secretary — should now succeed.
- [ ] Upload a file to a task via Google Drive picker, refresh the page — confirm the file link persists (previously vanished on reload).

## Small fixes (spot-check only)
- [ ] Support ticket: reply on a **closed** ticket — should now be allowed.
- [ ] Planner (Time Blocking): schedule a task into a time block — confirm it disappears from the "unscheduled" pool.
- [ ] Communications campaign editor: `{{first_name}}` variable chip is available.
- [ ] Resend an **expired** user invitation — should now succeed (previously incorrectly blocked as "expired").
- [ ] Delete a file attachment — confirm no orphaned/broken reference appears if storage delete fails.

---
**Note:** `.claude/launch.json`, `docs/*`, and `supabase/migration-log.md` changes are non-functional (tooling/docs) — no testing needed.
