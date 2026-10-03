# Phase 0 / Growth Correctness — Certification (DRAFT for review)

Branch `fix/phase0-push-security-schedulers-growth-week` · base `origin/main` @ `7d37d00` (PR #52 merged 2026-10-01T16:50:31Z, CI green) · **Production changes made: NONE.**
No secret values appear in this document, in git, in migrations, in test fixtures, or in logs.

---

## 0A — Push security (P0)

**Root cause.** `send-task-push-notification` trusted the request body (`userId`, `title`, `message`, `url`) and relied on the gateway JWT check, which the public anon key satisfies. Verified live 2026-10-01: no auth → 401; anon key → HTTP 200 `{"sent":0,"reason":"User not found"}` (arbitrary payload accepted; only the nonexistent recipient stopped delivery). A second path, `test-push-notification`, let any caller target any `user_id` (in-app + push + email). Client helpers `sendTaskPushNotification` / `dispatchPush` made browsers construct pushes (and sent an invented `/tasks/:id` URL).

**New contract.** Trusted internal caller → `POST {notification_id}` → server loads the stored row → recipient, title, body and an **approved deep link** are derived server-side. Anything else in the body is ignored.

| Control | Implementation |
|---|---|
| Caller auth | `Authorization: Bearer` must equal `CRON_SHARED_SECRET` (canonical hosted pattern) or the service-role key; constant-time compare; ≥16 chars or treated unconfigured → 503; anon key/user JWT/`apikey`-only → 401/403 |
| Gateway | `verify_jwt = false` for this function only because it authenticates itself and fails closed |
| Recipient | the stored row's `user_id`; subscription + `mobile` pref looked up for that user |
| Content | per-type templates over sanitised payload values (control chars stripped, length-capped); `calendar_sync_failure` no longer exposes raw error text |
| Deep link | `resolveDeepLink(type,payload)` → `validateInternalLink` allowlist (approved routes + whitelisted query keys with value patterns); fallback `/inbox` |
| Service worker | same validator inlined (`<safe-link>` region); push handler and `notificationclick` re-validate and open **same-origin only**; parity test with the server validator |
| Errors | no provider text in responses; no token logging |
| test-push | self-only (`auth.getUser(token)`), body `user_id` ignored |
| Client | `sendTaskPushNotification`/`dispatchPush` removed; redundant client push in `TaskComments` removed (server trigger already pushes) |
| Trigger | `20271002000001_push_dispatch_by_notification_id.sql`: sends only `notification_id`; Bearer = `recurring_meetings_cron_secret` from `app_settings` (no GUCs, no literals) |

Other push-sending paths inspected: DB trigger (now id-only), `due-date-reminders`/`calendar-event-reminders` (insert notification rows → trigger), `test-push-notification` (fixed). **New finding, not fixed here:** `send-notification-email` has the same weakness (no caller auth; caller-chosen `user_id`/`notification_type`/`payload` → templated email from the official sender). Recommended as the next P0 (same helper + trigger header; small).

## 0B — Scheduler recovery

Live evidence (read-only, 2026-10-01): `meeting-reminders-hourly` 336/336 failed; `due-date-reminders-evening` 14/14 failed; morning job absent; `daily-digest` 14/14 failed (unset GUCs). Additionally `delegated-task-reminders-hourly` (header `Bearer [<key>]` with literal brackets), `task-overdue-trigger-hourly` (no `Bearer ` prefix) and `task-notification-email-batch` (legacy key ≠ function's env key) report cron "success" but receive HTTP 401 — they have been silently dead. All six functions compared the Bearer token to `SUPABASE_SERVICE_ROLE_KEY`, which is the *new-format* key inside Edge Functions (documented in `20270724000204`), so a cron caller can never match it.

**Done in this branch (repo, not applied):** all six functions now authenticate via `_shared/internalAuth.ts` (`CRON_SHARED_SECRET` or service key, constant-time, fail closed); `config.toml` sets `verify_jwt = false` for them (gateway rejects a non-JWT Bearer otherwise).
**NOT done — held for your decision:** the scheduler migration (`20271002000002_repair_reminder_schedulers.sql`). My attempt to write it was blocked by the environment's permission classifier ("Modify Shared Resources": it unschedules/re-registers production cron jobs and marks 165 stale unsent notifications as handled). I did not retry or route around it. Its content is fully specified below so you can approve/author it. Until it exists: **Meeting reminder / Due-date morning / Due-date evening / Daily digest repair = FAIL (not delivered), credential literals removed = NO.**

Specified migration (for approval):
1. `public.invoke_internal_function(p_function text, p_body jsonb)` — SECURITY DEFINER; reads `supabase_url`, `service_role_key` (as `apikey`), `recurring_meetings_cron_secret` (as `Authorization: Bearer`) from `app_settings`; allowlist of the six function names; `REVOKE` from public/anon/authenticated.
2. One-time guard: `UPDATE notifications SET email_sent_at = now() WHERE email_sent_at IS NULL AND created_at < now() - interval '48 hours'` — otherwise the email batch resumes with 165 task notifications dating back to 2026-07-18 (oldest 2026-07-18; 0 in the last 24 h). **This is a production data change; needs explicit approval.**
3. `cron.unschedule` + `cron.schedule` by name (schedules unchanged): `meeting-reminders-hourly 0 * * * *`, `due-date-reminders 0 12 * * *` (restored), `due-date-reminders-evening 0 23 * * * {"mode":"evening"}`, `daily-digest 0 13 * * *`, `delegated-task-reminders-hourly 0 * * * *`, `task-overdue-trigger-hourly 0 * * * *`, `task-notification-email-batch 0 */3 * * *`.
Awaken-risk to review before applying: first runs of delegated/overdue/due-date will act on currently overdue tasks (dedupe windows apply; one-time burst of notifications and `task-overdue` automation triggers).

### Credential hygiene — findings
| Item | Finding |
|---|---|
| What it is | the project's **legacy `service_role` JWT** (role claim `service_role`, project ref matches, expires 2036). The 3 cron commands, and `app_settings.service_role_key`, hold the *same* value (hash comparison; value never printed). |
| In git? | No production service-role key. JWT-shaped strings in git are `supabase-demo` local keys (public by design) and production **anon** keys (public by design). |
| Consumers (known) | cron wrappers as `apikey` (Growth, recurring meetings, scheduled sends, the push/email triggers, the new helper); email trigger as Bearer; 3 cron literals; likely GitHub Actions secrets (CI notes the same secrets drive `deactivate-temp-sprint-members.yml`) and Vercel env (cannot read from here). |
| Active? | Yes — it is the live gateway-admitted key. |

### Rotation plan (READY to execute; execution BLOCKED on inventory of GitHub/Vercel/other consumers I cannot read)
1. **Identify all consumers** — DB (`cron.job.command`, `app_settings`, SQL functions), Edge secrets, Vercel env, GitHub Actions secrets, local `.env*`, any external scheduler. Produce the list with owners.
2. **Establish the replacement** — decide target: (a) move to the new opaque `sb_secret_…` key + `CRON_SHARED_SECRET` for function auth (preferred; functions already do not depend on the legacy key), or (b) roll the legacy JWT secret (invalidates legacy anon **and** service keys → every frontend/CI consumer must be updated in the same window).
3. **Update consumers first**: functions (this branch), then Vercel/GitHub secrets, then `app_settings.service_role_key` / `recurring_meetings_cron_secret` as needed.
4. **Update the scheduler**: apply 0B (removes the 3 literals; nothing in `cron.job` holds the key).
5. **Verify**: `cron.job_run_details` + `net._http_response` show 200s for every job for ≥1 cycle; push/email triggers produce 200; Growth wrappers fire correctly (first Sunday run).
6. **Rotate/revoke the old credential** only after 1–5 are green. Never before consumers have the replacement. No secret values in git, migration comments, fixtures, logs, or this document.

---

## Stream G — Growth week semantics

**Defect (proved).** At every scheduled Sunday-evening and Monday-morning point (EDT, EST, fall-back, spring-forward) the old UTC logic (view `CURRENT_DATE`, `weekly-growth-report` UTC Monday) resolved the **next** week (matrix in `src/tests/growth-week-fixtures.ts`; `OLD_UTC_DEFECT_CASES`). The UTC date flips at 8 PM ET (EDT) / 7 PM ET (EST), i.e. before the 8:50 PM sync. Also found: the email's week label shifted a day (UTC midnight formatted in Toronto time).

**Definition (explicit in tests).** `growth_reporting_week(t)` = Monday of the latest Sunday on or before the **Toronto** calendar date of `t`; rolls at Sunday 00:00 Toronto (DST-safe). Sun 8:49 PM … Mon 9:00 AM all resolve to the same week; Mon daytime = the week that just ended; Thu = last completed week.

**Single source of truth** (migration `20271002000003_growth_reporting_week_toronto.sql`): `growth_toronto_date`, `growth_week_start`, `growth_reporting_week`, `growth_week_summary`; view re-created with the live definition (manual flag wins) using the Toronto date; `fill_center_gaps` uses the Toronto date. Consumers: weekly report/PDF/email (week + X/Y from SQL; Monday label fixed), Growth page (default = DB reporting week; `?week=` honored incl. historical and non-Monday; X/Y/outstanding from `growth_week_summary`; Settings flag-week default from the DB; PDF export uses expected centers instead of week-count), future PWA/in-app (same RPCs). No JS week math remains in these paths (static test). Residual: Month End tab builds a calendar grid of Mondays in browser-local time (display only, not reporting-week semantics).

**Counts.** `expected` (all active centers) · `received` · `missing` · `pending` · `flagged` · `outstanding = missing + pending` (no report **and** no flag) — never `expected − received`. Live example (week 2026-09-07): 11 expected / 7 received / 3 missing / 1 flagged → outstanding 3, not 4 (asserted in the DB test with delta fixtures).

---

## Validation

See the run results recorded in the hand-off message (counts, Deno, build, diff check). Notes:
- Executed here: push security suite, SW/server link parity, Growth fixed-clock matrix + static single-source guards + page-selection tests.
- **Not executed here:** `growth-week-db.test.ts` (runs the real SQL functions; skipped unless `SUPABASE_URL` is localhost) — this machine has no Postgres/Docker daemon. CI builds a local Supabase from all migrations and will run it. The SQL was additionally certified by evaluating the same expressions read-only against the live DB (matrix in the hand-off).
- Deno: all changed functions type-check except pre-existing errors identical to base (18 in `task-overdue-trigger`, `task-notification-email-batch`, `due-date-reminders`, `test-push-notification`, `_shared/cors.ts`).

## Proposed deployment order (NOT executed)
0. **Pre-flight (read-only):** confirm Edge secret `CRON_SHARED_SECRET` equals `app_settings.recurring_meetings_cron_secret` (compare digests, never print); confirm `VAPID_*` present; snapshot `cron.job` names/schedules and the unsent-email count.
1. **Push closure:** deploy `send-task-push-notification` (new contract) then apply `20271002000001` immediately (seconds of fail-closed push gap; in-app unaffected). Verify: no-auth probe → 401, anon-key probe with a nonexistent id → 403, next real notification → `net._http_response` 200 `{"sent":…}`.
2. Deploy `test-push-notification` (self-only).
3. **Scheduler functions:** deploy the six functions + config (verify_jwt=false) **before** step 4.
4. **Apply 0B scheduler migration** (after your approval of items 2–3 in its specification).
5. **Growth:** apply `20271002000003`; deploy `weekly-growth-report`; deploy frontend. **Must complete before Sunday 2026-10-04 8:50 PM ET (2026-10-05T00:50Z).** Verify read-only: `growth_reporting_week()` for the §matrix instants; `growth_week_summary('2026-09-07')` = 11/7/3/0/1/3.
6. Frontend (Vercel) with service-worker update; confirm SW update path.
7. Post-deploy watch: first hourly cycles of the revived jobs (burst), first Sunday run, Monday catch-up.
Rollback: functions → redeploy previous version; migrations are additive/`CREATE OR REPLACE` (previous view/function text in 20270927000003 / 20270928000002 / 20270804000015); cron jobs re-registered by name.
