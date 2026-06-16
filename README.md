# BLW Canada OS

Internal operations platform for BLW Canada, built with React, Vite, and Supabase.

## What it is

BLW Canada OS is an internal workspace for a 30-person campus ministry organization with five departments. It centralizes day-to-day operations that would otherwise be spread across task managers, spreadsheets, email, and separate internal tools. The application covers task management, people lifecycle management, meetings, sprints, calendar coordination, notifications, and lightweight integrations.

The primary users are ministry leaders, department leads, pastors, and members. Each role sees a different slice of the system through Supabase Row Level Security. Department work stays scoped to the right team, pastor visibility stays limited to assigned members, and elevated workflows like invitations, automations, and communications stay restricted to leadership roles.

The project is designed as a replacement for ClickUp for this organization's internal operations. For a 30-user team, that removes an estimated ClickUp cost of about $360/month while allowing the platform to model ministry-specific workflows such as pastoral assignments, Meeting OS integration, and CAN Map access.

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | React 18, Vite, React Router, Tailwind CSS v4 |
| Backend | Supabase Postgres, Row Level Security, Supabase Edge Functions |
| Auth | Supabase Auth |
| Email | Resend |
| Hosting | Vercel or Netlify |
| AI | Anthropic Claude API and Whisper WASM in `apps/meeting-os/` |

## Features

### Task management
- Department-scoped kanban boards
- List view
- Task CRUD
- Subtasks
- Priority labels
- Due dates
- Personal tasks
- Task comments
- Link-based file attachments
- Task dependencies

### People management
- Invitation workflow
- User lifecycle states
- Activation flow
- Department assignment history
- Pastoral assignments
- People pages for users, invitations, departments, and pastor-member relationships

### Meetings
- Meeting OS integration
- Embedded Meeting OS route with fallback meeting log UI
- Meeting records
- Attendance tracking
- Action item to task bridge

### Sprints
- Cross-functional sprint workspace
- Sprint lifecycle
- Sprint member and team management
- Sprint review
- Archive, restore, and duplicate flows

### Ministry Calendar
- Org-wide event calendar
- Event types for ministry operations
- Space and sprint linking
- Zoom link field support

### Notifications
- Real-time in-app notifications
- Per-type notification preferences
- Email notification support through Edge Functions

### API + Automations
- Public task API with per-key rate limiting (60 req/min)
- API key management
- Automation rule builder
- Automation run log
- Apps Script integration support

### Settings
- Profile editing
- Password update
- Notification preferences
- Integration management (department-scoped)
- Account and workspace controls

### Ecosystem
- CAN Map embed
- BLW Mail embed
- Meeting OS embed
- Foundation School launch links

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
| `VITE_MAIL_OS_URL` | URL for the embedded BLW Mail app | Default is `/apps/mail/index.html` in this repo |

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
supabase secrets set INVITATION_FROM_EMAIL="BLW Canada OS <notifications@yourdomain.com>"
supabase secrets set INVITATION_FRONTEND_URL=https://your-frontend-url
supabase secrets set ALLOWED_ORIGIN=https://your-frontend-url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set NOTIFICATION_FROM_EMAIL="BLW Canada OS <notifications@yourdomain.com>"
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

## Architecture decisions

See `docs/decision-catalog.md` for 35+ documented architecture decisions with interview-ready explanations.

## Ecosystem

- **Meeting OS**: `apps/meeting-os/`
  Standalone meeting workspace for agenda, minutes, attendance, summaries, and exports. Embedded into `/meetings` in the main shell.

- **BLW CAN Map**: `apps/map/`
  Campus outreach map for Canadian post-secondary coverage. Exposed in the main shell through the CAN Map page.

- **BLW Mail**: `public/apps/mail/`
  Embedded communications tool used by leadership roles for outbound email workflows.

- **Foundation School**: external
  Connected through launch links and integration metadata. It remains an external system rather than a merged codebase.

## Cost

Replaces ClickUp (~$360/month for 30 users). Running cost: $0/month on free tiers.

## License

Internal use — BLW Canada
