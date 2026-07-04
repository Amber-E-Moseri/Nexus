# Nexus Calendar Systems — Full Codebase Audit

**Date:** 2026-07-04
**Scope:** Ministry Calendar multi-source sync (Phase 1) + Space Calendar → Google Calendar sync (Phase 2), pre-build audit.
**Method:** Static audit only — no code was changed. Findings sourced from `supabase/migrations/*.sql`, `supabase/functions/*`, `supabase/edge-functions/*`, `src/features/calendar/*`, `src/pages/calendar/*`, `src/lib/calendar/*`, `src/features/tasks/*`, `src/tests/*`.

---

## 1. Status Report

**What exists and works:**
- One-way outbound sync (Nexus → Google) for both a personal calendar path (`google_calendar_tokens`) and a per-space path (`google_calendar_sync`), triggered manually by a "Sync Now" button.
- Inbound pull (Google → Nexus) exists for the **space** calendar path only — not the personal path.
- Proactive OAuth token refresh (checked before every API call).
- Role-based category visibility config UI (`CategoryVisibilityConfig`) and a token-isolated per-space, per-user iCal feed for tasks (`calendar-task-feed`), which checks out as secure.
- Sync audit tables (`calendar_sync_log`, `user_integration_logs`) exist in schema.

**What's partial/broken:**
- The "15-minute poller" described in project docs is **never actually scheduled** — `cron.schedule(...)` is commented out. Sync only happens when a user clicks a button.
- Inbound sync has **no conflict resolution** — Google's copy unconditionally overwrites Nexus on every pull (last-pull-wins), silently discarding concurrent local edits.
- Deletes don't propagate either direction, and there's no soft-delete — deleted events/tasks orphan on the other side indefinitely.
- Two duplicate/conflicting migrations define `calendar_subscriptions` with **different column names** (`department_id` vs `dept_id`) — live schema depends on which migration order actually ran, and the deployed edge function and app code disagree on the column name. This is a live bug, not theoretical.
- The role-aware, category-filtered iCal feed (`calendar-ical-feed.ts`) is **not deployed** — the deployed feed (`calendar-ical`) ignores category visibility rules entirely.
- Google tokens are stored **in plaintext** in three separate tables, two of which have comments claiming "encrypted in application layer" with no such logic anywhere in the code.
- Test coverage for sync/OAuth is placeholder-only (`expect(true).toBe(true)`).

**Top 3 blockers for Phase 1:**
1. **Schema drift bug** — reconcile `calendar_subscriptions.department_id` vs `dept_id` before touching this table; determine which one is actually live in production and write a corrective migration.
2. **No inbound conflict resolution + no delete propagation** — any bidirectional sync work in Phase 1 needs this designed from scratch; nothing here is safely reusable as-is.
3. **Sync is not actually scheduled** — decide whether Phase 1 introduces a real `pg_cron` job or an alternative trigger; the current "poller" is vaporware.

**What can be reused:**
- Proactive token-refresh pattern (`getValidToken`/`getValidSpaceToken`) — sound logic, just needs a reactive 401 fallback added.
- `task_feed_subscriptions` token design (crypto-random, unique per user+space+feed_type, RLS-protected) — this is the one piece of the audit with no defects found; use it as the template for Ministry Calendar subscription tokens instead of the currently-broken `calendar_subscriptions` table.
- `calendar_category_visibility` schema/hook (`useCategoryVisibility`) — logic is fine, it's just wired to the wrong (undeployed) edge function.
- `calendar_sync_log` schema + `log_calendar_sync_attempt()` RPC — schema is usable, just needs to be called on the failure path too (currently only called on success).

---

## 2. Detailed Findings

### A.1 — `calendar_events` Schema
**Exists**, fragmented across 6+ migrations (base: `20260615000000_calendar_notifications.sql:5-22`, extended in `20260625000000_calendar_system_foundation.sql`, `20260625000003_regional_calendar_sync.sql`, `20260805000000` and `20260730000000` duplicate migrations).

Confirmed columns: `id, title, description, event_type, start_date, end_date, all_day, location, space_id→departments, sprint_id, created_by, created_at, google_event_id, google_calendar_id, synced_to_google, synced_from_google, last_sync_at, priority, duration_days, is_regional, regional_sync_id, is_admin_created, status, approved_by, approved_at, rejection_note, is_org_wide, recurrence_rule, department_id`.

- `source_id` — **Not Found**.
- `is_org_status` — **Not Found** on this table (that column only exists on `task_status_definitions`, a different feature — the two-tier status hierarchy documented in CLAUDE.md does not extend to calendar events).
- `deleted_at` — **Not Found** on `calendar_events` (soft-delete exists only on `tasks`, added 2026-10-02).
- `updated_at`/`last_modified` — **Not Found**. No update-timestamp trigger targets this table, unlike `google_calendar_sync`, `regional_calendar_syncs`, and `task_schedule`, which all have one.

**⚠️ Duplicate migration conflict:** `20260730000000_ministry_calendar_approval_and_subscriptions.sql` and `20260805000000_ministry_calendar_approval_and_subscriptions.sql` both create `calendar_permissions`/`calendar_subscriptions` with incompatible column sets and both redefine `calendar_events` RLS policies. One references `submitted_by`, a column not defined anywhere. **Actual live schema depends on migration apply order** — needs a production schema dump before Phase 1 starts.

Indexes found: `calendar_events_start_idx`, `_type_idx`, `_google_event_id_idx`, `_priority_idx`, `_space_date_idx`, `_status_space_idx`, `_sprint_idx`, `_created_by_idx`, `_is_regional_idx`, `_regional_sync_id_idx`, `_department_id_idx`, `_status_idx`, `_approved_by_idx`, `_status_created_idx`, `_approved_idx`.

### A.1b — Multi-source / settings tables
`ministry_calendar_settings`, `ministry_calendar_sources`, `user_calendar_preferences` — **Not Found**, none exist under these names.

Closest analogues that DO exist:
- `calendar_permissions` — per-user manage grants.
- `org_calendar_config` — single org-wide Google calendar pointer (`20260701000000_planner.sql:87-95`).
- `calendar_category_visibility` — role-based category visibility (`20260930000004_calendar_category_visibility.sql`).
- `regional_calendar_syncs` — external calendar sources (`20260625000003_regional_calendar_sync.sql:7-32`), the nearest existing thing to a "multi-source" table.

**Multi-source status (A.5):** all synced events currently live in the single `calendar_events` table; there is no source-type split and no `source_id` column. Any Phase 1 multi-source design (Birthdays/Holidays read-only calendars) is greenfield.

### A.2 — Google OAuth Token Storage
**Found, in three separate places, all plaintext:**

1. `google_calendar_tokens` — per-user primary (`20260701000000_planner.sql:56-64`, extended `20260726000002`): `user_id PK, access_token, refresh_token, token_expiry, google_calendar_id default 'primary', last_synced_at, tasks_synced`.
2. `google_calendar_sync` — per-org-space (`20260625000000_calendar_system_foundation.sql:69-91`): `google_access_token, google_refresh_token, token_expires_at` — column comment claims `-- Google OAuth credentials (encrypted in application layer)`; **no such encryption exists anywhere in the codebase**.
3. `user_integrations` — generic per-user integration table (`20260625000004_user_integrations.sql:8-52`): same plaintext storage, same false "encrypted in application layer" comment.

Reality check: only `space_integration_secrets` (Zoom) has any vault scaffolding, and that migration (`20260731000001_vault_zoom_credentials.sql`) explicitly states Supabase Vault is **not enabled** on this project. No `pgcrypto` call touches any token column anywhere.

**This is a genuine security gap** — anyone with database read access (including via a misconfigured RLS policy or a compromised service-role key) can read live Google refresh tokens in plaintext.

### A.3 — Outbound Sync (Nexus → Google)
**Found.** `supabase/functions/google-calendar-sync/index.ts`, function `syncSpaceCalendar()` (lines 166-298), push block at 182-219.

```ts
// per-event loop, not batched
for (const event of localEvents) {
  if (event.google_event_id) {
    await fetch(`.../events/${event.google_event_id}`, { method: 'PATCH', ... })
  } else {
    const res = await fetch(`.../events`, { method: 'POST', ... })
  }
}
```

- **Trigger:** manual only — `triggerSync()` called from `GoogleCalendarConnect.jsx:21-25` on button click. The documented 15-minute poller is dead code — `cron.schedule(...)` in `20260625000002_calendar_sync_scheduler.sql:31-41` is commented out.
- **Fields pushed:** `summary`, `description`, `start`/`end` only. No location, attendees, reminders, recurrence, or color/tag mapping.
- **Batching:** none — Google Calendar's batch API is not used; each event is a separate HTTP round trip.

### A.4 — Inbound Sync (Google → Nexus)
**Found, but only for the space-calendar path.** Pull block `google-calendar-sync/index.ts:221-282`.

```ts
if (existing) { await supabase.from('calendar_events').update({...}) }
else { await supabase.from('calendar_events').insert({...}) }
```

- **Conflict resolution: none.** No etag/timestamp comparison — Google's copy unconditionally overwrites the local row on every pull. The push branch avoids re-pushing pulled events via a `synced_from_google` flag, but that's loop-prevention, not conflict resolution. Concurrent edits in both places → Google silently wins.
- The **personal token path** (`google_calendar_tokens`) has no inbound sync at all — `listExternalEvents` only returns events for display, never writes them back.
- Cancelled Google events are skipped on pull (`if (item.status === 'cancelled') continue`) rather than deleted locally — see A.4/E.1 below.

### A.5 — Multi-Source Status
Covered above (A.1b) — single `calendar_events` table, no `source_id`, no read-only-fallback logic for non-writable Google calendars (Birthdays/Holidays) found anywhere.

### A.6 — Role-Based Visibility & Permissions
**Found, two layers that don't agree with each other:**

- **Route-level** (`src/App.jsx`): `/calendar` (Ministry Calendar view) has **no `ProtectedRoute` role restriction** — any authenticated user can view it. Sibling admin pages ARE gated: `/calendar-management` → `['super_admin','dept_lead']`; `/calendar/review` → `['super_admin','regional_secretary','dept_lead']`; `/calendar/settings` → `['super_admin','dept_lead']`.
- **App-level JS** in `MinistryCalendar.jsx:76-99` computes `canEdit`/`canApprove` from role + a `hasPermission(profile.id, 'calendar:write')` check — edit/approve gating exists, but *view* filtering is minimal: `getCalendarEvents` only filters `.eq('status', 'approved')`, no department/role scoping.
- **Category visibility** (`calendar_category_visibility` + `useCategoryVisibility` hook): configurable per role (`member, pastor, dept_lead, regional_secretary`; `super_admin` always sees everything). Fail-open — categories with no rule are visible to all. **This is only enforced in the undeployed iCal edge function (`calendar-ical-feed.ts`), not in the in-app calendar view** (`getCalendarEvents`/`getMonthEvents`) — so the visibility matrix configured by admins currently has zero effect on what users see in-app.
- Regional Secretary is modeled purely through `calendar_permissions.can_manage = false` (a data flag), not a JWT role check — `regional_secretary_view` RLS policy (`20260625000000...sql:289-299`) grants SELECT to any user with such a row.

### A.7 — iCal Subscription Feed
**Partial — deployed feed is unfiltered; the correct, role-aware version is dead code.**

- **Deployed:** `supabase/functions/calendar-ical/index.ts`, `GET /functions/v1/calendar-ical?token=...`, service-role auth (token-only, no user auth). Filters only `.eq("status","approved")` + optional department scope — **no category/role visibility filtering applied**.
- **Orphaned:** `supabase/edge-functions/calendar-ical-feed.ts` (different top-level directory — `edge-functions` vs `functions`) DOES apply `getHiddenCategories`/`get_hidden_categories` role filtering, but has no entry in `supabase/config.toml` and no folder under `supabase/functions/` — **not deployed, not reachable**.
- **Token generation — schema drift bug:** `20260730000000` creates `calendar_subscriptions.token` with no default (app must supply it); `20260805000000` (same nominal migration name, different file) creates it with `DEFAULT substr(md5(...), 1, 64)`. Worse: `20260730000000` names the FK column `department_id`; `20260805000000` names it `dept_id`. App code (`calendar.js:197-254`) uses `dept_id`; the deployed edge function (`calendar-ical/index.ts:31,54`) queries `department_id`. **Whichever migration actually applied in production determines which code path throws a "column does not exist" error.** This must be resolved before any Phase 1 work touches subscriptions.
- Granularity: one token per (user, scope) — `scope` is `all` or `department`, not per-source.
- Revocation/rate-limiting: not found for Ministry Calendar tokens.

### A.8 — Tag/Color Sync
**Found, two uncoordinated mechanisms:**
- `event_type` — a constrained text column directly on `calendar_events` (`conference|program|training|prayer|graduation|event|deadline`) — the de facto "category."
- `calendar_event_tags` (join table) + `calendar_tags` (catalog), added later (`20261001000005_add_calendar_tags.sql`), each tag row has a `visible_to JSONB` array for role/department scoping. **Not merged with `event_type`** — two independent categorization systems coexist, and no UI consumption of the tag system was found in any calendar component read.
- Bidirectional tag sync with Google labels: not found — outbound push doesn't send any tag/color field at all (see A.3).

---

### B.1 — `tasks` Table Schema
Base: `20260608000000_initial_blw_canada_os_schema.sql:40-59`. Confirmed: `due_date` (date type, not timestamptz), `parent_task_id`, `assignee_id`, `department_id` (**not `space_id`** — CLAUDE.md's "space" concept maps to `department_id` on tasks), `deleted_at` (soft-delete added 2026-10-02).

- `google_task_id` — **Not Found** anywhere in migrations or edge functions. Task↔Google sync is entirely greenfield.
- `space_id` — **Not Found** as a literal column; use `department_id`.
- `last_synced_at` / `sync_error` — **Not Found** on `tasks` (exist only on unrelated tables).

### B.2 — Space Calendar View
**Found**, two components:
- `TaskCalendarView.jsx` — reusable month grid, groups strictly **by due date** (no sprint/status grouping), color-coded by priority. Does not check `parent_task_id` — subtasks render flat alongside parents if included in the passed task list.
- `TaskCalendar.jsx` (page) — fetches via `getMyTasks(profile.id)`, so this is a **personal cross-space "my tasks" view**, not a single-space team calendar. Also renders a separate `UpcomingTasksList` (incomplete tasks, due ≥ today, capped at 15).

### B.3 — iCal Feed for Space Tasks
**Found and — unusually for this audit — no defects found in the isolation logic.**
- Endpoint: `supabase/functions/calendar-task-feed/index.ts`, path-based token `GET /functions/v1/calendar-task-feed/{token}`.
- Works uniformly across **all 5 spaces** — `space_id` is stored per-subscription row, not hardcoded.
- Feed types: `my_tasks` (assignee) and `followed_tasks` — **naming bug**: `followed_tasks` actually filters `created_by`, and the UI literally labels it "Created Tasks" (`TaskFeedSubscriptionPanel.jsx`). There is no true "watching/following" feature.
- **Token isolation: verified correct.** Token → `(user_id, space_id, feed_type)` unique constraint (`task_feed_subscriptions`), RLS restricts row access to `user_id = auth.uid()`, and the feed query filters `.eq('department_id', sub.space_id)` where `sub.space_id` comes from the token-bound row itself — a token for Space A structurally cannot return Space B's tasks. Tokens are 24 random bytes, base64url-encoded — cryptographically sound.
- **Completed tasks are NOT excluded** — the feed query has no status/completion filter, so completed and cancelled tasks with a due date remain in the feed indefinitely.

### B.4 — Space Task Performance
**No N+1 found.** `calendar-task-feed` uses a deliberate 2-query batch pattern (fetch tasks, then fetch distinct statuses via `.in(statusIds)`). `getMyTasks` (`src/features/tasks/lib/tasks.js:176-263`) issues 3 sequential queries (space/personal/sprint tasks), each using PostgREST embedded-resource joins in one round trip — not per-task loops, though not a single unified query either.

---

### C — Google OAuth Setup
**C.1 Flow:** Client-side redirect (`src/lib/calendar/api.js:150-163`, `getGoogleOAuthUrl` → `window.location.href`). Scope requested: `https://www.googleapis.com/auth/calendar` only (no `tasks` or `drive` scope here — Drive has its own separate OAuth flow, `google-drive-auth`). Secrets are properly in env/Supabase secrets (`Deno.env.get`, `import.meta.env.VITE_GOOGLE_CLIENT_ID`) — no hardcoded credentials found.

**Disconnect exists but is incomplete:** `disconnectGoogleCalendar()` just deletes the local `google_calendar_sync` row — **it never calls Google's `/revoke` endpoint**, so the OAuth grant stays active on Google's side after a user "disconnects" in Nexus.

**Dead code:** `supabase/edge-functions/calendar-google-oauth.ts` (256 lines) duplicates the OAuth exchange logic and is not deployed/wired anywhere.

**C.2 Token Refresh:** Proactive, checked before every call (`getValidToken`/`getValidSpaceToken`, `google-calendar-sync/index.ts:28-118`) — refreshes if expiry is within 60 seconds. No reactive 401-retry path exists — a token invalidated externally (e.g. user revokes access on Google's side) just 401s and surfaces as `reauth_required` with no automatic recovery.

**C.3 Multi-Connection:** Strictly **1:1**. `google_calendar_tokens` upserts on `user_id` (one row per user); `google_calendar_sync` upserts on `(org_id, space_id, google_calendar_id)` but `google_calendar_id` is hardcoded to `'primary'` everywhere — no UI or schema path exists to connect a second Google account/calendar.

---

### D — Error Handling & Monitoring
**D.1 Sync Failures:** `calendar_sync_log` table + `log_calendar_sync_attempt()` RPC exist, but `syncSpaceCalendar()` only calls this RPC on the **success** path — failures/exceptions are never logged to the table despite it having an `error_message` column and an `error` status. `notify_sync_failure()` is defined in the scheduler migration but never called anywhere — dead code with a literal `-- TODO: Send notification to calendar managers` in its body. User-facing failure surfacing is limited to a generic error string shown only if the user is actively looking at the `GoogleCalendarConnect` panel when the call throws — no persistent banner, no email.

**D.2 Rate Limiting:** **Not found anywhere.** Grepped `retry|backoff|429|rate.?limit` across the sync function, hooks, and API lib — zero matches. Combined with the per-event, non-batched push loop (A.3), this is a real quota-exhaustion risk once sync volume grows.

**D.3 Monitoring:** `calendar_sync_status` SQL view exists (with color-coded health states) but **no frontend component consumes it** — grepped `src/` for both `calendar_sync_status` and `calendar_sync_log`, zero hits. There is no sync-health dashboard a user or admin can see today.

---

### E — Data Quality & Consistency
**E.1 Deleted Events:** Both `deleteCalendarEvent()` implementations (`src/lib/calendar/api.js` and `src/features/calendar/lib/calendar.js`) do a **hard delete** from `calendar_events` with no call to Google's delete endpoint and no soft-delete flag, even though a Google-side `deleteEvent()` function exists in the edge function — it's just never invoked by any caller found in `src/`. Conversely, cancelled Google-side events are skipped (not deleted) on pull, so cross-deletion doesn't propagate in either direction — **orphaned events accumulate on both sides**. `tasks` does have `deleted_at` (soft-delete, since 2026-10-02), but nothing analogous exists for `calendar_events`.

**E.2 Concurrent Edits:** No conflict resolution exists — see A.4. Last Google pull always wins over local edits; there is no logging or user surfacing of the overwrite.

**E.3 Historical Data:** `calendar_sync_log`, `user_integration_logs`, `user_integration_activity`, and a generic `activity_log` (via triggers `log_calendar_sync_action()` / `log_calendar_event_action()`) all exist and would support tracing — but as noted in D.1, the sync log is only populated on success, so failure history is not actually traceable today.

---

### F — Code Quality & Testability
**F.1 Test Coverage:** Effectively placeholder-only for sync/OAuth. `src/tests/calendarSync.test.js` (255 lines) — nearly every assertion is `expect(true).toBe(true) // Placeholder`; none import or exercise the real edge function, hook, or API lib. `src/tests/calendar.test.js` (522 lines) has some real assertions for pure iCal string formatting, but `formatEventDateRange` tests are declared `it.todo(...)` (explicitly skipped), and most "tests" assert against inline mock objects rather than calling real exported functions (e.g. an "RLS prevents unauthorized access" test that literally asserts `expect(true).toBe(true)`). No test file exists for `TaskCalendarView`, `TaskCalendar`, `calendar-task-feed`, `calendar-ical`, or the category-visibility components.

**F.2 Code Organization:** Sync logic lives in one large edge function (`google-calendar-sync/index.ts`, several hundred lines, personal + space paths interleaved). No TODO/FIXME comments found in any calendar frontend file (grepped clean) — the only "unfinished work" markers are the `it.todo()` test stubs and the dead `notify_sync_failure()` function's inline TODO comment. Two full sets of duplicate/orphaned files exist (`supabase/edge-functions/` vs `supabase/functions/`) that should be reconciled or deleted before Phase 1, since they silently diverge from what's actually deployed.

**F.3 Secrets Management:** OAuth client ID/secret are correctly in env vars. Access/refresh tokens are **not encrypted at rest** in any of the three tables that store them, despite two of them carrying comments claiming encryption exists. Confirmed no `pgcrypto` usage on any token column. Anyone with database or service-role access can read live tokens in plaintext today.

---

## 3. Database Schema Diagram (calendar-related tables, as currently found)

```
calendar_events
├── id, title, description, event_type, start_date, end_date, all_day, location
├── space_id → departments, department_id → departments  (both exist; overlapping)
├── sprint_id → sprints, created_by → users
├── google_event_id, google_calendar_id, synced_to_google, synced_from_google, last_sync_at
├── priority, duration_days, is_regional, regional_sync_id, is_admin_created
├── status, approved_by, approved_at, rejection_note, is_org_wide, recurrence_rule
├── NO source_id · NO deleted_at · NO updated_at
└── created_at

calendar_event_types                    calendar_tags               calendar_event_tags
├── id, name, color, ...                ├── id, name, color         ├── event_id → calendar_events
                                         └── visible_to (jsonb)      └── tag_id → calendar_tags

calendar_permissions                    calendar_category_visibility
├── user_id, can_manage                 ├── category, role, visible (bool)
└── ...                                 └── (fail-open: no rule = visible to all)

calendar_subscriptions   ⚠️ SCHEMA DRIFT — two conflicting migrations
├── id, user_id, token
├── scope ('all' | 'department')
└── department_id  (per 20260730000000)   OR   dept_id  (per 20260805000000)
    — app code (calendar.js) uses dept_id
    — deployed edge fn (calendar-ical) queries department_id

task_feed_subscriptions                 (no schema issues found)
├── id, user_id, space_id → departments, feed_type ('my_tasks'|'followed_tasks')
├── token (24 random bytes, base64url, DEFAULT-generated)
├── UNIQUE(user_id, space_id, feed_type)
└── RLS: user_id = auth.uid()

google_calendar_tokens                  google_calendar_sync              user_integrations
├── user_id PK                          ├── org_id, space_id                ├── user_id, integration_type
├── access_token (plaintext)            ├── google_calendar_id='primary'    ├── oauth_token (plaintext)
├── refresh_token (plaintext)           ├── google_access_token (plaintext) ├── oauth_refresh_token (plaintext)
├── token_expiry                        ├── google_refresh_token (plaintext)├── token_expires_at
├── google_calendar_id='primary'        ├── token_expires_at                └── "encrypted in app layer" (false)
├── last_synced_at, tasks_synced        └── "encrypted in app layer" (false)
└── (1:1 with user — no multi-account)  └── (1:1 with space's Google cal)

org_calendar_config                     regional_calendar_syncs
├── single org-wide Google calendar id  ├── external source config (nearest thing to multi-source)
└── public_subscribe_url (static)       └── is_regional / regional_sync_id FK'd from calendar_events

calendar_sync_log                       user_integration_logs        user_integration_activity
├── sync_started_at/completed_at        ├── items_synced/failed       ├── action ('synced'|'sync_failed'|
├── status, synced/created/updated      ├── started/completed_at      │          'token_refreshed')
├── error_message  (populated only on   └── duration_seconds, status  └── generic per-integration audit trail
│   success — never on failure)
└── calendar_sync_status (view, unused by any frontend)

tasks
├── id, title, due_date (date), parent_task_id, assignee_id
├── department_id  (NOT space_id)
├── deleted_at  (soft-delete, added 2026-10-02)
└── NO google_task_id · NO last_synced_at · NO sync_error
```

---

## 4. Open Blockers (must resolve before Phase 1)

1. **`calendar_subscriptions` column-name schema drift** (`department_id` vs `dept_id`) — two migrations with the same descriptive name create incompatible schemas; app code and the deployed edge function disagree. **Dump production schema first** to find out which one actually won.
2. **Tokens stored in plaintext** across `google_calendar_tokens`, `google_calendar_sync`, `user_integrations` — comments falsely claim application-layer encryption. Needs real encryption (Supabase Vault, once available, or `pgcrypto`) before Phase 1 expands the sync surface.
3. **iCal feed leaks role/category visibility** — the deployed `calendar-ical` function ignores `calendar_category_visibility` rules entirely; the correct filtered version (`calendar-ical-feed.ts`) exists but was never deployed. Decide: deploy the orphaned version, or rebuild.
4. **No inbound conflict resolution** — Google always wins on pull, silently discarding local edits made between polls. True bidirectional sync needs a resolution strategy designed from scratch.
5. **No delete propagation, no soft-delete on `calendar_events`** — deletions on either side orphan the other. `tasks.deleted_at` exists and could be a model to extend to `calendar_events`.
6. **Sync scheduling is vaporware** — the documented 15-minute poller is a commented-out `cron.schedule()` call; sync currently only runs on manual button click.
7. **No rate-limit/retry handling** against a per-event (non-batched) push loop — real risk once event volume grows.
8. **Disconnect doesn't revoke Google's grant** — a "disconnected" user's OAuth grant remains live on Google's side indefinitely.

## 5. Migration Readiness Checklist

- [ ] **Blocked** — Do not run new calendar migrations until the `calendar_subscriptions` (`department_id`/`dept_id`) drift is resolved with a corrective migration that reconciles both `20260730000000` and `20260805000000`.
- [ ] **Blocked** — Confirm via a production schema dump (`supabase db diff` against live) which of the two duplicate ministry-calendar-approval migrations actually applied, before writing anything that touches `calendar_subscriptions`, `calendar_permissions`, or `calendar_events` RLS.
- [ ] **Cleanup first** — Decide the fate of `supabase/edge-functions/` (orphaned duplicates: `calendar-ical-feed.ts`, `calendar-google-oauth.ts`). Either deploy the correct versions or delete them; their existence as dead code is actively misleading (they look "done" but aren't wired up).
- [ ] **Safe to build on top of, unmodified:** `task_feed_subscriptions` schema/RLS, `getMyTasks` batched-query pattern, `getValidToken`/`getValidSpaceToken` refresh logic (extend, don't replace).
- [ ] **Greenfield, no existing schema conflicts:** `source_id`/multi-source support, `google_task_id` on tasks, any `deleted_at` extension to `calendar_events`, retry/backoff logic, real cron scheduling.
- [ ] **Needs a decision before Phase 1 starts:** whether Ministry Calendar subscriptions should be migrated onto the `task_feed_subscriptions` token pattern (recommended — it's the only token scheme in this audit with no defects) rather than continuing to patch `calendar_subscriptions`.

---

*Compiled from three parallel static-analysis passes (DB schema, sync engine/OAuth, frontend/iCal). No code was modified as part of this audit.*
