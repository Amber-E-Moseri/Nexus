# BLW CAN NEXUS - Product Requirements Document v2.1
# Living document - reflects actual built state as of June 2026

---

## Document Purpose

This PRD reflects the **actual current state** of the BLW CAN NEXUS codebase
alongside the full target vision. It replaces PRD v2.0 where the implementation
has diverged from or extended the spec.

Status key:
- ✅ Built and verified
- 🔄 Partially built
- 📋 Specced, not yet built
- 🔮 Future roadmap

---

## 1. Product Vision

BLW CAN NEXUS is the operational platform for BLW CAN NEXUS - a Christ Embassy
campus ministry sub-region with 30 members across 5 departments.

It provides:
- Task management (dept-scoped and personal)
- People management (invitations, lifecycle, pastoral assignments)
- Meetings logging and action item tracking
- Cross-functional Sprint management (future)
- Ministry Calendar (future)
- Internal integrations (CAN Map, Meeting OS, Foundation School, Zoom)

It does not replace: Foundation School OS, Meeting OS, BLW CAN Map.
It integrates with them.

---

## 2. Current Architecture

### Tech stack
- Frontend: React + Vite + Tailwind CSS
- Auth + DB: Supabase (Postgres, Auth, Edge Functions, Realtime)
- Email: Resend (via Supabase Edge Function)
- AI summaries: Anthropic Claude API (in Meeting OS)
- Transcription: Whisper WASM (in Meeting OS)
- Drive export: Google Drive OAuth2 (in Meeting OS)
- Hosting: Vercel / Netlify (free tier)

### Repository structure
```text
clickup/
├── apps/
│   ├── meeting-os/          ← Standalone Meeting OS (fully built)
│   └── map/                 ← BLW CAN Map Apps Script
├── src/                     ← BLW CAN NEXUS React app
│   ├── components/layout/   ← Shell, Sidebar, TopBar, ProtectedRoute
│   ├── context/             ← AuthContext
│   ├── hooks/               ← useAuth
│   ├── lib/
│   │   ├── people/          ← api.js, selectors.js, csv.js
│   │   ├── supabase.js
│   │   └── tasks.js
│   ├── modules/tasks/       ← KanbanBoard, TaskCard, TaskModal, etc.
│   └── pages/
│       ├── people/          ← UsersPage, InvitationsPage, etc.
│       ├── dept/            ← DeptSpace (kanban)
│       └── ...
├── supabase/
│   ├── functions/send-user-invitation/  ← Resend email edge function
│   └── migrations/          ← migration files
└── docs/                    ← Phase hardening docs
```

---

## 3. Navigation

### Current (v1 routing)
```text
/dashboard
/my-tasks
/dept/:deptSlug
/flock                    (pastor only)
/meetings
/people/users
/people/invitations
/people/departments
/people/pastoral-assignments
/automations              (placeholder)
/settings
/activate                 (public - invitation activation)
```

### Target (v2 routing - Phase 1 rebuild)
```text
/dashboard
/my-work
/ministry-calendar
/spaces
/spaces/:spaceId
/spaces/:spaceId/folders/:folderId/lists/:listId
/sprints
/sprints/:sprintId
/people/*                 (unchanged)
/settings
/activate                 (unchanged)
```

---

## 4. Spaces (Departments)

### Current state ✅
Departments exist as the primary work context. Users are assigned to one
department via `department_id`. The sidebar shows dept-scoped task boards
at `/dept/:slug`.

### Target state 📋
Departments become Spaces. Each Space contains Folders -> Lists -> Tasks.
Space membership via `space_members` join table. Users may belong to multiple
Spaces simultaneously (for Sprints).

### Transition plan
The v1->v2 delta migration seeds Spaces from existing Departments and migrates
users into `space_members`. Existing data is preserved.

---

## 5. Task System

### Current state ✅
Full task system is built:
- Kanban board (5 columns: backlog, in_progress, review, done, blocked)
- List view with sortable columns
- Task CRUD (create, edit, delete)
- Subtasks
- Priority labels (urgent, high, medium, low)
- Due dates with overdue highlighting
- Assignee (from dept members)
- Personal tasks (private, `is_personal = true`)
- My Tasks page (grouped by urgency: overdue, today, this week, upcoming, personal)
- Pastor flock view (cross-dept read-only)
- Source tracking (manual, meeting, automation, api, integration)
- Task filters (status, priority, assignee, due date, source, personal toggle)
- Comments on tasks
- Link-based task file attachments
- Task dependencies (blocking / waiting on)

### Target state 📋
Tasks to gain:
- List-scoped tasks (`list_id` -> `folder_id` -> `space_id` hierarchy)
- Sprint tasks (`sprint_id` set)
- @mentions
- External task keys (`external_unique_key` for API duplicate prevention)

---

## 6. People & User Lifecycle

### Current state ✅ (Phase 1.5 + 1.6 complete)

**User model:**
- `users` table with: `id`, `name`, `email`, `role`, `department_id`, `first_name`, `last_name`,
  `status`, `invited_at`, `activated_at`, `inactivated_at`, `archived_at`, `last_active_at`
- Status lifecycle: `invited` -> `pending_activation` -> `active` -> `inactive` -> `archived`

**Roles:**
- `super_admin` - full access org-wide
- `dept_lead` - dept-scoped access, can invite members
- `pastor` - assigned-member visibility, read-only People
- `member` - no People module access

**Invitation system:**
- `user_invitations` table with full delivery tracking (`sent_at`, `last_sent_at`,
  `send_count`, `delivery_status`, `delivery_error`)
- `create_user_invitation` RPC - role and dept boundary enforcement
- `resend_user_invitation` RPC - token rotation + expiry extension
- `cancel_user_invitation` RPC
- `accept_user_invitation` RPC - creates user, assigns pastor, writes status history
- `preview_user_invitation` RPC - reads token without consuming it
- Bulk CSV invitation via `create_bulk_user_invitations` RPC
- Edge function `send-user-invitation` - Resend API integration with HTML + text email

**Activation flow:**
- `/activate?token=...` page
- Token preview -> password creation -> Supabase Auth `signUp` -> `accept_user_invitation`
- Handles: expired, reused, email mismatch, invalid token

**History tables:**
- `user_status_history` - tracks every status transition
- `department_assignment_history` - tracks dept transfers

**People pages:**
- `UsersPage` - user list with filters, status management, dept assignment, role change
- `InvitationsPage` - invitation list with send/resend/cancel actions
- `DepartmentsPage` - department overview
- `PastoralAssignmentsPage` - assign/remove pastor-member links

**Dashboard integration:**
- Stat cards: Active Members, Pending Invitations, Recently Activated, Users Needing Attention
- Counts respect role permissions

### Phase 1.7 status 🔄
E2E validation in progress. Known gaps:
- Activity log completeness (some RPCs may not write to `activity_log`)
- Dashboard stat scoping to verify per-role
- Activation edge case handling to confirm

---

## 7. Meetings

### Current state 🔄
- `meetings` table exists (from Phase 1 migration)
- `/meetings` route renders the meetings UI
- Meeting OS is a fully built standalone app at `apps/meeting-os/`
- Sidebar links to Meeting OS via `VITE_MEETING_OS_URL` (opens new tab)

### Target state (Phase 2) 📋
- MeetingsList component per department
- MeetingCard with action item expansion
- ActionItemBridge - converts action items to tasks with `source: 'meeting'`
- MeetingModal - log a meeting record (paste summary from Meeting OS)
- DeptSpace gets a Meetings tab
- Global `/meetings` page shows all meetings for user's department

### Meeting OS (standalone - permanent)
The Meeting OS at `apps/meeting-os/` is fully built with:
- Agenda builder, minutes, attendance, action items
- AI summary via Claude API
- Whisper WASM transcription
- Google Drive export
- PDF/CSV export
- BLW design system applied

It stays independent. The OS tracks meeting records; Meeting OS runs meetings.

---

## 8. Sprints

### Current state 📋 (not yet built)

### Target state (Phase 4)
Cross-functional temporary initiatives independent of Spaces.

Sprint structure:
- `name`, `description`, `goal`, `status` (`planning` -> `active` -> `completed` -> `review` -> `archived`)
- Sprint teams (optional sub-groups)
- Sprint members (cross-space, no team required)
- Sprint Review before archive

Sprint lifecycle:
```text
Planning -> Active -> Completed -> Review -> Archived
```

Archived sprints: read-only, searchable, restorable, duplicatable.

Sprint Review captures:
- Goals achieved, outstanding items, lessons learned,
  wins/testimonies, recommendations, final decisions, attachments

---

## 9. Ministry Calendar

### Current state 📋 (not yet built)

Single org-wide calendar. Purpose: "What is happening in the ministry?"

Event types: conference, program, training, prayer, graduation, event, deadline.

Not primarily for task due dates.
Calendar view also embeds inside Spaces and Sprints.

---

## 10. Files

### Current state 📋 (not yet built)

Files scoped to: Spaces, Sprints, Meetings, Tasks. No standalone file system.
Google Drive integration for upload/link.

---

## 11. Integrations

### Current state 🔄

| Integration | Status | Notes |
|---|---|---|
| Meeting OS | ✅ Linked | Opens in new tab via `VITE_MEETING_OS_URL` |
| BLW CAN Map | 🔄 Linked | Sidebar link placeholder; full module Phase 4 |
| Foundation School | 📋 | SSO + read-only data in Phase 5 |
| Zoom | 📋 | Meeting creation + webhook in Phase 4 |
| Google Drive | ✅ In Meeting OS | Phase 2 extends to OS meetings |
| Resend | ✅ | Invitation emails working |
| Apps Script APIs | 📋 | CAN Map service in Phase 4 |

### Target state
Integrations scoped to Space or Sprint. Each integration has:
`name`, `description`, `type`, `status`, `open_url`, `api_endpoint`, `config`.
Users see only integrations for spaces/sprints they belong to.

---

## 12. API & Automation Layer

### Current state 📋 (not yet built - was removed from v1)

### Target state (Phase 4)
Public REST API for external systems to create and manage work.

Core endpoints:
- `POST /tasks`
- `GET /tasks`
- `PATCH /tasks/:id`
- `GET /spaces`
- `GET /folders`
- `GET /lists`
- `GET /sprints`

External task keys:
- `source_name`, `source_type`, `external_unique_key`
- Prevents duplicate task creation from Apps Script

Scoped API keys per Space or Sprint.

---

## 13. Database Schema (Current)

### Applied migrations
1. `20260608_phase1_blw_canada_os.sql` - base schema
2. `20260609_phase1_5_user_lifecycle.sql` - user lifecycle, invitations, history
3. `20260610_phase1_6_invitation_delivery.sql` - delivery tracking

### Current tables
```text
departments
users
pastor_members
tasks
task_comments
goals
meetings
meeting_attendance
automations
notifications
activity_log
user_notification_prefs
user_invitations
user_status_history
department_assignment_history
```

### Tables needed for future phases
```text
spaces
space_members
folders
lists
sprints
sprint_teams
sprint_members
sprint_reviews
files
integrations
calendar_events
api_keys
```

---

## 14. Permissions

### Current roles
- `super_admin` - full org access
- `dept_lead` - own department only (note: v1 role name, v2 renames to `space_lead`)
- `pastor` - assigned members read-only
- `member` - own tasks only, no People module

### Role rename
v1 uses `dept_lead`. v2 renames to `space_lead`.
The v1->v2 delta migration handles this automatically.

### RLS approach
All permissions enforced at Supabase RLS layer.
Helper functions: `current_user_role()`, `current_user_department()`,
`is_space_member()`, `is_sprint_member()` (last two added in v2 schema).

---

## 15. Build Phases (Actual Roadmap)

| Phase | Name | Status | Key deliverables |
|---|---|---|---|
| Phase 1 | Foundation - auth, schema, shell, tasks | ✅ Complete | Auth, RLS, sidebar, dept spaces, kanban, list view, my tasks, flock view |
| Phase 1.5 | People - user lifecycle, invitations | ✅ Complete | User model, invitation RPCs, activation flow, People pages |
| Phase 1.6 | People - email delivery | ✅ Complete | Resend edge function, delivery tracking, bulk CSV |
| Phase 1.7 | Hardening - E2E validation | 🔄 In progress | Activity log audit, RLS validation, smoke testing |
| Phase 2 | Meetings migration | 📋 Next | MeetingsList, ActionItemBridge, dept meetings tab |
| Phase 3 | Task maturity | ✅ | Comments, files, dependencies, Folder/List hierarchy |
| Phase 4 | Sprints | 📋 | Sprint creation, teams, lifecycle, Sprint Review, archive |
| Phase 5 | Ministry Calendar | 📋 | Org calendar, embedded in Spaces/Sprints |
| Phase 6 | API & Apps Script | 📋 | Public API, scoped keys, `external_unique_key`, Apps Script guides |
| Phase 7 | Integrations | 📋 | Foundation School SSO, Zoom, CAN Map module, notifications |

---

## 16. Unique Differentiators

These features make BLW CAN NEXUS purpose-built rather than a generic tool:

1. **Pastor shepherd model** - pastors see cross-department task activity for assigned
   members, enforced at RLS level (not just UI)

2. **Full invitation lifecycle** - create, send, resend, cancel, expire, activate with
   full audit trail and delivery tracking

3. **Meeting OS integration** - fully built standalone meeting tool linked to OS;
   action items bridge to tasks

4. **BLW CAN Map** - 358 Canadian post-secondary campuses tracked with hub coverage,
   fellowship status, prayer mode

5. **Foundation School SSO** - external system stays independent; OS connects via
   shared auth token (no double login)

6. **Sprint model** - cross-functional temporary initiatives independent of permanent
   Spaces; captures ministry programs (Healing Streams, Welcome Week, etc.)

7. **Apps Script automation** - Google Sheets workflows push tasks into OS via API
   with duplicate prevention (`external_unique_key`)

---

## 17. Running Cost

| Service | Cost |
|---|---|
| Supabase | $0 (free tier - well within limits for 30 users) |
| Vercel / Netlify | $0 (free tier) |
| Resend | $0 (free tier - 3,000 emails/month) |
| vs ClickUp (30 users) | ~$360/month |
| **Total savings** | **~$4,320/year** |

---

*Document version: v2.1*  
*Last updated: June 2026*  
*Codebase: `C:\Users\moser\Downloads\clickup`*  
*Active phase: 1.7 - Hardening & E2E Validation*
