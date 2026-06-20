# BLW CAN NEXUS â€” Decision Catalog

Use `docs/decision-catalog-prompt.md` after each build session to extend this file.

---

## Phase 1

### [DECISION-001] â€” Supabase over Firebase or Railway
**Phase:** Phase 1
**Category:** Architecture
**What I decided:** Used Supabase (Postgres + Auth + Edge Functions + RLS) as the sole backend instead of Firebase, PlanetScale, or a custom Node server.
**Why I decided it:** Supabase gives a real relational database with row-level security enforced at the DB layer â€” something Firebase's document model can't replicate cleanly. The free tier covers 30 users comfortably and includes auth, edge functions, and realtime in one platform, eliminating the need to stitch together separate services.
**What I considered instead:** Firebase (rejected â€” no relational model, no RLS, NoSQL doesn't map well to role-scoped org data); Railway with a custom API (rejected â€” adds a server to maintain and a whole auth layer to build); PlanetScale (rejected â€” no auth or edge functions, still need a separate backend).
**Interview answer (30 seconds):** "I chose Supabase because the project needed real relational data with enforced access control per user role. Firebase doesn't give you row-level security at the database layer â€” you'd enforce it in application code, which is easier to misconfigure. Supabase let me define RLS policies once in Postgres and have them apply to every query, whether from the frontend, an edge function, or a direct API call. The free tier also covered everything â€” auth, edge functions, realtime â€” without needing separate services."
**Follow-up questions this invites:**
- How does Supabase RLS actually work â€” can you walk me through a policy?
- What are the tradeoffs of enforcing access at the DB layer vs the API layer?
**Ecosystem connection:** The same Supabase project powers auth for the OS. Foundation School runs on its own separate Supabase project â€” the SSO bridge passes a JWT token rather than merging databases.

### [DECISION-002] â€” React + Vite over Next.js
**Phase:** Phase 1
**Category:** Architecture
**What I decided:** Used React + Vite as a client-side SPA rather than Next.js.
**Why I decided it:** The app is a private internal tool â€” SEO and server-side rendering provide no value. All data is user-specific and behind auth, so there's nothing to pre-render. Vite gives faster dev builds than the Next.js dev server, and the SPA model keeps the deployment simple: a static bundle on Vercel or Netlify with no serverless function cold starts on page load.
**What I considered instead:** Next.js (rejected â€” SSR overhead with no benefit for an authenticated internal tool; App Router adds complexity for no gain here); Create React App (rejected â€” effectively deprecated, much slower than Vite).
**Interview answer (30 seconds):** "Next.js is the right call when you need SSR, SEO, or server components. This is a private internal operations platform â€” every route is behind auth, there's nothing to index, and all data is user-specific. A Vite SPA gives faster dev builds, simpler deployment as a static bundle, and no cold-start latency from serverless pages. I'd use Next.js for a public-facing product, but it would've been the wrong tool here."
**Follow-up questions this invites:**
- How do you handle routing in a SPA vs Next.js?
- What would change if this needed to be public-facing?
**Ecosystem connection:** Meeting OS is also a Vite SPA â€” consistent stack across the ecosystem means patterns transfer directly.

### [DECISION-003] â€” Row-level security over middleware auth checks
**Phase:** Phase 1
**Category:** Security
**What I decided:** Enforced all data access through Supabase RLS policies at the database layer rather than checking roles in React components or API middleware.
**Why I decided it:** Frontend role checks are UI hints, not security. A determined user can bypass JavaScript. RLS policies execute inside Postgres for every query â€” if the policy says a dept_lead can only see their own department's tasks, that's true whether the request comes from the React app, a direct API call, a Supabase client in the browser console, or an edge function. The permission is defined once and enforced everywhere.
**What I considered instead:** Middleware checks in edge functions (rejected â€” still bypassable if the frontend calls Supabase directly); frontend role checks (rejected â€” purely cosmetic, provides no actual security).
**Interview answer (30 seconds):** "All access control lives in Postgres RLS policies, not in React. If I check roles in a component, that's a UI hint â€” anyone with the Supabase anon key and a valid session can query the database directly and bypass it. With RLS, the policy is evaluated inside the database for every single query regardless of where it originates. A dept_lead literally cannot receive data from another department â€” the database returns an empty result set before it ever reaches the application layer."
**Follow-up questions this invites:**
- Can you write an RLS policy from memory?
- What happens if someone gets hold of the anon key?
**Ecosystem connection:** Same RLS model governs Foundation School's data. Pastor shepherd model is enforced via RLS â€” pastors cannot query tasks outside their assigned members at the DB level.

### [DECISION-004] â€” No public sign-up â€” super admin creates accounts only
**Phase:** Phase 1
**Category:** Security / Product
**What I decided:** Disabled public sign-up entirely. All accounts are created through a super admin or dept_lead invitation flow with a time-limited activation token.
**Why I decided it:** This is a private internal platform for 30 known people. An open sign-up endpoint is an attack surface with no legitimate use case. The invitation model also guarantees every account is pre-assigned to the correct department and role before the user ever logs in.
**What I considered instead:** Open sign-up with email domain restriction (rejected â€” domain restriction is weak and doesn't enforce department/role assignment); manual account creation by admin (rejected â€” no activation flow, no audit trail).
**Interview answer (30 seconds):** "There's no sign-up page. Every account starts as an invitation created by a super admin or dept lead â€” it includes the user's department, role, and optionally their pastor assignment. The user gets a time-limited activation link, sets their password, and the account goes live. This means there's no open attack surface, every account has correct metadata from day one, and there's a full audit trail of who invited whom."
**Follow-up questions this invites:**
- What happens if the activation token expires?
- How do you handle the case where someone leaves the organisation?
**Ecosystem connection:** Foundation School has its own auth â€” the shared SSO bridge uses token passthrough so a user authenticated in the OS doesn't need to log in again when launching Foundation School.

### [DECISION-005] â€” Pastor shepherd model enforced at DB layer
**Phase:** Phase 1
**Category:** Security / Architecture
**What I decided:** Implemented the pastor cross-department visibility model entirely through Supabase RLS policies rather than filtering in the frontend.
**Why I decided it:** Pastors need to see tasks assigned to their specific flock members regardless of which department those members work in. This cross-department join is non-trivial â€” if done in the frontend, a pastor could theoretically modify the query to see any user's tasks. The RLS policy uses a subquery through `pastor_members` so the database itself evaluates membership before returning any rows.
**What I considered instead:** Frontend filtering (rejected â€” bypassable); a dedicated API endpoint with middleware checks (rejected â€” adds a server layer and still less safe than DB enforcement).
**Interview answer (30 seconds):** "Pastors have a cross-department view â€” they can see tasks for their assigned members across any department. That join happens in an RLS policy using a subquery through the `pastor_members` table. The policy checks whether the requesting user is a pastor and whether the task's assignee is one of their members. If either condition fails, the row isn't returned. A pastor cannot see tasks for people outside their flock no matter how the query is constructed."
**Follow-up questions this invites:**
- How does the `pastor_members` table work?
- What happens when a member transfers to a different department?
**Ecosystem connection:** The pastor flock view in the OS reads cross-department tasks. Meeting OS attendance records are also linked to the same user model, so pastors can see attendance history for their members.

## Phase 2

### [DECISION-006] â€” @dnd-kit over react-beautiful-dnd
**Phase:** Phase 2
**Category:** Tooling
**What I decided:** Used `@dnd-kit` for the kanban drag-and-drop implementation instead of `react-beautiful-dnd`.
**Why I decided it:** `react-beautiful-dnd` is effectively unmaintained â€” Atlassian archived it and it has known issues with React 18's strict mode and concurrent rendering. `@dnd-kit` is actively maintained, has a smaller bundle, supports pointer and touch sensors natively, and its modular architecture means you only import what you need.
**What I considered instead:** `react-beautiful-dnd` (rejected â€” archived, React 18 compatibility issues); building custom drag-and-drop with the HTML5 Drag and Drop API (rejected â€” significant effort, no mobile support, poor UX).
**Interview answer (30 seconds):** "I chose `@dnd-kit` because `react-beautiful-dnd` is archived. It has unresolved issues with React 18's strict mode and concurrent rendering â€” you'd be building on an unmaintained foundation. `@dnd-kit` is actively maintained, modular so you only bundle what you need, and has first-class pointer and touch sensor support. The activation constraint of 8px movement also lets click handlers and drag handlers coexist on the same card without conflict."
**Follow-up questions this invites:**
- How does the 8px activation constraint work technically?
- How do you handle the drag overlay vs the original card position?
**Ecosystem connection:** N/A â€” specific to OS task board.

### [DECISION-007] â€” Optimistic updates on task status changes
**Phase:** Phase 2
**Category:** Performance
**What I decided:** When a task card is dragged to a new column, the UI updates immediately in local state before the Supabase write completes, with a rollback to the previous state if the write fails.
**Why I decided it:** Kanban drag-and-drop feels broken if the card snaps back to its original column while waiting for a network round-trip. The optimistic update makes the interaction feel instant. The rollback ensures correctness â€” if the DB write fails (network error, RLS violation), the card returns to its actual position rather than showing stale data.
**What I considered instead:** Wait for DB confirmation before updating UI (rejected â€” 200-400ms lag on every drag makes the board feel sluggish); no rollback on failure (rejected â€” leads to UI showing state that doesn't match the database).
**Interview answer (30 seconds):** "Drag-and-drop needs to feel instant or it feels broken. When you drag a card to a new column, I update the local state in `TasksContext` immediately â€” the card is in its new position before the network request even starts. Then the Supabase write happens async. If it succeeds, nothing changes. If it fails â€” network error, permission issue â€” I call `loadTasks()` to reload from the DB, which snaps the card back to its actual position. The user gets fast UI with eventual correctness."
**Follow-up questions this invites:**
- What if two users drag the same card simultaneously?
- How would you add real-time sync for multiple users?
**Ecosystem connection:** Meeting OS action items create tasks via the `ActionItemBridge` â€” those task inserts benefit from the same optimistic pattern when they appear on the board.

### [DECISION-008] â€” Department-scoped task fetches, not org-wide
**Phase:** Phase 2
**Category:** Performance / Security
**What I decided:** `getDeptTasks()` always filters by a specific `department_id` rather than fetching all tasks and filtering client-side.
**Why I decided it:** Fetching all tasks org-wide and filtering in the browser doesn't scale and is wasteful â€” a 30-person org with months of tasks could easily have thousands of records. More importantly, even with RLS, fetching everything and filtering client-side sends unnecessary data over the wire. Scoped queries keep payloads small and fast regardless of total data volume.
**What I considered instead:** Fetch all accessible tasks and filter client-side (rejected â€” unnecessary data transfer, doesn't scale); global task store with all departments (rejected â€” complexity with no benefit for a dept-scoped UI).
**Interview answer (30 seconds):** "Each department space fetches only its own tasks. I don't load all tasks org-wide and filter in the browser â€” that pattern breaks as data grows and sends data the user doesn't need. The query passes `department_id` as a filter, RLS validates the user has access to that department, and only the relevant rows come back. The My Tasks page is the exception â€” it fetches tasks assigned to the current user across departments, but that's intentionally narrow."
**Follow-up questions this invites:**
- How does the My Tasks page handle cross-department data?
- How would you add pagination if task lists grow very large?
**Ecosystem connection:** N/A â€” specific to OS task queries.

### [DECISION-009] â€” Personal tasks invisible to everyone including dept leads
**Phase:** Phase 2
**Category:** Product / Security
**What I decided:** Tasks with `is_personal = true` are only visible to the assignee, enforced by an RLS policy â€” dept leads and super admins cannot see them even though they can see all other tasks in their scope.
**Why I decided it:** Personal tasks are a trust feature. If a dept lead can see a member's personal task list, members won't use it for anything sensitive. The whole value of personal tasks collapses if they're not truly private. The RLS policy `is_personal = true AND assignee_id = auth.uid()` is the only path to those rows.
**What I considered instead:** Only hiding personal tasks in the UI (rejected â€” provides no actual privacy, bypass trivial); allowing dept leads to see personal tasks (rejected â€” destroys the trust model).
**Interview answer (30 seconds):** "Personal tasks are enforced private at the database level. The RLS policy requires both `is_personal = true` and `assignee_id = auth.uid()` â€” so even a super admin running a direct query cannot retrieve someone else's personal tasks. This isn't a UI toggle, it's a database constraint. The value of personal tasks disappears the moment people think their manager can see them, so the privacy has to be real."
**Follow-up questions this invites:**
- How do you handle the case where an admin needs to audit someone's tasks?
- Could you extend this to allow opt-in sharing of personal tasks?
**Ecosystem connection:** N/A.

### [DECISION-010] â€” Source tracking on every task
**Phase:** Phase 2
**Category:** Product / Architecture
**What I decided:** Every task records its `source` field (`manual`, `meeting`, `automation`, `api`, `integration`) to track how it was created.
**Why I decided it:** As the platform grows, tasks will arrive from multiple entry points â€” meeting action items, Zoom webhook transcripts, Apps Script automations, direct API calls. Without source tracking, there's no way to audit which pipeline created a task or debug duplicate creation. The `external_unique_key` field (added for API tasks) pairs with source to prevent duplicate imports.
**What I considered instead:** No source tracking (rejected â€” makes debugging integrations impossible and loses useful analytics); tracking source only for non-manual tasks (rejected â€” inconsistent model).
**Interview answer (30 seconds):** "Every task has a source field â€” manual, meeting, automation, api, or integration. This was a forward-looking decision. Right now most tasks are manual, but the roadmap includes meeting action items, Zoom transcripts, and Apps Script automations all creating tasks automatically. When something goes wrong â€” a duplicate, a task that shouldn't exist â€” the source field tells you exactly which pipeline created it. The `external_unique_key` field prevents duplicates from repeated API calls."
**Follow-up questions this invites:**
- How does the `external_unique_key` prevent duplicates technically?
- How would you build the Apps Script integration?
**Ecosystem connection:** Meeting OS action items create tasks with `source = 'meeting'` via `ActionItemBridge`. Future CAN Map status changes can create ORS tasks via Apps Script with `source = 'integration'`.

### [DECISION-011] â€” Meeting OS stays external, not absorbed
**Phase:** Phase 2
**Category:** Architecture / Trade-off
**What I decided:** The Meeting OS remains a fully independent standalone app linked from the OS sidebar, rather than being migrated into the OS codebase.
**Why I decided it:** The Meeting OS has a sophisticated architecture â€” `useReducer` store, `StorageAdapter`, Whisper WASM transcription, PDF export, AI summarization. Absorbing it would risk breaking a working system for no user-facing benefit. The integration value comes from the bridge layer: meeting action items become tasks, meeting records are stored in Supabase, and the OS sidebar links to it. Users get seamless access without a rewrite.
**What I considered instead:** Full migration into OS codebase (rejected â€” high risk, weeks of work, no user benefit); complete separation with no integration (rejected â€” loses the action item â†’ task bridge).
**Interview answer (30 seconds):** "The Meeting OS is fully built with its own architecture â€” Whisper transcription, PDF export, AI summaries via Claude API. Absorbing it into the OS codebase would mean a high-risk rewrite for no user-facing benefit. Instead I built a bridge layer: meeting records are logged in Supabase, action items flow into the task board with `source = 'meeting'`, and the sidebar links to the external app. Users get a seamless experience without me touching working code."
**Follow-up questions this invites:**
- How does the `ActionItemBridge` work technically?
- What would you change if you were starting the Meeting OS today?
**Ecosystem connection:** Core ecosystem decision â€” Meeting OS â†” OS bridge is the primary integration pattern. Same approach applies to Foundation School and CAN Map.

### [DECISION-012] â€” Resend over SendGrid or Mailgun for invitation emails
**Phase:** Phase 1.5 / Phase 1.6
**Category:** Tooling / Trade-off
**What I decided:** Used Resend as the transactional email provider for invitation delivery instead of SendGrid or Mailgun.
**Why I decided it:** Resend's free tier gives 3,000 emails/month â€” enough for an org of 30 people sending occasional invitations. The API is clean and modern, the React Email integration is well-documented, and it's designed specifically for transactional email rather than marketing campaigns. SendGrid and Mailgun have more complex setups and higher baseline costs for the same use case.
**What I considered instead:** SendGrid (rejected â€” heavier setup, higher cost, marketing-oriented features we don't need); Mailgun (rejected â€” similar overhead); HubSpot (rejected â€” CRM and marketing platform, wrong tool entirely for internal staff invitation emails); SMTP directly (rejected â€” deliverability issues without a managed provider).
**Interview answer (30 seconds):** "Resend is purpose-built for transactional email â€” account activations, notifications, system emails. We're sending invitation emails for 30 internal users, maybe 50 emails a month total. Resend's free tier handles that with no configuration overhead. I considered HubSpot but that's a marketing CRM â€” using it to send a 'click here to activate your account' email adds compliance baggage like unsubscribe links and contact list management to what should be a simple SMTP call."
**Follow-up questions this invites:**
- How does the email actually get sent â€” where does the API key live?
- How do you handle email delivery failures?
**Ecosystem connection:** N/A â€” specific to OS invitation flow. Future notifications (task assigned, overdue alerts) will use the same Resend integration.

### [DECISION-013] â€” Activity log writes in RPCs not the frontend
**Phase:** Phase 1.7
**Category:** Security / Architecture
**What I decided:** All audit log writes (`invitation_created`, `user_activated`, `user_status_changed`, etc.) happen inside Postgres security-definer RPCs, not in frontend code.
**Why I decided it:** If activity logging happens in React, it can be skipped â€” the user can navigate away, the network call can fail silently, or a bug can omit the log entry. Security-definer RPCs execute as the Postgres superuser within the same transaction as the operation being logged. The log entry either succeeds with the operation or the whole thing rolls back. You can't create an invitation without the log entry.
**What I considered instead:** Frontend activity log writes after each operation (rejected â€” not atomic, can be skipped, unreliable); edge function logging (rejected â€” async, still not atomic with the DB operation).
**Interview answer (30 seconds):** "Activity log writes are inside the RPCs that perform the operations, not in the frontend. If I log from React, the call can fail silently or the user can navigate away before it fires. By putting the insert inside the security-definer RPC, the log entry is atomic with the operation â€” either both happen or neither does. You can't cancel an invitation without a cancellation log entry because they're the same database transaction."
**Follow-up questions this invites:**
- What is a security-definer function in Postgres?
- How would you query the activity log for a compliance audit?
**Ecosystem connection:** N/A â€” specific to OS audit trail.

### [DECISION-014] â€” User lifecycle: no hard deletes, status-based archival
**Phase:** Phase 1.5
**Category:** Product / Architecture
**What I decided:** Users are never physically deleted from the database â€” instead they transition through statuses (`invited` â†’ `active` â†’ `inactive` â†’ `archived`) with full history preserved.
**Why I decided it:** Deleting a user would orphan their tasks, meeting attendance records, activity log entries, and pastoral assignment history. More practically, organisations frequently need to report on former members â€” who did what, when they were active, who their pastor was. Archival preserves all relationships while removing active access.
**What I considered instead:** Hard delete with cascading nulls (rejected â€” destroys historical data); soft delete with a single boolean (rejected â€” no lifecycle state, no history of transitions).
**Interview answer (30 seconds):** "Users are never deleted. When someone leaves, they're archived â€” their account is deactivated but every task, meeting attendance record, and activity log entry stays intact and attributed to them. Organisations need this for reporting: who did this task, who attended this meeting, what was their department at the time. A boolean soft-delete loses the lifecycle history. We track every status transition in `user_status_history` so you can reconstruct exactly what happened to any account."
**Follow-up questions this invites:**
- How do archived users affect RLS â€” can they still query data?
- How would you handle GDPR right-to-erasure requests?
**Ecosystem connection:** Foundation School student records follow the same principle â€” historical cohort data must survive even when a student is no longer active.

### [DECISION-015] â€” TaskModal works inside and outside TasksContext
**Phase:** Phase 2
**Category:** Architecture
**What I decided:** `TaskModal` accepts optional `onSave` and `onDelete` callback props rather than requiring `TasksContext`, falling back to context when callbacks aren't provided.
**Why I decided it:** `TaskModal` is used in two contexts: inside `DeptSpace` (which wraps everything in `TasksProvider`) and from `MyTasks` (which has no provider). A component that throws if it's not inside a context is fragile and limits reuse. Optional callbacks let the component work anywhere while still benefiting from context-based optimistic updates when available.
**What I considered instead:** Require `TasksContext` always (rejected â€” `MyTasks` would need a wrapper that doesn't make sense architecturally); two separate modal components (rejected â€” duplicated logic); direct Supabase calls always, ignoring context (rejected â€” bypasses optimistic updates on the kanban board).
**Interview answer (30 seconds):** "`TaskModal` is used both inside the department kanban board and on the personal My Tasks page. The kanban board wraps everything in a `TasksProvider` for optimistic state management, but My Tasks doesn't. I made the modal accept optional callbacks â€” if you pass `onSave` and `onDelete`, it uses those. If you don't, it falls back to `TasksContext`. This pattern keeps the component reusable without requiring every use site to set up context infrastructure."
**Follow-up questions this invites:**
- How does React context actually propagate through the component tree?
- What's the tradeoff between context and props for shared state?
**Ecosystem connection:** N/A.

### [DECISION-016] â€” lucide-react for icons
**Phase:** Phase 1 / Phase 2
**Category:** Tooling
**What I decided:** Used `lucide-react` as the icon library throughout the application.
**Why I decided it:** `lucide-react` is tree-shakeable â€” each icon is a separate named export, so only the icons actually used end up in the bundle. It's actively maintained, has excellent TypeScript types, renders as clean SVGs that scale at any size, and the icon set covers all common UI needs. The icons match the clean, flat aesthetic of the design system.
**What I considered instead:** Heroicons (considered but smaller set); Font Awesome (rejected â€” large bundle, requires font loading); inline SVGs (rejected â€” verbose, hard to maintain consistency); `react-icons` (rejected â€” inconsistent icon styles across different sets).
**Interview answer (30 seconds):** "`lucide-react` gives individual named exports for every icon, so Vite's tree-shaking means only the icons you actually import end up in the bundle. If I use 20 icons out of 1,000, I pay for 20. Libraries that export a single object or require a font file can't tree-shake. The icons also render as clean inline SVGs â€” no font loading, no CORS issues, scales perfectly at any size."
**Follow-up questions this invites:**
- How does tree-shaking work in Vite?
- What would you do if you needed a custom icon not in lucide?
**Ecosystem connection:** Consistent icon library across OS, sidebar tools panel, and people module.

## Phase 3

**DECISION-017 â€” Comments, files, and dependencies as a tabbed panel inside TaskModal**
Phase 3 | Architecture / Product
What I decided: Added comments, file attachments, and task dependencies as tabs within the existing TaskModal edit view rather than creating separate pages or panels.
Why: ClickUp-style task detail should be one place. The tabbed panel keeps the modal self-contained while adding depth. Only shown in edit mode because you need a task ID to attach data to.
Considered instead: Separate drawer panel (rejected â€” layout complexity); inline on kanban card (rejected â€” too much noise); separate task detail page (rejected â€” forces navigation away from board).
Interview answer: "Comments, files, and dependencies all live inside the task modal as tabs â€” you open a task and everything is there. I only show the tabs in edit mode because you need an existing task ID to attach data to. This keeps the component self-contained: the kanban board doesn't need to know anything about comments."

**DECISION-018 â€” File attachments are link-based only, no binary upload**
Phase 3 | Trade-off / Architecture
What I decided: Task file attachments in Phase 3 are Google Drive links only â€” no binary file upload to Supabase Storage.
Why: Google Drive is already the team's file storage. Adding Supabase Storage introduces a second file system with cost implications and requires multipart upload handling. Link-based attachments give 90% of the value with 10% of the complexity.
Considered instead: Supabase Storage binary upload (rejected â€” cost, complexity, second storage system).
Interview answer: "File attachments in Phase 3 are Drive links, not binary uploads. The team already uses Google Drive. Adding Supabase Storage creates a second file system and requires multipart upload handling in React. Link-based attachments cover the real use case."

**DECISION-019 â€” Two dependency types: blocking vs waiting_on**
Phase 3 | Product
What I decided: Implemented two dependency relationship types â€” blocking and waiting_on â€” rather than a single generic dependency type.
Why: In ministry operations the difference matters. Blocking means hard stop. Waiting_on is a softer coordination signal. The type is stored on the task_dependencies row so it can drive different UI treatment and future automation triggers.
Considered instead: Single type (rejected â€” loses the distinction); three or more types (rejected â€” overkill for Phase 3).
Interview answer: "I modelled two dependency types: blocking and waiting-on. Blocking means hard stop â€” you can't complete this task until the dependency resolves. Waiting-on is softer â€” you're coordinating but could technically proceed."

**DECISION-020 â€” getLinkableTasks excludes done tasks and self-references**
Phase 3 | Performance / Product
What I decided: The dependency picker only shows open tasks from the same department, excluding the current task, already-linked tasks, and done tasks.
Why: Linking to a completed task as a dependency is meaningless. Excluding done tasks keeps the picker clean and prevents users from creating dependencies that will never block anything.
Considered instead: Show all tasks including done (rejected â€” clutters picker).
Interview answer: "The dependency picker filters to open tasks in the same department. Done tasks are excluded because a resolved dependency is meaningless â€” if it's done, it can't block anything."

**DECISION-021 â€” Activity log completeness fixed in RPCs not edge functions**
Phase 1.7 | Security / Architecture
What I decided: Fixed missing audit log entries by adding INSERT INTO activity_log statements inside the existing Postgres RPCs rather than moving logging to edge functions or the frontend.
Why: Keeps all audit writes atomic with their operations inside the same DB transaction. Edge function logging is async and can fail independently; RPC logging cannot.
Considered instead: Edge function logging (rejected â€” async, not atomic); Postgres triggers (considered â€” fires on raw table change, not business operation).
Interview answer: "The RPCs were performing operations without logging them. The fix was adding activity_log inserts inside the RPCs themselves. This keeps logging atomic: the RPC, the data change, and the log entry are one transaction."

**DECISION-022 â€” Separate task_dependencies and task_files tables, not JSONB columns**
Phase 3 | Architecture
What I decided: Stored task dependencies and file attachments in dedicated normalised tables rather than JSONB arrays on the tasks table.
Why: JSONB arrays can't be efficiently queried or joined. You can't ask "which tasks depend on task X" with a JSONB array without scanning every row. The join tables allow efficient reverse lookups, proper foreign key constraints, and RLS policies per record.
Considered instead: JSONB arrays on tasks (rejected â€” no reverse lookups, no per-record RLS, no proper constraints).
Interview answer: "Dependencies and files are in their own tables, not JSONB columns on tasks. JSONB arrays make write-side simple but break read-side â€” I can't efficiently ask which tasks are blocked by task X without scanning every row."

### Phase 3 / UI Polish â€” Surface Refinement

### [DECISION-023] â€” Surface layering: page background vs card background
**Phase:** Phase 3 / UI Polish
**Category:** Tooling / Product
**What I decided:** Set the page background to `#F4F5F7` and card backgrounds to pure white `#ffffff` with a subtle box-shadow, creating a clear depth hierarchy between the canvas and content surfaces.
**Why I decided it:** When both surfaces are the same near-white colour, cards visually dissolve into the page â€” the layout reads as flat. The contrast between a slightly grey page and white cards makes the content feel elevated without heavy shadows or borders. This is the same principle ClickUp, Linear, and Notion use.
**What I considered instead:** Both surfaces white (rejected â€” no depth, cards disappear); strong shadows like Material Design (rejected â€” too heavy, not appropriate for a data-dense ops tool).
**Interview answer (30 seconds):** "The page sits at a slightly grey #F4F5F7 and cards are white. This is intentional surface layering â€” the visual hierarchy tells the user 'this is the canvas, these are the content objects on it.' When both surfaces are the same colour, cards disappear. A 1-3px shadow with low opacity adds depth without the heavy Material Design look. It's the same principle most modern SaaS tools use â€” ClickUp, Linear, Notion all do this."
**Follow-up questions this invites:**
- How do you decide when to use shadow vs border for elevation?
- How does this translate to dark mode?
**Ecosystem connection:** N/A â€” specific to OS visual system.

### [DECISION-024] â€” Validation docs created before marking phases production-complete
**Phase:** Phase 3 / Process
**Category:** Architecture / Product
**What I decided:** Before marking any phase production-complete, created a structured live validation checklist doc in the repo with explicit test cases, RLS matrix, sign-off table, and exit criteria.
**Why I decided it:** Code-complete and production-complete are different things. A phase is code-complete when the build passes. It's production-complete when the live Supabase environment has been validated with real data and real roles. The checklist creates a forcing function to not skip that step, and it becomes an audit trail showing what was tested and who signed off.
**What I considered instead:** Skip formal validation docs and test ad-hoc (rejected â€” easy to miss RLS boundary cases when testing informally); automated E2E tests with Playwright (considered for later â€” right tool for a mature product, overkill for a 30-user internal tool in active development).
**Interview answer (30 seconds):** "I separate code-complete from production-complete. Code-complete means the build passes and the logic is right in isolation. Production-complete means the live environment has been validated â€” migrations applied, RLS tested with real accounts across all roles, UI flows confirmed against real data. I created structured validation checklists in the repo for each phase so there's a forcing function and an audit trail. It's the difference between 'I think it works' and 'I confirmed it works.'"
**Follow-up questions this invites:**
- How would you automate this validation in a larger team?
- What's the most common thing that breaks between local and production?
**Ecosystem connection:** The same validation pattern applies across Meeting OS, CAN Map, and Foundation School integrations â€” each integration needs its own live validation pass before being considered production-complete.

### [DECISION-025] â€” UI polish as a dedicated pass, not mixed with feature work
**Phase:** Phase 3 / UI Polish
**Category:** Product / Process
**What I decided:** Ran UI surface refinements as a completely isolated pass with an explicit constraint: no layout changes, no component changes, no feature changes â€” CSS and design tokens only.
**Why I decided it:** Mixing visual polish with feature work is how regressions happen. When you change a layout while also adjusting shadows, a visual bug gets attributed to the shadow change and the layout change goes unnoticed. Isolating the polish pass means any regression has exactly one cause. It also makes the pass reviewable in isolation â€” the diff shows only style changes.
**What I considered instead:** Mixing polish with Phase 4 feature work (rejected â€” pollutes diffs, harder to bisect regressions); never doing a dedicated polish pass (rejected â€” accumulated visual debt makes the product feel unfinished).
**Interview answer (30 seconds):** "I ran the UI polish as an isolated pass with an explicit constraint: touch only backgrounds, borders, shadows, and badge styling â€” no layouts, no component hierarchy, no features. When you mix visual changes with feature work, regressions become hard to attribute. If something breaks, you can't tell if it was the layout change or the shadow change. An isolated pass means the diff is clean and reviewable, and any regression from it has one cause."
**Follow-up questions this invites:**
- How do you manage design tokens across a growing codebase?
- How would you implement dark mode on top of this system?
**Ecosystem connection:** The CSS variable token system (`--accent`, `--surface-secondary`, `--border`) is shared across the OS. When Meeting OS and CAN Map are embedded or linked, they should reference the same visual language for consistency.

## Phase 4

### [DECISION-026] â€” Sprints live outside permanent departments
**Phase:** Phase 4
**Category:** Architecture / Product
**What I decided:** Built sprints as a separate cross-functional work layer instead of nesting them inside department spaces.
**Why I decided it:** Departments are permanent operational homes, but sprints are temporary initiatives that often need people from multiple departments. If sprints lived inside a single department, cross-functional programs would inherit the wrong ownership and visibility model. Keeping them separate preserves permanent structure while enabling temporary collaboration.
**What I considered instead:** Nest sprints inside departments or spaces (rejected â€” too restrictive for multi-department initiatives like ministry campaigns); make departments optional on all sprint tasks (rejected â€” weakens the operational model and makes reporting less clear).
**Interview answer (30 seconds):** "I separated sprints from departments because they solve different problems. Departments are permanent operating units. Sprints are temporary cross-functional initiatives. If I nested sprints under a department, every cross-functional program would inherit the wrong ownership and permissions model. By making sprints their own layer, I preserved the org structure while still letting Admin, Media, ORS, and Pastors collaborate around a temporary goal."
**Follow-up questions this invites:**
- How did permissions work once sprints became cross-functional?
- How did sprint tasks coexist with department tasks in the same task system?
**Ecosystem connection:** This decision matters across Meeting OS and future automations because meetings, tasks, and calendar items can now attach either to a permanent department or a temporary sprint context.

### [DECISION-027] â€” Sprint lifecycle enforces review before archive
**Phase:** Phase 4
**Category:** Product / Trade-off
**What I decided:** Enforced a structured sprint lifecycle of `planning -> active -> completed -> review -> archived`, with review required before archival.
**Why I decided it:** Ministry initiatives are not only about throughput; they also need retrospective learning, testimonies, recommendations, and a clean handoff of unfinished work. If a sprint can jump directly from done to archive, the learning loop disappears and future teams repeat the same mistakes. The extra review step trades speed for institutional memory.
**What I considered instead:** A simpler lifecycle like active -> done -> archived (rejected â€” too shallow for ministry programs with real learning value); free-form status changes (rejected â€” harder to govern and audit).
**Interview answer (30 seconds):** "I made review a first-class sprint phase instead of a nice-to-have. The point was to force the system to capture outcomes, unresolved work, lessons learned, and testimonies before a sprint disappears into archive. That adds one extra step, but it turns sprints into reusable organizational knowledge instead of just a temporary task bucket."
**Follow-up questions this invites:**
- What data did the sprint review capture?
- How did you handle archived sprints that needed to be reused later?
**Ecosystem connection:** The review-before-archive model strengthens future automations, reporting, and Meeting OS follow-up because sprint outcomes become structured data instead of lost context.

### [DECISION-028] â€” Archived sprints are read-only but restorable and duplicatable
**Phase:** Phase 4
**Category:** Product / Trade-off
**What I decided:** Made archived sprints immutable for normal work, while still allowing restore and duplicate flows.
**Why I decided it:** Archive should mean a stable historical record, not just "hidden from the main list." At the same time, ministry programs often recur. Restore supports correcting archival mistakes; duplicate supports rerunning a program without mutating historical evidence. This preserves history without sacrificing reuse.
**What I considered instead:** Hard-delete archived sprints (rejected â€” destroys history); allow full editing of archived sprints (rejected â€” historical reporting becomes untrustworthy).
**Interview answer (30 seconds):** "I treated archived sprints as historical records. Once archived, they become read-only so metrics and review data stay trustworthy. But I still allowed restore and duplicate. Restore handles mistakes. Duplicate handles recurring ministry programs. That gives the team reuse without corrupting the past."
**Follow-up questions this invites:**
- Why not just let users edit archived sprints?
- How does duplication differ from restore in practice?
**Ecosystem connection:** This supports recurring events across Calendar, Meeting OS, and later automation templates because prior sprint structures can be reused safely.

## Phase 5

### [DECISION-029] â€” Calendar is an org-wide coordination layer, not a task due-date view
**Phase:** Phase 5
**Category:** Product / Architecture
**What I decided:** Implemented the ministry calendar as an org-wide event layer that can embed into departments and sprints, instead of treating it as just a visualization of task due dates.
**Why I decided it:** Task due dates answer "when should this work finish?" but ministry operations also need "what is happening?" â€” conferences, trainings, prayers, deadlines, graduations, and programs. Those are not equivalent concepts. A dedicated calendar model preserves that distinction and keeps task management from swallowing ministry coordination.
**What I considered instead:** Reuse task due dates as the calendar (rejected â€” loses event semantics and creates noisy calendar views); build separate calendars per department only (rejected â€” misses org-wide coordination).
**Interview answer (30 seconds):** "I kept calendar events separate from task due dates because they answer different questions. A due date is about one task finishing. A ministry calendar is about what is happening across the organization â€” programs, trainings, prayers, deadlines. If you collapse those into one thing, the calendar becomes noisy and semantically weak. I built a dedicated event layer and then embedded it into departments and sprints where that context was useful."
**Follow-up questions this invites:**
- How did you relate calendar events back to departments and sprints?
- Why not just filter tasks into a calendar UI?
**Ecosystem connection:** This decision directly connects Meetings, Sprints, CAN Map events, and future Zoom scheduling into one timeline without redefining tasks as events.

### [DECISION-030] â€” Notifications use Supabase tables and Realtime before external channels
**Phase:** Phase 5
**Category:** Architecture / Performance
**What I decided:** Built notifications first as an in-app Supabase-backed system with Realtime delivery, rather than starting with email, push, or third-party notification infrastructure.
**Why I decided it:** In-app notifications are the lowest-friction way to prove the event model, permissions, and unread-state behavior. Realtime gives immediate feedback without polling. Once the notification model is stable, email becomes an extension of the same event system rather than a parallel system. That keeps the architecture simpler and avoids duplicating logic too early.
**What I considered instead:** Start directly with email-only notifications (rejected â€” weak in-app feedback loop and harder to validate delivery semantics); build a separate notification service (rejected â€” unnecessary complexity at this stage).
**Interview answer (30 seconds):** "I started with in-app notifications backed by Supabase tables and Realtime. That let me validate the event model, read state, permissions, and live updates with minimal complexity. Once that foundation exists, email notifications become an extension of the same system instead of a separate implementation. It was an intentional sequencing decision: stabilize the core notification model first, then add delivery channels."
**Follow-up questions this invites:**
- Why use Realtime instead of polling for notifications?
- How did you keep notification visibility role-safe?
**Ecosystem connection:** The same notification event model powers People lifecycle events, Sprint membership, task assignment, and later automation-engine-triggered alerts.

### [DECISION-031] â€” Notifications are triggered at the workflow source
**Phase:** Phase 5
**Category:** Architecture / Trade-off
**What I decided:** Created notifications at the point where the business event happens â€” task assignment, sprint member add, invitation activation â€” instead of introducing a separate centralized event bus first.
**Why I decided it:** At this scale, source-local triggers are easier to reason about, faster to ship, and simpler to debug. Every notification remains close to the workflow that caused it. A centralized event system would be cleaner in a large platform, but it would add indirection before the product needs it. This is a deliberate maintainability trade-off for the current stage.
**What I considered instead:** A formal event bus or trigger orchestration layer (rejected for now â€” cleaner long-term, but premature relative to product size and velocity).
**Interview answer (30 seconds):** "I triggered notifications where the actual workflow event occurred. For example, task assignment creates the notification in the task flow, sprint membership creates it in the sprint flow, and invitation activation creates it in the activation flow. That kept the logic local and debuggable. A centralized event bus is something Iâ€™d consider later, but introducing that abstraction too early would have slowed delivery without solving a real pain yet."
**Follow-up questions this invites:**
- When would you refactor this into a true event bus?
- Did this create duplication risks?
**Ecosystem connection:** This sequencing decision makes it easier to evolve toward Phase 7 automations, where the automation engine can later become the more centralized trigger layer.

## Phase 6

### [DECISION-032] â€” API keys are hashed and shown exactly once
**Phase:** Phase 6
**Category:** Security
**What I decided:** Stored only a SHA-256 hash of each API key in the database and showed the plaintext key to the user one time at creation.
**Why I decided it:** API keys should be treated like credentials, not application data. If the database is compromised or an admin accidentally exposes rows, plaintext keys should not be recoverable. The one-time reveal mirrors GitHub-style personal access token handling and sets the right operational expectation: if a key is lost, rotate it.
**What I considered instead:** Store plaintext keys encrypted in the database (rejected â€” adds key-management complexity and still increases exposure compared with hashing); allow users to reveal keys repeatedly (rejected â€” weakens the security model).
**Interview answer (30 seconds):** "I treated API keys like secrets, not records. The database stores only a SHA-256 hash plus a short prefix for display. The full key is shown exactly once at creation, and if itâ€™s lost the user generates a new one. Thatâ€™s the same model GitHub uses for personal access tokens. It reduces blast radius if the database is ever exposed and keeps the operational model simple."
**Follow-up questions this invites:**
- Why hash instead of encrypt?
- How do revoke and rotate flows work with a hashed key model?
**Ecosystem connection:** This decision matters across CAN Map, Apps Script, and any future external connector calling BLW CAN NEXUS APIs.

### [DECISION-033] â€” Public task API is scope-bound to department or sprint
**Phase:** Phase 6
**Category:** Security / Architecture
**What I decided:** Scoped each public API key to a department or sprint and enforced that scope inside the Edge Function before any task read or write occurs.
**Why I decided it:** External integrations should never get org-wide access by default. A birthday sync for one department should not be able to read or mutate tasks across the whole ministry. Binding keys to a scope preserves least privilege and keeps external automations aligned with the same organizational boundaries the product uses internally.
**What I considered instead:** Org-wide API keys with client-side filtering (rejected â€” violates least privilege and trusts the wrong layer); only department scope with no sprint support (rejected â€” too rigid once sprints exist as first-class work contexts).
**Interview answer (30 seconds):** "Every API key is bound to a department or sprint scope, and the Edge Function enforces that scope before touching tasks. That means an external workflow only gets the minimum access it needs. I didnâ€™t want org-wide integration keys floating around because that breaks the same least-privilege model we enforce internally with RLS."
**Follow-up questions this invites:**
- Why enforce scope in the Edge Function if RLS already exists?
- How did sprint-scoped keys differ from department-scoped keys?
**Ecosystem connection:** This directly governs future CAN Map, Apps Script, Zoom, and Foundation School integrations so each connection can be limited to the correct operational surface.

### [DECISION-034] â€” `external_unique_key` provides idempotency for external automation
**Phase:** Phase 6
**Category:** Architecture / Performance
**What I decided:** Added `external_unique_key` on tasks and made the public task API return the existing task instead of creating a duplicate when the same logical external event is replayed.
**Why I decided it:** External systems rerun. Cron jobs retry. Apps Script executions repeat. Without idempotency, every retry becomes data corruption by duplication. A deterministic external key turns retries into safe replays and makes integrations operationally reliable.
**What I considered instead:** Let the client detect duplicates before calling the API (rejected â€” race-prone and unreliable); rely only on fuzzy matching like title + date (rejected â€” not deterministic enough).
**Interview answer (30 seconds):** "I made the task API idempotent with `external_unique_key`. External systems like Apps Script or cron jobs often rerun, and without an idempotency key every retry creates duplicate work. With a deterministic external key, the API can safely say 'Iâ€™ve already processed this logical event' and return the existing task instead of creating another one."
**Follow-up questions this invites:**
- Why is idempotency especially important for external automation?
- Why not key off title and due date instead?
**Ecosystem connection:** This is essential for Google Sheets automations, recurring campaign imports, CAN Map syncs, and future webhook-driven integrations.

### [DECISION-035] â€” Automations are stored before they are auto-executed
**Phase:** Phase 6
**Category:** Architecture / Trade-off
**What I decided:** Shipped the automation registry and rule builder first, while intentionally deferring the execution engine to the next phase.
**Why I decided it:** Storing and reviewing automations is lower risk than automatically firing them. It lets admins define rules, inspect the schema, and validate the UI before any side effects are live. That sequencing reduces the chance of a half-tested automation engine mutating production data unexpectedly.
**What I considered instead:** Ship the builder and executor together in one phase (rejected â€” too much surface area and harder to validate safely); keep automations as a placeholder until the engine was ready (rejected â€” delayed useful admin workflow setup).
**Interview answer (30 seconds):** "I deliberately separated rule definition from rule execution. Phase 6 gives admins a real automation registry and builder, but it doesnâ€™t auto-fire rules yet. That means teams can model and review automation intent before the system starts mutating live data. Itâ€™s a sequencing decision that reduces operational risk while still moving the product forward."
**Follow-up questions this invites:**
- What changed once you were ready to introduce the execution engine?
- How did you prevent the builder from implying functionality that didnâ€™t exist yet?
**Ecosystem connection:** This decision bridged directly into the planned Phase 7 automation engine, making the UI and schema stable before execution logic was introduced.

## Interview Prep Summaries

### Interview Prep Summary â€” v1.2

### New decisions worth leading with from this session

**DECISION-024 â€” Validation docs before production-complete** is the strongest new addition. It shows engineering maturity â€” you understand the difference between "works on my machine" and "confirmed working in production." Most junior candidates don't make this distinction explicitly.

**DECISION-025 â€” Isolated polish pass** shows process discipline. The constraint you placed on yourself (CSS only, no layout) demonstrates that you understand how regressions happen and how to prevent them.

### Updated totals
- 25 decisions documented
- Phases covered: 1, 1.5, 1.6, 1.7, 2, 3, UI polish
- Categories: Architecture (7), Security (5), Product (6), Performance (2), Tooling (4), Trade-off (3), Process (2)

### Interview Prep Summary â€” v1.3

### Strongest decisions to lead with from these sessions

**DECISION-032 â€” API keys hashed and shown once** is the strongest security decision from the recent phases. It is concrete, defensible, and easy for an interviewer to understand immediately.

**DECISION-026 â€” Sprints outside permanent departments** is the strongest architecture decision. It shows you were modeling organizational reality, not just copying generic project-management software.

**DECISION-034 â€” `external_unique_key` idempotency** is the strongest integration decision. It demonstrates that you understand how external systems fail in practice.

### Deep technical follow-up candidate

**DECISION-033 â€” scope-bound public API keys** is the most likely to generate a deep technical follow-up, because it touches Edge Functions, permissions, least privilege, and the relationship between application-layer enforcement and database-layer enforcement.

### Product-thinking signals

- **DECISION-027** shows product thinking around institutional learning, not just status workflows.
- **DECISION-029** shows clear semantic separation between events and tasks.
- **DECISION-035** shows sequencing discipline: shipping useful configuration before introducing risky side effects.

### Updated totals
- 35 decisions documented
- Phases covered: 1, 1.5, 1.6, 1.7, 2, 3, 4, 5, 6, UI polish
- Categories: Architecture, Security, Performance, Tooling, Product, Trade-off, Process

---

*Catalog is now v1.3 with 35 decisions. Paste this as the running catalog for the next build session.*

## Phase 7

### [DECISION-036] — External tools embedded inside the OS shell
**Phase:** Phase 7
**Category:** Architecture / Product
**What I decided:** Embedded Meeting OS, CAN Map, and BLW Mail inside BLW CAN NEXUS routes using iframe-based shell pages instead of sending users out to separate tabs by default.
**Why I decided it:** Phase 7 was about consolidation. Users should experience one operational workspace, not a collection of disconnected tools. Embedding the tools preserves their independence while making the platform feel unified under one navigation model and one subdomain.
**What I considered instead:** Keeping all tools as external links only (rejected — breaks flow and weakens the “one OS” goal); fully rewriting those tools into the main React app (rejected — high migration risk and unnecessary when the tools already work independently).
**Interview answer (30 seconds):** "I consolidated the ecosystem at the shell layer rather than rewriting each tool. Meeting OS, CAN Map, and BLW Mail now open inside BLW CAN NEXUS routes using iframe wrappers with consistent headers and navigation. That gave users one workspace experience without taking on the risk of re-platforming already-working tools."
**Follow-up questions this invites:**
- Why use iframes instead of fully merging the apps?
- What are the tradeoffs of iframe-based consolidation?
**Ecosystem connection:** Core ecosystem decision — it directly unifies Meeting OS, CAN Map, and BLW Mail under the BLW CAN NEXUS shell.

### [DECISION-037] — Meeting OS embed keeps a native fallback
**Phase:** Phase 7
**Category:** Architecture / Trade-off
**What I decided:** Built the `/meetings` route to embed Meeting OS when `VITE_MEETING_OS_URL` is configured, but fall back to the internal Phase 2 meeting log UI when it is not.
**Why I decided it:** The embed should improve the experience, not become a hard dependency that breaks meetings for local development or partial deployments. The fallback preserves continuity and keeps the internal meeting records workflow usable even if the external Meeting OS URL is missing or unavailable.
**What I considered instead:** Hard-require the external Meeting OS URL (rejected — too brittle for local/dev and staged deployments); remove the internal meeting log once the embed exists (rejected — loses a useful operational backup and historical workflow).
**Interview answer (30 seconds):** "I treated Meeting OS as an enhancement layer, not a single point of failure. If the external embed URL is configured, `/meetings` shows the full Meeting OS inside the shell. If not, it falls back to the internal meeting logging module. That makes the system more deployable and more resilient."
**Follow-up questions this invites:**
- How do you decide when to add a fallback versus enforcing a hard dependency?
- Would you do the same for other integrations?
**Ecosystem connection:** Directly affects Meeting OS integration and establishes the pattern for resilient integration behavior across the ecosystem.

### [DECISION-038] — External integrations are database-driven, not hardcoded
**Phase:** Phase 7
**Category:** Architecture / Product
**What I decided:** Added an `external_integrations` table and used it to drive the Settings integrations tab and Sidebar Tools section instead of hardcoding every external tool link in the frontend.
**Why I decided it:** Integrations are operational configuration, not just presentation. A DB-driven model lets admins enable, disable, reorder, and scope tools without a code deploy. It also creates one canonical source of truth for launch URLs, labels, visibility, and future ecosystem growth.
**What I considered instead:** Hardcoded sidebar/settings links only (rejected — inflexible and duplicates config in code); a JSON config file in the repo (rejected — still requires deploys for operational changes).
**Interview answer (30 seconds):** "I moved external tool definitions into the database so the platform, not the codebase, owns integration metadata. That means Foundation School, CAN Map, Canva, and Drive can be managed from the app itself — visibility, order, enablement, and launch URLs — without shipping frontend code for every change."
**Follow-up questions this invites:**
- Why put integration metadata in the database instead of env or code?
- How did you secure admin-only editing of integrations?
**Ecosystem connection:** This directly governs Foundation School, CAN Map, Canva, Google Drive, and any future linked tool.

### [DECISION-039] — Automation engine executes declarative DB rules
**Phase:** Phase 7
**Category:** Architecture
**What I decided:** Implemented the automation execution engine as a Supabase Edge Function that reads enabled automation rules from the database and executes their actions dynamically.
**Why I decided it:** The automation builder already stored declarative trigger, condition, and action data. The clean next step was to execute that data centrally rather than hardcoding each automation path separately in the frontend or creating one-off server scripts. This keeps automation behavior data-driven and extensible.
**What I considered instead:** Hardcoding each automation workflow in application code (rejected — brittle and hard to scale); introducing n8n/Zapier as the execution layer (rejected — extra operational complexity and duplicated logic outside the product boundary).
**Interview answer (30 seconds):** "The builder already stored automations as data, so the right execution model was an Edge Function that reads enabled rules, evaluates conditions, executes actions, and writes run logs. That keeps the system declarative — admins define behavior in the product, and the execution layer interprets it consistently."
**Follow-up questions this invites:**
- Why use an Edge Function instead of a third-party automation platform?
- How would you evolve this into a more advanced rules engine later?
**Ecosystem connection:** This becomes the shared execution layer for task workflows, notification triggers, and future integrations like CAN Map or Apps Script.

### [DECISION-040] — Notification preferences are per-type and dual-channel
**Phase:** Phase 7
**Category:** Product / Architecture
**What I decided:** Modeled notification preferences per notification type with separate `in_app` and `email` controls rather than a single global notifications setting.
**Why I decided it:** Different events have different urgency and different delivery expectations. A user may want in-app alerts for comments but email for task assignments. Per-type dual-channel preferences make the notification system flexible enough for real operational use without needing separate preference systems later.
**What I considered instead:** One global notifications toggle (rejected — too coarse); only in-app notifications (rejected — misses async delivery use cases); only email notifications (rejected — poor in-product feedback loop).
**Interview answer (30 seconds):** "I treated notification preferences as a matrix, not a boolean. Each notification type has separate in-app and email settings, so users can tune the channel per event. That makes the system much more realistic operationally — comments, sprint updates, and invitations don’t all deserve the same delivery behavior."
**Follow-up questions this invites:**
- Why default missing preferences to enabled?
- How would you handle notification batching or digest emails later?
**Ecosystem connection:** This affects task assignment, sprint membership, meeting creation, invitation acceptance, and future automation-generated alerts.

### [DECISION-041] — Embedded app assets ship through Vite public output
**Phase:** Phase 7
**Category:** Tooling / Trade-off
**What I decided:** Copied CAN Map, Meeting OS static build assets, and the BLW Mail composer asset into Vite-served public paths so the embedded iframe routes exist in the production build.
**Why I decided it:** Embedding a tool in the shell is only useful if its target path actually ships with the deployed build. The React app and the embedded apps had separate source locations, so Phase 7 needed an explicit asset-serving decision. Using Vite public paths was the fastest reliable way to make those shell routes real without introducing a more complex multi-app deployment pipeline first.
**What I considered instead:** Assuming `apps/` content would ship automatically (rejected — not true for Vite build output); building a more complex monorepo asset pipeline first (rejected — too much infrastructure for the current stage); leaving the mail placeholder instead of using the real composer asset (rejected once the file was found in the repo).
**Interview answer (30 seconds):** "One subtle deployment issue was that embedding an app route doesn’t mean the static asset ships automatically. The React build only outputs what Vite knows to serve. So I copied the embedded tools into public paths that survive build output — that made `/apps/mail`, `/apps/map`, and `/apps/meeting-os/dist` actual deployable targets instead of broken iframe URLs."
**Follow-up questions this invites:**
- Why use public asset copying instead of a more formal multi-app deployment pipeline?
- What would you change if these embedded tools became independently deployed services?
**Ecosystem connection:** Directly affects Meeting OS, CAN Map, and BLW Mail deployment behavior inside the unified shell.

## Interview Prep Summary — v1.4

### Strongest decisions to lead with from this session

**DECISION-036 — External tools embedded inside the OS shell** is the strongest consolidation decision. It shows you understood how to unify a product ecosystem without forcing a risky rewrite.

**DECISION-039 — Automation engine executes declarative DB rules** is the strongest architecture decision. It shows you can take a schema-and-builder system and carry it through to a real execution layer.

**DECISION-038 — External integrations are database-driven, not hardcoded** is the strongest platform design decision. It demonstrates that you treat integrations as configurable product infrastructure, not static UI links.

### Deep technical follow-up candidate

**DECISION-039 — Automation engine executes declarative DB rules** is the most likely deep technical follow-up because it touches rule evaluation, action execution, run logging, and the tradeoff between native execution and third-party automation tooling.

### Product-thinking signals

- **DECISION-036** shows product thinking around unification and operator workflow continuity.
- **DECISION-037** shows resilience thinking — the Meeting OS embed improves the UX without becoming a hard operational dependency.
- **DECISION-040** shows realistic product design around notification channels and event-specific user preferences.

### Updated totals
- 43 decisions documented
- Phases covered: 1, 1.5, 1.6, 1.7, 2, 3, 4, 5, 6, 7, UI polish
- Categories: Architecture, Security, Performance, Tooling, Product, Trade-off, Process

---

*Catalog is now v1.4 with 43 decisions. Paste this as the running catalog for the next build session.*

### [DECISION-042] — Zoom credentials stored as config, not hardcoded
**Phase:** Phase 7
**Category:** Security / Architecture
**What I decided:** Zoom integration credentials (`account_id`, `client_id`) are stored in a `zoom_config` table with RLS restricted to `super_admin`, while the client secret is intentionally excluded from the database.
**Why I decided it:** Credentials in code are a security risk because they end up in version control and deployment history. A config table lets the super admin update non-secret Zoom settings without a deployment. The client secret belongs in Supabase Vault or equivalent encrypted secret storage, not a plain relational table.
**What I considered instead:** Hardcoded env vars in the application code path (rejected — higher exposure risk and harder operational updates); storing the client secret in the table (rejected — plain table columns can leak through exports, logs, and admin tooling).
**Interview answer (30 seconds):** "Zoom credentials go in a `zoom_config` table, not in the codebase. The super admin can update them without a deployment, and RLS restricts access to that config. The client secret is intentionally not stored there — it belongs in Supabase Vault, which is the right place for encrypted secrets at rest. Hardcoding credentials or storing secrets in normal table columns are both patterns I avoided."
**Follow-up questions this invites:**
- Why separate config values from true secrets?
- How would you wire Supabase Vault or another secret manager into this flow?
**Ecosystem connection:** This governs future Zoom meeting creation inside the BLW CAN NEXUS calendar and keeps external meeting credentials aligned with the platform security model.

### [DECISION-043] — BLW Mail is scoped to super admin and department leads
**Phase:** Phase 7
**Category:** Product / Security
**What I decided:** Restricted the `/communications` route and sidebar link for BLW Mail to `super_admin` and `dept_lead` users instead of exposing the email composer to every authenticated user.
**Why I decided it:** Broadcast communications are an operational privilege, not a general member capability. Emailing from the ministry platform affects coordination, reputation, and potentially external recipients. Scoping BLW Mail to admin and leadership roles keeps the tool aligned with organizational responsibility and reduces misuse risk.
**What I considered instead:** Expose BLW Mail to all users (rejected — too much sending power for general members); create a more granular communications-only role in Phase 7 (rejected — adds permission complexity before a real need is proven).
**Interview answer (30 seconds):** "BLW Mail is intentionally not a member-facing feature. I scoped it to `super_admin` and `dept_lead` because outbound communications affect the whole organization and should stay with operational leadership. That keeps permissions simple and consistent with how the rest of the product treats elevated actions — members consume operational data, but they don’t get broadcast tooling by default."
**Follow-up questions this invites:**
- Why not create a dedicated communications role?
- How would you audit or approve outbound email workflows later?
**Ecosystem connection:** This affects BLW Mail directly and reinforces the same leadership-boundary model already used in People, Automations, and other elevated OS tools.

## Interview Prep Summary — v1.4

### Strongest Phase 7 decisions to lead with

**DECISION-036 — External tools embedded inside the OS shell** is the strongest consolidation decision. It shows you unified a multi-tool ecosystem without taking on a risky rewrite.

**DECISION-039 — Automation engine executes declarative DB rules** is the strongest technical architecture decision. It shows you carried a rule-builder system through to actual execution and run logging.

**DECISION-042 — Zoom credentials stored as config, not hardcoded** is the strongest later-stage security decision. It shows you understand the boundary between editable config and true secrets.

### Deep technical follow-up candidate

**DECISION-039 — Automation engine executes declarative DB rules** is the most likely deep technical follow-up because it touches condition evaluation, action execution, durability, and the tradeoff between native execution and third-party automation platforms.

### Product-thinking signals

- **DECISION-036** shows product thinking around unification and operator workflow continuity.
- **DECISION-037** shows resilience thinking by keeping the Meeting OS embed optional rather than brittle.
- **DECISION-040** shows realistic thinking about user-controlled delivery channels.
- **DECISION-043** shows governance thinking around who should have broadcast communications access.
