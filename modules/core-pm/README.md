# Core PM — Task & Sprint Management

## Problem

The organization needed a task system that could handle both individual work (personal task lists, "my tasks" cross-space views) and team coordination (sprints, Kanban boards) — with per-department data isolation enforced at the database layer, not the application layer. The off-the-shelf tool being replaced had two blocking limitations: it couldn't model the org's status vocabulary (each department had different workflow names for the same lifecycle stages), and its permissions model didn't match how departments operated independently but sometimes shared work.

## Key Technical Decisions

**Two-tier status hierarchy.** Five canonical org-wide statuses (To Do, In Progress, Review, Completed, Cancelled) anchor all reporting. Each department can define its own sub-statuses that map to a parent via a foreign key enforced by a `CHECK` constraint (`org_status_id IS NOT NULL` for non-org statuses). This enables cross-space rollup queries ("what's In Progress across all sprints?") while letting individual teams define their own workflow vocabulary without diverging from the canonical lifecycle.

**RLS-enforced visibility.** Task filtering happens in the database, not the component. A `dept_lead` policy returns their department's full task set; a `member` policy returns only tasks they're assigned to or following. The UI renders what the query returns — no conditional visibility logic in the component tree.

**Sprints as first-class entities.** Sprints have their own membership model (`sprint_members` with `expires_at` for temporary cross-team assignments). External collaborators can be invited by email via a signed token flow without having a platform account. Sprint boards support team velocity tracking, sprint goals, linked meetings, and a review/retrospective flow.

## Schema Highlights

- `tasks → lists → folders → spaces` — four-level hierarchy mirroring the ClickUp data model
- `task_status_definitions`: `is_org_status BOOL`, `org_status_id UUID REFERENCES ... CHECK (is_org_status OR org_status_id IS NOT NULL)`
- `sprints`, `sprint_members` (`expires_at TIMESTAMPTZ` for temporary membership)
- `task_follows` — follower fan-out powering the activity feed and a per-user iCal task feed
- `task_comments` — inline comments with `@mention` extraction, subtask conversion, and file attachments

## Engineering Challenge: Retiring a Status Without a Maintenance Window

Fourteen months into production, the "Not Started" status (added as the original To Do default) was retired after a newer "To Do" status was introduced — leaving every space showing both in its picker. The challenge: atomically remap all existing tasks off the retired status and remove it from all pickers, without locking tables or requiring a maintenance window.

The solution used a single migration: an `UPDATE` with a correlated subquery to remap affected tasks to "To Do" in one statement, followed by flipping `active = false` on the retired rows. The `get_space_statuses()` RPC already filtered on `active = true`, so pickers stopped showing the retired status the moment the migration committed — no application code change needed. The same pattern was later reused to retire a "Blocked" status.
