# Phase 0 — Production Precheck (READ-ONLY) and Backlog Closure Plan

PR #56 · branch `fix/phase0-push-security-schedulers-growth-week` · base `main` @ `7d37d00`.
**Production mutations performed: NONE.** Only SELECTs, `functions list/download` (into a scratch directory), `secrets list` (digests), and credential-less HTTP probes were used. No secret value is recorded anywhere.

## 1. PR #56 (certified head)
At the time of the precheck: OPEN, not draft, base `main`, `mergeable = MERGEABLE`, `mergeStateStatus = CLEAN`; certified head `01bed3f2ae…` equalled the local HEAD and the CI run's head SHA; checks CI Status / build / lint / security / test / Vercel all **pass**. This document and the due-date fix (§7) add a new commit, so **CI must go green again on the new head before merge.**

## 2. Production migration ledger
Latest applied: `20271001000004`. 764 applied versions = exactly the 764 migration files on `main` (no drift in either direction, no duplicate versions). PR #56 adds four; **pending set = exactly the expected four:**
```
20271002000001_push_dispatch_by_notification_id.sql
20271002000002_repair_reminder_schedulers.sql
20271002000003_growth_reporting_week_toronto.sql
20271002000004_email_dispatch_by_notification_id.sql
```
Heads-up (not part of Phase 0): ICPLC PR #55 adds `20271001000005_…`, which sorts **before** the Phase 0 versions. If Phase 0 migrations are applied first, `supabase db push` will refuse the older-versioned file unless `--include-all` is used. Apply `…05` before Phase 0 or plan for `--include-all` explicitly.

## 3. Cron secret
Digest comparison (SHA-256; method validated by a positive control: the `SUPABASE_URL` Edge secret digest equals the digest of `app_settings.supabase_url`): `CRON_SHARED_SECRET` (Edge) vs `app_settings.recurring_meetings_cron_secret` → **MATCH**. The stored secret is 64 characters (≥ the 16-character floor the dispatchers enforce).

## 4. Live scheduler inventory (credentials never shown)
| Job | Schedule | Target | Auth shape now | Failure state (14 d) | Replacement in `…02` |
|---|---|---|---|---|---|
| meeting-reminders-hourly | `0 * * * *` | meeting-reminders | GUC read (`current_setting('app.*')`) | 336/336 failed; **target function is not deployed (404)** | `invoke_internal_function('meeting-reminders')` |
| due-date-reminders (morning) | `0 12 * * *` | due-date-reminders | **job absent** | — | restored |
| due-date-reminders-evening | `0 23 * * *` | due-date-reminders | GUC read | 14/14 failed | `invoke_internal_function('due-date-reminders','{"mode":"evening"}')` |
| daily-digest | `0 13 * * *` | daily-digest | GUC read | 14/14 failed | `invoke_internal_function('daily-digest')` |
| delegated-task-reminders-hourly | `0 * * * *` | delegated-task-reminders | **literal key, wrapped in `[ ]`** | cron "ok" 336/336, HTTP 401 | helper |
| task-overdue-trigger-hourly | `0 * * * *` | task-overdue-trigger | **literal key, no `Bearer ` prefix** | cron "ok" 336/336, HTTP 401 | helper |
| task-notification-email-batch | `0 */3 * * *` | task-notification-email-batch | **literal legacy key as Bearer** | cron "ok" 112/112, HTTP 401 | helper |

28 live jobs; exactly **3** contain a literal credential (the three above). `…02` re-registers all seven by name through the allowlisted, `app_settings`-based helper: **0 literals remain** (asserted by `scheduler-recovery.test.ts`). `…02` performs no data mutation.

## 5. Live function configuration and deployment ordering
Deployed function sources were downloaded to a scratch directory and diffed against `origin/main`: **all nine affected functions are byte-identical (modulo line endings) to `main`**, so PR #56 is the complete delta. Gateway behaviour was probed with no credentials:

| Function | Deployed version | Gateway `verify_jwt` now | After PR #56 |
|---|---|---|---|
| send-task-push-notification | v40 | **true** (anon key reaches it — the P0) | false; authenticates internally |
| send-notification-email | v54 | **true** (anon key reaches it — the P0) | false; authenticates internally |
| test-push-notification | v52 | true | true (self-only via `auth.getUser`) |
| meeting-reminders | **NOT DEPLOYED (404)** | — | first-time deploy, verify_jwt false |
| due-date-reminders | v32 | true | false |
| daily-digest | v31 | true | false |
| delegated-task-reminders | v39 | true | false |
| task-overdue-trigger | v47 | false | false |
| task-notification-email-batch | v23 | true | false |
| weekly-growth-report | v21 | false | false (needs `…03` RPCs) |

**Unsafe-window analysis.** Both mismatches are fail-closed, never open: (a) *old dispatcher + new trigger*: the trigger's Bearer is the cron secret, which the old function (gateway JWT check on) rejects with 401 — nothing is sent; (b) *new dispatcher + old trigger*: the old trigger's Bearer is the legacy key, which is neither the env service key nor the cron secret → 403 — nothing is sent. The only exposure window is the **existing hole staying open until the new dispatcher is deployed**, so dispatchers deploy first. Push/email delivery pauses (in-app unaffected) between function deploy and trigger migration.
**Ordering requirements:** all affected functions (incl. first-time `meeting-reminders`) must be deployed **before** `…02` (scheduler) and before `db push`; `weekly-growth-report` before the Sunday run but it needs `…03`'s RPCs (a manual invocation between deploy and `…03` would 500). The frontend (Vercel) deploys on merge to `main`, so **merge last**: the Growth page needs `…03`.

## 6. Backlog — approved policy: EXPIRE OBSOLETE ONLY (dry run; nothing mutated)
Predicate (frozen cohort `created_at <= 2026-09-30T00:00Z`; first match wins; exact SQL in `docs/audits/proposed/EXPIRE_OBSOLETE_TASK_EMAIL_BACKLOG.proposed.sql`): not a batch type · task deleted/missing · task archived · task completed/cancelled · sprint closed/missing · informational/time-sensitive type older than 7 days. **Actionable items for still-active tasks/sprints are retained regardless of age.**

| Metric | Value |
|---|---|
| Total pending | **165** |
| Would expire | **153** (not a batch type 67 · sprint closed/missing 58 · task completed/cancelled 18 · task deleted/missing 7 · task archived 3) |
| Would retain | **12** |
| Retained by type | task_assigned 7 · mention 2 · sprint_added 2 · sprint_status 1 |
| Retained: active task / active sprint | 9 active tasks (6 past due) · 3 active sprints |
| Oldest retained | **69 days** (a `mention` on an active task) |
| Duplicate groups remaining (user,type,task) | **1** |
| Of the 12, would the batch actually email | **3** (9 are suppressed by the recipients' own email-off preference and would be silently stamped) |
| Retained read in-app | 1 |

If a stricter age ceiling is preferred, a 30-day cap on the actionable types would retain only the same 3 emailable rows; the 9 older ones are all already email-suppressed. The file's cohort query was executed read-only and reproduces the dry run exactly (153 / 12).

**Cleanup operation (READY, NOT APPLIED).** Narrow (only the 153), auditable (reason per row in `notification_email_expiry_audit`), idempotent (touches only `email_sent_at IS NULL`; audit insert `ON CONFLICT DO NOTHING`), guarded (aborts if the cohort exceeds 200), reversible (rollback SQL included), no payload/read-flag changes, no new lifecycle model. It lives under `docs/` (not `supabase/migrations`) so `db push` cannot apply it implicitly, and is **separate from `…02`**. Run as an approved admin operation **before** any scheduler change.

## 7. Morning due-date burst — fix REQUIRED (done on this PR; CI must re-run)
Findings (read-only): `due-date-reminders` has created **zero** notifications in its entire history. Its query (a) embedded `status_definition`, a relation that does not exist (the table is `task_status_definitions`); (b) used an embedded-resource `.neq` that never excludes parent rows; (c) ignored `deleted_at` / `archived_at` / `completed_at`; (d) read its 24 h de-duplication key from `n['payload->>task_id']`, a column name PostgREST does not return (the typed client shows it is `task_id`), so de-dup could never match. `task-overdue-trigger` had the same de-dup key defect and ignored deleted/archived tasks (it already limits status categories to open/in_progress).

Change: `due-date-reminders` selects `status_def:task_status_definitions!status_id(category)`, filters `deleted_at`, `archived_at`, `completed_at` IS NULL in the query, additionally drops categories `completed`/`cancelled` via the shared pure helper `_shared/taskActionable.ts`, and reads the de-dup key through an explicit alias (`task_id:payload->>task_id`). `task-overdue-trigger` gets the same alias plus `deleted_at`/`archived_at` IS NULL. Overdue tasks that are still open are intentionally **kept** (they are actionable). Effect on the morning run (read-only replication): **42 → 29 notifications** (28 still-open overdue, 1 due ≤3 d; 0 for deleted/cancelled/archived/completed). Tests: `reminder-actionability.test.ts` (17). Unrelated and **not changed**: `task-inactive-trigger` has the same `->>` pattern and a GUC-based cron (separate follow-up).

## 8. Production deployment plan (NOT executed)
Preconditions: PR #56 head CI green after the latest commit; backlog dry run re-run immediately before (must still be 165 / 153 / 12 or **STOP**); explicit approval of each stage. Run from a checkout of the PR head (the CLI applies `supabase/config.toml` `verify_jwt` on deploy).

1. **Pre-flight (read-only).** Head SHA = certified; ledger latest = `20271001000004` and pending = the four files; cron-secret digest MATCH; snapshot `cron.job` and function versions. *Stop if any differs.*
2. **Backlog cleanup (approved admin op).** Re-run the dry run, then apply the proposed expiry SQL. Verify: audit rows = 153, pending = 12, `cron.job` untouched. *Rollback: the included restore statement.* The batch job is still broken at this point, so nothing is emailed.
3. **Deploy all affected functions** in this order, verifying each deploy succeeds: `send-task-push-notification`, `send-notification-email` (closes both P0s the moment they deploy), `test-push-notification`, then `meeting-reminders` (first deploy), `due-date-reminders`, `daily-digest`, `delegated-task-reminders`, `task-overdue-trigger`, `task-notification-email-batch`, `weekly-growth-report`. Verify with credential-less probes: both dispatchers → gateway no longer in front (function-level 401 without auth; anon key → 403 on a nonexistent id). Push/email delivery is paused (fail closed) from here until step 4 — keep this gap to minutes. *Rollback: redeploy the previous versions from `main@7d37d00`.*
4. **`supabase db push`** → applies `…01`, `…02`, `…03`, `…04` in order (if ICPLC `20271001000005` is not yet applied, apply it first or use `--include-all`). Immediately verify: ledger; `cron.job` shows the 7 jobs, **0 literal credentials**, schedules/bodies as in §4; `growth_reporting_week()` matrix instants return the expected weeks and `growth_week_summary('2026-09-07')` = 11/7/3/0/1/3. *Stop and roll back the failing migration's effect if any verification fails* (rollback SQL: restore trigger bodies from `20270804000015` / `20270822000002`; unschedule the seven jobs; restore view and `fill_center_gaps` from `20270927000003` / `20270928000002`; drop the new functions).
5. **Watch the first cycles** (do not skip): next top of hour → `meeting-reminders`, `delegated-task-reminders`, `task-overdue-trigger` should show HTTP 200 in `net._http_response`; 12:00 / 23:00 UTC due-date runs (≈29 morning items); 13:00 UTC digest; the next 3-hourly batch should email only the ≤3 eligible retained items. *Stop condition:* any 401/403/5xx, or a notification count far above the estimates → unschedule the offending job (`cron.unschedule`) and investigate.
6. **Merge PR #56 last** (Vercel deploys the frontend: service worker with link validation, Growth page using the new RPCs). Verify the SW update and the Growth page default week / `?week=`. **Must all be complete before Sunday 2026-10-04 8:50 PM ET (2026-10-05T00:50Z).**
7. **Sunday 2026-10-04**: verify the 8:50 PM sync, the 9:00 PM report (week label and X/Y for the week just ended) and Monday's catch-up.
Credential rotation is **not** part of this deployment (separate plan in the final certification, §4 there; GitHub/Vercel consumers UNKNOWN).
