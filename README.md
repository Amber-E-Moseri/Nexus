# Nexus — BLW Canada Operations Platform

**Internal operations platform for BLW Canada Sub-Region** — a ~50-person team across 5 departments. Replaces ClickUp ($600/month) with a purpose-built workspace for task management, meetings, sprints, communications, calendar coordination, CRM, event registration, and automations. **Saves $550/month · $6,600/year.**

**Live:** [nexus.lwcanada.org](https://nexus.lwcanada.org)

---

## Quick Links

- **[Full Feature Catalog](docs/FEATURES.md)** — Complete breakdown of every feature
- **[Architecture Decisions](docs/architecture/decision-catalog.md)** — 35+ design rationales
- **[Security Guidelines](docs/SECURITY.md)** — RLS, JWT, auth patterns
- **[Deployment Guide](docs/deployment/)** — Production setup, migrations, secrets
- **[GitHub](https://github.com/Amber-E-Moseri/Nexus)**

---

## Why It Exists

| | ClickUp Business | Nexus |
|---|---|---|
| ~50 users | $12/user/month = **$600/month** | flat ~**$50/month** |
| Annual | **$7,200/year** | **~$600/year** |
| **Saving** | | **$6,600/year** |

Beyond cost, ClickUp couldn't model BLW Canada's workflows: ministry-scoped meetings, pastor contact management, delegate registration with compliance tracking, or absence notifications. Nexus is purpose-built for each.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6 |
| UI & Animations | Radix UI, dnd-kit, Framer Motion, Recharts |
| Rich Text | Tiptap (comments, meeting notes) |
| State | React Query (server) + Context (auth, notifications, UI) |
| Backend | Supabase (PostgreSQL + RLS + 20+ Edge Functions) |
| Auth | Supabase Auth + custom token-based invite flow |
| Real-time | Supabase Realtime (`postgres_changes` subscriptions) |
| AI | Anthropic Claude API, Whisper WASM (in-browser transcription) |
| Email | Resend (transactional + campaigns with webhooks) |
| External Sync | Google Calendar OAuth, Google Drive, Slack, Outlook, Teams |
| Hosting | Vercel (frontend) + Supabase (backend) |

---

## Key Features

**Task Management** — Kanban/List/Table/Calendar views, two-tier statuses, subtasks, followers, @mentions, dependencies, archive/trash  
**Meetings** — Agenda builder, Live Minutes Mode, AI transcription (Whisper WASM), Meeting Docs, PDF export, attendance tracking  
**Sprints** — Sprint board, teams, temporary membership, auto-expiration, sprint review  
**Calendar** — Google/Outlook sync, RSVP system, approval queue, event subscriptions  
**Communications** — Email campaigns, advanced segments, A/B testing, bounce tracking, RSVP invitations, analytics  
**Personal Planning** — Today/Tomorrow views, time-blocking planner, Personal List with sublists, Wins tracker  
**Flock CRM** — Pastor contact management with role-scoped visibility  
**Registration** — Delegate registration (6 tabs), room assignment, compliance tracking, public sign-up  
**Organization** — Org chart (editable), pastoral assignments, department directory, support tickets  
**Dashboard** — Customizable widgets: activity feed, progress, workload, attendance, charts  
**Automations & API** — Rule engine, task REST API (60 req/min), scoped keys  
**Other** — Immerse e-reader, Regional Updates, BLW CAN Map, Files browser, Growth Tracking  

**→ [Full feature breakdown](docs/FEATURES.md)**

---

## Getting Started (Dev)

### Prerequisites
- Node 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli)

### Local Setup
```bash
git clone <repo-url>
cd clickup
npm install
cp .env.example .env.local    # fill in Supabase URL + anon key
npm run dev                     # http://localhost:5173
```

### Environment Variables
```
VITE_SUPABASE_URL=             # Supabase project URL
VITE_SUPABASE_ANON_KEY=        # Public anon key
VITE_MEETING_OS_URL=           # Embedded Meeting OS URL
```

### Database Setup
1. Create a Supabase project
2. Apply migrations: `supabase db push` (or manually in order from `supabase/migrations/`)
3. Attach JWT hook: Supabase dashboard → Authentication → Hooks → Custom Access Token → `public.custom_access_token_hook`
4. Create first super admin:
   ```sql
   insert into public.users (id, name, email, role, department_id)
   values ('AUTH_USER_ID', 'Admin', 'admin@example.com', 'super_admin', 
           (select id from public.departments where name = 'Admin'));
   ```

### Commands
```bash
npm run dev        # Dev server with hot reload
npm run build      # Production build
npm run preview    # Preview prod build locally
npm test           # Run tests (Vitest)
npm run lint       # ESLint
ANALYZE=true npm run build   # Bundle analysis
```

**Full setup guide:** [docs/setup/](docs/setup/)

---

## Architecture

### RLS-First Security
Every table has Row Level Security enabled. Policies resolve the current user's department and role from JWT custom claims embedded at sign-in. Super admins bypass scoping; everyone else is strictly scoped. Cross-department access uses explicit share tables.

**Roles:**
- `super_admin` — all departments, platform config
- `regional_secretary` — near-super_admin, minus campus photos and permission management
- `dept_lead` — department + sprint management, people invites, automations
- `pastor` — Pastors space, Flock CRM, Registration
- `member` — own department, assigned tasks

### State Architecture
- **Server data → React Query** — stable keys, Realtime invalidations (no polling)
- **Global contexts** — AuthContext, NotificationsContext, InboxCountContext, ToastContext
- **Feature contexts** — TasksContext, SidebarContext (scoped, low in tree)
- **Component state** — everything else

### Database
Core tables: `users` · `spaces` · `folders` · `lists` · `tasks` · `task_comments` · `sprints` · `sprint_members` · `meetings` · `calendar_events` · `communication_campaigns` · `automation_rules` · `flock_contacts` · `registration_delegates` · `api_keys`

**→ [Full DB architecture](docs/architecture/decision-catalog.md)**

---

## Contributing

**Branch naming:** `feature/*` · `fix/*` · `docs/*` · `refactor/*`

**Commit style:** `feat(module): description` · `fix(module): description`

**Code style:**
- Inline styles only (no Tailwind); design tokens from `src/styles/index.css`
- React hooks, async/await
- Optimistic updates with rollback
- RLS checked in every query
- React Query keys stable and namespaced

**PR expectations:**
- Manual testing on Vercel preview deployment
- Smoke test checklist: sign-in, create task, invite user, trigger automation
- RLS policy review if touching auth/permissions
- No breaking changes to public API without deprecation

**Testing:** Unit tests for utilities and hooks; end-to-end manual testing on preview.

---

## Common Issues

| Problem | Solution |
|---|---|
| JWT hook not attached | Supabase dashboard → Authentication → Hooks → Custom Access Token → `public.custom_access_token_hook` |
| RLS blocking queries | Check JWT claims in token decoder; ensure `user_role` and `user_department_id` are present |
| Migrations won't apply | Run in order; check `supabase/migrations/` naming convention |
| HMR not working | Restart dev server; check Vite config |
| Supabase client undefined | Ensure `.env.local` is filled and dev server restarted |

**→ [Troubleshooting guide](docs/guides/troubleshooting.md)**

---

## MCP Connector (Claude Cowork)

Nexus exposes a stateless MCP endpoint at `https://nexus.lwcanada.org/api/mcp`.

**Setup:** Settings → API → Create key → select `mcp:access` scopes → paste into Claude Cowork as `Authorization: Bearer <key>`

Keys are SHA-256 hashed (shown once). **Regenerate** to rotate; old key stops immediately.

**Required migrations:** `20270806000000_mcp_connector_audit.sql` and `20270806000001_mcp_atomic_meeting_note_append.sql`

**→ [Full MCP guide](docs/MCP_CONNECTOR.md)**

---

## Documentation

- **[DECISIONS.md](DECISIONS.md)** — Recent feature decisions (August 2026+)
- **[docs/README.md](docs/README.md)** — Master documentation index
- **[docs/FEATURES.md](docs/FEATURES.md)** — Exhaustive feature catalog
- **[docs/architecture/](docs/architecture/)** — Architecture decisions + patterns
- **[docs/deployment/](docs/deployment/)** — Production setup + checklists
- **[docs/guides/](docs/guides/)** — Testing, troubleshooting, verification
- **[docs/SECURITY.md](docs/SECURITY.md)** — Security guidelines

---

## Contact & Support

**Maintainer:** Amber Moseri · [github.com/Amber-E-Moseri/Nexus](https://github.com/Amber-E-Moseri/Nexus)  
**Issues & Features:** [GitHub Issues](https://github.com/Amber-E-Moseri/Nexus/issues)

---

*Internal use — BLW Canada Sub-Region*
