# Phase 3 — Step 1 Audit Findings (read-only)
**Date:** 2026-07-09 · **Status:** COMPLETE — awaiting approval before any SQL is written
**Live DB queried:** yes (read-only, service key from `.env.local`; project `scrdatlpyfudpdwuiigk`)

---

## 1. `users.role`: enum or CHECK? → **TEXT + CHECK constraint** ✅ verified

**Repo evidence:**
- `20260608000000_initial_blw_canada_os_schema.sql:25` — `role text not null default 'member' check (role in (...))` (4 roles)
- `20261001000000_standardize_regional_secretary_role.sql` — drops and recreates `users_role_check` with all 8 roles (this is the **active** constraint)
- No migration ever converts `users.role` to the `user_role` enum type.

**Live evidence:** REST probe `users?role=eq.zzz_bogus_zzz` returned `[]` (an enum column would throw `22P02 invalid input value for enum`). → **users.role is text.**

**The `user_role` enum is a separate type** referenced only by:
- `20260625000010_add_ors_role.sql` (`ALTER TYPE user_role ADD VALUE 'ors'`)
- `20260905000002_role_permissions_system.sql` (`role_permissions.role user_role`)

⚠️ **But see Finding 2 — `role_permissions` doesn't exist live**, so the enum may never have been exercised. Its `CREATE TYPE` is untracked either way (Phase 4.4 landmine confirmed).

**Consequence for §1c of the design:** the simple CHECK-swap path applies. No enum surgery needed on `users`. The 8-role CHECK shrinks to 5: `('super_admin','dept_lead','pastor','regional_secretary','member')` — **safe against live data** (see §5: no user holds `media`/`programs`/`regional_secretary`; the one `ors` user must be migrated to a `space_roles` row + base role flipped to `member` in the same migration, or the new CHECK fails).

---

## 2. 🚨 BLOCKER: Phase 2 dependency NOT met on live DB

| Object | Migration says | Live DB says |
|---|---|---|
| `role_permissions` | created + seeded (20260905000002, 20261001000009) | **table does not exist** (`PGRST205`) |
| `user_permissions` | exists (20260630000000) | exists, **0 rows** |
| `calendar_permissions` | exists (20260625000000) | exists, **0 rows** |
| `space_roles` | n/a (Phase 3 creates it) | does not exist (expected) |

- The Phase 3 brief header says "Depends on: Phase 2 (communications RLS live + role_permissions seeded)". **Neither is verifiable/true on live.** The consolidated seed (`supabase/seed_role_permissions.sql`) cannot run until the table exists.
- Since `role_permissions` must be **created from scratch on live**, we can sidestep the untracked enum entirely: **recommend `role text` + the `role_scope text check ('base','space')` column from §6** instead of the `user_role` enum. Zero coupling to an untracked type; base and space role keys stay disjoint by convention and are collision-proofed by `role_scope`.
- Empty `user_permissions` / `calendar_permissions` mean the §1b `user_permission_overrides` table and the calendar fold-in have **zero data migration cost**.

**Corollary (pre-existing, now confirmed live):** every `userHasPermission()` gate (campus edits, agenda steps 1/3, minutes capture) currently fails closed for non-super-admins because the table it queries doesn't exist.

---

## 3. `users.role === 'dept_lead'` as authority — inventory & verdicts

### Frontend — authority checks (need migration to space-aware resolution)
| Location | What it gates | Verdict |
|---|---|---|
| `src/App.jsx` (13 `ProtectedRoute roles={[...]}` arrays incl. `dept_lead`) | route access | **authority — needs migration**; global admin screens may stay base-role (flag per-route in step 4) |
| `src/components/layout/Sidebar.jsx:265-269` (`DEPT_LEAD_ROLES`, `showPeople`, `showAdminPlatform`) | nav visibility | **authority — needs migration** |
| `src/features/integrations/lib/integrationRequests.js:23` (`role.eq.dept_lead,department_id.eq.X`) | who receives integration requests | **authority — needs migration** (already dept-scoped; becomes `has_space_role`) |
| `src/features/calendar/lib/calendar.js:82` + `src/tests/calendar-settings-access.test.js` | calendar settings: `dept_lead` ∧ member-of-Programs/Admin | **authority + dual-identity — needs migration** (poster child for `has_space_role(uid, programs_space, 'dept_lead')`) |
| `src/pages/sprints/SprintsList.jsx:189`, `SprintOverview.jsx:26,188` | sprint create/restore | **authority — needs migration** |
| `src/pages/spaces/SpacesList.jsx:68` | space create | **authority — needs migration** |
| `src/pages/spaces/SpaceOverview.jsx:714,1285,1339` (`MANAGE_ROLES`, `canManageStatuses`) | space manage/status manage | **authority — needs migration** |
| `src/pages/settings/StatusManagementSection.jsx:49`, `Settings.jsx:67-69,392-404` | settings tabs | **authority — needs migration** |
| `src/features/tasks/lib/tasks.js:495-496` | permanent task delete | **authority — needs migration** |
| `src/features/calendar/components/EventModal.jsx:76` | event edit | **authority — needs migration** |
| `src/lib/people/selectors.js:32` | people list scoping | **authority — needs migration** |
| `src/components/settings/MembersPanel.jsx` (multiple) | role-assignment UI; dept_lead locked to own dept | **mixed** — role *labels* stay; the own-dept scoping logic is authority — needs review in step 4 |

### Frontend — display/config only (safe to leave)
| Location | Verdict |
|---|---|
| `MembersPanel.jsx:17,145,488` (label map, `<option>` values) | display only |
| `src/features/calendar/hooks/useCategoryVisibility.js:16` + `CategoryVisibilityConfig.jsx:13` (visibility-matrix row keys) | config keys, not authorization |
| `src/features/dashboard/lib/roleDefaults.ts:29` | dashboard default layouts |
| `src/lib/permissions.js:66` (`ROLE_HIERARCHY`) | superseded by Phase 3 §5 hierarchy cleanup (in-scope there) |
| tests (`jwtClaims`, `calendar-settings-access`) | test fixtures |

### Edge functions — authority checks (service-role clients; need space-scoping in follow-up pass)
| Function | Check |
|---|---|
| `broadcast-campaign/index.ts:258,284` | `['super_admin','dept_lead']` + dept_lead restricted to own department |
| `send-absence-emails/index.ts:173` | `['super_admin','dept_lead']` privileged |
| `send-communication-email/index.ts:442` | `['super_admin','dept_lead']` |
| `send-user-invitation/index.ts:182,222` | `['super_admin','dept_lead']` + own-dept restriction |

### SQL / RLS
**51 migration files** contain `dept_lead` authority checks (`current_user_role() = 'dept_lead'`, `auth.jwt() ->> 'role'` variants, etc.). Per the brief, the RLS swap to `has_space_role()` is the deferred follow-up pass — the live-policy enumeration belongs there. (Reminder from Phase 1: every `auth.jwt() ->> 'role'` variant is dead-deny — those policies need the swap most urgently since they're already broken.)

---

## 4. Remaining dual-identity checks (`d.name = 'ORS'`-style)

**Runtime authorization (must retire):**
- `20260620000014_meetings_ors_access.sql` — 3× `d.name = 'ORS Projects' or d.name = 'ORS'`
- `20260620000015_communications_ors_access.sql` — 6×
- `20260620000017_communications_grants.sql` — 6×
- `20260620000018_meetings_grants.sql` — 3×
- Frontend: the calendar-settings `dept_lead ∧ Programs/Admin-membership` pattern (see §3)

**Seed-time name lookups (benign, not auth):** `20260625000000/…000001` calendar migrations look up `WHERE name = 'Programs'` to seed rows — no action needed.

⚠️ Note: the dual-identity SQL references a department named **'ORS Projects'** which does **not exist live** (live spaces: Admins, Media, ORS, Pastors, PFCC, Programs) — dead branch, one more reason these checks are fragile.

---

## 5. `feature_roles` JSONB — confirmed fully dead, including data

- Live: **all 9 users have `feature_roles: []` and `dept_roles: []`**. Zero rows to migrate from JSONB → `space_roles`.
- Code: unchanged since Phase 1 — read only by `hasFeatureRole()` (`permissions.js`), called from `MeetingsModule.jsx` + `Sidebar.jsx`, never populated, never fetched into the auth profile. Nothing new picked it up.
- ⚠️ `src/lib/permissions/api.js` is **churning in the working tree** — `ROLE_BASELINE_PERMISSIONS` (with dead `reg_sec`) reappeared between two reads this session (another session/dev-server is active in this folder). Reconcile that file's final state during Phase 3 step 4 wiring.

---

## 6. User → space-role mapping table (THE deliverable — approve before any writes)

Live users with role in (`ors`,`media`,`programs`,`dept_lead`) — **only 2 exist**:

| user_id | name | current_role | current_dept (id) | current_dept_name | proposed space_id | proposed role |
|---|---|---|---|---|---|---|
| `ceba851c-1539-429b-a710-b6b76d54a8e4` | Amber 2 | `ors` | `740b2809-b821-4861-b323-c37612de7741` | ORS | `740b2809-…de7741` (ORS) | `ors` |
| `4c70ca61-443b-4a64-87aa-3453c9dd5c65` | Pastor Chi Nwokem | `dept_lead` | `0654615d-9bb2-4b1c-a56d-1f50c5add60e` | Programs | `0654615d-…add60e` (Programs) | `dept_lead` |

- Both map cleanly to `current_dept` — **no "needs Amber's input" rows**.
- No `media` / `programs` / `regional_secretary` users exist yet — nothing else to backfill.
- "ORS" space already exists (`740b2809-…`) — **no space creation needed** (§5 question answered).
- Post-backfill base-role flips required by the 5-role CHECK: `Amber 2: ors → member`, `Pastor Chi Nwokem: dept_lead → dept_lead` (stays — label-only under the new model).
- Note (hygiene, not blocking): two duplicate `super_admin` accounts named "Amber Moseri".
- Full role distribution: super_admin 2 · member 5 · ors 1 · dept_lead 1.

---

## 7. Deviations from the design doc the audit forces

1. **§Schema/§6 — `role_permissions` must be created, not adjusted.** It doesn't exist live. Create it with `role text` + `role_scope text not null check (role_scope in ('base','space'))` (recommended in §6; the audit upgrades that from "recommended" to "do it" since we're creating fresh anyway). Skip the `user_role` enum entirely.
2. **§1c — CHECK-constraint path confirmed** (users.role is text). But the shrink to 5 roles **must ship in the same migration as (or after) the backfill + base-role flips**, else `Amber 2 (role='ors')` violates the new CHECK. Also remove the inert 4-role conditional CHECK in `20261105000004_clean_users_schema.sql` (Phase 4.3) at the same time or document it.
3. **§4 backfill — trivially small.** 2 rows into `space_roles`, from the approved table above; JSONB migration is a no-op.
4. **Sequencing** — since Phase 2's consolidated seed was never applied, Phase 3's migration set should CREATE `role_permissions` (+`role_scope`), then seed base roles + space-role keys (`dept_lead` moves to `role_scope='space'` per §6, `meetings:manage`-vs-`create` drift resolved at seed time), then `space_roles` + `user_permission_overrides` + `has_space_role()` + backfill. One reviewable file per concern, per the brief.

---

---

## 8. Post-audit addendum (2026-07-09, after live verification round)

- **Communications RLS hardening (20260731000000): APPLIED on live** — verified behaviorally, not from the migrations folder. Anon-key insert probe on `campaign_link_clicks` returned `42501 "new row violates row-level security policy"` — that message requires RLS to be enabled, and only 20260731000000 enables it on that table. Probe was zero-residue (NOT-NULL FK into empty `communication_campaigns` guarantees no row insert either way).
- **Broken `auth.jwt() ->> 'role'` claim → tracked as Task #5**, an explicit **precondition of the deferred Phase 3 RLS-swap pass** (not merely an audit caveat). The JWT hook sets `user_role`, never `role`; every policy comparing `auth.jwt() ->> 'role'` is dead — the applied comms hardening therefore denies ALL client reads including super_admin. Full affected-policy inventory lives in the task description.
- **Duplicate super_admin resolution (Amber's own investigation):** active/real account = `3e5ad72c-1da4-4cde-9220-97e82c920e4e` (moseriewere@gmail.com, ORS, real usage: 18 tasks/4 meetings/7 sprints). Duplicate = `72c8bfea-e3d7-47c5-aa54-5659b2347e33` (aemoseri@my.yorku.ca, Admins, zero usage, manual signup 2026-07-04 later elevated; its pending `member` invitation was never accepted). **`granted_by` for all backfilled `space_roles` rows = `3e5ad72c-1da4-4cde-9220-97e82c920e4e`.**
- `permissions/api.js` concurrent-session flag: resolved — other session's uncommitted change was reverted; file matches HEAD (`935f956`). Phase 1.3's "baseline already removed" claim retracted; `ROLE_BASELINE_PERMISSIONS` (incl. dead `reg_sec`) is live code and stays in scope for the seed/§6 sync work.

**STOP.** Per the execution prompt: no migration or seed SQL will be written until this audit and the §6 mapping table are approved.
