# Nexus Code Tour

Use this 30-minute walkthrough for new maintainers. Use a non-production account and stop before any RLS or migration change.

| Time | Topic | Files / outcome |
| --- | --- | --- |
| 0-5 min | App shell and authentication | `src/App.jsx`, `src/context/AuthContext.jsx`, `src/components/layout/Sidebar.jsx`; routes, roles, and navigation. |
| 5-12 min | Tasks and sprints | `src/features/tasks`, `src/features/sprints`, `TasksContext.jsx`; list load, mutation, optimistic update, and statuses. |
| 12-17 min | Authorization and data | `supabase/migrations`, `src/lib/permissions`; one RLS policy and its deny case. |
| 17-22 min | Realtime and notifications | `NotificationsContext.jsx`, `InboxCountContext.jsx`; scoped subscriptions and cleanup. |
| 22-27 min | Edge Functions and integrations | `supabase/functions/broadcast-campaign`, `extract-meeting-data`, calendar functions; secrets, provider calls, logs. |
| 27-30 min | Delivery workflow | `.github/workflows/ci.yml`, Vercel preview, [RUNBOOKS.md](./RUNBOOKS.md); tests, migration discipline, rollback. |

## Non-Negotiables

- Never use a service-role key in browser code.
- Never bypass an RLS failure by broadening a policy without testing a deny case.
- Treat migrations as immutable after production deployment; use a new forward migration.
- Use a preview/staging environment for integration testing before production.
