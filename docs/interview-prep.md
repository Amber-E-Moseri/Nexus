# BLW CAN NEXUS — Interview Preparation

---

## Quick Reference Card

| Decision # | One-line summary | Category |
|---|---|---|
| DECISION-001 | Supabase over Firebase — real relational DB + RLS in one platform | Architecture |
| DECISION-002 | React + Vite SPA over Next.js — no SEO needed, simpler deployment | Architecture |
| DECISION-003 | RLS at the DB layer, not middleware — enforced for every query regardless of origin | Security |
| DECISION-004 | No public sign-up — invitation-only with time-limited activation tokens | Security |
| DECISION-005 | Pastor shepherd model enforced via DB subquery, not frontend filtering | Security |
| DECISION-006 | @dnd-kit over react-beautiful-dnd — actively maintained, React 18 safe | Tooling |
| DECISION-007 | Optimistic task status updates with rollback on DB failure | Performance |
| DECISION-008 | Department-scoped task fetches, not org-wide with client-side filtering | Performance |
| DECISION-009 | Personal tasks invisible to everyone including dept leads — enforced by RLS | Product |
| DECISION-010 | Source field on every task — tracks manual, meeting, automation, api, integration | Architecture |
| DECISION-011 | Meeting OS stays external with a bridge layer, not absorbed into the codebase | Architecture |
| DECISION-012 | Resend over SendGrid/Mailgun — purpose-built transactional email, free tier fits | Tooling |
| DECISION-013 | Activity log writes inside Postgres RPCs, not frontend — atomic with operations | Security |
| DECISION-014 | No hard deletes — users archive through status lifecycle, history preserved | Architecture |
| DECISION-015 | TaskModal accepts optional callbacks, falls back to context — reusable anywhere | Architecture |
| DECISION-016 | lucide-react — tree-shakeable, one import per icon, clean inline SVG | Tooling |
| DECISION-017 | Comments, files, dependencies as tabbed panel inside TaskModal | Architecture |
| DECISION-018 | File attachments are Google Drive links only, no binary upload | Trade-off |
| DECISION-019 | Two dependency types: blocking vs waiting_on | Product |
| DECISION-020 | Dependency picker excludes done tasks and self-references | Product |
| DECISION-021 | Activity log completeness fixed inside RPCs, not edge functions | Security |
| DECISION-022 | task_dependencies and task_files as normalised tables, not JSONB columns | Architecture |
| DECISION-023 | Surface layering: grey page canvas, white cards with subtle shadow | Tooling |
| DECISION-024 | Validation docs created before marking phases production-complete | Product |
| DECISION-025 | UI polish as an isolated CSS-only pass — no layout changes mixed in | Product |
| DECISION-026 | Sprints live outside permanent departments — temporary cross-functional layer | Architecture |
| DECISION-027 | Sprint lifecycle enforces review before archive | Product |
| DECISION-028 | Archived sprints are read-only but restorable and duplicatable | Trade-off |
| DECISION-029 | Calendar is an org-wide coordination layer, not a task due-date view | Architecture |
| DECISION-030 | Notifications use Supabase tables and Realtime before external channels | Architecture |
| DECISION-031 | Notifications triggered at the workflow source, not a centralized event bus | Trade-off |
| DECISION-032 | API keys are SHA-256 hashed and shown exactly once | Security |
| DECISION-033 | Public task API keys are scope-bound to department or sprint | Security |
| DECISION-034 | external_unique_key provides idempotency for external automation | Architecture |
| DECISION-035 | Automation rule storage shipped before execution engine | Trade-off |

---

## By Category

### Architecture

**DECISION-001 — Supabase over Firebase or Railway**
"I chose Supabase because the project needed real relational data with enforced access control per user role. Firebase doesn't give you row-level security at the database layer — you'd enforce it in application code, which is easier to misconfigure. Supabase let me define RLS policies once in Postgres and have them apply to every query, whether from the frontend, an edge function, or a direct API call. The free tier also covered everything — auth, edge functions, realtime — without needing separate services."

**DECISION-002 — React + Vite over Next.js**
"Next.js is the right call when you need SSR, SEO, or server components. This is a private internal operations platform — every route is behind auth, there's nothing to index, and all data is user-specific. A Vite SPA gives faster dev builds, simpler deployment as a static bundle, and no cold-start latency from serverless pages. I'd use Next.js for a public-facing product, but it would've been the wrong tool here."

**DECISION-010 — Source tracking on every task**
"Every task has a source field — manual, meeting, automation, api, or integration. This was a forward-looking decision. Right now most tasks are manual, but the roadmap includes meeting action items, Zoom transcripts, and Apps Script automations all creating tasks automatically. When something goes wrong — a duplicate, a task that shouldn't exist — the source field tells you exactly which pipeline created it. The external_unique_key field prevents duplicates from repeated API calls."

**DECISION-011 — Meeting OS stays external**
"The Meeting OS is fully built with its own architecture — Whisper transcription, PDF export, AI summaries via Claude API. Absorbing it into the OS codebase would mean a high-risk rewrite for no user-facing benefit. Instead I built a bridge layer: meeting records are logged in Supabase, action items flow into the task board with source = 'meeting', and the sidebar links to the external app. Users get a seamless experience without me touching working code."

**DECISION-013 — Activity log writes in RPCs**
"Activity log writes are inside the RPCs that perform the operations, not in the frontend. If I log from React, the call can fail silently or the user can navigate away before it fires. By putting the insert inside the security-definer RPC, the log entry is atomic with the operation — either both happen or neither does. You can't cancel an invitation without a cancellation log entry because they're the same database transaction."

**DECISION-014 — No hard deletes**
"Users are never deleted. When someone leaves, they're archived — their account is deactivated but every task, meeting attendance record, and activity log entry stays intact and attributed to them. Organisations need this for reporting: who did this task, who attended this meeting, what was their department at the time. A boolean soft-delete loses the lifecycle history. We track every status transition in user_status_history so you can reconstruct exactly what happened to any account."

**DECISION-015 — TaskModal context/callback flexibility**
"TaskModal is used both inside the department kanban board and on the personal My Tasks page. The kanban board wraps everything in a TasksProvider for optimistic state management, but My Tasks doesn't. I made the modal accept optional callbacks — if you pass onSave and onDelete, it uses those. If you don't, it falls back to TasksContext. This pattern keeps the component reusable without requiring every use site to set up context infrastructure."

**DECISION-022 — Normalised tables over JSONB**
"Dependencies and files are in their own tables, not JSONB columns on tasks. JSONB arrays make write-side simple but break read-side — I can't efficiently ask which tasks are blocked by task X without scanning every row. The join tables allow efficient reverse lookups, proper foreign key constraints, and RLS policies per record."

**DECISION-026 — Sprints outside permanent departments**
"I separated sprints from departments because they solve different problems. Departments are permanent operating units. Sprints are temporary cross-functional initiatives. If I nested sprints under a department, every cross-functional program would inherit the wrong ownership and permissions model. By making sprints their own layer, I preserved the org structure while still letting Admin, Media, ORS, and Pastors collaborate around a temporary goal."

**DECISION-029 — Calendar as org-wide coordination layer**
"I kept calendar events separate from task due dates because they answer different questions. A due date is about one task finishing. A ministry calendar is about what is happening across the organization — programs, trainings, prayers, deadlines. If you collapse those into one thing, the calendar becomes noisy and semantically weak. I built a dedicated event layer and then embedded it into departments and sprints where that context was useful."

**DECISION-030 — Notifications with Supabase Realtime**
"I started with in-app notifications backed by Supabase tables and Realtime. That let me validate the event model, read state, permissions, and live updates with minimal complexity. Once that foundation exists, email notifications become an extension of the same system instead of a separate implementation. It was an intentional sequencing decision: stabilize the core notification model first, then add delivery channels."

**DECISION-034 — external_unique_key idempotency**
"I made the task API idempotent with external_unique_key. External systems like Apps Script or cron jobs often rerun, and without an idempotency key every retry creates duplicate work. With a deterministic external key, the API can safely say 'I've already processed this logical event' and return the existing task instead of creating another one."

---

### Security

**DECISION-003 — RLS over middleware auth**
"All access control lives in Postgres RLS policies, not in React. If I check roles in a component, that's a UI hint — anyone with the Supabase anon key and a valid session can query the database directly and bypass it. With RLS, the policy is evaluated inside the database for every single query regardless of where it originates. A dept_lead literally cannot receive data from another department — the database returns an empty result set before it ever reaches the application layer."

**DECISION-004 — No public sign-up**
"There's no sign-up page. Every account starts as an invitation created by a super admin or dept lead — it includes the user's department, role, and optionally their pastor assignment. The user gets a time-limited activation link, sets their password, and the account goes live. This means there's no open attack surface, every account has correct metadata from day one, and there's a full audit trail of who invited whom."

**DECISION-005 — Pastor shepherd model at DB layer**
"Pastors have a cross-department view — they can see tasks for their assigned members across any department. That join happens in an RLS policy using a subquery through the pastor_members table. The policy checks whether the requesting user is a pastor and whether the task's assignee is one of their members. If either condition fails, the row isn't returned. A pastor cannot see tasks for people outside their flock no matter how the query is constructed."

**DECISION-009 — Personal tasks invisible to all**
"Personal tasks are enforced private at the database level. The RLS policy requires both is_personal = true and assignee_id = auth.uid() — so even a super admin running a direct query cannot retrieve someone else's personal tasks. This isn't a UI toggle, it's a database constraint. The value of personal tasks disappears the moment people think their manager can see them, so the privacy has to be real."

**DECISION-021 — Activity log atomicity**
"The RPCs were performing operations without logging them. The fix was adding activity_log inserts inside the RPCs themselves. This keeps logging atomic: the RPC, the data change, and the log entry are one transaction."

**DECISION-032 — API keys hashed and shown once**
"I treated API keys like secrets, not records. The database stores only a SHA-256 hash plus a short prefix for display. The full key is shown exactly once at creation, and if it's lost the user generates a new one. That's the same model GitHub uses for personal access tokens. It reduces blast radius if the database is ever exposed and keeps the operational model simple."

**DECISION-033 — Scope-bound public API**
"Every API key is bound to a department or sprint scope, and the Edge Function enforces that scope before touching tasks. That means an external workflow only gets the minimum access it needs. I didn't want org-wide integration keys floating around because that breaks the same least-privilege model we enforce internally with RLS."

---

### Performance

**DECISION-007 — Optimistic updates with rollback**
"Drag-and-drop needs to feel instant or it feels broken. When you drag a card to a new column, I update the local state in TasksContext immediately — the card is in its new position before the network request even starts. Then the Supabase write happens async. If it succeeds, nothing changes. If it fails — network error, permission issue — I call loadTasks() to reload from the DB, which snaps the card back to its actual position. The user gets fast UI with eventual correctness."

**DECISION-008 — Department-scoped task fetches**
"Each department space fetches only its own tasks. I don't load all tasks org-wide and filter in the browser — that pattern breaks as data grows and sends data the user doesn't need. The query passes department_id as a filter, RLS validates the user has access to that department, and only the relevant rows come back. The My Tasks page is the exception — it fetches tasks assigned to the current user across departments, but that's intentionally narrow."

**DECISION-020 — Dependency picker excludes done tasks**
"The dependency picker filters to open tasks in the same department. Done tasks are excluded because a resolved dependency is meaningless — if it's done, it can't block anything."

---

### Tooling

**DECISION-006 — @dnd-kit over react-beautiful-dnd**
"I chose @dnd-kit because react-beautiful-dnd is archived. It has unresolved issues with React 18's strict mode and concurrent rendering — you'd be building on an unmaintained foundation. @dnd-kit is actively maintained, modular so you only bundle what you need, and has first-class pointer and touch sensor support. The activation constraint of 8px movement also lets click handlers and drag handlers coexist on the same card without conflict."

**DECISION-012 — Resend over SendGrid**
"Resend is purpose-built for transactional email — account activations, notifications, system emails. We're sending invitation emails for 30 internal users, maybe 50 emails a month total. Resend's free tier handles that with no configuration overhead. I considered HubSpot but that's a marketing CRM — using it to send a 'click here to activate your account' email adds compliance baggage like unsubscribe links and contact list management to what should be a simple SMTP call."

**DECISION-016 — lucide-react for icons**
"lucide-react gives individual named exports for every icon, so Vite's tree-shaking means only the icons you actually import end up in the bundle. If I use 20 icons out of 1,000, I pay for 20. Libraries that export a single object or require a font file can't tree-shake. The icons also render as clean inline SVGs — no font loading, no CORS issues, scales perfectly at any size."

**DECISION-023 — Surface layering**
"The page sits at a slightly grey #F4F5F7 and cards are white. This is intentional surface layering — the visual hierarchy tells the user 'this is the canvas, these are the content objects on it.' When both surfaces are the same colour, cards disappear. A 1-3px shadow with low opacity adds depth without the heavy Material Design look. It's the same principle most modern SaaS tools use — ClickUp, Linear, Notion all do this."

---

### Product

**DECISION-017 — Tabbed task detail panel**
"Comments, files, and dependencies all live inside the task modal as tabs — you open a task and everything is there. I only show the tabs in edit mode because you need an existing task ID to attach data to. This keeps the component self-contained: the kanban board doesn't need to know anything about comments."

**DECISION-018 — Link-based file attachments**
"File attachments in Phase 3 are Drive links, not binary uploads. The team already uses Google Drive. Adding Supabase Storage creates a second file system and requires multipart upload handling in React. Link-based attachments cover the real use case."

**DECISION-019 — Two dependency types**
"I modelled two dependency types: blocking and waiting-on. Blocking means hard stop — you can't complete this task until the dependency resolves. Waiting-on is softer — you're coordinating but could technically proceed."

**DECISION-024 — Validation docs before production-complete**
"I separate code-complete from production-complete. Code-complete means the build passes and the logic is right in isolation. Production-complete means the live environment has been validated — migrations applied, RLS tested with real accounts across all roles, UI flows confirmed against real data. I created structured validation checklists in the repo for each phase so there's a forcing function and an audit trail. It's the difference between 'I think it works' and 'I confirmed it works.'"

**DECISION-025 — Isolated UI polish pass**
"I ran the UI polish as an isolated pass with an explicit constraint: touch only backgrounds, borders, shadows, and badge styling — no layouts, no component hierarchy, no features. When you mix visual changes with feature work, regressions become hard to attribute. If something breaks, you can't tell if it was the layout change or the shadow change. An isolated pass means the diff is clean and reviewable, and any regression from it has one cause."

**DECISION-027 — Review before archive sprint lifecycle**
"I made review a first-class sprint phase instead of a nice-to-have. The point was to force the system to capture outcomes, unresolved work, lessons learned, and testimonies before a sprint disappears into archive. That adds one extra step, but it turns sprints into reusable organizational knowledge instead of just a temporary task bucket."

**DECISION-028 — Archived sprints read-only but restorable**
"I treated archived sprints as historical records. Once archived, they become read-only so metrics and review data stay trustworthy. But I still allowed restore and duplicate. Restore handles mistakes. Duplicate handles recurring ministry programs. That gives the team reuse without corrupting the past."

---

### Trade-off

**DECISION-031 — Source-local notification triggers**
"I triggered notifications where the actual workflow event occurred. For example, task assignment creates the notification in the task flow, sprint membership creates it in the sprint flow, and invitation activation creates it in the activation flow. That kept the logic local and debuggable. A centralized event bus is something I'd consider later, but introducing that abstraction too early would have slowed delivery without solving a real pain yet."

**DECISION-035 — Automations stored before auto-executed**
"I deliberately separated rule definition from rule execution. Phase 6 gives admins a real automation registry and builder, but it doesn't auto-fire rules yet. That means teams can model and review automation intent before the system starts mutating live data. It's a sequencing decision that reduces operational risk while still moving the product forward."

---

## The 5 Strongest Answers

### 1. DECISION-003 — Row-level security over middleware

**Question an interviewer would ask:** "How did you handle authorization in your app? Why not just check roles in the API?"

**30-second answer:** "All access control lives in Postgres RLS policies, not in React. If I check roles in a component, that's a UI hint — anyone with the Supabase anon key and a valid session can query the database directly and bypass it. With RLS, the policy is evaluated inside the database for every single query regardless of where it originates. A dept_lead literally cannot receive data from another department — the database returns an empty result set before it ever reaches the application layer."

**Follow-up to prepare for:** Can you write an RLS policy from memory? What happens if someone gets hold of the anon key?

---

### 2. DECISION-032 — API keys hashed and shown once

**Question an interviewer would ask:** "How do you store API keys in your database?"

**30-second answer:** "I treated API keys like secrets, not records. The database stores only a SHA-256 hash plus a short prefix for display. The full key is shown exactly once at creation, and if it's lost the user generates a new one. That's the same model GitHub uses for personal access tokens. It reduces blast radius if the database is ever exposed and keeps the operational model simple."

**Follow-up to prepare for:** Why hash instead of encrypt? How do revoke and rotate flows work with a hashed key model?

---

### 3. DECISION-011 — Meeting OS bridge layer

**Question an interviewer would ask:** "You had an existing tool. How did you decide whether to rewrite it or integrate it?"

**30-second answer:** "The Meeting OS is fully built with its own architecture — Whisper transcription, PDF export, AI summaries via Claude API. Absorbing it into the OS codebase would mean a high-risk rewrite for no user-facing benefit. Instead I built a bridge layer: meeting records are logged in Supabase, action items flow into the task board with source = 'meeting', and the sidebar links to the external app. Users get a seamless experience without me touching working code."

**Follow-up to prepare for:** How does the ActionItemBridge work technically? What would you change if you were starting the Meeting OS today?

---

### 4. DECISION-007 — Optimistic updates with rollback

**Question an interviewer would ask:** "How did you make the kanban drag-and-drop feel fast? What happens if the save fails?"

**30-second answer:** "Drag-and-drop needs to feel instant or it feels broken. When you drag a card to a new column, I update the local state in TasksContext immediately — the card is in its new position before the network request even starts. Then the Supabase write happens async. If it succeeds, nothing changes. If it fails — network error, permission issue — I call loadTasks() to reload from the DB, which snaps the card back to its actual position. The user gets fast UI with eventual correctness."

**Follow-up to prepare for:** What if two users drag the same card simultaneously? How would you add real-time sync for multiple users?

---

### 5. DECISION-013 — Activity log writes in RPCs

**Question an interviewer would ask:** "How do you keep your audit log consistent? What prevents it from getting out of sync?"

**30-second answer:** "Activity log writes are inside the RPCs that perform the operations, not in the frontend. If I log from React, the call can fail silently or the user can navigate away before it fires. By putting the insert inside the security-definer RPC, the log entry is atomic with the operation — either both happen or neither does. You can't cancel an invitation without a cancellation log entry because they're the same database transaction."

**Follow-up to prepare for:** What is a security-definer function in Postgres? How would you query the activity log for a compliance audit?

---

## Deep Technical Questions

### DECISION-003 — RLS: be ready to write the policy SQL

Dept lead scoped to their own department:
```sql
CREATE POLICY "dept_lead sees own dept tasks"
ON tasks FOR SELECT
USING (
  department_id = (
    SELECT department_id FROM users
    WHERE id = auth.uid()
  )
);
```

Super admin sees all:
```sql
CREATE POLICY "super_admin sees all tasks"
ON tasks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);
```

Personal tasks only visible to the assignee:
```sql
CREATE POLICY "personal tasks private"
ON tasks FOR SELECT
USING (
  is_personal = false
  OR (is_personal = true AND assignee_id = auth.uid())
);
```

---

### DECISION-005 — Pastor RLS: be ready to write the cross-join policy

```sql
CREATE POLICY "pastor sees assigned member tasks"
ON tasks FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM pastor_members pm
    JOIN users u ON u.id = auth.uid()
    WHERE pm.pastor_id = auth.uid()
      AND pm.member_id = tasks.assignee_id
      AND u.role = 'pastor'
  )
);
```

The key point: the subquery through `pastor_members` is evaluated inside Postgres. The pastor cannot manipulate it from the client side. Cross-department visibility is real, but the scope is bound to their flock only.

---

### DECISION-022 — Normalised tables vs JSONB: be ready to explain the query difference

With JSONB (wrong approach):
```sql
-- Reverse lookup: "which tasks are blocked by task X?"
-- Requires a full table scan — no index can support arbitrary JSONB membership
SELECT * FROM tasks
WHERE dependencies @> '[{"blocked_by": "task-uuid-x"}]'::jsonb;
```

With a normalised join table (correct approach):
```sql
-- Efficient reverse lookup — uses a regular index
SELECT t.* FROM tasks t
JOIN task_dependencies td ON td.dependent_task_id = t.id
WHERE td.blocking_task_id = 'task-uuid-x'
  AND td.type = 'blocking';
```

The normalised table enables: foreign key constraints, per-row RLS policies, efficient indexed reverse lookups, and aggregation queries. JSONB loses all of these for array-of-objects patterns.

---

## Weak Spots to Prepare

These are areas where implementation is scoped or not yet wired. Be honest if asked — the right answer is: "I designed the model and know the flow, but haven't implemented the full exchange in production code."

**Full Zoom OAuth flow (not implemented)**
The `zoom_config` table is built and credentials are stored safely (DECISION-042). The actual OAuth 2.0 Server-to-Server token exchange, webhook signature verification, and meeting creation API calls are not yet implemented. You know the model: client_id + client_secret exchanged for a bearer token, then used to call the Zoom REST API. The wiring is not done.

**Foundation School SSO deep integration (not implemented)**
The conceptual model is token passthrough — a user authenticated in the OS generates a signed JWT that Foundation School's Supabase project accepts, avoiding a second login. The `external_integrations` table exists. The actual cross-project JWT bridge is not implemented.

**Supabase cron scheduling (not implemented)**
The automation execution engine exists as an Edge Function (DECISION-039, Phase 7). Scheduling it to run on an interval using `pg_cron` or an external scheduler is not wired. You know the pattern — `pg_cron` calls a Supabase function on a schedule — but it is not in production.

---

## Story Format Answers (STAR)

### Story 1 — DECISION-003: Building real access control

**Situation:** I was building an internal operations platform for a ministry with 5 departments and multiple role levels — super admin, dept lead, pastor, and regular member. Every authenticated user could theoretically reach the same database, but a media team member should never see ORS department tasks, and no one except the assignee should ever see a personal task.

**Task:** Design an access control system that was actually secure — not just hidden in the UI, but enforced at the data layer so that a technically sophisticated user could not bypass it by querying Supabase directly.

**Action:** I implemented Row-Level Security policies in Postgres. Instead of checking roles in React components or API middleware, I wrote policies that execute inside the database for every query regardless of origin. A dept_lead policy checks the user's department_id against the task's department_id inside Postgres. The personal tasks policy requires both `is_personal = true` and `assignee_id = auth.uid()`. The pastor policy uses a subquery through a `pastor_members` join table to allow cross-department visibility only for that pastor's assigned flock members.

**Result:** Access control is enforced at the database layer for every query path — React component, direct browser console call, edge function, or misconfigured middleware. A dept_lead cannot receive another department's data. The policies are the single source of truth. RLS boundary cases caught during live validation confirmed the approach — several gaps were found and fixed before any real users were onboarded.

---

### Story 2 — DECISION-011: Deciding not to rewrite working code

**Situation:** BLW CAN NEXUS was being built as the central operations platform. Meeting OS already existed as a standalone app with Whisper WASM transcription, AI meeting summaries, PDF export, and its own local data model. The obvious path was to absorb it so everything lived in one codebase.

**Task:** Decide whether to migrate Meeting OS into the main codebase — achieving one unified app — or find a way to integrate it while keeping the existing system intact.

**Action:** I evaluated the risk-to-benefit ratio. Migration would take weeks, risk breaking transcription and PDF export features that were already production-stable, and provide zero user-facing benefit. Instead I built a bridge layer: Meeting OS logs records to Supabase tables, action items flow into the task board as tasks with `source = 'meeting'`, and the OS sidebar links to the external app. The `/meetings` route embeds Meeting OS in an iframe when the URL is configured, falling back to the internal meeting log module when it is not.

**Result:** Users get a seamless experience — one navigation model, one platform feel. Meeting data is available in Supabase for reporting and notifications. The Meeting OS codebase was not touched. The bridge layer took days to build instead of weeks, and the integration pattern became the reusable model for CAN Map, Foundation School, and BLW Mail.

---

### Story 3 — DECISION-024: Separating code-complete from production-complete

**Situation:** I was building solo on a platform for 30 real users, with Supabase migrations, RLS policies, and live-environment state that behaved differently than local development seeds. Getting something working locally did not mean it worked with real accounts and real data.

**Task:** Create a process that would reliably surface RLS boundary errors, migration issues, and role-specific bugs before a phase was called production-ready.

**Action:** Before closing any phase, I created a structured validation checklist document in the repo. Each checklist covered: migrations applied in the live Supabase environment, RLS tested with real user accounts across every role, UI flows exercised with actual data, and an explicit sign-off table with pass/fail criteria per test case. The checklist became a forcing function — the phase was not done until every row was checked and initialled.

**Result:** Multiple RLS edge cases were caught in validation that had passed local testing — including a policy condition that evaluated differently against real multi-tenant data than against single-user seed data. The validation docs also doubled as an audit trail showing exactly what was tested, when, and by whom. The discipline of separating code-complete from production-complete became a repeatable standard across all seven build phases.
