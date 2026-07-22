# BLW CAN NEXUS - Product Requirements Document v2.1
# Living document - reflects actual built state as of July 2026

---

## Document Purpose

This PRD reflects the **actual current state** of the BLW CAN NEXUS codebase
alongside the full target vision. It replaces PRD v2.0 where the implementation
has diverged from or extended the spec.

This is a refresh of the June 2026 snapshot. Spaces, Sprints, Ministry Calendar,
Communications, and the Automation/API layer — all "future roadmap" in the prior
version — are now built and in active use. Sections below have been rewritten to
match the live codebase rather than the original v1→v2 migration plan; where the
original plan didn't survive contact with the codebase (e.g. a literal `spaces`
table), that's called out explicitly rather than silently dropped.

Status key:
- ✅ Built and verified
- 🔄 Partially built
- 📋 Specced, not yet built
- 🔮 Future roadmap

---

## 1. Product Vision

BLW CAN NEXUS is the operational platform for BLW Canada Sub-Region - a Christ
Embassy campus ministry sub-region with ~30 members across 5 departments
(Admin, Media, ORS, Pastors, PFCC).

It provides:
- Task management (space-scoped and personal), with folders → lists → tasks
  hierarchy and a two-tier org/dept status system
- People management (invitations, lifecycle, pastoral assignments, permission grants)
- Native meetings (agenda, minutes, transcription, action items, recurrence)
- Cross-functional Sprint management
- Ministry Calendar with two-way Google Calendar sync
- Communications (email campaigns, segments, templates, bounce handling)
- Automations (rule builder + execution engine) and a scoped public task API
- Internal integrations (CAN Map, Zoom, Google Drive, Foundation School)

It does not replace: Foundation School OS, BLW CAN Map. It integrates with them.
The original standalone Meeting OS app (`apps/meeting-os/`) has been superseded
by native meeting features built directly into this app — see §7.

---

## 2. Current Architecture

### Tech stack
- Frontend: React 18 + Vite + React Router; inline styles / CSS modules (no Tailwind)
- Auth + DB: Supabase (Postgres, Auth, Edge Functions, Realtime)
- Email: Resend (via Supabase Edge Functions)
- AI: Anthropic Claude API (meeting summaries, extraction)
- Transcription: Whisper WASM
- Drive export/attachments: Google Drive OAuth2 + Apps Script
- Calendar sync: Google Calendar OAuth2 (server-side, shared connection)
- Hosting: Vercel

### A note on "multi-tenant"
This is a single-organization platform (BLW Canada), not multi-org SaaS — there
is no `org_id` column anywhere in the schema. "Multi-tenant" in this codebase
means department/space-scoped row isolation *within* that one organization:
a dept_lead's queries are scoped to their department the same way a SaaS
tenant's queries would be scoped to their org. Worth being precise about this
distinction rather than implying literal multi-org tenancy.

### Repository structure
```text
clickup/
├── apps/
│   ├── meeting-os/          ← Legacy standalone Meeting OS. No src/ present
│   │                            (only index.html/dist/package.json). Dormant —
│   │                            only reachable if VITE_MEETING_OS_URL is set,
│   │                            which it currently is not. See §7.
│   └── map/                 ← BLW CAN Map Apps Script
├── src/
│   ├── components/          ← Shared UI (layout/Shell, Sidebar, files, ui/)
│   ├── context/              AuthContext, TasksContext, ToastContext, etc.
│   ├── hooks/                 useAuth, useUser, useSupabase
│   ├── lib/                   supabase.js, queryClient.js, api helpers
│   ├── features/             ← Self-contained feature modules (current org unit):
│   │   ├── tasks/               kanban, list view, trash, checklists, files
│   │   ├── sprints/              lifecycle, teams, members, goals, review
│   │   ├── calendar/             Google sync, sources, category visibility
│   │   ├── meetings/             native meeting UI, transcription, recurrence
│   │   ├── communications/       campaigns, segments, templates, bounces
│   │   ├── automations/          rule builder, API key management
│   │   ├── spaces/                space/folder/list admin UI
│   │   ├── ideaBank/              (new) idea capture per space
│   │   └── planner/               time-blocking planner
│   └── pages/                ← Route-level pages, lazy-loaded from App.jsx
├── supabase/
│   ├── functions/            ← 20+ edge functions (task-api, automation-engine,
│   │                            google-calendar-sync, generate-recurring-meetings,
│   │                            send-user-invitation, calendar-ical, etc.)
│   └── migrations/           ← 400+ migration files
└── docs/
```

---

## 3. Navigation (current, live routes)

```text
/dashboard
/my-tasks[/:view]
/personal-list
/planner
/calendar                     (Ministry Calendar)
/calendar-management
/calendar/review
/calendar/settings
/spaces
/spaces/:spaceId
/sprints                      (blocked for group_member role)
/sprints/:sprintId
/dept/:deptSlug                (legacy dept-slug board, still live alongside /spaces)
/flock                         (pastor / regional_secretary)
/flock-crm
/meetings
/meetings/:meetingId
/meetings/wizard
/meetings/expected-attendees
/meetings/attendance-trends
/meetings/absence-email-log
/people/{users,invitations,departments,pastoral-assignments,permissions}
/automations
/communications                (+ nested: campaigns, compose, templates,
                                 recipients, segments, analytics, absentees,
                                 invitations)
/files
/inbox
/notifications
/activity-log
/settings/{personal-integrations,integrations,api-docs}
/admin/{campus-edits,permissions,tickets}
/map                            (fullscreen, no shell)
/activate, /accept-invite, /confirm-invite, /set-password, /reset-password
+ OAuth callbacks: google-drive, google_calendar, ministry-calendar,
  meeting-doc, slack, outlook_calendar, teams
```

The v2.0 plan predicted a `/my-work` route and `/ministry-calendar` — those
shipped as `/my-tasks` and `/calendar` respectively. Otherwise the predicted
`/spaces`, `/spaces/:spaceId`, `/sprints`, `/sprints/:sprintId` routes are real
and match the plan.

---

## 4. Spaces (Departments)

### Current state ✅ — built, but not the way originally planned
Spaces did **not** ship as a new parallel table. `departments` was extended
in place with `space_type`, `visibility`, `status`, `owner_id`, `start_date`,
`end_date`, `description` — a permanent department is simply a row with
`space_type = 'department'`. This was a deliberate call once it was clear
almost everything (tasks, RLS, sprints, the frontend) already keyed off
`department_id`; migrating onto a brand-new `spaces` table would have meant a
large, risky migration for what's really a type/visibility expansion, not a
new entity. See `supabase/migrations/20260618000000_spaces.sql`.

`folders` and `lists` are real, dedicated tables
(`20260629000001_folders_lists.sql`) — each Space contains Folders → Lists →
Tasks as planned. Space membership is tracked via `group_space_members`
(for temporary/group spaces; permanent departments use existing
department-assignment logic) rather than a table literally named
`space_members`.

Feature code: `src/features/spaces/` (SpaceModal, CreateFolderModal,
CreateListModal, SpaceStatusSettings, SpaceAutomationsTab,
SpaceIntegrationsTab, GroupSpaceMembersPanel). Pages: `src/pages/spaces/
SpacesList.jsx`, `SpaceOverview.jsx`.

---

## 5. Task System

### Current state ✅
- Kanban board and list view, both space-scoped
- **Two-tier status system** (see CLAUDE.md for full detail): 5 canonical
  org-wide statuses (To Do, In Progress, Review, Completed, Cancelled) with
  department-specific statuses mapping up to a parent. The old 5-column
  backlog/in_progress/review/done/blocked model from v2.0 has been retired —
  "Not Started"/backlog and "Blocked" were both deactivated in favor of the
  canonical set (`get_space_statuses()` filters to `active = true` only).
- Task CRUD, subtasks, checklists, priority labels, due dates, assignees
- Personal tasks (`is_personal = true`, RLS-private even from dept leads/admins)
- Task Trash — soft delete (`deleted_at`) with a dedicated Trash page
  (`src/pages/tasks/TrashPage.jsx`, `useTrash.js`) scoped to space membership
- My Tasks page (Today/Tomorrow quick views, urgency grouping)
- Pastor flock view (cross-dept, RLS-enforced, isolated per pastor at the
  application layer for the Flock CRM panels specifically)
- Source tracking (`manual`, `meeting`, `automation`, `api`, `integration`)
  and `external_unique_key` for API idempotency — both live, not planned
- Comments, link-based + binary file attachments (see §10), dependencies
  (`blocking` / `waiting_on`)
- Sprint-linked tasks (`sprint_id`) — live, see §8

### Target / open items 🔄
- @mentions in comments — not yet confirmed built
- Continued RLS hardening as new soft-delete-style features (Idea Bank, Trash)
  ship — each has needed the same "exclude deleted_at" pattern applied to its
  own SELECT policies (see decision catalog DECISION-048)

---

## 6. People & User Lifecycle

### Current state ✅
Same invitation/activation/status-lifecycle model as before (see decision
catalog DECISION-004, 013, 014), with the role and permission model extended:

**Roles (current, live):**
- `super_admin` - full org access
- `regional_secretary` - near-`super_admin` cross-department visibility
  (all departments' tasks/meetings/sprints), explicitly excluded from campus
  photos, permissions management, integrations, and support tickets
- `dept_lead` - own department only. **Not renamed to `space_lead`** — the
  v2.0 plan's predicted rename never happened; `dept_lead` remains the live
  role name across ~140 call sites
- `pastor` - assigned-member visibility (Flock model), read-only People
- `member` - own tasks only, no People module access
- `ors`, `programs` - additional department-scoped role tokens used in a
  handful of route/RLS checks

**Additive capability grants (new pattern, not in v2.0):** rather than adding
a new role for every permission exception, narrow named grants layer on top
of a user's existing role — e.g. `pastor_access` lets a non-pastor be assigned
as a pastor without reclassifying their role everywhere else;
`regional_secretary_access` extends near-admin access to a specific person
without making them a full `regional_secretary`. See decision catalog
DECISION-045/046.

**History tables**, **invitation RPCs**, and **activation flow** are unchanged
from the original build — see decision catalog DECISION-004/013/014 for the
reasoning behind that design.

---

## 7. Meetings

### Current state ✅ — native, not iframe-embedded
The v2.0 plan described Meeting OS as a permanent standalone app linked via
iframe, with a lighter internal meeting-log fallback. That has inverted:
**native meeting features in `src/features/meetings/` are now the primary and
only actively used model.** `apps/meeting-os/` still exists in the repo but
has no `src/` directory (only a stale `dist/` build) and its embed code path
in `MeetingsModule.jsx` only activates if `VITE_MEETING_OS_URL` is set, which
it currently is not — it is dormant legacy, not a live integration.

Built and live:
- Agenda builder, live minutes capture, action item tracking
  (`ActionItemBridge` converts action items to tasks with `source: 'meeting'`)
- Audio transcription (Whisper WASM) via `AudioTranscriptionPanel` /
  `TranscriptionUploadPanel`
- AI summarization and extraction via Claude API (`ExtractedResultsCard`,
  `AIProcessingAdminPanel`)
- PDF/report export and public share links (`MeetingReportTab`,
  `MeetingReportPublicPage`, `/reports/:share_token`)
- Attendance tracking and trend views
- **Recurring meetings**, generated *progressively* rather than bulk-created:
  an hourly `pg_cron` job (`generate-recurring-meetings` edge function)
  materializes each occurrence roughly a day ahead of when it's needed,
  tracked via `series_instance_num` / `next_occurrence_scheduled` /
  `exception_date`. This replaced an earlier approach that bulk-materialized
  up to 52 rows at series-creation time — see decision catalog DECISION-044.
- Space-scoped meetings tab (`SpaceOpenItemsTab`) and a global `/meetings`
  hub with role-appropriate cross-department visibility (recent RLS work
  scoped `regional_secretary`/`ors` meeting visibility to published meetings
  only, closing a private-meeting leak)

---

## 8. Sprints

### Current state ✅ — fully built
Cross-functional temporary initiatives, independent of permanent Spaces, as
originally planned.

- Tables: `sprints`, `sprint_teams`, `sprint_members`, `sprint_reviews`
  (`20260614000000_sprints.sql`). Note: goals are captured as a text field
  (`goal` on `sprints`, `goals_achieved` on `sprint_reviews`) rather than a
  dedicated `sprint_goals` table.
- Lifecycle: `planning -> active -> completed -> review -> archived`, with
  review required before archive (decision catalog DECISION-027)
- Teams (`SprintTeamPanel`, `AssignTeamToSprintModal`, `ImportTeamModal`),
  members (`SprintMemberPanel`, `InviteExternalModal`), goals
  (`SprintGoalsPanel`), review/archive (`SprintReviewForm`, `SprintReviewView`)
- Boards: `AllTeamsBoard`, `SprintTaskBoard`, `TaskDetailSidebar`
- Archived sprints: read-only, restorable, duplicatable (decision catalog
  DECISION-028)
- Pastors can now create sprints, with their `pastor_members` group
  auto-added as contributors — a newer addition beyond the original plan
- New tasks auto-select the sole open sprint for a space when only one exists

---

## 9. Ministry Calendar

### Current state ✅ — built, with a known plaintext-secret gap
Org-wide event layer with two-way Google Calendar sync, as planned, plus a
per-source/per-category dept visibility model beyond what v2.0 specced.

- Connection model: one shared `ministry_calendar_connection` (singleton
  Google OAuth) covers all sources. Sources
  (`ministry_calendar_sources`) are individually added, synced, and can be
  independently `push_enabled` (multiple sources can push simultaneously).
- Sync edge functions: `google-calendar-sync`, `calendar-event-reminders`,
  `calendar-ical`, `calendar-task-feed`
- Visibility: `calendar_category_dept_visibility` and
  `ministry_calendar_source_dept_visibility` — no rows means org-wide
- **Known gap, not yet closed:** despite `vault_secret_id`/`secret_type`
  scaffolding existing on the connection table, Supabase Vault is disabled on
  this project and OAuth tokens (`access_token`/`refresh_token`) are
  currently stored **plaintext** in `ministry_calendar_connection`. This is
  called out as a TODO directly in the migration comments
  (`20261108000000_ministry_calendar_sources.sql`) — flagging it here so it
  isn't lost, since CLAUDE.md's vault-RPC guidance elsewhere in the codebase
  could otherwise read as implying this table is already covered.
- Calendar view also embeds inside Spaces and Sprints, per plan

---

## 10. Files

### Current state ✅ — beyond the original "link-only" plan
Two coexisting attachment models, not just Drive links:
- `file_attachments` (`20260728000001_file_storage.sql`) — a real managed
  attachment table, with a dedicated `/files` page (gated to
  `super_admin` / `regional_secretary` / `dept_lead`)
- `space_drive_files` (`20260801000001_space_drive_files.sql`) — Drive-link
  attachments, the original Phase 3 model (decision catalog DECISION-018)

Task-level file attachments (`TaskFiles.jsx`, `FileList.jsx`) use both paths
depending on context.

---

## 11. Integrations

### Current state 🔄
No single generic `integrations` table as v2.0 specced. Instead, integration
metadata is split by scope:
- `space_integrations` / `space_integration_secrets` — per-space tool config
  (`SpaceIntegrationsTab.jsx`)
- `user_integrations` — per-user connections (personal Google Drive, etc.)
- `zoom_config` — org-wide Zoom credentials, `super_admin`-only RLS, client
  secret intentionally excluded from the table (decision catalog DECISION-042)

| Integration | Status | Notes |
|---|---|---|
| Google Calendar | ✅ | Two-way sync, see §9 |
| Google Drive | ✅ | Both managed uploads and Drive-link attachments |
| Zoom | 🔄 | Config table live; meeting-creation/webhook flow not confirmed built |
| Meeting OS (standalone) | ⚠️ Dormant | See §7 — superseded by native meetings |
| BLW CAN Map | 🔄 | Linked via `/map` route |
| Foundation School | 📋 | SSO not yet built |
| Slack | 🔄 | OAuth callback route exists (`/auth/slack-callback`) |

---

## 12. API & Automation Layer

### Current state ✅ — built, not "removed from v1" as previously stated
- Public task API: `supabase/functions/task-api/` — `x-api-key` header auth
  against the `api_keys` table, idempotent creation via
  `external_unique_key`
- `api_keys` table: SHA-256 hashed keys shown once at creation, scoped to a
  department *or* sprint (mutually exclusive), `permissions` jsonb,
  `expires_at`, `revoked`/`disabled` (decision catalog DECISION-032/033/034)
- Automation rule builder (`AutomationBuilder.jsx`,
  `automationTemplates.js`) plus a real execution engine:
  `supabase/functions/automation-engine/` reads enabled `automation_rules`,
  evaluates conditions, executes actions, and writes to an automation run log
  (decision catalog DECISION-039) — this shipped, closing the gap the v2.0
  doc described as "stored before auto-executed"
- Admin UI: `ApiKeyManager.jsx`, `/settings/api-docs`

---

## 13. Database Schema (Current)

### Representative current tables (non-exhaustive — 400+ migrations)
```text
departments (extended with space_type/visibility/status — see §4)
folders, lists
group_space_members
tasks, task_comments, task_dependencies, file_attachments, space_drive_files
task_status_definitions (two-tier org/dept hierarchy)
sprints, sprint_teams, sprint_members, sprint_reviews
meetings (+ recurrence_rule, series_instance_num, next_occurrence_scheduled)
meeting_attendance
ministry_calendar_connection, ministry_calendar_sources
calendar_category_dept_visibility, ministry_calendar_source_dept_visibility
communication_campaigns, communication_segments, communication_sends,
  communication_unsubscribes, communication_ab_tests
automations, automation_rules, automation_runs
api_keys
zoom_config
space_integrations, space_integration_secrets, user_integrations
idea_bank_items                      (new — src/features/ideaBank/)
users, user_invitations, user_status_history, department_assignment_history
notifications, activity_log, user_notification_prefs
```

### v2.0 plan vs. actual naming
| v2.0 planned name | What actually exists |
|---|---|
| `spaces` | `departments`, extended in place — see §4 |
| `space_members` | `group_space_members` |
| `files` | `file_attachments` (+ `space_drive_files` for links) |
| `integrations` | Split: `space_integrations`, `user_integrations`, `zoom_config` |
| `sprint_goals` | Text columns on `sprints`/`sprint_reviews`, not a table |
| `spaces`/`sprints`/`api_keys`/`folders`/`lists` | ✅ matched the plan directly |

---

## 14. Permissions

### Current roles
- `super_admin` - full org access
- `regional_secretary` - near-admin, cross-department, with explicit exclusions (§6)
- `dept_lead` - own department only. **No rename to `space_lead` occurred.**
- `pastor` - assigned members, read-only People
- `member` - own tasks only, no People module
- `ors`, `programs` - narrower department-scoped tokens
- Additive grants (`pastor_access`, `regional_secretary_access`, etc.) extend
  specific capabilities to a user without changing their base role

### RLS approach
All permissions enforced at Supabase RLS layer. Helper functions:
`current_user_role()`, `current_user_department()`, `is_space_member()`,
`is_sprint_member()`, `user_can_view_task()`.

A dedicated **P0 hardening pass** (decision catalog DECISION-048) closed five
live RLS gaps in one audited migration: RLS enabled on
`sprint_invite_tokens`, comment inserts gated by `user_can_view_task()`,
soft-deleted tasks excluded from three SELECT policies, and two RPCs locked
to the caller's own `auth.uid()`.

---

## 15. Build Phases (Actual Roadmap)

| Phase | Name | Status | Key deliverables |
|---|---|---|---|
| Phase 1 | Foundation - auth, schema, shell, tasks | ✅ Complete | Auth, RLS, sidebar, dept spaces, kanban, list view, my tasks, flock view |
| Phase 1.5 | People - user lifecycle, invitations | ✅ Complete | User model, invitation RPCs, activation flow, People pages |
| Phase 1.6 | People - email delivery | ✅ Complete | Resend edge function, delivery tracking, bulk CSV |
| Phase 1.7 | Hardening - E2E validation | ✅ Complete | Activity log audit, RLS validation |
| Phase 2 | Meetings (native) | ✅ Complete | Agenda, minutes, transcription, action items, exceeds original iframe plan |
| Phase 3 | Task maturity | ✅ Complete | Comments, files, dependencies, Folder/List hierarchy |
| Phase 4 | Sprints | ✅ Complete | Lifecycle, teams, members, goals, review, archive |
| Phase 5 | Ministry Calendar | ✅ Complete | Google sync, sources, dept visibility (vault gap open, see §9) |
| Phase 6 | API & Automations | ✅ Complete | Public task API, scoped keys, execution engine |
| Phase 7 | Integrations & Communications | ✅ Complete | Embedded/native tools, notifications, Zoom config, Communications/BLW Mail |
| Phase 8 (ongoing) | Hardening & permission model refinement | 🔄 In progress | regional_secretary rollout, additive grant model, P0 RLS hardening, meeting-recurrence rework, Task Trash, Idea Bank |

---

## 16. Unique Differentiators

1. **Pastor shepherd model** - pastors see cross-department task activity for
   assigned members, enforced at RLS level; Flock CRM panels additionally
   isolate per-pastor data at the application layer

2. **Full invitation lifecycle** - create, send, resend, cancel, expire,
   activate with full audit trail and delivery tracking

3. **Native meeting suite** - transcription, AI summarization, PDF export,
   and progressively-generated recurrence, built directly into the platform
   rather than depending on the standalone Meeting OS

4. **BLW CAN Map** - Canadian post-secondary campuses tracked with hub
   coverage, fellowship status, prayer mode

5. **Sprint model** - cross-functional temporary initiatives independent of
   permanent Spaces, with a review-before-archive institutional-memory step

6. **Additive capability grants** - narrow, named permission extensions
   (`pastor_access`, `regional_secretary_access`) layered on top of fixed
   roles, so organizational exceptions don't force new role enum values

7. **Scoped public API** - Apps Script and other external workflows push
   tasks into the platform via a department/sprint-scoped, hashed-key API
   with `external_unique_key` duplicate prevention

---

## 17. Running Cost

| Service | Cost |
|---|---|
| Supabase | $0 (free tier - well within limits for 30 users) |
| Vercel | $0 (free tier) |
| Resend | $0 (free tier - 3,000 emails/month) |
| vs ClickUp (30 users) | ~$360/month |
| **Total savings** | **~$4,320/year** |

---

*Document version: v2.1 (content refreshed July 2026)*
*Last updated: July 2026*
*Codebase: `C:\Users\moser\Downloads\clickup`*
*Active phase: 8 - Permission model refinement & ongoing hardening*
