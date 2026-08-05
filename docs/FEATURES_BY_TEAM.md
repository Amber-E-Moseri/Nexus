# Features by Team

This is the escalation map for maintainers. It uses role-based owners until a primary and backup person are assigned.

| Feature / subsystem | Operational owner | Main code area | Dependencies | Escalate when |
| --- | --- | --- | --- | --- |
| Tasks, spaces, sprints | Operations lead | `src/features/tasks`, `src/features/sprints`, `src/features/spaces` | Supabase Postgres/RLS, Realtime | Tasks are missing, permissions leak, or statuses cannot change. |
| Meetings and Minutes Hub | Meetings lead | `src/features/meetings` | Supabase, Drive, Anthropic | Meeting access, minutes, reporting, or extraction fails. |
| Calendar and task sync | Calendar integration owner | `src/features/calendar`, `src/features/user-integrations` | Google OAuth/API, Supabase functions | Calendar connection/sync/token handling fails. |
| Communications and email | Communications lead | `src/features/communications`, `supabase/functions/broadcast-campaign` | Resend, Edge Functions | Campaign delivery, webhooks, invitations, or opt-out behavior fails. |
| Registration | Programs/registration lead | `src/features/registration` | Supabase, event configuration | Delegates, rooms, reports, or public registration fail. |
| Flock CRM | Pastoral data lead | `src/features/flock` | Supabase RLS | Confidential data is missing or visible to the wrong role. |
| Automations | Platform administrator | `src/pages/platform`, `supabase/functions/automation-engine` | DB webhooks, Resend | Rules misfire, duplicate, or fail to execute. |
| Dashboard and Inbox | Operations lead | `src/features/dashboard`, `src/pages/Inbox.jsx` | Supabase Realtime | Counts/activity are stale or expose wrong data. |
| API keys and MCP connector | Platform administrator | `api/mcp.ts`, settings API screens | Supabase, Vercel | Key revocation, audit, rate limiting, or access scope fails. |
| Deployment and RLS | Platform administrator | `supabase/migrations`, `.github/workflows`, Vercel | Supabase, GitHub, Vercel | Migration, policy, build, or production deployment fails. |

## Ownership Rules

- Every subsystem needs a primary and backup person in the internal roster.
- Only the platform administrator changes RLS, migrations, Edge Function secrets, or production deployment settings.
- Feature leads own acceptance testing and routine configuration, and escalate permission or data-model changes.
