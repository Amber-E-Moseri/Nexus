# Nexus — Interview Prep (Deep Technical Q&A)

> Answers are grounded in the actual system. Where exact metrics aren't instrumented, honest estimates are given. Always say "we don't yet instrument X, but here's how I'd measure it" rather than fabricating numbers.
>
> **Role glossary (actual system roles):**
> - `super_admin` — full cross-department access, platform owner
> - `regional_secretary` — region-wide visibility: Flock, attendance, calendar approvals, communications
> - `pastor` — group pastors; region-wide read access to Flock + calendar, limited write
> - `dept_lead` — manages their own department's spaces, people, meetings
> - `ors` — ORS department member; unlocks Communications hub and meeting minutes
> - `programs` — Programs department member; unlocks calendar management
> - `media` — Media department member
> - `member` — default role, scoped to their own department
>
> **The 5 departments:** Admin · PFCC · Media · ORS · Pastors
>
> **Example used in answers:** "Night of Worship" (NOW) — a region-wide live event sprint. Sprint status: `active`. Sprint teams: Core Team · Media · Registration · Admin Support. Members pulled from multiple departments; tasks live on the sprint board, not inside a department space.

---

## PRODUCT & PROBLEM FRAMING

### Why Nexus exists

**What specific gap did ClickUp/Asana/Monday.com have for BLW Canada?**

Three gaps, in order of importance:

1. **Integration gap.** BLW Canada runs on Supabase for auth, Google Calendar for ministry scheduling, Google Drive for SOPs, and Slack for comms. Every off-the-shelf tool would have required glue-code webhooks, credential sharing, and brittle automations. Building natively meant the task system, the calendar, and the communications hub share one auth layer, one database, and one RLS model — no sync lag, no credential sprawl.

2. **Mental-model gap.** ClickUp's hierarchy (Workspace → Space → Folder → List → Task → Subtask) is richer than what a 30-person team needs and overwhelms non-technical members. Nexus maps directly onto how BLW Canada already thinks: Departments (spaces) → Campaigns (folders) → Workstreams (lists) → Tasks. Onboarding time dropped because we didn't have to teach an abstraction layer.

3. **Cost & data sovereignty.** ClickUp's Business plan for 30 seats is ~$720/yr. More importantly, member personal data (contact info, attendance, giving records) lives in a Canadian-hosted Supabase instance. Routing that through a US SaaS creates PIPEDA compliance friction we didn't want to manage.

**What happened before Nexus?**

- Task tracking: WhatsApp group threads, forwarded emails, and a shared Google Sheet that had 12 tabs and no version history.
- Meeting notes: Google Docs with no standard template; action items buried in paragraphs.
- Campaign coordination: the Regional Secretary manually copy-pasted names and assignments into emails each week, then followed up individually to check status.

**How much time was wasted before?**

Rough estimate from conversations before building: ~3 hours/week per dept_lead on status-checking ("did you do X?") and re-sending assignments. For 5 active dept_leads during a campaign, that's 15 lead-hours/week. Not measured post-launch with instrumentation, but the behavior change is visible — status-check WhatsApp messages dropped significantly.

**Did you do user research?**

Yes, lightweight. Interviewed the Regional Secretary (who runs logistics) and two dept_leads before writing a line of code. Key insights:

- *Surprising:* Members don't want dashboards. They want one answer to "what do I do next?" A task list sorted by deadline is sufficient. All the reporting complexity is for dept_leads and leadership, not members.
- *Surprising:* The Regional Pastor never wants to enter tasks. He wants a weekly digest — not a dashboard he has to log into.
- *Expected but confirmed:* Dept leads assign tasks on mobile (WhatsApp mentality), review on desktop. The UI had to work on both.

---

### "Night of Worship" (NOW) event sprint as primary use case

NOW is a region-wide live event — one evening, ~500 attendees, coordinated across departments. Instead of living inside a single department's space, it runs as a **sprint**: a time-boxed cross-functional initiative with its own task board, its own team structure, and its own lifecycle (`planning → active → completed → review → archived`).

**Sprint structure:**

```
Sprint: "Night of Worship — Spring Edition"
  ├── Team: Core Team       (sprint lead: regional_secretary; members: dept_leads from ORS + Admin)
  ├── Team: Media           (sprint lead: Media dept_lead; members: Media dept members)
  ├── Team: Registration    (sprint lead: ORS member; members: mixed — ORS + temporary invitees)
  └── Team: Admin Support   (sprint lead: Admin dept_lead; members: Admin dept members)
```

Each team is a `sprint_team` row. Each person on a team is a `sprint_member` row with a role of `owner`, `manager`, `lead`, or `member`. Some Registration team members are **temporary** — they have a `membership_end_date` set to the night of the event; Nexus auto-deactivates them after that date.

**Task lifecycle for a NOW sprint task:**

```
regional_secretary creates sprint + teams (status: planning)
→ Sprint auto-advances to 'active' when start_date arrives
→ Team leads assign tasks to their team members
→ Member sees task in My Tasks (task_type = 'sprint')
→ Member moves: Not Started → In Progress → Review → Completed
→ Blocked → team lead resolves dependency → back to In Progress
→ Sprint moves to 'completed' when all tasks done
→ ORS writes sprint_review (goals_achieved, lessons_learned, wins_testimonies)
→ Sprint archived
```

**How sprint tasks differ from space tasks:**

Space tasks (`task_type = 'space'`) live inside a department folder/list and are scoped to that department's RLS. Sprint tasks (`task_type = 'sprint'`) are scoped to `sprint_id` — any `sprint_member` can see them regardless of their home department. A Media member and an ORS member both see the same NOW sprint board; they'd never share a department space view.

**How many people touch a single NOW task?**

Typically 3: the team lead who creates it, the member who executes it, and the team lead again who approves completion. For dependencies between teams (Media needs the venue floor plan from Admin Support before setting up AV), the task gets a follower from the other team and sits Blocked until the dependency ships — visible to both teams on the sprint board.

**What decisions happened in Nexus vs. in meetings?**

Strategic decisions (venue, headcount target, budget) happen in the weekly ORS meeting. ORS captures action items in the Meeting Minutes feature and converts them to sprint tasks from inside Nexus — one click from a meeting record to a task assigned to a sprint team member. Execution decisions (who runs the welcome table, what time soundcheck starts) live entirely in the sprint board.

**What was the failure mode if Nexus went down during NOW prep?**

For a sprint mid-flight, the risk is team leads losing visibility into blockers. Fallback: a shared WhatsApp group per sprint team (already existed before Nexus). For the actual event night, all tasks should be completed — the sprint board is a planning/coordination tool, not a real-time operations tool on the day.

**What reports did leadership need?**

- Sprint progress bar (tasks completed / total, per team and overall) — built into SprintOverview
- Blocked task list with assignee + blocking reason — filtered view on sprint board
- Sprint review after close: `goals_achieved`, `outstanding_items`, `lessons_learned`, `wins_testimonies`, `recommendations` — captured in `sprint_reviews` table by ORS

---

### Success metrics

**How do you measure if Nexus is working?**

Current proxies (not formally instrumented):
- **Sprint task completion rate:** Completed tasks / total tasks per sprint team at close — the sprint board's progress bar shows this live
- **Staleness:** sprint tasks with `updated_at` > 7 days and status_category ≠ 'completed' (signals a stuck team)
- **Temporary member activation:** did Registration team temporary members actually log in and use their tasks before `membership_end_date`?
- **Adoption:** DAU — are team leads logging in daily during sprint active phase? (visible in Supabase auth logs)

What I'd add: a `task_views` table (user_id, task_id, viewed_at) to track the assigned → viewed → updated funnel per sprint team. Drop-off between assigned and viewed shows notification problems; drop-off between viewed and updated shows UX friction or task ambiguity.

**Did the NOW sprint succeed because of Nexus or in spite of it?**

Honest answer: both. The structural improvements — cross-department visibility without shared credentials, clear team ownership, written deadlines — were the core value. Nexus was the medium. The sprint model's real win was giving the Media team and the Registration team a shared board they could both see without needing access to each other's department spaces.

---

### User personas

**Regional Pastor:** Consumes information, never inputs it. Acceptable latency: weekly digest (not real-time). Needs: "is NOW on track?" answered in under 30 seconds.

**Regional Secretary (`regional_secretary`):** The operations hub. Cross-department visibility on everything: Flock CRM, attendance, calendar approvals, communications sends. Assigns tasks across departments; the only non-`super_admin` role that can see all five departments simultaneously.

**Group Pastors (`pastor`):** Delegators who want occasional visibility. Region-wide read access for Flock and the ministry calendar. Don't assign tasks but need to see their group's pastoral care activity (call logs in Flock CRM). Acceptable latency: daily.

**Dept Leads (`dept_lead`):** Power users. Create tasks, assign them, monitor status, follow up on blockers. Managing 30–50 tasks simultaneously during a campaign. Need fast filtering ("show me only Blocked tasks") and bulk operations. Also manage their department's spaces, members, and meeting records.

**ORS members (`ors`):** Specialist role. In addition to standard task access, they unlock Communications (email campaign management) and Meeting Minutes. During a NOW sprint, ORS members are the primary creators of meeting action items → sprint tasks.

**Members (`member`):** Occasional users. Check in when assigned a task, update status when done. Mental model: "todo list." Don't think in terms of campaigns or folders — they see My Tasks and act on due dates.

---

### Comparison to alternatives

**Could you have used ClickUp for 80% of the use case?**

Yes. 80% coverage, definitely. The 20% gap is: (1) native Supabase auth — members don't create a separate ClickUp account, they use their BLW Canada invite; (2) Ministry Calendar with per-department source visibility and event type management; (3) Flock CRM for pastor call logs; (4) Communications hub for internal email campaigns. Those four are deeply custom.

**Rebuild or migrate today?**

Start with ClickUp for task management, build only the custom integrations (Calendar sync, Flock CRM, Communications hub) as a thin layer on top. Nexus as a full replacement was the right call *given* the team's technical capacity — but the maintenance burden is real. I'd be more conservative about what to custom-build.

**Abandonment risk:**

High if I leave without a second maintainer. Mitigations in place: CLAUDE.md, all migrations versioned in git, edge functions documented. The real risk is fresh eyes debugging RLS policies under production pressure.

---

## DATA MODEL & SCHEMA

### Tasks table — field-by-field

| Field | Type | Decision |
|---|---|---|
| `id` | UUID | UUIDs prevent enumeration attacks; no sequential ID leaks row count |
| `title` | varchar(500) | 500 chars generous without being unlimited; enforced at DB level |
| `description` | text | Markdown stored as plain text; rendered client-side |
| `assignee_id` | UUID FK → users, nullable | Single assignee model; additional followers via `task_followers` table |
| `created_by_id` | UUID FK → users, non-null | Audit trail; never cleared even on reassignment |
| `list_id` | UUID FK → space_lists | Hierarchy: departments (spaces) → folders → lists → tasks |
| `status_id` | UUID FK → task_status_definitions | Two-tier: org statuses + dept-specific (see Status Hierarchy below) |
| `priority` | smallint 1–4 | 1=Urgent, 2=High, 3=Normal, 4=Low; integer for sort arithmetic |
| `due_date` | timestamptz | Timezone-aware; stored UTC, displayed in user's local time |
| `created_at`, `updated_at` | timestamptz | `updated_at` set by trigger on any row change |
| `completed_at` | timestamptz, nullable | Set when status transitions to a `completed`-category status |
| `is_personal` | boolean default false | Personal tasks (creator-only visibility) vs. shared tasks |
| `is_deleted` | boolean default false | Soft delete; hard delete deferred to periodic archive job |
| `parent_task_id` | UUID FK → tasks, nullable | Subtask support; self-referential, max 1 level deep by convention |
| `sort_order` | float8 | Fractional update avoids full-list renumber on manual reorder |
| `custom_fields` | JSONB | Schema-less extension; validated at application layer, GIN-indexed |

**Why UUID over serial int?**

Two reasons: (1) you can generate the ID client-side before the DB insert, enabling optimistic UI updates with no round-trip; (2) UUIDs don't leak row counts or insertion order when a member inspects network requests.

**Why soft delete?**

Campaign task history is organizationally important (NOW sprint audit trail). Hard deletes are irreversible. Soft delete + archive job after 90 days gives a recovery window without permanent storage bloat. Partial index `WHERE is_deleted = false` keeps active queries fast.

**Why JSONB for custom_fields?**

Different departments need different fields (ORS needs "campus assignment," Media needs "asset type," PFCC needs "zone"). Adding a column per field requires a migration for every new field. JSONB lets dept_leads self-service new fields. Trade-off: no FK constraints, no indexed lookups by default — mitigated with a GIN index.

---

### Statuses — two-tier system

```sql
task_status_definitions
  id          UUID PK
  name        varchar
  category    -- 'open' | 'in_progress' | 'completed' | 'cancelled'
  is_org_status  boolean
  org_status_id  UUID FK → task_status_definitions  -- null for org statuses
  department_id  UUID FK → departments               -- null for org statuses
  color       varchar(7)
  sort_order  smallint
  CHECK (is_org_status = true OR org_status_id IS NOT NULL)
```

The CHECK constraint is the key: you cannot create a department status without anchoring it to one of the 6 canonical org statuses. This prevents orphaned statuses that break reporting roll-ups.

**The 6 canonical org statuses:**
Not Started (open) · In Progress (in_progress) · Review (in_progress) · Blocked (in_progress) · Completed (completed) · Cancelled (cancelled)

**Why this over a simple enum?**

Enums require a migration to add values. This model lets a dept_lead add "Pending Approval" (mapped to Review / in_progress) without touching the schema. Org statuses are the reporting contract; dept statuses are the UX vocabulary. ORS and PFCC both have different naming conventions for the same workflow stages.

**State machine (application-layer enforcement):**

```javascript
const VALID_TRANSITIONS = {
  open:        ['in_progress', 'cancelled'],
  in_progress: ['open', 'completed', 'cancelled'],
  completed:   ['in_progress'],  // re-open allowed
  cancelled:   ['open'],         // uncancel allowed
};
```

The status dropdown only renders options that pass this check. No DB trigger enforces it — a known gap we'd close with a PG trigger if we needed stricter guarantees.

---

### Users table

```sql
users
  id            UUID PK  (= auth.users.id from Supabase Auth)
  email         varchar UNIQUE
  full_name     varchar
  role          -- 'super_admin' | 'regional_secretary' | 'pastor' | 'dept_lead'
                --  | 'ors' | 'programs' | 'media' | 'member'
  department_id UUID FK → departments
  group_name    varchar   -- BLW group/campus affiliation
  avatar_url    varchar
  phone         varchar
  is_active     boolean default true
  last_login    timestamptz
  created_at    timestamptz
```

**Can a user have multiple roles?**

No — single role per user by design. BLW Canada's hierarchy is strict: each person has one seat in the org chart. The role hierarchy in code is:

```javascript
const ROLE_HIERARCHY = [
  'super_admin', 'regional_secretary', 'dept_lead', 
  'pastor', 'ors', 'programs', 'media', 'member'
];
```

If a member is promoted to dept_lead, the role column is updated and their JWT is refreshed on next login (Supabase Auth hook stamps `user_role` into the JWT claim).

**How do role changes propagate?**

JWT TTL is 1 hour. Role change takes effect on the user's next login or token refresh. For security-critical demotions (someone leaves the team), we can force token invalidation via Supabase admin API — but this is a manual step today.

---

### RLS — the actual policies

```sql
-- Members: see tasks assigned to them or created by them in their department
CREATE POLICY "member_select_tasks" ON tasks
  FOR SELECT USING (
    assignee_id = auth.uid()
    OR created_by_id = auth.uid()
    OR (
      is_personal = false
      AND list_id IN (
        SELECT sl.id FROM space_lists sl
        JOIN folders f ON sl.folder_id = f.id
        WHERE f.space_id = current_user_department_id()
      )
    )
  );

-- Dept leads: see all non-personal tasks in their department
CREATE POLICY "dept_lead_select" ON tasks
  FOR SELECT USING (
    current_user_role() IN ('dept_lead', 'regional_secretary')
    AND is_personal = false
    AND list_id IN (
      SELECT sl.id FROM space_lists sl
      JOIN folders f ON sl.folder_id = f.id
      WHERE f.space_id = current_user_department_id()
    )
  );

-- Super admin and regional_secretary: see everything except personal tasks
-- (personal tasks visible only to creator, even for admins)
CREATE POLICY "admin_select_tasks" ON tasks
  FOR SELECT USING (
    current_user_role() IN ('super_admin', 'regional_secretary')
    AND (is_personal = false OR created_by_id = auth.uid())
  );
```

**How many policies total?**

~40–50 across all tables (tasks, space_lists, folders, departments, task_comments, calendar_events, task_status_definitions, etc.). Each table has separate policies for SELECT, INSERT, UPDATE, DELETE.

**Performance impact:**

The `current_user_department_id()` helper is a SECURITY DEFINER function that reads from the JWT claim rather than querying the users table — avoids a round-trip on every row check. Still adds 1–3ms to queries on large result sets.

**Bug we hit:**

Pastors (`pastor` role) could initially see tasks from all departments because the first policy draft only checked `current_user_role() = 'pastor'` with no department scope. Found during manual testing with two accounts. Fix: pastors see only their own tasks + the pastoral activity feed (Flock CRM), not the full task board.

---

### Indexes

```sql
-- Hottest query: dept_lead dashboard, member My Tasks
CREATE INDEX idx_tasks_assignee_active 
  ON tasks(assignee_id, due_date ASC NULLS LAST) 
  WHERE is_deleted = false;

-- Space-level task listing
CREATE INDEX idx_tasks_list_id ON tasks(list_id) WHERE is_deleted = false;

-- Full-text search
CREATE INDEX idx_tasks_fts 
  ON tasks USING GIN(to_tsvector('english', title || ' ' || coalesce(description, '')));

-- JSONB custom fields (ORS campus assignment, PFCC zone, etc.)
CREATE INDEX idx_tasks_custom_fields ON tasks USING GIN(custom_fields);
```

---

## QUERYING, FILTERING & PERFORMANCE

### The hottest queries

**1. Member My Tasks (the most common view):**

```sql
SELECT t.id, t.title, t.due_date, t.priority,
       u.full_name AS assignee_name,
       s.name AS status_name, s.color, s.category
FROM tasks t
JOIN users u ON t.assignee_id = u.id
JOIN task_status_definitions s ON t.status_id = s.id
WHERE t.assignee_id = $1
  AND t.is_deleted = false
  AND s.category != 'completed'
ORDER BY t.due_date ASC NULLS LAST
LIMIT 50;
```

At current scale (~2,000–3,000 tasks total), returns in <10ms. The partial index on `(assignee_id, due_date) WHERE is_deleted = false` makes this an index scan.

**2. Dept lead department board (all tasks in their department):**

```sql
SELECT t.*, u.full_name AS assignee_name, s.name AS status_name, s.color
FROM tasks t
JOIN space_lists sl ON t.list_id = sl.id
JOIN folders f ON sl.folder_id = f.id
JOIN task_status_definitions s ON t.status_id = s.id
LEFT JOIN users u ON t.assignee_id = u.id
WHERE f.space_id = $1  -- department id
  AND t.is_deleted = false
ORDER BY t.due_date ASC NULLS LAST;
```

One query, all joins in a single round-trip via Supabase's embedded select syntax. No N+1.

**3. Dashboard status counts (SpaceOverview cards):**

```sql
SELECT s.name, s.color, s.category, COUNT(t.id) AS count
FROM task_status_definitions s
LEFT JOIN tasks t 
  ON t.status_id = s.id 
  AND t.is_deleted = false
  AND t.list_id IN (
    SELECT sl.id FROM space_lists sl
    JOIN folders f ON sl.folder_id = f.id
    WHERE f.space_id = $1
  )
WHERE s.department_id = $1 OR s.is_org_status = true
GROUP BY s.id, s.name, s.color, s.category;
```

Run once on SpaceOverview load. No caching currently — at <5,000 tasks per department this is <5ms. At 50k tasks, we'd switch to a materialized view refreshed via Postgres NOTIFY.

**4. Task full-text search:**

```sql
SELECT id, title, due_date, assignee_id,
       ts_rank(to_tsvector('english', title || ' ' || coalesce(description, '')), 
               plainto_tsquery('english', $1)) AS rank
FROM tasks
WHERE to_tsvector('english', title || ' ' || coalesce(description, ''))
      @@ plainto_tsquery('english', $1)
  AND is_deleted = false
ORDER BY rank DESC
LIMIT 20;
```

GIN index makes this fast. ILIKE would require a sequential scan at scale.

### N+1 prevention

All queries select related data in one JOIN rather than loading tasks then fetching assignees per-task. Supabase's `.select()` compiles embedded resource syntax to a single JOIN:

```javascript
const { data } = await supabase
  .from('tasks')
  .select(`
    id, title, due_date, priority, is_personal,
    assignee:users(id, full_name, avatar_url),
    status:task_status_definitions(id, name, color, category)
  `)
  .eq('assignee_id', userId)
  .eq('is_deleted', false);
```

### Real performance issue hit

During bulk import of ~400 NOW sprint tasks from the planning spreadsheet, we hit Supabase's free-tier connection pool limit (20 concurrent connections). The import was running 400 individual inserts. Fixed by batching: `supabase.from('tasks').insert([...400 rows...])` — single round-trip, single connection slot.

---

## PERMISSIONS, SECURITY & RLS

### What each role can do

| Action | `member` | `ors` / `programs` / `media` | `pastor` | `dept_lead` | `regional_secretary` | `super_admin` |
|---|---|---|---|---|---|---|
| View own tasks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View dept tasks | own only | own dept | ❌ | ✅ | ✅ all depts | ✅ all depts |
| Create tasks | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Assign tasks | ❌ | ❌ | ❌ | ✅ (own dept) | ✅ | ✅ |
| Edit task status | own tasks | own tasks | own tasks | all in dept | all | all |
| Delete (soft) | ❌ | ❌ | ❌ | ✅ own dept | ✅ | ✅ |
| Manage statuses | ❌ | ❌ | ❌ | ✅ own dept | ✅ | ✅ |
| Communications hub | ❌ | ✅ (ors only) | ❌ | ❌ | ✅ | ✅ |
| Meeting minutes | ❌ | ✅ (ors only) | ❌ | ✅ | ✅ | ✅ |
| Flock CRM | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Calendar management | ❌ | ❌ | ❌ | ✅ (Programs/Admin) | ✅ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

### Privilege escalation vectors we guarded against

1. **Role self-promotion:** The `users.role` column has an RLS UPDATE policy that prevents anyone from updating their own role. Only `super_admin` can update roles.

2. **Cross-department task visibility:** JWT claim `user_department_id` is embedded at login by a Supabase Auth hook. A member cannot fake their department_id because the JWT is signed by Supabase's private key.

3. **Personal task leakage:** `is_personal = true` tasks are visible only to `created_by_id = auth.uid()`. Initial super_admin policy (`FOR ALL`) would have exposed personal tasks. Fixed by adding explicit exclusion: personal tasks are exempt even for `super_admin` unless they're the creator.

4. **Service role key:** Never in client code. The Supabase anon key is public by design (RLS is the security layer). The service role key (bypasses RLS) lives only in Vercel environment variables and edge function secrets.

5. **ORS-gated features:** Communications and Meeting Minutes are gated by checking `d.name = 'ORS' OR d.name = 'ORS Projects'` in the RLS policy — a dept_lead from PFCC cannot access these even with the dept_lead role.

### Real incident: broken-invite cohort

Two users were invited before the accept-invite RPC was hardened. Their accounts were created but bypassed both the email-verification step and the role-assignment RPC. Result: null roles in JWT claims, which caused them to hit the most permissive policy fallback. Fixed by batch-patching their user records and role claims directly via the Supabase admin API. Verified via live JWT inspection. Lesson: the invite flow must validate role claim presence before creating the session, not after.

### Authentication

- Supabase Auth with email/password + custom token-based invite flow (no self-sign-up)
- JWT TTL: 1 hour; refresh token valid 7 days
- Multiple sessions allowed (phone + desktop simultaneously)
- Compromised account: `super_admin` can revoke all sessions via `supabase.auth.admin.signOut(userId, { scope: 'global' })`

---

## REAL-TIME & COLLABORATION

### How real-time works

Supabase Realtime via Postgres LISTEN/NOTIFY. When a row changes in `tasks`, Supabase broadcasts a `postgres_changes` event to subscribed clients.

```javascript
useEffect(() => {
  const channel = supabase
    .channel(`tasks-dept-${departmentId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'tasks',
    }, () => {
      queryClient.invalidateQueries(['tasks', departmentId]);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [departmentId]);
```

The handler invalidates React Query's cache, triggering a refetch. Intentionally simple — we don't apply the delta directly (avoids complex merge logic). Trade-off: extra round-trip per change, but correctness is guaranteed.

### Concurrent edit conflict model

Last-write-wins. Concurrent edits to the same field are rare because dept_leads own disjoint task sets. If two dept_leads (e.g., ORS and Admin) edit a cross-department task simultaneously, one overwrites the other silently — `updated_at` records who won. At current team size this is acceptable; at scale we'd add an `optimistic_lock_version` integer and check it on update.

### Presence

Not implemented. At 30 people, verbal coordination handles simultaneous editing. Supabase Realtime has a Presence channel feature we'd enable if the team grew past ~100 active users.

### Offline support

Not implemented. On reconnect, React Query's `refetchOnWindowFocus: true` plus Realtime subscription catch-up handle refresh. A member who marks a task complete while offline would need to redo it on reconnect. Acceptable for the current use case.

---

## STATUS WORKFLOW & STATE MACHINE

### Lifecycle for a NOW sprint task

The NOW sprint has 4 teams. Here's how a cross-team task flows:

```
regional_secretary creates sprint + 4 teams in SprintOverview (status: planning)
  ↓
Sprint auto-advances to 'active' on start_date
  ↓
Media team lead creates "AV setup checklist" task → Not Started
  assigns to a Media team member (sprint_member, role='member')
  ↓
Member moves → In Progress
  ↓
Dependency: needs venue floor plan from Admin Support team
  → status → Blocked, comment: "waiting on Admin Support floor plan"
  → Admin Support team lead sees it (they're both on the same sprint board)
  → Admin Support member completes "Submit floor plan" task → Completed
  ↓
Media member unblocks → back to In Progress → completes AV checklist → Completed
  ↓
Media team lead spot-checks → marks their team tasks reviewed
  ↓
All teams reach 100% → sprint_lead advances sprint to 'completed'
  ↓
ORS writes sprint_review (goals_achieved, lessons_learned, wins_testimonies)
  ↓
Sprint archived → temporary Registration members auto-deactivated by membership_end_date
```

**What's unique about sprint tasks vs. space tasks:**

Sprint tasks (`task_type = 'sprint'`) are visible to all `sprint_members` regardless of their home department. A Media member and a Registration member both see each other's tasks on the NOW sprint board — they'd never share a department space view. The RLS policy on tasks checks `is_sprint_member(sprint_id)` instead of `current_user_department_id()`.

### Time-based state

Overdue tasks (`due_date < now AND category != 'completed'`) show a red deadline badge — computed client-side at render time. No cron job stamps "overdue" into the DB; that would create noise in the sprint activity log and require a notification fan-out. The sprint progress bar degrades visually when tasks go overdue, which is enough signal for a team lead.

### Bulk status changes

Sprint team leads can bulk-select their team's tasks and mark them completed. Implementation: one `supabase.from('tasks').update({status_id}).in('id', selectedIds)` — single transaction. Notifications batched: one digest per affected assignee, not one per task. Undo is not implemented — a bulk close is intentional and reversible per-task manually.

---

## TESTING, RELIABILITY & DEBUGGING

### Test coverage

- **RLS policies:** manually tested with two Supabase test accounts (one `dept_lead`, one `member`). No automated RLS test suite yet.
- **JWT claims:** unit-tested in `src/tests/jwtClaims.test.js` — verifies role and department_id round-trip correctly through the Auth hook.
- **Status transitions:** `canTransition` helper is unit-tested.
- **Edge functions:** each has a test invocation script in `supabase/functions/*/test.sh`.
- **Calendar access:** `src/tests/calendar-settings-access.test.js` covers `super_admin`, `dept_lead` (Programs/Admin = yes, Media/ORS/etc = no), `pastor` (= no), `member` (= no).

What I'd add: Playwright e2e suite covering the golden path — login (as `dept_lead`) → create task → assign to `member` → member updates status → verify dashboard count updates.

### Real bugs found

1. **Personal task leak:** `super_admin` policy was `FOR ALL` with no personal-task exception. A `super_admin` could see other users' personal tasks. Found: manual testing. Fix: added `AND (is_personal = false OR created_by_id = auth.uid())`.

2. **Status count stale on SpaceOverview:** Two simultaneous status updates caused React Query to serve a 30-second-stale count briefly. Not a correctness bug — a staleTime issue. Fixed by reducing `staleTime` from 30s to 5s for status-count queries.

3. **Vault secret name collision:** `vault_create_secret` throws on duplicate name. On Google Calendar reconnect, the second token creation failed silently (error logged, not surfaced to UI). Calendar sync then used a stale token and failed. Diagnosis: checked edge function logs → saw vault collision error. Fix: switched to `vault_upsert_secret` (idempotent). Now documented in CLAUDE.md as a critical pattern.

4. **`profile !== undefined` OAuth gotcha:** OAuth callback component used `profile !== undefined` as the ready check. In JavaScript, `null !== undefined` is `true`, so the check passed when profile was `null` (still loading). Effect ran, hit `profile.id` on null, threw "user not authenticated," then re-ran when real profile loaded — double execution, confusing flash. Fix: `profile?.id` truthy check. One character change, two hours to diagnose.

### Production debugging workflow

"An ORS dept_lead reports tasks are slow to load":
1. Supabase Dashboard → Logs → Postgres → filter by slow queries (>100ms)
2. Find the specific query in logs
3. `EXPLAIN ANALYZE` in Supabase SQL editor
4. Look for `Seq Scan` where index scan expected
5. Check if statistics are stale → `ANALYZE tasks`
6. Check if RLS subquery is the bottleneck (nested SELECT on space_lists → folders)
7. If so, cache `current_user_department_id()` result or denormalize

---

## INTEGRATIONS

### Google Calendar sync architecture

One shared Google OAuth connection (`ministry_calendar_connection` singleton). Connection ≠ import — dept_leads separately add calendar sources and trigger sync. Sync is pull-only: Google Calendar → `calendar_events` (not bidirectional, to avoid conflicts).

Multiple sources can have `push_enabled = true` simultaneously. We had a migration with a single-push-per-org UNIQUE constraint — wrong design, because ORS and Programs both need independent push channels. Dropped that constraint in `20261224000004`.

**Vault pattern (critical — learned the hard way):**

The vault schema is NOT exposed to PostgREST. `supabase.from('vault.secrets')` silently no-ops — no error, no data. All OAuth token storage goes through SECURITY DEFINER RPCs: `vault_upsert_secret(name, value)` to store, `vault_get_secret(id)` to decrypt, `vault_delete_secret(name)` to remove. We discovered this when tokens appeared to save but were never persisted — a silent no-op that took significant debugging to diagnose.

### Email (Resend)

Used for: task assignment notifications, deadline reminders (1 day out), NOW sprint invitation emails (via RSVP system), weekly digest.

Bounce handling: Resend webhook → Supabase edge function → marks `users.email_bounced = true` → further notifications suppressed. Prevents spam-trap damage to our sender reputation.

### Communications hub (ORS-gated)

The native Communications hub (built as a nested-route feature, not an iframe) is accessible only to `ors`, `regional_secretary`, and `super_admin`. ORS uses it to manage email campaigns to BLW Canada members. The RLS policy gates all `communication_campaigns` rows to users whose department is ORS or who have `regional_secretary`/`super_admin` role.

### Flock CRM (pastor-gated)

Per-pastor call logs, RLS-enforced so each `pastor` sees only their own contacts. `regional_secretary` and `super_admin` see all. Pastors access it via the Flock widget in the sidebar. Phone/email click-to-call/email is wired client-side; the underlying contact data is fully DB-backed.

---

## REPORTING & ANALYTICS

### SpaceOverview dashboard

5-status breakdown cards (Not Started, In Progress, Review, Blocked, Completed). Each card shows count, is clickable to filter the task list to that status, and uses the actual department's status color. Implemented as a GROUP BY query per department on load.

### What the Regional Pastor actually needs

- "Is NOW on track?" → sprint progress bar (tasks completed / total per team) on SprintOverview
- "Who's blocking progress?" → Blocked tasks with assignee names
- "Are we on schedule?" → Overdue count with names (he follows up Sunday service)

Automated weekly email digest is on the roadmap: Resend templated email triggered by a `pg_cron` job at Monday 8am EST, summarizing task counts and overdue items per department.

### Metrics I'd add

- **Velocity:** tasks completed per week per dept_lead (trend over NOW sprint duration)
- **Cycle time:** `completed_at - created_at` distribution (p50, p95)
- **Overdue rate:** tasks past deadline / total active tasks at any point
- **Member engagement:** members who viewed AND updated their task / members assigned

---

## TECHNICAL DECISIONS & TRADE-OFFS

### Why Supabase over raw Postgres + custom API

| Factor | Supabase | Custom |
|---|---|---|
| Auth + JWT hooks | Built-in | Weeks of work |
| RLS | DB-native, first-class | Need middleware |
| Real-time | Included | Custom WebSocket server |
| Migrations | CLI tooling | Custom tooling |
| Vault (secrets) | Built-in | Build or use AWS Secrets Manager |
| Maintenance | Managed | You own the server |
| Lock-in | Medium | Low |

At 30 users, managed beats custom every time. At 10,000 users, Supabase connection limits and cost curve would push toward self-hosted Postgres + custom API.

### Why inline CSS over Tailwind

Tailwind utility classes create 30-class `className` strings that are hard to read and refactor, and create specificity surprises. Inline styles + CSS custom properties (`var(--color-primary)`, `var(--text-secondary)`) are verbose but explicit. Design tokens in `index.css` create a system without a build-time dependency. **Critical:** `src/styles/index.css` is append-only — never overwritten. All existing tokens are preserved.

### Denormalization decisions

We store `assignee_name` as a JOIN, not denormalized on the task row. At current scale, the JOIN costs nothing. If we saw slow dashboard loads at 50k tasks, the first optimization would be denormalizing `assignee_name` and `status_name` onto the task row — accept stale reads for up to 1 second, acceptable for a task management context.

### Soft delete trade-offs

**Pro:** NOW sprint audit trail, data recovery, PIPEDA compliance (can't prove you deleted what you claim to have deleted without a record).
**Con:** Every query filters `WHERE is_deleted = false`. Mitigated with partial index: `CREATE INDEX idx_tasks_active ON tasks(id) WHERE is_deleted = false`.

---

## SCALABILITY

### Current scale

- Tasks: ~2,000–3,000 total
- Active users: ~30
- Concurrent users at peak (NOW sprint active phase, all 4 teams working): estimated 15–20
- Database: <100MB
- Supabase plan: free tier (connection pool: 20)

### Bottlenecks at 10x scale (300 users, 30,000 tasks)

1. **Status-count GROUP BY** starts getting measurable at 30k rows. Fix: materialized view refreshed via Realtime trigger.
2. **Realtime subscriptions:** 300 concurrent subscribers to `postgres_changes`. Supabase Realtime handles this fine but broadcast fan-out per change grows linearly.
3. **Connection pool:** 20 connections saturated. Fix: upgrade to Supabase Pro (60 connections) + ensure PgBouncer is routing correctly.

### Bottlenecks at 100x scale (3,000 users)

- Read replicas for dashboard queries (Supabase Enterprise)
- Separate notification service (edge function fan-out doesn't scale to 3,000 recipients per event)
- Search: move from Postgres FTS to Typesense or Algolia

---

## DEPLOYMENT & DEVOPS

### Stack

- **Frontend:** Vercel (auto-deploy on push to `main`; instant rollback)
- **Backend:** Supabase managed Postgres + Edge Functions (Deno runtime)
- **Migrations:** `supabase db push` via CLI; versioned in `supabase/migrations/`
- **Secrets:** Vercel env vars for frontend; Supabase Vault RPCs for runtime secrets (OAuth tokens)

### Migration process

```
1. Write SQL in supabase/migrations/<timestamp>_<name>.sql
2. Test locally: supabase start → supabase db reset (replays all migrations)
3. Review: supabase db diff --name "migration_name"
4. Push to remote: supabase db push
5. Verify in Supabase dashboard → Table Editor
```

**Zero-downtime rule:** All migrations are additive-only (add column, add table, add index). Never rename/drop in a single migration — always: add new → backfill → update app → drop old (three separate migrations, three separate deployments).

### Rollback strategy

Vercel: instant rollback to previous deployment (~30 seconds, UI button). Database: no automatic rollback. We maintain a `_rollback.sql` comment block at the top of each migration for manual reversal. Never had to use one in production.

### Monitoring

- **Errors:** Supabase Dashboard → Logs → Edge Functions
- **Slow queries:** Supabase Dashboard → Reports → Slow Queries
- **Uptime:** Not formally monitored yet (it's an internal tool, no SLA)
- **On-call:** None — if Nexus goes down during NOW sprint prep, fallback is per-team WhatsApp groups (already existed pre-Nexus)

---

## QUICK-REFERENCE VERBAL ANSWERS

**"What is Nexus?"**
> A custom internal operations platform for BLW Canada — 30 people across 5 departments: Admin, PFCC, Media, ORS, and Pastors. It replaced a patchwork of WhatsApp threads, Google Sheets, and ClickUp with a unified workspace for tasks, calendar, communications, and pastoral care. Built on React + Supabase with multi-tenant row-level security enforced at the database layer.

**"What's the hardest technical problem you solved?"**
> The two-tier status hierarchy. Different departments needed custom workflow stages — ORS wanted "Pending Approval," PFCC wanted "Zone Review" — without breaking org-wide reporting. I designed a CHECK constraint that forces every department status to anchor to one of 6 canonical org statuses. Reporting aggregates by canonical statuses; each department sees their own vocabulary. This solved the apples-to-apples reporting problem without requiring a migration every time a dept_lead wanted a new status name.

**"How do you enforce security?"**
> Three layers: Supabase RLS at the database row level (enforced even on direct DB connections), JWT claims baked into every auth token — `user_role` and `user_department_id` signed by Supabase so they can't be forged — and application-layer guards for business logic like valid status transitions and ORS-gated feature access. The service role key, which bypasses RLS, lives only in Vercel environment variables and Supabase edge function secrets, never in client code.

**"Walk me through a query from browser to database."**
> A Media team member opens the NOW sprint board. React fires a React Query fetch for sprint tasks. Supabase's JS client builds a parameterized SQL query — no string concatenation, no injection vector. The request hits Supabase's REST API with the user's JWT in the Authorization header. Supabase verifies the JWT, stamps the Postgres session with `request.jwt.claims`, and runs the query. The RLS policy on tasks checks `is_sprint_member(sprint_id)` — a Postgres function that queries `sprint_members` for the current user's UID — and returns only tasks belonging to that sprint. The Media member sees their team's tasks alongside the Registration and Admin Support teams' tasks, even though they're from different departments. The JSON goes back to React Query, cached for 5 seconds, and renders the sprint task board grouped by team.

**"What would you do differently if starting over?"**
> Two things: (1) Start with an automated RLS test suite before writing features — a `SET LOCAL role` + `SET LOCAL request.jwt.claims` test transaction per role per table, run in CI. RLS bugs are nearly impossible to catch manually at scale. (2) Keep the invite flow simpler — the custom token-based invite has edge cases (token expiry, re-invite of existing user, the broken-invite cohort incident) that Supabase Auth magic links would have handled for free.

**"Tell me about a bug you caused."**
> The vault secret collision. I used `vault_create_secret` to store Google OAuth tokens. On reconnect, the function hit a UNIQUE constraint violation because the secret name already existed, threw an error, and the edge function swallowed it — logged but not surfaced. Calendar sync then used a stale token and failed silently. The user reported "sync stopped working after reconnecting." I checked edge function logs, found the vault error, switched to `vault_upsert_secret` (idempotent), and added the pattern to CLAUDE.md so no one hits it again. Took 20 minutes to fix, two hours to diagnose — because the error wasn't visible in the UI.

---

*Last updated: 2026-07-11 — Amber Moseri*
