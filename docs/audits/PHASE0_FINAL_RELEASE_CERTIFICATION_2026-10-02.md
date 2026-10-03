# Phase 0 — Final Release Certification

Branch `fix/phase0-push-security-schedulers-growth-week` · base `origin/main` @ `7d37d00` · **Production changes made: NONE.** No secret value appears in this document, in git, migrations, fixtures, or logs.
Supersedes the open items in `PHASE0_GROWTH_CERTIFICATION_2026-10-01.md`.

---

## 1. Email dispatch (`send-notification-email`) — closed

**Proven from code (pre-fix).** No caller authorization of any kind. The request body chose `user_id` (recipient), `notification_type` (template) and `payload` (every interpolated field, the `message` body of the `system` template, and `action_url`, the button link); payload values were interpolated into HTML **unescaped**, and the provider's error body was returned to the caller. Gateway default `verify_jwt` admits the public anon key. Result: the anon key could make Nexus email attacker-chosen text and an arbitrary link to any user from the official sender (phishing), and any stored payload value (e.g. a task title) was an HTML-injection vector.

**Inventory of legitimate use (repo-wide).** Only two callers: the `dispatch_email_on_notification_insert` DB trigger (sent `notification_id` + user/type/payload) and `test-push-notification` (direct call with fixed text). No browser code calls it. Nothing sets `payload.action_url`. The weekly Growth report, `daily-digest`, `email-digest`, `weekly-recap-email`, absence/invitation emails all send through Resend directly with their own sender and are **unaffected** (asserted by test).

**New contract (same principle as push).** Trusted internal caller (`CRON_SHARED_SECRET` or service key, constant-time, fail closed) → `POST {notification_id}` → server loads the stored row → recipient, template, subject, body and link are derived server-side. Everything else in the request is ignored. All payload values are HTML-escaped; subject is control-character-stripped and capped; `payload.action_url` is no longer honoured (link derived by the shared deep-link allowlist); exactly-once via an atomic `email_sent_at` claim (released on failure) so the per-row trigger, the batch job and test-push cannot double-send; provider errors are never returned; credentials never logged. Existing preference semantics are unchanged (selective-email redesign deferred).

Files: `supabase/functions/_shared/emailCore.ts`, `send-notification-email/index.ts`, `test-push-notification/index.ts` (now inserts a stored notification and reports the pipeline's result — no caller-shaped email call), `config.toml`, migration `20271002000004_email_dispatch_by_notification_id.sql`. Tests: `src/tests/email-security.test.ts` (29): no auth → 401; anon / anon-as-apikey / user JWT → 403; unconfigured → 503; recipient, user, subject, html, template, deep-link and `action_url` injection ignored even with a trusted caller; legacy contract refused; trusted cron-secret and service-key paths succeed; escaping; CRLF; templates preserved; prefs honoured; no double-send; no provider/credential leakage; wiring and producer-isolation guards. A fake sender is injected: no real email is ever sent.
Residual (not in scope, recommended follow-up): `task-notification-email-batch` renders stored payload values into HTML unescaped (authenticated cron path; stored-injection via user-controlled task titles).

---

## 2. Scheduler recovery — migration `20271002000002_repair_reminder_schedulers.sql`

Re-inventory before writing: migration filenames re-listed (latest applied live `20271001000004`; `…02` was the only free slot in the Phase 0 range). The migration creates `invoke_internal_function` (SECURITY DEFINER, allowlist of the six names, execute revoked from public/anon/authenticated) and re-registers seven jobs by name. **It contains no data mutation** (the backlog update was removed; asserted by test), no literals, no GUC reads.

| Job | Schedule (unchanged) | Target function | Auth BEFORE | Auth AFTER | Body preserved? | Backlog / burst risk | Expected first-run behaviour |
|---|---|---|---|---|---|---|---|
| `meeting-reminders-hourly` | `0 * * * *` | `meeting-reminders` | `current_setting('app.supabase_url')` threw in SQL → never sent (336/336 failed) | `apikey` legacy key + `Bearer` cron secret via `app_setting()` | none (no body) ✔ | none — fixed 55–65 min window, no backlog | next top of hour: reminders for meetings starting in that window; once each |
| `due-date-reminders` (morning) | `0 12 * * *` | `due-date-reminders` | job **absent** | as above | `{}` ✔ | **42 notifications / 16 recipients**: 41 overdue 31–90 d, 1 due ≤3 d; **10 are for soft-deleted tasks and 4 for cancelled** (function does not filter them); re-notifies daily (24 h dedupe) for every overdue task regardless of age | 12:00 UTC: 42 in-app items, push to push-enabled recipients, picked up by email batch |
| `due-date-reminders-evening` | `0 23 * * *` | `due-date-reminders` | GUC read threw (14/14 failed) | as above | `{"mode":"evening"}` ✔ | none now (0 tasks due tomorrow with prefs); bounded to one date | 23:00 UTC: tasks due tomorrow only |
| `daily-digest` | `0 13 * * *` | `daily-digest` | `app.settings.*` GUC threw (14/14 failed) | as above | `{}` ✔ | no backlog; opt-out pref and no pref rows exist → all users with email are eligible; content limited to last-24 h assignments / due today / status changes | 13:00 UTC: one digest per user with content |
| `delegated-task-reminders-hourly` | `0 * * * *` | `delegated-task-reminders` | literal key, header `Bearer [<key>]` (brackets) → 401 at gateway | cron secret | no body ✔ | 3 reminders now; 24 h dedupe | first hour: 3 in-app items |
| `task-overdue-trigger-hourly` | `0 * * * *` | `task-overdue-trigger` | literal key, **no `Bearer ` prefix** → 401 | cron secret | `{}` ✔ | 55 overdue open tasks in total; **2 would trigger automations** (3 enabled `task_overdue` rules); 24 h dedupe via `automation_run_log` | first hour: ≤2 automation runs, then once per task per 24 h |
| `task-notification-email-batch` | `0 */3 * * *` | `task-notification-email-batch` | literal key → function's env key is the new-format key → 401 | cron secret | `{}` ✔ | **the 165-row backlog (below)**: no cap, no age check | first run within 3 h; see §3 |

All six functions now authenticate via `_shared/internalAuth.ts`; `config.toml` sets `verify_jwt = false` for them (a non-JWT Bearer is otherwise rejected by the gateway). Tests: `src/tests/scheduler-recovery.test.ts` (21): schedules/bodies/targets match the table, helper allowlisted and revoked from API roles, secrets only via `app_setting()`, **0 credential literals**, no GUCs, no `notifications` mutation, all six functions use the trusted-caller check and have `verify_jwt = false`.
Credential literals in repaired jobs: **0** (previously 3).

---

## 3. Stale email backlog — READ-ONLY classification (not mutated)

Counts only; no message bodies or recipient identifiers were read or printed.

**Total unsent (`email_sent_at IS NULL`): 165** (oldest ~75 days; 0 created in the last 24 h) — 40 distinct recipients; 0 without an address; 21 rows addressed to temporary accounts; 109 rows with no email preference row (default allow), 37 with email disabled.

| Type | Rows | Handled by batch? | Ages (0–7 / 8–30 / 31–60 / 61–90 d) |
|---|---|---|---|
| sprint_status | 57 | yes | 1 / 56 / 0 / 0 |
| meeting_created | 45 | **no** | 11 / 18 / 16 / 0 |
| task_completed | 13 | yes | 0 / 4 / 4 / 5 |
| mention | 12 | yes | 0 / 0 / 0 / 12 |
| task_assigned | 12 | yes | 0 / 0 / 7 / 5 |
| sprint_archived | 10 | no | 0 / 9 / 1 / 0 |
| meeting_scheduled | 6 | no | 0 / 0 / 6 / 0 |
| system / flock_followup_due / task_status_changed | 2 / 2 / 2 | no | mixed |
| sprint_access_requested / sprint_added | 2 / 2 | yes | 61–90 d / 0–7 d |

**Referenced entity state (165):** 126 have no task reference (sprint/meeting types); of the 39 with a task: 8 soft-deleted, 3 archived, 19 completed/cancelled, **9 still active** (6 overdue now, 3 no due date).
**What the batch would do if the backlog were left untouched (verified against its code):** it selects *all* pending rows of 13 task/sprint types (98), **no cap and no age or entity-state check**; it groups **one digest email per user**, applies only the email-preference filter (29 rows suppressed), and then **stamps every selected row as processed, even if the send failed**. Result: **39 digest emails to 39 users** carrying **69 items** (largest digest 6, average 1.8, 19 single-item digests). 31 duplicate (user, type, task) groups exist, so some digests would repeat an item. The remaining 67 rows (meeting_created, sprint_archived, meeting_scheduled, system, flock, task_status_changed) are **never processed by the batch** and would stay unsent (harmless; they are not emailed by any path).
**Of the 69 emailable items:** 58 concern sprints that are now closed/archived (56 `sprint_status`, 2 `sprint_access_requested`); 8 point at deleted/completed tasks; **only 3 are still useful** (1 recent `sprint_status` on an active sprint, 2 `task_assigned` on still-active tasks aged 31–60 d). Users **would receive reminders up to ~75 days old**, including for deleted tasks.

- Would the repaired scheduler immediately process them? **PARTIAL** — not 165 individual emails: up to 39 per-user digests (69 items) at the first run (≤ 3 h after the migration), and all 98 batch-type rows get stamped; the other 67 are left.
- Would current eligibility checks suppress obsolete entries? **No** (preferences only).
- Could users receive months-old reminders? **Yes.** Could duplicates occur? **Yes** (within a digest; 31 groups).
- **Recommended disposition: EXPIRE OBSOLETE ONLY** (rule-based): expire every row older than 7 days *or* whose task/sprint is deleted/archived/completed/cancelled/closed, and expire all non-batch types; that leaves ≈ 3 rows to process normally. As a durable fix, add an age/entity guard to the batch (ignore rows older than ~48 h; skip rows whose task is gone/done) so a future outage cannot cause a burst — and a pre-enable fix for `due-date-reminders` (skip soft-deleted/cancelled tasks; cap overdue age) because the revived morning job would otherwise notify 42 times on day one, 14 of them for deleted/cancelled tasks, then daily.
- **Backlog mutated: NO.** The migration does not touch it. Until the disposition is applied, deploy ordering must keep `task-notification-email-batch` from running (see §6).

---

## 4. Credential rotation inventory (no value printed)

The old embedded credential is the project's **legacy `service_role` JWT**. References were found by value (hash/substring comparison inside the DB; in-memory comparison for files), never displayed.

| Location | Class | Status |
|---|---|---|
| `cron.job` — `delegated-task-reminders-hourly`, `task-notification-email-batch`, `task-overdue-trigger-hourly` | DB cron | **found (3)** — removed by migration 02 |
| `public.app_settings` key `service_role_key` | app_settings | **found** — used as the `apikey` header by the cron/trigger wrappers (Growth, recurring meetings, scheduled sends, push/email triggers, the new helper) and by the email trigger (until migration 04) |
| Supabase **Vault** secret `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret (Vault) | **found** — consumed by Vault-based cron wiring (e.g. the nova jobs, `20270821000000`) |
| SQL function bodies / views / other `app_settings` rows | DB | **none** |
| Edge Function secrets (`supabase secrets list`, digests compared) | Supabase secret | **none equal** — `SUPABASE_SERVICE_ROLE_KEY` is the new-format key (confirms the format split) |
| Edge Function source | Edge Function | six reminder functions *previously compared Bearer to the env key* (now `internalAuth`); no function embeds it |
| Repository working tree | other | only gitignored `.env.local` (local developer copy) |
| Git history (all refs), other worktrees | other | **0** commits / **0** files |
| GitHub Actions secrets: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL` (used by `ci.yml` and `deactivate-temp-sprint-members.yml`) | GitHub secret | **UNKNOWN** — values are unreadable; may or may not equal the legacy key |
| Vercel env (`api/growth-report-pdf.ts`, `api/mcp.ts`, `api/mcp-oauth.ts` read `SUPABASE_SERVICE_ROLE_KEY`) | Vercel secret | **UNKNOWN** — no CLI/read access from here |
| Local developer machines, password managers, any external scheduler/automation | other | **UNKNOWN** |

### Exact rotation order (NOT executed; no rotation yet)
1. **Close the unknowns:** with the owner, read the GitHub and Vercel `SUPABASE_SERVICE_ROLE_KEY` values' *digests* (or re-set them) and list any local/external consumers. Do not proceed while any row above is UNKNOWN and in use.
2. **Choose the replacement:** preferred = stop using the legacy key anywhere except the gateway-admission `apikey` header and move consumers to the new `sb_secret_…` key; otherwise a JWT-secret roll, which invalidates the legacy anon **and** service keys (the frontend build and every consumer must be updated in the same window).
3. **Update consumers first:** Vercel and GitHub secrets, Vault secret, any local env; confirm each consumer works with the replacement.
4. **Update the scheduler:** deploy the six functions, then apply migration 02 (removes the 3 literals); apply migrations 01/04 (triggers use the cron secret). Verify ≥1 full cycle of 200s in `net._http_response` / `cron.job_run_details`.
5. **Rotate/refresh `app_settings.service_role_key` and the Vault entry** to the replacement; verify the Growth and recurring-meetings wrappers, push/email triggers and nova jobs.
6. **Only then revoke/rotate the legacy credential.** Never before consumers hold the replacement; no secret in git, migration comments, fixtures, logs, or documents.
**Rotation plan: READY** (execution BLOCKED on step 1).

---

## 5. Growth (unchanged, preserved)
Toronto canonical week, canonical counts (`growth_week_summary`), page default, `?week=`, weekly report/email, DST matrix: unchanged from the prior certification (live fixed-clock check 45/45). The DB-backed week/summary test (`growth-week-db.test.ts`) runs in CI against the local Supabase.

---

## 6. Pending production migrations and deployment order (NOT executed)

Pending (live ledger's latest applied = `20271001000004`): `20271002000001_push_dispatch_by_notification_id.sql`, `20271002000002_repair_reminder_schedulers.sql`, `20271002000003_growth_reporting_week_toronto.sql`, `20271002000004_email_dispatch_by_notification_id.sql`. Re-verify at the production precheck.

1. **Pre-flight (read-only):** ledger = the four migrations above only; `CRON_SHARED_SECRET` ↔ `app_settings.recurring_meetings_cron_secret` digest equality; `VAPID_*`/`RESEND_API_KEY` present; snapshot `cron.job`; confirm deployed function configs.
2. **Decide and apply the backlog disposition first** (or temporarily avoid the batch): `task-notification-email-batch` must not run before the backlog is expired. If the disposition is not decided, apply migration 02 and immediately unschedule only that job, or apply 02 after the decision.
3. Deploy `send-task-push-notification`, then apply `…01` immediately (seconds of fail-closed push gap).
4. Deploy `send-notification-email` and `test-push-notification`, then apply `…04` immediately (seconds of fail-closed email gap; in-app unaffected).
5. Deploy the six scheduler functions + `config.toml`; **then** apply `…02`.
6. Apply `…03`, deploy `weekly-growth-report`, deploy the frontend (service worker + Growth page). **Before Sun 2026-10-04 8:50 PM ET (2026-10-05T00:50Z).**
7. Post-deploy: anon-key probes of both dispatchers → 403/401; next real notification → 200s; first hourly cycles of revived jobs (watch the 42-item due-date burst and the ≤2 overdue automation runs); first Sunday Growth run.
Rollback: redeploy previous function versions; migrations are additive/`CREATE OR REPLACE` (prior trigger text in `20270804000015`, `20270822000002`); jobs are re-registered by name.
