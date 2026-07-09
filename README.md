# BLW CAN NEXUS

[![CI/CD Pipeline](https://github.com/blwcanada/nexus/actions/workflows/ci.yml/badge.svg)](https://github.com/blwcanada/nexus/actions/workflows/ci.yml)

**Internal operations platform for BLW Canada Sub-Region** — centralized task, meeting, sprint, and communication hub replacing ClickUp for 30 members across 5 departments.

## Project Overview

BLW CAN NEXUS is an internal workspace for BLW Canada Sub-Region's 30-person team organized into five departments (Admin, Media, ORS, Pastors, PFCC). It replaces ClickUp (~$360/month) by centralizing operations: task management, meetings, sprints, communications, calendar coordination, and automations—all in one place, with role-based security enforced at the database layer.

**Key attributes:**
- Multi-tenant with department-scoped views via Supabase Row Level Security (RLS)
- Custom role system (super_admin, dept_lead, pastor, member)
- Real-time collaboration with Supabase subscriptions
- External integrations: Google Calendar, Google Drive (Apps Script), Slack, Resend

> **📚 [View Full Documentation](docs/README.md)** — Setup guides, feature docs, deployment procedures, and more

## Tech Stack

| Area | Technology |
| --- | --- |
| **Frontend** | React 18, Vite, React Router, inline styles (no Tailwind) |
| **Backend** | Supabase PostgreSQL, Row Level Security, Supabase Edge Functions |
| **Auth** | Supabase Auth + custom token-based invite flow |
| **Email** | Resend (transactional + campaigns) |
| **Real-time** | Supabase Realtime subscriptions |
| **External** | Google Calendar, Google Drive (Apps Script), Slack integration, Resend webhooks |
| **Hosting** | Vercel |
| **AI** | Anthropic Claude API, Whisper WASM (Meeting OS) |

## Features

### Tasks & Lists
- **Kanban, List, Table views** with drag-and-drop
- **Status lifecycle**: To Do, In Progress, Review, Done, Blocked (per-space definitions)
- **Assignee management** with avatars, watchers, dependencies
- **Priority levels**: Urgent, High, Medium, Low
- **Attachments** (file links), **comments**, **subtasks**
- **Space-scoped** with folder → list hierarchy
- **Filtering** by status, assignee, due date, priority
- **Optimistic updates** with rollback on error

### Sprints
- **Full lifecycle**: create, archive, restore, duplicate, review
- **Sprint teams** (inline creation, role-based)
- **Temporary membership** with auto-expiration (external invites)
- **Custom token flow** for external member invites (avoids Gmail scanner issues)
- **Sprint board** with drag-and-drop task management
- **Progress tracking** and sprint review workflows
- **Auto-deactivation** on sprint archive

### Meetings (Meeting OS)
- **Agenda builder** (3-step wizard, drag-drop reordering)
- **Minutes capture** with formatting
- **Attendance tracking** (Service, Group, Both categories)
- **Meeting reports**: Regional vs Per-Subgroup modes
- **PDF export** with BLW Canada branding
- **Action items** → Task bridge (create tasks from action items)
- **Absence notifications** (email alerts for no-shows)
- **Attendee management** with RSVP tracking

### Communications (Email Campaigns)
- **Campaign builder** with drag-drop editor
- **Scheduling** (send now, schedule for later)
- **A/B testing** with winner selection
- **Bounce management** (Resend webhooks auto-mark bounced emails)
- **Subscriber segments** (filter by department, role, custom tags)
- **Click & open tracking** with analytics dashboard
- **Unsubscribe management** (CASL compliance)
- **Performance dashboard** (open rate, click rate, bounces)

### Calendar
- **Google Calendar integration** (read/write OAuth)
- **Ministry calendar** (org-wide events)
- **Event CRUD** with RSVP tracking
- **Google Drive sync** (auto-attach files to events)
- **Space & sprint linking**

### Automations
- **Rule engine**: trigger (task status change, due date, user assignment, etc.) → action (send email, update status, assign user)
- **Automation history** with audit log
- **Public task API** (per-key rate limiting: 60 req/min)
- **API key management** with last-used tracking

### Birthday Flyer System
- **Monthly sync** from Google Sheets (Apps Script trigger on 1st of month)
- **Auto-create tasks** for each birthday with:
  - Assignee: Ella Ukpabia
  - Due date + time (birthday at 11:30 AM)
  - Status: To Do
  - Description with checklist template
- **Duplicate prevention** (checks existing tasks)
- **Time-based execution** (monthly trigger)

### Attendance & Analytics
- **Event attendance tracking** (per meeting, per member)
- **Attendance trends** visualization (group/subgroup breakdown)
- **Excel workbook export** (consolidated attendance data with BLW Canada branding)
- **Historical reporting** by department and date range

## Database Architecture

**Core tables:**
- `users` — platform users with role, department, and profile info
- `spaces` — 5 departments (Admin, Media, ORS, Pastors, PFCC)
- `folders` — space → folder hierarchy
- `lists` — folder → list hierarchy
- `tasks` — task data with space_id, list_id, status, assignee, priority, due_date
- `task_comments` — comments with author, content, attachments
- `task_status_definitions` — per-space custom statuses (backfilled for all departments)
- `sprints` — sprint metadata with team, dates, status
- `sprint_members` — temporary membership with auto-expiration
- `meetings` — meeting records with attendee list and action items
- `communication_campaigns` — email campaigns with bounce tracking
- `calendar_events` — ministry calendar with RSVP tracking
- `automation_rules` — rule definitions (trigger + action)
- `automation_runs` — audit log of automation executions

**RLS policies:**
- All tables enforced at row level by `current_user_department()` and `current_user_role()`
- JWT custom claims (`user_role`, `user_department_id`) embedded in every token
- JWT fallback to direct DB lookup if claims absent (for pre-hook sessions)
- Cross-department access: super_admin only (except explicit share workflows)

## Edge Functions (18+)

- `send-user-invitation` — transactional invite email via Resend
- `send-sprint-invite` — external sprint member invite (custom token)
- `send-agenda-reminder` — meeting prep notification
- `send-birthday-notification` — birthday flyer reminders
- `send-campaign` — email campaign dispatch with A/B variant selection
- `handle-bounces` — Resend webhook: auto-mark bounced emails, suppress future sends
- `send-notification-email` — automation/system email notifications
- `automation-engine` — trigger detector and action executor
- `task-api` — public task API (rate-limited by key)
- Calendar sync webhooks
- Slack integration functions (async dispatch)
- Google Drive file attachment functions

## API & RPC Functions

**Public endpoints:**
- `GET /functions/v1/task-api/tasks` — fetch tasks (filtered by department, list_id, assignee)
- `POST /functions/v1/task-api/tasks` — create task (requires API key)
- `PATCH /functions/v1/task-api/tasks/:id` — update task

**RPC functions:**
- `create_user_invitation()` — atomic user + invitation row creation
- `invite_external_sprint_member()` — SECURITY DEFINER (custom token flow, FK constraint safe)
- `get_space_statuses()` — fetch all task statuses per space
- `get_space_tasks()` — fetch tasks with list_id support (RLS enforcement)
- `archive_sprint()` — auto-deactivate sprint members, archive tasks
- `get_automation_run_log()` — audit log query with filtering

## Authentication & Authorization

**Login flow:**
1. Supabase Auth (email/password)
2. JWT issued with custom claims (user_role, user_department_id)
3. JWT hook embedded on sign-in; fallback to direct DB lookup if absent

**Invite flow (avoids Gmail scanner issues):**
1. Create invitation row in DB
2. Generate custom token (not in URL)
3. Send email with token in body
4. User clicks activation link → submits form with token
5. Atomic `invite_external_sprint_member()` RPC creates user + assigns sprint membership

**Roles:**
- `super_admin` — full access, all departments, user management, platform config
- `dept_lead` — department + sprint management, people invites, automations, communications
- `pastor` — view assigned members, read pastoral tasks, meeting attendance
- `member` — view own department, assigned tasks, sprints

**RLS enforcement:** Every row query filtered by `current_user_department()` and `current_user_role()`

## Architecture Decisions

**Design patterns:**
- **Feature-first folder structure** (recommended refactor: `/src/features/*`)
- **Inline styles only** (no Tailwind CSS v4 in production; design tokens: primary #4C2A92, border #EDE8DC, text #2D2A22)
- **Optimistic updates** with rollback on error (React state → Supabase)
- **Supabase Realtime** for live collaboration (task updates, sprint changes)
- **Per-space task statuses** with global fallback (backfilled on migration)
- **Temporary sprint membership** with auto-expiration (cron job on sprint archive)

See `docs/decision-catalog.md` for 35+ documented decisions with rationale.

## Local setup

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd clickup
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create local environment file**
   ```bash
   cp .env.example .env.local
   ```
   Fill in the values described in the Environment variables section below.

4. **Create a Supabase project**
   - Create a Supabase project in the dashboard.
   - Copy the project URL and anon key into `.env.local`.
   - Use the same project for local development and migration testing.

5. **Run migrations in order**
   Apply the SQL files in `supabase/migrations/` in the order listed below (see Migration order section).

6. **Attach the JWT custom claims hook**
   See the JWT custom claims hook section below. The hook must be active before any user signs in, otherwise `current_user_role()` and `current_user_department()` will fall back to a direct DB lookup (see `20260625000000_jwt_role_fallback.sql`).

7. **Create the first super admin**
   First create an auth user in Supabase Auth, then insert the matching profile row:
   ```sql
   insert into public.users (id, name, email, role, department_id)
   values (
     'YOUR_AUTH_USER_ID',
     'First Admin',
     'admin@example.com',
     'super_admin',
     (select id from public.departments where name = 'Admin')
   );
   ```
   Replace `YOUR_AUTH_USER_ID` with the UUID from `auth.users`.

8. **Start the app**
   ```bash
   npm run dev
   ```

## Environment variables

| Variable | Description | Where to get it |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL used by the frontend client | Supabase project settings |
| `VITE_SUPABASE_ANON_KEY` | Public anon key for the frontend Supabase client | Supabase project API settings |
| `VITE_MEETING_OS_URL` | URL for the embedded Meeting OS app | Deployed Meeting OS URL or `/apps/meeting-os/dist/index.html` |

## Edge functions

Deploy these Edge Functions after migrations are applied:

```bash
supabase functions deploy send-user-invitation
supabase functions deploy task-api
supabase functions deploy automation-engine
supabase functions deploy send-notification-email
```

Required secrets:

```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key
supabase secrets set INVITATION_FROM_EMAIL="BLW CAN NEXUS <notifications@yourdomain.com>"
supabase secrets set INVITATION_FRONTEND_URL=https://your-frontend-url
supabase secrets set ALLOWED_ORIGIN=https://your-frontend-url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set NOTIFICATION_FROM_EMAIL="BLW CAN NEXUS <notifications@yourdomain.com>"
```

| Secret | Used by | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | `send-user-invitation`, `send-notification-email` | Transactional email delivery via Resend |
| `INVITATION_FROM_EMAIL` | `send-user-invitation` | From address for invitation emails |
| `INVITATION_FRONTEND_URL` | `send-user-invitation` | Activation link base URL |
| `NOTIFICATION_FROM_EMAIL` | `send-notification-email` | From address for notification emails |
| `ALLOWED_ORIGIN` | `automation-engine` | CORS allowed origin (`*` in dev) |
| `SUPABASE_SERVICE_ROLE_KEY` | `automation-engine`, `task-api` | Service role for DB writes inside edge functions |

## JWT custom claims hook

`20260623000000_jwt_custom_claims.sql` installs a PostgreSQL function called `custom_access_token_hook` that embeds `user_role` and `user_department_id` directly into every issued JWT. This means RLS helper functions (`current_user_role()`, `current_user_department()`) read from the token rather than hitting the database on every row check.

### Attaching the hook in the Supabase dashboard

1. Open your Supabase project → **Authentication** → **Hooks**.
2. Under **Custom Access Token**, select **PostgreSQL function**.
3. Choose schema `public`, function `custom_access_token_hook`.
4. Save and confirm. New sign-ins will include the claims immediately.

> **Note:** Sessions created before the hook was attached will not have the claims in their JWT. The fallback in `20260625000000_jwt_role_fallback.sql` handles this by falling back to a direct `public.users` lookup when the claim is absent. Remove that fallback once all pre-hook sessions have expired or been re-issued.

### Verifying the hook is working

Run this query in the Supabase SQL editor while signed in as a non-admin user, then decode the result at [jwt.io](https://jwt.io):

```sql
select auth.jwt();
```

The decoded payload should include:

```json
{
  "user_role": "member",
  "user_department_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

If `user_role` is absent, the hook is not attached or the session predates the hook.

## Key Bugs Fixed

- **Task filtering by list_id** — Fixed `getSpaceTasks()` RPC select to filter by list_id (was returning all space tasks regardless)
- **Status bucketing** — Per-space task status definitions with global fallback; backfill migration for all departments
- **External invite FK constraint** — Moved user creation into `SECURITY DEFINER` RPC to atomically create user + sprint_member row (avoids race conditions)
- **Gmail scanner token consumption** — Replaced URL-embedded tokens with custom token flow (token in email body, not URL)
- **CreateTeamModal rendering** — Fixed state variable gating to prevent modal flash on non-sprint pages
- **Concurrent sprint updates** — Added optimistic updates with rollback on Supabase write error
- **RLS policy gaps** — Hardened JWT custom claims, removed deprecated direct DB lookups, added fallback for pre-hook sessions

## Known Limitations & Future Work

**Current limitations:**
- PKCE flow not available on current Supabase plan (affects future mobile app)
- Sprint review type selector (team vs unified) — UI ready, backend toggle needed
- Forgot password system — on roadmap
- Clickable breadcrumbs for navigation — on roadmap
- Feature-first folder structure refactor — recommended but deferred

**Planned:**
- Role-based permission matrix UI (currently hardcoded in RLS)
- Meeting OS export to Google Drive
- Advanced automation builder (UI for complex trigger chains)
- Slack channel creation/sync for sprints
- Two-factor authentication (Supabase MFA)

## Contributing

**Branch naming:**
- `feature/*` — new features
- `fix/*` — bug fixes
- `docs/*` — documentation
- `refactor/*` — code cleanup without behavior change

**Commit style:**
- `feat(module): description` — new feature
- `fix(module): description` — bug fix
- `docs: description` — documentation
- `refactor(module): description` — refactoring

**Testing:**
- Manual testing on Vercel preview deployments (no automated test suite yet)
- Smoke test checklist: sign-in, create task, invite user, trigger automation, call task API

**Code style:**
- Inline styles only (no Tailwind); reuse design tokens from `src/styles/index.css`
- React hooks (no class components)
- Async/await for Supabase calls
- Optimistic updates with error rollback

## Contact & Support

- **Maintainer:** Amber Moseri
- **Email:** blwcan.elvanto@gmail.com
- **Repository:** [github.com/Amber-E-Moseri/Nexus](https://github.com/Amber-E-Moseri/Nexus)
- **Issues & features:** GitHub Issues

## Migration order

Apply these files in alphabetical order (which matches chronological order by filename prefix):

1. `20260608000000_initial_blw_canada_os_schema.sql`
2. `20260609000000_user_lifecycle.sql`
3. `20260610000000_invitation_delivery.sql`
4. `20260611000000_activity_log_completeness.sql`
5. `20260612000000_meeting_task_foreign_keys.sql`
6. `20260613000000_task_maturity.sql`
7. `20260613000001_dept_scoped_integrations.sql`
8. `20260614000000_sprints.sql`
9. `20260615000000_calendar_notifications.sql`
10. `20260616000000_api_automations.sql`
11. `20260617000000_settings_integrations_finalization.sql`
12. `20260618000000_spaces.sql`
13. `20260618000001_configurable_task_statuses.sql`
14. `20260619000000_auth_onboarding.sql`
15. `20260620000000_sprint_system_hardening.sql`
16. `20260621000000_spaces_rls_security.sql`
17. `20260622000000_task_indexes.sql`
18. `20260622000001_task_comments_rls_fix.sql`
19. `20260623000000_jwt_custom_claims.sql`
20. `20260623000001_actionable_tasks_view.sql`
21. `20260623000002_harden_jwt_helpers.sql`
22. `20260624000000_sidebar_tools.sql`
23. `20260624000001_seed_task_defaults.sql`
24. `20260625000000_jwt_role_fallback.sql`
25. `20260625000001_missing_indexes.sql`
26. `20260626000000_rate_limits.sql`

## Smoke test

After first setup, verify the app is working end-to-end:

1. **Sign in** with the super admin account. Confirm you land on the Dashboard and the sidebar shows Spaces, Sprints, and People sections.
2. **Create a task** — navigate to any Space, open the task panel, create a task with a title and due date. Confirm it appears in the kanban board and in My Tasks.
3. **Invite a user** — go to People → Invitations, send an invitation to a test email. Confirm the invitation row appears with status `pending` and a Resend delivery event appears in your Resend dashboard.
4. **Trigger an automation** — go to Automations, create a rule with trigger type `task_created` and action `notify_user`. Create a task. Confirm an entry appears in the Run Log.
5. **Call the task API** — generate an API key in Automations → API Keys, then run:
   ```bash
   curl -X GET "https://<project>.supabase.co/functions/v1/task-api/tasks" \
     -H "x-api-key: <your-key>"
   ```
   Confirm a JSON response with a `tasks` array is returned and the key's `last_used_at` timestamp updates in the database.

## Documentation

Complete documentation is available in the `docs/` directory:

- **[docs/README.md](docs/README.md)** — Master documentation index with quick links
- **[docs/architecture/decision-catalog.md](docs/architecture/decision-catalog.md)** — 35+ documented architecture decisions
- **[docs/setup/](docs/setup/)** — Environment setup and configuration guides
- **[docs/features/](docs/features/)** — Feature implementation guides
- **[docs/deployment/](docs/deployment/)** — Deployment procedures and checklists
- **[docs/phases/](docs/phases/)** — Phase-specific implementation and validation guides
- **[docs/audits/](docs/audits/)** — System audits and investigation reports
- **[docs/guides/](docs/guides/)** — Testing and verification guides
- **[docs/SECURITY.md](docs/SECURITY.md)** — Security guidelines and best practices

## Ecosystem

- **Meeting OS**: `apps/meeting-os/`
  Standalone meeting workspace for agenda, minutes, attendance, summaries, and exports. Embedded into `/meetings` in the main shell.

- **BLW CAN Map**: `apps/map/`
  Campus outreach map for Canadian post-secondary coverage. Exposed in the main shell through the CAN Map page.

- **Foundation School**: external
  Connected through launch links and integration metadata. It remains an external system rather than a merged codebase.

## Cost

Replaces ClickUp (~$360/month for 30 users). Running cost: $0/month on free tiers.

## License

Internal use — BLW CAN NEXUS
