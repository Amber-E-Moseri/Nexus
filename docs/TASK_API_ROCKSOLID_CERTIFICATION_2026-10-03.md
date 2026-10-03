# Nexus task-api — Rock Solid readiness certification (2026-10-03)

Branch `fix/task-api-rocksolid-readiness`, cut from `origin/main` @ `aedbf3221016d44f0ab29e74dc722450c64b3236`.
Rock Solid reference: `integration/c6-edge-security` @ `4bc1e9bcb7aebcd150ee231ece53fb275d5cad4d` (read-only; only its
`supabase/tests/c6/nexus-e2e.ts` was *run*, nothing in it was modified).
Nexus `main` was not merged and nothing was deployed.

## 1. Verdict

**NEXUS CODE-READY.** Production verification is still required (section 9) because everything below ran on a local
Supabase-image Postgres + PostgREST, not on the production Nexus project.

## 2. Contract (Rock Solid client vs task-api)

`supabase/functions/task-api/index.ts` on `main` was byte-identical to the copy Rock Solid was certified against.
The contract is unchanged by this branch. Additive only: `GET /tasks?external_unique_key=` and new error mappings below.

| Aspect | Value (unchanged) |
|---|---|
| Auth | `x-api-key` only (SHA-256 lookup in `api_keys`); `Authorization: Bearer` alone → 401 |
| POST `/tasks` | 201 `{task}` created; 200 `{duplicate:true, task}` for a repeated `external_unique_key` |
| Fields | `title`, `description`, `priority`, `due_date`, `source_name`, `source_type`, `external_unique_key`, `assignee_id`, `status`/`status_id` |
| Placement | key's department (or sprint) scope; no Sprint is required |
| Rate limit | 60 req / min / key, 429 + `Retry-After` |

## 3. Root causes

### 3.1 503 "Rate limit check failed"
`task-api` calls `rpc('check_and_increment_rate_limit', { p_key_id, p_max_requests: 60 })` on every authenticated request.
The only definition lived in `.bak_20260626000000_rate_limits.sql` (disabled, so never applied) and owned a per-key table
named `rate_limits`. The September IP/email limiter (`20260902000001_rate_limiting.sql`) later took the `rate_limits`
name with a different shape. The RPC therefore never existed on a database built from the migration chain → PostgREST
error → 503 for **every** keyed request, including healthy ones.

### 3.2 Opaque 500 on a department without statuses
`sync_task_status_fields()` (BEFORE INSERT/UPDATE) resolved `status_id` only from rows owned by the task's department.
Since the org-level status model (`is_org_status`, `get_space_statuses`), a department created through
`createSpace()` has no rows of its own and inherits org statuses. The trigger left `status_id` NULL →
`23502 not-null violation` → task-api's catch-all returned a generic 500.

### 3.3 RLS recursion (real defect on current main)
Reproduced independently on a fresh replay of `origin/main`: every authenticated read of `departments`, `sprints`,
`group_space_members`, `sprint_members`, `sprint_teams`, `pastor_members`, `users` and `tasks` raised
`infinite recursion detected in policy`. Five distinct cycles:

| # | Cycle |
|---|---|
| 1 | `departments_select` → `group_space_members` → `group_space_members_select` → `departments` (the clause also compared `gsm.group_space_id = gsm.id`, which is never true) |
| 2 | `sprints_select` → `sprint_teams` → `sprint_teams_select_space_access` → `sprints` (and `sprint_members_select_space_access`) |
| 3 | `sprint_teams_select` → `sprint_team_members` → `sprint_team_members_select` → `sprint_teams` |
| 4 | `users_select_pastor_members` → `pastor_members` → `pastor_members_select_scope` → `users` |
| 5 | (runtime) `users_select_authenticated` → `current_user_can_bypass_department()` (SECURITY INVOKER, reads `users`) → `users_select_authenticated` … → `stack depth limit exceeded` for any non-admin once `users` has rows |

Not a certification artifact: it reproduces with a plain migration replay and an ordinary authenticated JWT.

## 4. Changes

| Commit | Content |
|---|---|
| `20271004000005_fix_rls_policy_recursion.sql` | SECURITY DEFINER helpers (search_path pinned, `public` revoked, granted to `authenticated`/`service_role`; same pattern as `is_sprint_member`/`can_view_space`): `is_group_space_owner`, `is_group_space_member`, `sprint_has_team_in_my_department`, `can_see_sprint`, `can_view_sprint_space`, `is_sprint_team_member`, `can_read_sprint_team_members`, `pastor_pair_in_my_department`; `current_user_can_bypass_department()` made SECURITY DEFINER. Policies re-created with the *same predicates*, calling the helpers. |
| `20271004000006_task_status_org_fallback.sql` | `sync_task_status_fields()`: department-owned statuses first (unchanged order), then enabled org-level statuses (`space_disabled_org_statuses` honoured). No status ids hard-coded, no rows inserted. If nothing resolves → SQLSTATE `TS001` (mappable) instead of a NOT NULL violation. |
| `20271004000007_task_api_rate_limiting.sql` | New table `task_api_rate_limits(key_id → api_keys.id ON DELETE CASCADE, window_start, request_count)` (RLS on, no policies, no grants to anon/authenticated) and `check_and_increment_rate_limit(uuid, int)` (SECURITY DEFINER, `service_role` only). One atomic `INSERT … ON CONFLICT DO UPDATE` per call, fixed 60 s windows, old windows of the key pruned when it opens a new one. Stores only `api_keys.id`; no plaintext key, no hash. The IP/email `rate_limits` table is untouched. |
| `task-api/index.ts` | `TS001` → 422; FK violation on `tasks_status_id_fkey` → 400; unique-violation race on `external_unique_key` → 200 `{duplicate:true}` (409 if the key belongs to another scope); duplicate lookup scoped to the key's department/sprint (previously any key could read any task's id/title through a colliding `external_unique_key`); optional `GET /tasks?external_unique_key=` filter. |

Deliberate behaviour notes:
* Cycle 1 fix corrects the group-space membership clause to `group_space_members.group_space_id = departments.id`, i.e. the
  documented intent (a member of a group space can see it). Previously it could never match.
* Policies for cycles 2/3 are evaluated through helpers that bypass RLS *only on the lookup tables*; each helper replicates the
  original predicate exactly (e.g. `can_see_sprint` = the `sprints_select` predicate) so access is not widened.
* anon retains the platform-default EXECUTE on the helpers (same as every existing policy helper); the anon read check in the
  SQL test shows anon still sees zero rows.

## 5. Assignment behaviour (documented, no new policy)
task-api checks only that `assignee_id` exists in `public.users` (unknown → 400 `assignee not found`, nothing created).
`inactive`, `archived`, `pending_activation` and `invited` users are **accepted** today (test AS02 pins this). Nexus defines
eligibility in `set_task_assignees()`; task-api deliberately does not duplicate it and this branch does not invent a policy.
Decide separately whether the API should refuse non-active assignees.

## 6. Test evidence (all local)

Stack: `supabase/postgres:17.6.1.054`, PostgREST (latest), real `task-api/index.ts` loaded in-process with real supabase-js.
Migration replay on the stock image has the same 8 environmental failures on `main` and on this branch (storage-schema
`buckets.public` column and the reader tables that depend on it); they are unrelated to this change.

| Run | Result |
|---|---|
| Baseline `main`, fresh DB, task-api integration suite | **2 passed / 21 failed** (503 on every keyed request; status 23502) — reproduces the defects |
| Baseline + only rate-limit migration, status tests | ST02 / ST03 fail with `23502 null value in column "status_id"` (status defect isolated) |
| Baseline `main`, authenticated reads | `infinite recursion detected in policy` on 8 tables; populated `users` read → recursion |
| **Fresh replay incl. new migrations (DB D)** | integration **23/23**; `rls_recursion_and_visibility.sql` **5/5 PASS** |
| **Upgrade from `main` with data (DB C)** | migrations applied, then re-applied (idempotent); seeded departments / own statuses / api key / task preserved; integration **23/23**; RLS **5/5** |
| **Upgrade from state with legacy per-key `rate_limits` (DB B)** | legacy rows preserved; legacy RPC replaced; integration **23/23**; RLS **5/5** |
| `npm test` (vitest) | 2134 passed / 13 failed / 296 skipped — **identical failing set before and after** (19 files that need a live Supabase stack/`SUPABASE_DB_URL`, not available here) |
| `task-api/assignee-validation.test.ts` | 2 passed, 9 ignored (ignored need a live URL; same as before) |
| Rock Solid `supabase/tests/c6/nexus-e2e.ts` against corrected Nexus (department with **zero** status rows, no Sprint) | **22 checks, 22 PASS, 0 FAIL, 0 UNVERIFIED** |

Integration suite (`supabase/tests/task-api/task-api.integration.test.ts`, run with `scripts/test-task-api-integration.sh`):
RL01–06 (first / within / boundary 60-61 / window reset / key isolation / 120-way concurrency admits exactly 60 / grants & argument validation),
SEC01–06 (no key, Bearer-only, invalid, revoked, disabled, expired, read-only POST, write-only GET, cross-department, 429+Retry-After, never 503),
CORS01, ST01–04, AS01–02, ID01–04 (sequential duplicate, 12-way concurrent same-key POST → one 201 + eleven 200 duplicates + count 1,
scope isolation, `external_unique_key` GET filter).
SQL suite (`supabase/tests/rls_recursion_and_visibility.sql`, rolled back): RLS01 all 230 RLS tables readable as an authenticated user;
RLS02 assignee / `task_assignees` / unassigned / same-dept member / dept lead / super admin visibility; RLS03 unauthorised read & write still denied;
RLS04 helper hardening; RLS05 anon sees nothing.

Rock Solid config proof: key scoped to a department with `tasks:write`+`tasks:read`, no `sprint_id`; created tasks have
`sprint_id = NULL`, `sprint_team_id = NULL`, `task_type = 'space'` (ST01, E1d).

CORS: with `ALLOWED_ORIGIN` set the response carries exactly that origin (never `*`) for any request origin; `OPTIONS` answers 200;
with `ALLOWED_ORIGIN` unset the function returns 500 and no CORS headers (verified manually; unchanged behaviour).

## 7. Limits of this evidence
* The 19 vitest files that need a live Supabase stack (icplc DB tests etc.) could not run here; their failing set is identical before/after.
* The old June per-key `rate_limits` table, if it exists in production, is left in place (unused).
* Concurrency was proven against a single Postgres; behaviour under Supabase's pooler is expected to be identical (single-statement atomic upsert) but not exercised.

## 8. Security review summary
No policy was dropped without an equivalent replacement; RLS stays enabled on all tables; the new table has RLS with no policies and no client grants;
the RPC is callable only by `service_role` (anon/authenticated get 401/403); responses never contain the key, hash, SQL or service-role material (SEC03/SEC05);
the duplicate lookup can no longer be used to read another scope's task.

## 9. Required before production
1. Apply the three migrations to a Nexus staging project cloned from production; re-run `scripts/test-task-api-integration.sh` and `supabase/tests/rls_recursion_and_visibility.sql` there.
2. Confirm in production whether policy recursion is actually present (it may have been patched out-of-band); the migration is safe either way (idempotent, same predicates).
3. Deploy `task-api` and set `ALLOWED_ORIGIN`.
4. Run Rock Solid's `nexus-e2e.ts` against staging, then the cross-repo final certification.
