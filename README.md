# BLW Canada OS

Internal operations platform for BLW Canada, built with React, Vite, and Supabase.

## What it is

BLW Canada OS is an internal workspace for a 30-person campus ministry organization with five departments. It centralizes day-to-day operations that would otherwise be spread across task managers, spreadsheets, email, and separate internal tools. The application covers task management, people lifecycle management, meetings, sprints, calendar coordination, notifications, and lightweight integrations.

The primary users are ministry leaders, department leads, pastors, and members. Each role sees a different slice of the system through Supabase Row Level Security. Department work stays scoped to the right team, pastor visibility stays limited to assigned members, and elevated workflows like invitations, automations, and communications stay restricted to leadership roles.

The project is designed as a replacement for ClickUp for this organization’s internal operations. For a 30-user team, that removes an estimated ClickUp cost of about $360/month while allowing the platform to model ministry-specific workflows such as pastoral assignments, Meeting OS integration, and CAN Map access.

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
- Public task API
- API key management
- Automation rule builder
- Automation run log
- Apps Script integration support

### Settings
- Profile editing
- Password update
- Notification preferences
- Integration management
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
   Apply the SQL files in `supabase/migrations/` in the order listed below:
   1. `20260608_phase1_blw_canada_os.sql`
   2. `20260609_phase1_5_user_lifecycle.sql`
   3. `20260610_phase1_6_invitation_delivery.sql`
   4. `20260611_phase1_7_activity_log_completeness.sql`
   5. `20260612_phase2_meeting_task_fk.sql`
   6. `20260613_phase3_task_maturity.sql`
   7. `20260614_phase4_sprints.sql`
   8. `20260615_phase5_calendar_notifications.sql`
   9. `20260616_phase6_api_automations.sql`
   10. `20260617_phase7_final.sql`

6. **Create the first super admin**
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

7. **Start the app**
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
```

Notes:
- `send-user-invitation` uses Resend for invitation delivery.
- `send-notification-email` uses the same email secret pattern.
- `automation-engine` and `task-api` run inside Supabase Edge Functions and depend on the project’s server-side environment.

## Migration order

1. `20260608_phase1_blw_canada_os.sql`
2. `20260609_phase1_5_user_lifecycle.sql`
3. `20260610_phase1_6_invitation_delivery.sql`
4. `20260611_phase1_7_activity_log_completeness.sql`
5. `20260612_phase2_meeting_task_fk.sql`
6. `20260613_phase3_task_maturity.sql`
7. `20260614_phase4_sprints.sql`
8. `20260615_phase5_calendar_notifications.sql`
9. `20260616_phase6_api_automations.sql`
10. `20260617_phase7_final.sql`

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
# BLW_CANADA_PM-Tool
