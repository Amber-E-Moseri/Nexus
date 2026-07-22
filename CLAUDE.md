# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BLW CAN NEXUS** — Internal operations platform for BLW Canada Sub-Region (30-person team across 5 departments). Replaces ClickUp with a custom-built workspace for tasks, meetings, sprints, communications, calendar, and automations. All data is multi-tenant with RLS enforced at the database layer.

**Tech Stack:**
- **Frontend:** React 18 + Vite + React Router + inline CSS (no Tailwind utility class bloat)
- **Backend:** Supabase PostgreSQL + RLS + Edge Functions (18+)
- **Auth:** Supabase Auth + custom token-based invite flow
- **Real-time:** Supabase Realtime subscriptions
- **External:** Google Calendar (OAuth), Google Drive (Apps Script), Slack, Resend (email)
- **Hosting:** Vercel
- **AI:** Anthropic Claude API, Whisper WASM (meeting transcription)

## Development Commands

```bash
# Start dev server (Vite, hot reload)
npm run dev

# Build for production
npm run build

# Preview built site locally
npm run preview

# Run tests
npm test

# View bundle analysis (set ANALYZE=true, then build)
ANALYZE=true npm run build
```

## Architecture

### Frontend Structure (`src/`)

```
src/
├── App.jsx                  # Main router; lazy-loads all pages
├── components/              # Reusable UI components
│   ├── layout/             # Shell, Sidebar, ProtectedRoute
│   ├── ui/                 # Low-level widgets (buttons, modals, etc.)
│   ├── [feature]/          # Feature-scoped components (tasks, meetings, calendar)
│   └── ...
├── features/               # Self-contained features (e.g., "calendar", "tasks")
│   └── [name]/
│       ├── components/     # Feature-local components
│       ├── hooks/          # Feature-local hooks (useTaskFilters, useGoogleCalendarSync)
│       └── pages/          # Feature page components
├── pages/                  # Top-level page routes (exported from App.jsx)
├── hooks/                  # Global hooks (useAuth, useUser, useSupabase)
├── lib/                    # Utilities: Supabase client, API helpers, RLS checks
├── context/                # React Context (TasksContext, AuthContext)
├── dnd/                    # Drag-and-drop utilities (@dnd-kit)
├── data/                   # Data constants and seed files
├── types/                  # TypeScript types (optional, mostly JS)
└── styles/                 # Global styles (index.css); design tokens in CSS variables
```

### Key Patterns

**1. RLS-First Design**
- All data access goes through Supabase RLS policies, enforced at the row level
- JWT claims (`user_role`, `user_department_id`) embedded in every token
- Fallback to direct DB lookup if claims absent (pre-hook sessions)
- Super admin can cross departments; regular users are scoped to their department

**2. Contexts & State Ownership (BLW-09)**

Rule of thumb for where state lives:
- **Server data → React Query** (`@tanstack/react-query`, client configured in `src/lib/queryClient.js`). Anything fetched from Supabase belongs in a `useQuery` hook with a stable key — don't copy it into a context just to share it. Realtime handlers push updates via `queryClient.invalidateQueries`.
- **Global contexts (justified):**
  - `AuthContext` — identity/session; genuinely global.
  - `NotificationsContext` — owns the single notifications realtime subscription.
  - `InboxCountContext` — derives the inbox badge from NotificationsContext + a realtime subscription on assigned comments (no polling).
  - `ToastContext` — imperative UI API, no data.
- **Scoped contexts:** `TasksContext`, `SidebarContext`, `SearchContext`, `AgendaBuilderContext` hold view/UI state for their feature area. Keep them mounted as low in the tree as possible; don't add server data to them.
- **Everything else → local component state.**
- Do **not** add `setInterval` polling for data freshness — subscribe to `postgres_changes` (with `supabase.removeChannel` cleanup) or rely on React Query staleTime.

**3. React Router**
- App.jsx lazy-loads all pages for code splitting
- Protected routes wrap pages that need auth
- Space routing: `/spaces/:id` (by ID) vs `/dept/:slug` (by department name, matches on-the-fly)

**4. Real-time Subscriptions**
- Use `supabase.on()` to subscribe to table changes in React useEffect
- Remember to unsubscribe in cleanup function to avoid memory leaks
- Example: task updates stream live to all viewers of a list

**5. API Calls**
- Use helpers in `src/lib/` (e.g., `fetchTasks`, `createTask`)
- These wrap Supabase client calls with error handling
- Optimistic updates: update local state, catch errors, rollback

**6. Styling**
- **No Tailwind utility classes** — use inline styles or CSS modules instead
- Global design tokens in `src/styles/index.css` (CSS variables like `--color-primary`)
- Component styles: inline style objects or `.css` files in component folders
- **⚠️ CRITICAL:** Never overwrite `src/styles/index.css`; append to it only to preserve existing tokens

### Database Architecture

**Core Tables:**
- `users` — platform users with role, department, profile
- `spaces` — 5 departments (Admin, Media, ORS, Pastors, PFCC)
- `folders` → `lists` → `tasks` — space hierarchy
- `task_status_definitions` — **status hierarchy** (see below)
- `task_comments` — comments with author, content, attachments
- `sprints` — sprint metadata with team, dates, status
- `sprint_members` — temporary membership with auto-expiration
- `meetings` — meeting records, attendees, action items
- `communication_campaigns` — email campaigns with bounce tracking
- `calendar_events` — ministry calendar with RSVP tracking
- `automation_rules` — rule definitions (trigger + action)
- `automation_runs` — audit log of executions

**RLS Enforcement:**
- All tables have RLS enabled
- Policies check `current_user_department()` and `current_user_role()`
- Super admin can see all rows; dept_lead/members see only their department
- Cross-department shares use explicit share tables (e.g., `space_shares`)

## Status Hierarchy (Two-Tier System)

**Schema:**
- `task_status_definitions.is_org_status` — true for 5 canonical org-wide statuses, false for dept-specific
- `task_status_definitions.org_status_id` — FK to parent org status (null for org statuses)
- **CHECK constraint** — ensures all non-org statuses have an `org_status_id`

**The 5 Canonical Statuses:**
1. **To Do** (open, `legacy_key='to_do'`) — default for new tasks
2. **In Progress** (in_progress) — work in flight
3. **Review** (in_progress) — awaiting review
4. **Completed** (completed) — done
5. **Cancelled** (cancelled) — canceled

**Dept-Specific Mappings:**
- "Done" → "Completed" (semantic equivalent)
- "In Review" → "In Progress" (review is a type of in-progress)
- All other dept statuses → map to their org parent by category + legacy_key

**⚠️ "Not Started" (`legacy_key='backlog'`) is retired, not canonical.** It was
the original open-category default before `20260623000003_task_status_to_do_default.sql`
replaced it with "To Do". It was left `active=true` for a year, causing
every space to show 7 statuses instead of 6 (both "To Do" and "Not Started").
`20270720000008_retire_backlog_status_duplicate.sql` deactivated all
`legacy_key='backlog'` rows and remapped any tasks still on them to "To Do".
`get_space_statuses()` now filters on `active = true`, so deactivated
statuses never surface in Kanban/TaskModal pickers again.

**⚠️ "Blocked" (`legacy_key='blocked'`) is retired, not canonical.**
`20270720000019_retire_blocked_status.sql` deactivated the org-wide row and
any dept-scoped "Blocked" duplicates, re-pointed dept statuses parented to it
onto "In Progress" (same category), and remapped any live tasks onto "In
Progress" too. Don't reference `legacy_key='blocked'` in new code — it will
never appear active again.

**Usage in Code:**
```javascript
// Fetch org status parent
const parentStatus = await supabase
  .from('task_status_definitions')
  .select('*')
  .eq('id', task.status.org_status_id)
  .single();

// Fetch all statuses for a space (org + dept-specific)
const statuses = await supabase
  .from('task_status_definitions')
  .select('*')
  .or(`department_id.eq.${spaceId},department_id.is.null`)
  .eq('is_org_status', false) // Don't return org statuses directly
  .order('sort_order');

// Create a new dept status with hierarchy
await supabase
  .from('task_status_definitions')
  .insert({
    name: 'Custom Status',
    category: 'in_progress',
    department_id: spaceId,
    org_status_id: orgStatusId, // Required by CHECK constraint
    color: '#FF6B6B'
  });
```

## Supabase Migrations

**Location:** `supabase/migrations/`

**Convention:** Timestamp prefix + descriptive name, e.g., `20260702000000_status_hierarchy_interactive_option_b.sql`

**Key Migrations:**
- `20260618000001_configurable_task_statuses.sql` — initial status schema
- `20260702000000_status_hierarchy_interactive_option_b.sql` — two-tier hierarchy with CHECK constraint
- `20261224000000_fix_calendar_event_types_manage_policy.sql` — backfills `can_manage=true` and adds JWT-role fallback to event-type manage policy
- `20261224000001_vault_upsert_secret.sql` — `vault_upsert_secret` + `vault_delete_secret` RPCs (idempotent; replaces delete-then-create pattern that caused `secrets_name_idx` collisions)
- `20261224000002_calendar_source_dept_visibility.sql` — per-source dept visibility junction table (same semantics as category visibility: no rows = org-wide)
- `20261224000004_fix_calendar_push_and_sync_filter.sql` — drops single-push-per-org index; allows multiple sources to have push enabled simultaneously

**Before running migrations:**
1. Test locally with `supabase start` (spins up local Postgres)
2. Preview with `supabase db diff --name "migration_name"`
3. Push to remote: `supabase db push`

## Ministry Calendar — Google Sync Architecture

**Connection model:** One shared Google account connection (`ministry_calendar_connection` singleton) covers all sources. Connecting ≠ importing — you must add calendars as sources and sync them separately.

**Sources (`ministry_calendar_sources`):** Each row is a Google calendar linked to the connection. Sync pulls Google → `calendar_events` with `source_id` set and `event_type = 'event'` (not a custom Nexus type). Multiple sources can have `push_enabled = true` simultaneously.

**Vault pattern — CRITICAL:** The `vault` schema is NOT exposed to PostgREST. Never use `.from('vault.secrets')` or `.schema('vault').from('secrets')` — both silently no-op. All vault access must go through SECURITY DEFINER RPCs:
- `vault_create_secret(name, value)` — creates (errors on duplicate name)
- `vault_upsert_secret(name, value)` — idempotent create-or-update ← **always use this**
- `vault_get_secret(id)` — decrypt by UUID
- `vault_delete_secret(name)` — delete by name

**Event filtering:** Google-synced events (`source_id IS NOT NULL`) bypass the event-type filter in `MinistryCalendar.jsx` — they use source-level visibility (`ministry_calendar_source_dept_visibility`) instead. Only locally-created events are filtered by `selectedEventTypes` / `hiddenCategories`.

**Visibility tables:**
- `calendar_category_dept_visibility` — per-category dept access (no rows = org-wide)
- `ministry_calendar_source_dept_visibility` — per-source dept access (no rows = org-wide)

**Auth gotcha:** The OAuth callback page (`MinistryCalendarConnectionCallback`) runs its effect only when `profile?.id` is truthy. Never use `profile !== undefined` — that fires when profile is `null` (still loading) and causes a premature "user not authenticated" error followed by a re-run when the real profile loads.

**calendar_permissions dual-column trap:** The table has both a text `permission` column and a boolean `can_manage` column (two migrations defined it differently). The RLS policy on `calendar_event_types` gates management on `can_manage = true`. Always ensure `can_manage = true` is set for admins — the text column alone is not enough.

## Important Notes

### RLS & Permissions

- **Always verify JWT claims** when handling sensitive operations (password reset, permissions changes)
- **Test with dept_lead + super_admin** — permissions differ significantly
- If RLS is blocking a query unexpectedly, check:
  - JWT token contains `user_role` and `user_department_id`
  - Policy logic matches the query filter
  - Table has RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)

### React Hooks & Dependencies

- **useEffect cleanup:** Always unsubscribe from Supabase listeners to prevent memory leaks
- **useCallback:** Wrap callbacks passed to child components to avoid re-renders
- **Context updates:** TasksContext batches updates; dispatch actions rather than setState directly

### CSS & Styling Gotchas

- ⚠️ Never modify `src/styles/index.css` directly — append only
- Use CSS variables like `var(--color-primary)` for theming
- Inline styles take precedence; avoid !important unless absolutely necessary
- Dark mode not implemented; assume light theme

### Performance

- Lazy-load pages in App.jsx (already done)
- Code split vendor libraries (React, Supabase, @dnd-kit, @radix-ui, etc.) in `vite.config.js`
- Monitor bundle size: `ANALYZE=true npm run build`

### Testing

- Tests live in `src/tests/`
- Run with `npm test`
- Test database access patterns, RLS policies, and utility functions
- End-to-end UI tests are limited; focus on critical paths

### External Integrations

- **Google Calendar:** OAuth token stored in user table; sync via `useGoogleCalendarSync` hook
- **Google Drive:** Apps Script triggers; file links stored as attachments
- **Slack:** Async dispatch via edge function; webhook handling in `supabase/functions/slack-*`
- **Resend:** Transactional emails via edge functions; bounce handling via webhooks

### Deployment

- **Vercel:** auto-deploys on push to main; env vars in Vercel dashboard
- **Supabase:** migrations auto-run on `supabase db push`; edge functions deploy via CLI
- **Environment:** `.env.local` for local dev; Vercel dashboard for prod

## Codebase Health

- **Branches:** main is production; feature branches follow `feature/` prefix
- **Git status:** Use `git status` to check uncommitted changes before pushing
- **Recent activity:** Check git log for recent patterns and conventions
