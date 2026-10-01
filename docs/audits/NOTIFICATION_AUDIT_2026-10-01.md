# Nexus Notification Audit — PWA-First Direction

Date: 2026-10-01 · Branch: `fix/growth-report-cron-and-pdf` · Status: **AUDIT + DESIGN ONLY. No code, migration, deploy, or production write has been made.**

Evidence rule: "Current state" is read from the repo. Section 1.9 holds **read-only live verification** (SELECT-only queries via `supabase db query --linked`, `supabase functions list`, and one auth probe against a nonexistent recipient). No secrets are recorded here.

---

## 0. PRODUCT DECISIONS (recorded; these are requirements, not recommendations)

> **PWA is the default Nexus operational notification channel.**

### 0.1 Channel policy
- Normal operational events: **PWA push default ON · in-app default ON · email selective.** Email never mirrors every notification.
- Native browser permission is requested only after the user clicks *Enable* in Nexus onboarding.

### 0.2 Onboarding / snooze (confirmed 2026-10-01)
- After login, if push is supported, **this device** has no active subscription, permission ≠ `denied`, and the prompt isn't snoozed → show Nexus onboarding ("Stay updated with Nexus …" **[Enable notifications] [Not now]**).
- **Not now = 7-day snooze** (`snoozed_until` timestamp). **No permanent "never ask again".** **No hard lifetime prompt count** initially; prompts must stay unobtrusive (not on every login).
- Browser permission `denied` ⇒ stop native prompting; show manual instructions only where useful (Settings).
- **A Nexus setting lets a user explicitly suppress Nexus notification onboarding** (stored server-side per user). That is the only "stop asking" switch.
- After grant: register this device; categories default ON (Tasks, Sprints, Meetings, Growth Tracking, Programs/ICPLC, Operational Alerts); in-app ON; email prefs stay separate.
- Later logins: valid subscription ⇒ do nothing; expired ⇒ safe silent recovery; new device ⇒ offer onboarding for that device.

### 0.3 Multi-device
Replace `users.push_subscription` with `push_subscriptions` (one row per user+endpoint). A dead device must never remove another device.

### 0.4 Deep links (confirmed 2026-10-01)
Every push carries an authenticated internal deep link to the exact screen; `/inbox` is history, not the universal destination. **Do not invent `/tasks/:id` or an ICPLC participant URL** — use Nexus's existing navigation mechanisms (§2.6). Links must survive cold PWA launch and the login redirect, validate authorization after navigation, and fall back to the relevant domain page if the entity is gone.

### 0.5 Email defaults at launch (confirmed 2026-10-01)
**Email retained for:** task assigned · meeting invitation · meeting rescheduled · meeting cancelled · existing intentional digests · weekly Growth PDF/report.
**PWA + in-app are the normal channel for:** task due/overdue · sprint operational reminders · meeting reminders · Growth X/Y weekly status · Growth operational failures · ICPLC operational attention · other ordinary alerts.
Existing explicit user email preferences are **preserved** during migration (no mass flip of existing rows; new defaults apply only to users/types with no row). Caveat: current seeds set `email=true` for `task_due_soon`/`daily_digest` and the table has no timestamp, so "seeded" vs "explicit" rows cannot be told apart — preserve as-is and review (see D3).

### 0.6 Growth (confirmed 2026-10-01)
- **Sunday is the primary Growth status notification**, sent after the final Sunday sync/report processing, to **super_admin + regional_secretary** (verified against the Growth access model, §1.7). PWA + in-app.
  - Complete: **"This week's Growth Tracking is ready"** / "35 of 35 reports received. Tap to review Growth Tracking."
  - Incomplete: **"Growth Tracking update"** / "32 of 35 reports received this week. 3 still outstanding."
- **Monday is catch-up, not a duplicate scheduled push.** A Monday push happens only when useful: state materially changed since Sunday, or reports remain operationally missing and a follow-up is warranted; otherwise state comparison suppresses it.
- Completeness uses **canonical missing-center semantics** — never `outstanding = expected − reported`. X/Y and missing/outstanding come from **one definition** shared by the Growth page, weekly report/email, PWA, in-app notification, and the `?week=` deep link.
- **Growth reporting-week semantics must be certified and fixed before Growth PWA** (§5 — GROWTH WEEK SEMANTICS CERTIFICATION).
- **Failure is a separate event** → "Growth report needs attention" / "This week's Growth report could not be completed. Tap to review." (PWA + in-app, super_admin + regional_secretary, no technical detail).
- Weekly PDF/email is unchanged and stays email-first. No per-host reminders, no host→user mapping, no per-submission notifications.

### 0.7 Notification discipline
Notifications are driven by meaningful domain events, not database writes. ICPLC bulk actions (Mark Reviewed, Add/Remove Tag, flight-not-required) → **no push**; bulk *assignment* may notify the newly assigned staff (aggregated). Push payloads are minimal context; details live behind authentication. ICPLC: "Participant documentation requires attention. Tap to review in Nexus." — never immigration/passport details.

### 0.8 Implementation order (mandatory)
| Phase | Scope |
|---|---|
| 0 | Push security closure (+ live reminder-cron repair, §1.9) |
| 1 | Multi-device `push_subscriptions` |
| 2 | Shared dispatcher: in-app, PWA, selective email, categories, deep links, dedupe |
| 3 | Default post-login PWA onboarding |
| 4 | Migrate Tasks / Meetings / Sprints to the canonical dispatcher |
| **Gate** | **GROWTH WEEK SEMANTICS CERTIFICATION (§5)** |
| 5 | Growth Tracking PWA |
| 6 | ICPLC operational notifications |

---

## 1. CURRENT STATE

### 1.1 Data model
| Object | Shape | Notes |
|---|---|---|
| `notifications` | `id, user_id, type, payload jsonb, read bool, created_at` (+ `email_sent_at`) | No category, link, importance, **dedupe key**, `read_at`. |
| `user_notification_prefs` | `PK(user_id, notification_type)`, `in_app, email, mobile` | Per *type*. No row ⇒ in-app allowed, push OFF. |
| `users.push_subscription`, `push_enabled`, `push_subscribed_at` | `20261230000008` | **One subscription per user.** |
| `app_notifications` | Communications Hub | Separate system. |

### 1.2 Pipeline
```
producer --INSERT--> notifications
   |-- BEFORE INSERT enforce_in_app_pref
   |-- AFTER INSERT dispatch_push_on_notification_insert  -> send-task-push-notification (pg_net)
   '-- AFTER INSERT dispatch_email_on_notification_insert -> send-notification-email
```
(All three triggers confirmed enabled live, §1.9.) One row = one event with channel fan-out by trigger — the seed of a shared dispatcher.

### 1.3 What Nexus sends today
| Domain | Types | Push today |
|---|---|---|
| Tasks | `task_assigned`, `mention`, `comment_added`, `task_status_changed`, `subtask_completed`, `dependency_cleared`, `task_completed`, `task_due_soon`, `delegated_task_due_soon` | only if a `mobile=true` pref row exists (subscribing seeds 11 types) |
| Sprints | `sprint_added`, `sprint_status`, `sprint_access_*`, `sprint_archived` | membership/status only. **No starting/ending/deadline emitter** |
| Meetings | `meeting_created`, `meeting_scheduled`, `meeting_reminder` (T-1h) | scheduled/reminder seeded. **No rescheduled/cancelled** |
| Calendar | `calendar_event_reminder`, `calendar_sprint_prompt`, `event_*`, `calendar_sync_failure` | not seeded |
| Other | flock, support, campus edits, automation, system | mostly not seeded |
| **Growth / ICPLC** | **none** | no |
| Email-only | weekly/daily digests, dormant nudge, announcements, absence/login-reminder | n/a |

Email today **mirrors** every templated notification type unless `email=false`; this must become an explicit allowlist (§0.5).

### 1.4 PWA / Web Push today
`public/service-worker.js` (push + notificationclick, opens `data.url` with no same-origin check); `src/lib/webPush.js`; `AuthContext` silent re-subscribe only if `profile.push_enabled`; `NotificationPermissionPrompt` (10 s toast); `NotificationsSection` settings; edge fn `send-task-push-notification` (VAPID, per-type formatter, `mobile` gate, prunes the user's subscription on 404/410). Push-capable today: tasks, mentions/comments, sprints (membership/status), meetings (scheduled/reminder), calendar reminders. Not Growth/ICPLC/flock/comms.

### 1.5 In-app center
`NotificationsContext` (realtime, unread, lazy list, mark read/all), `Inbox.jsx`, `NotificationsPage.jsx`. No stored link (derived per type in the page), no category filter, no dedupe, no `read_at`.

### 1.6 Dedupe today
Ad hoc per-producer time windows; no unique key; racy.

### 1.7 Growth Tracking
- `growth-reports-sync` pulls `leaders.lwcanada.org` → `service_reports`. **Hosts submit externally and are not Nexus users.**
- `weekly-growth-report` emails PDF to `report_recipients` (plain emails).
- **Access model (verified):** `/growth-tracking` = `ProtectedRoute roles=['super_admin','regional_secretary']`; RLS select on Growth tables = same two roles (`20270928000002`); manual function triggers = same two roles; Settings tab = `super_admin`. ⇒ recipients **super_admin + regional_secretary** are correct, resolved at send time from `users.role`, active accounts only (confirm the deactivation column before build).
- Only Growth route: **`/growth-tracking`**; tab and week are `useState` (no URL params).
- **Page canonical counts** (from `v_service_center_weekly_growth`, selected week): **X** = rows `status='reported'`; **Y** = *all* rows for that week = every `active=true` center. `merged`/`did_not_meet` flags are in Y, not X.
- Silent failures: Resend non-2xx → 502 nobody sees; PDF failure swallowed; zero recipients → 200 no-op; no run log; no admin status surface.

### 1.8 Findings register
| # | Finding | Status | Severity |
|---|---|---|---|
| **S1** | `send-task-push-notification` accepts caller-supplied `userId/title/message/url` with no recipient authorization; **anon key reaches it** | **EXPLOITABLE — live-confirmed (§1.9)** | **P0** |
| **L1** | `meeting-reminders-hourly` has failed **336/336** runs since 2026-09-17 18:00 UTC (unset GUC `app.supabase_url`) → **no meeting reminders for ~2 weeks** | live-confirmed | **P1** |
| **L2** | `due-date-reminders`: only the *evening* job exists and has failed 14/14 since 2026-09-17 (same GUC error); the *morning* job from `20260912000000` is **absent from `cron.job`** → **no due-date reminders** | live-confirmed | **P1** |
| **L3** | `daily-digest` failed 14/14 since 2026-09-18 (`app.settings.supabase_url` unset) | live-confirmed | P1 |
| **L4** | 3 cron commands embed literal credential-like strings in `cron.job.command` (`delegated-task-reminders-hourly`, `task-notification-email-batch`, `task-overdue-trigger-hourly`) — visible to anyone with DB read access | live-confirmed (values not recorded) | P1 (rotate + move to `app_settings` pattern) |
| **S7** | Growth week resolved in UTC → Sunday-evening ET runs target **the next, empty week** | **PROVEN (§5.1)** | **P0 for Growth** |
| S8 | View-definition drift (data-wins vs flag-wins) | **Resolved: live view is flag-wins** (`ws.status` tested first) | closed |
| S2 | `calendar_sync_failure` push embeds raw `error_message` | repo | P2 |
| S3 | Push text uses titles/names verbatim; unsafe default for ICPLC/people | repo | P2 |
| S4 | "Not now" writes permanent `notification-permission-never` | repo | P2 |
| S5 | Dispatcher never passes `url`; push always opens `/inbox`; SW has no same-origin check | repo | P2 |
| S6 | One 404/410 nulls the user's only subscription | repo | P2 |
| S9 | In-app link `navigate('/my-tasks?task=<id>')` (`NotificationsPage.jsx:251`) — `MyTasks.jsx` consumes only `?new=true`; **nothing reads `?task=`** | repo (confirm in UI) | P2 |

### 1.9 LIVE VERIFICATION (read-only, 2026-10-01 · project NEXUS `kraurtuhf…`)
Method: SELECT-only SQL via the linked CLI; `functions list`; secrets redacted. **No production data was modified.**

**A. Deployed `send-task-push-notification` (v40, updated 2026-10-01 04:37 UTC, ACTIVE)**
Probe (nonexistent recipient UUID, so nothing could be delivered; body carried an arbitrary `title`, `message` and an external `url`):
| Request | Result |
|---|---|
| no `Authorization` header | **HTTP 401** `Missing authorization header` (gateway JWT check is on) |
| **public anon key** as `apikey` + Bearer | **HTTP 200** `{"sent":0,"reason":"User not found"}` → request reached the function and the arbitrary payload was accepted; only the nonexistent recipient stopped delivery |

⇒ **EXPLOITABLE.** The gateway only requires *a* valid JWT, and the anon key (public in the frontend bundle) is one. For any user with `push_enabled`, the same request with a real `userId` would push attacker-chosen text and URL. (Deliberately not demonstrated against a real user.) 12 of 40 users currently have push enabled.

**B. Live Growth view** `v_service_center_weekly_growth`: definition matches `20270927000003` (**manual flag wins**, then reported, then `missing` if `week_start < date_trunc('week', CURRENT_DATE)`, else `current`). `CURRENT_DATE`/session timezone are **UTC** (`now()` returns +00). Live data: **21 centers, 11 active.** Recent weeks (rows/reported/missing/flagged): 09-07 → 11/7/3/1 · 09-14 → 11/5/6/0 · 09-21 → 11/8/3/0 · 09-28 → 11/0/0/0 (11 `current`). Week 09-07 proves the point: Y−X = 4 but **missing = 3** (1 flagged).

**C. Cron jobs (36 jobs, all `active`)**
- Growth (created by `20271001000004`; **no runs yet** — first scheduled Sunday is 2026-10-04): `growth-reports-sync-weekly` `50 0 * * 1` and `-est` `50 1 * * 1` → `trigger_growth_reports_sync()`; `weekly-growth-report` `0 1 * * 1` and `-est` `0 2 * * 1` → `trigger_weekly_growth_report()`; `growth-reports-sync-monday` `0 13 * * 1` and `-est` `0 14 * * 1` → `trigger_growth_reports_catchup()`. Wrapper + guard functions exist.
- `meeting-reminders-hourly`, `due-date-reminders-evening`, `daily-digest` failing as in L1–L3; `delegated-task-reminders-hourly`, `task-overdue-trigger-hourly`, `generate-recurring-meetings-hourly` succeeding (336/336).
- **Root cause of L1–L3** is the same class already fixed for Growth: crons reading `current_setting('app.*')` GUCs that hosted Supabase never populates. The working pattern is `public.app_setting(...)` wrapper functions. Live `app_settings` keys (names only): `service_role_key`, `supabase_url`, `recurring_meetings_cron_secret`, `archive_tasks_cron_secret`, `email_signature`, `last_personal_archive_run`.

**D. Other:** triggers `dispatch_push_on_notification_insert`, `dispatch_email_on_notification_insert`, `enforce_in_app_pref_before_insert` all enabled. 40 users; 12 push-enabled/12 with a stored subscription; 224 `mobile=true` pref rows across 40 users.

---

## 2. TARGET STATE

```
DOMAIN EVENT (explicit RPC/cron/action — never a bare table write)
   -> create_notification(user, type, category, importance, payload, link, dedupe_key)
        1. validate link  2. resolve prefs (category defaults)  3. ON CONFLICT (user_id, dedupe_key) DO NOTHING
   -> notifications row (= in-app item = push = optional email)
        |-- in-app: realtime -> bell (history)
        |-- push  : service-only dispatcher -> all active devices -> template payload + validated link
        '-- email : only types on the email allowlist AND user's email pref
```

### 2.1 Phase 0 — closing S1
- Dispatcher accepts **only `{notification_id}` from an internal caller** (DB trigger/cron) authenticated by a dedicated secret or service-role key, compared in constant time. User JWTs and the anon key ⇒ 403 even when the gateway admits them.
- Recipient, type, payload, link read **server-side from the `notifications` row**; never from the request body.
- Title/body from a per-type template over whitelisted payload keys.
- Remove/neutralize client `sendTaskPushNotification`/`dispatchPush`; "Send test" is self-only with fixed text/link (audit `test-push-notification` v52 the same way).
- **Link allowlist** enforced at insert time, at dispatch time, and in the service worker: single leading `/`, no `//`, no scheme/backslash, matches approved internal route patterns; SW opens same-origin only.
- Regression tests: no auth / anon / other-user JWT ⇒ denied; arbitrary title/body/url ⇒ ignored/denied; external and malformed links ⇒ rejected; service path works.
- Same phase: repair L1–L3 (migrate crons to `app_setting()` wrappers, restore the morning due-date job, make schedules migration-managed) and rotate/move the literal credentials in L4. These are production-repair migrations and need separate sign-off.

### 2.2 Device model (Phase 1)
`push_subscriptions(id, user_id, endpoint UNIQUE, p256dh, auth, user_agent, platform, device_label, created_at, updated_at, last_seen_at, last_success_at, failure_count, revoked_at)`. Per-endpoint revoke on 404/410; fan-out to all active devices; logout revokes **this** device only; backfill from `users.push_*` (12 live rows) with dual-write, then drop old columns. Also stores `notification_prompt_snoozed_until` / `notification_onboarding_suppressed` (user-level suppress setting, device-level snooze).

### 2.3 Categories & email
| Category | Push | In-app | Email default |
|---|---|---|---|
| Tasks | ON | ON | **assigned only** |
| Sprints | ON | ON | OFF |
| Meetings | ON | ON | **invitation, rescheduled, cancelled**; reminders OFF |
| Growth Tracking (oversight) | ON | ON | OFF (PDF email separate) |
| Programs / ICPLC | ON | ON | OFF |
| Operational alerts (admins) | ON | ON (locked) | optional |
| Security/system | ON (locked) | ON | as needed |
| Optional (flock, comms, announcements) | per type | ON | per type |

Absent pref row ⇒ category default (not "off"); existing rows preserved.

### 2.4 Dedupe
`notifications.dedupe_key` + partial unique index `(user_id, dedupe_key)`. Keys: `task_due:<task>:<due_date>:<soon|overdue>`, `meeting_reminder:<meeting>:<scheduled_at>:T-60`, `meeting_rescheduled:<meeting>:<new_scheduled_at>`, `meeting_cancelled:<meeting>`, `sprint_ending:<sprint>:<end_date>:T-24h`, `growth_weekly_status:<week_start>:<stage>:<recipient>`, `growth_report_failed:<week_start>:<job>:<recipient>`, `icplc_attention:<participant>:<reason>:<date>`.

### 2.5 Payload privacy
T1 generic (ICPLC, Growth failure, calendar sync) · T2 object title only (tasks, meetings) · T3 never in push or URL (passport/visa/immigration, health/allergy, pastoral notes, raw errors, emails, participant names tied to documentation). Enforced by type→template with whitelisted keys, not free text.

### 2.6 Deep links — canonical mechanisms (from existing routing/UI)
| Entity | What exists today | Deep-link design |
|---|---|---|
| **Task** | No task route. Tasks open via **modal state**: `TopBar.openTask(id)` (`getTaskById` → modal); pages host `TaskModal`. `/my-tasks?task=<id>` is emitted by `NotificationsPage` but **not consumed** (S9). | Add **one global consumer** (Shell-level hook) of `?task=<id>`: `getTaskById` → open `TaskModal` on whatever page the app is on; RLS decides access; if not found/forbidden → toast + fall back to `/my-tasks`. Link stored as `/my-tasks?task=<id>` (keeps the existing emitted shape, now made real). |
| **Meeting** | `/meetings/:meetingId` route exists | use it; fallback `/meetings` |
| **Sprint** | `/sprints/:sprintId` route exists | use it; fallback `/sprints` |
| **Growth** | `/growth-tracking`; week/tab in `useState` | `/growth-tracking?week=<week_start>` (needs page to read the param) |
| **ICPLC participant** | single route `/icplc`; profile drawer = **in-memory `ICPLCContext.openProfile(id, tab)`**; sections are local tab state | `/icplc?participant=<id>&tab=<tab>` consumed in `ICPLCProvider` → `openProfile`; id only (never names); fallback to `/icplc` (Needs Attention) if the participant is gone/forbidden |
| Calendar | `/calendar` | as-is |

Cross-cutting requirements: survive **cold PWA launch** (SW `openWindow` URL carries the full path+query); survive **login redirect** (`ProtectedRoute` passes `state.from`; verify the login flow returns to `from` including the query string); **authorize after navigation** (rely on RLS/role checks at the destination, never on the link); **graceful fallback** to the domain page; links validated against the allowlist (§2.1).

---

## 3. RECOMMENDED DEFAULT MATRIX

| Event | PWA | In-App | Email |
|---|---|---|---|
| Task assigned | ON | ON | **ON (retained)** |
| Task reassigned / mentioned | ON | ON | OFF |
| Task due soon / overdue | ON | ON | OFF |
| Trivial task edits | OFF | optional | OFF |
| Sprint assigned / starting / ending / deadline / overdue-needs-attention | ON | ON | OFF (no "blocked" revival) |
| Meeting invitation | ON | ON | **ON (retained)** |
| Meeting rescheduled / cancelled | ON | ON | **ON (retained)** |
| Meeting reminder | ON | ON | OFF |
| Meeting action item assigned | ON | ON | OFF |
| Growth weekly status (Sunday; Monday only if changed) | ON | ON | OFF |
| Growth failure | ON | ON (locked) | optional |
| Growth weekly PDF/report | OFF | OFF | **ON (unchanged)** |
| Growth per-submission / per-host / metric change | OFF | OFF | OFF |
| ICPLC needs staff attention / assigned follow-up / program deadline / travel-documentation action | ON (T1) | ON | OFF |
| ICPLC bulk Mark Reviewed / Add Tag / Remove Tag / flight-not-required | **OFF** | OFF | OFF |
| ICPLC bulk assignment | ON to the assignee only (aggregated, T1) | ON | OFF |
| Existing intentional digests | OFF | OFF | **ON (retained)** |
| Security/system | ON (locked) | ON | as needed |

---

## 4. GROWTH PWA DESIGN (implement only after §5 certification)

Four independent concerns, none calling another: **sync · PDF/email · `growth-notify` · dispatcher.** `growth-notify` reads only `growth_runs` and the canonical week function.

### 4.1 Timing
| Point (ET) | Purpose | Notification behavior |
|---|---|---|
| Sun 8:50 PM | sync | none |
| Sun 9:00 PM | PDF + email | none |
| **Sun ~9:10 PM** | **primary status** | **Push + in-app** to super_admin + regional_secretary, only if `growth_runs` shows the Sunday sync **and** report both completed; otherwise the *failure* event instead. Counts from the canonical function for `R` (§5.2). |
| Mon 9:00 AM | catch-up sync | no scheduled push |
| **Mon ~9:10 AM** | catch-up evaluation | compare to Sunday's snapshot (`state_hash` of received/expected/outstanding). **Changed** (more received / outstanding decreased / now complete) ⇒ one `catchup` notification (push + in-app; completion uses the "ready" copy). **Unchanged & outstanding > 0** ⇒ no push; the existing in-app item is left as-is (D2 knob: optionally one in-app-only follow-up). **Unchanged & complete** ⇒ nothing. |

Sunday-night is chosen because the Sunday 8:50/9:00 jobs already define the lifecycle and your decision names Sunday as primary; Monday never repeats an identical status.

### 4.2 Canonical counts (single source)
One SQL function, e.g. `growth_week_summary(p_week date)` over `v_service_center_weekly_growth`, returns `expected` (all active centers, same as page Y), `received` (X), `flagged` (merged/did_not_meet), `outstanding`, and a `state_hash`. **Outstanding is defined by center status, not by arithmetic** — a center is outstanding when it has no report and no manual flag for the reporting week. Because the view labels the in-progress week `current` until Monday 00:00 (Toronto, once §5 fix applies), the function must count `missing` **and** `current` as outstanding when evaluated for the reporting week `R` at/after the Sunday sync point. Consumers (all must call it): Growth page header/tiles, weekly PDF/email body, push, in-app item, deep-link target. A parity test asserts page counts == function counts for fixture weeks (incl. flagged and inactive centers). Copy rules:
- outstanding = 0, X = Y → "This week's Growth Tracking is ready" / "35 of 35 reports received. Tap to review Growth Tracking."
- outstanding = 0, X < Y → same title / "33 of 35 reports received (2 merged or not meeting). Tap to review."
- outstanding > 0 → "Growth Tracking update" / "32 of 35 reports received this week. 3 still outstanding."
(Live data today: 11 active centers; the 35 in examples is illustrative.)

### 4.3 Idempotency
`growth_weekly_status:<week_start>:<stage>:<recipient>` with `stage ∈ {sunday, catchup}`; retries are no-ops; at most two notifications per recipient per week; device `tag` collapses an earlier notice with a later one. State comparison for Monday uses the persisted Sunday snapshot (`growth_runs` / snapshot row), not the notification text.

### 4.4 Deep link & payload
`/growth-tracking?week=<week_start>` for push and in-app. Counts only; no center names, no emails. 

### 4.5 Failure (separate)
Type `growth_report_failed`, category `growth`, high importance, super_admin + regional_secretary, dedupe `growth_report_failed:<week_start>:<job>:<recipient>`; push "Growth report needs attention / This week's Growth report could not be completed. Tap to review."; link `/growth-tracking`; **no** provider errors, stack traces, addresses, secrets, or internals; detail only in admin-readable `growth_runs.error_code`. Detected from `growth_runs` by the checker (no `sent` row by check time, `failed`, zero recipients, PDF missing) since pg_net is fire-and-forget. In-app not suppressible.

---

## 5. PREREQUISITE — GROWTH WEEK SEMANTICS CERTIFICATION
**Must pass before any Growth PWA work. Not part of the notification layer; a separate narrow Growth correctness fix. Do not deploy as part of this audit.**

### 5.1 Proof of defect (read-only, executed against the exact live SQL semantics)
Scope: Sunday 2026-10-04 (EDT), Sunday 2027-01-10 (EST), plus DST edges. "View/report week" = what the live view's `week_spine` latest week and `weekly-growth-report`'s default `weekStart` compute (UTC). "Intended" = the Toronto-local week being reported (Sunday stage: the week ending that Sunday; Monday stage: the week that just ended).

| Local (ET) | UTC | View latest week | Report fn week | **Intended week** | Cron guard fires |
|---|---|---|---|---|---|
| EDT Sun 8:49 PM | Mon 00:49 | 2026-10-05 | 2026-10-05 | **2026-09-28** | SYNC |
| EDT Sun 8:50 PM | Mon 00:50 | 2026-10-05 | 2026-10-05 | **2026-09-28** | SYNC |
| EDT Sun 9:00 PM | Mon 01:00 | 2026-10-05 | 2026-10-05 | **2026-09-28** | REPORT |
| EDT Sun 9:10 PM | Mon 01:10 | 2026-10-05 | 2026-10-05 | **2026-09-28** | — |
| EDT Sun 11:59 PM | Mon 03:59 | 2026-10-05 | 2026-10-05 | **2026-09-28** | — |
| EDT Mon 12:00 AM | Mon 04:00 | 2026-10-05 | 2026-10-05 | **2026-09-28** (closed week) | — |
| EDT Mon 9:00 AM | Mon 13:00 | 2026-10-05 | 2026-10-05 | **2026-09-28** | CATCHUP |
| EST Sun 8:49 PM | Mon 01:49 | 2027-01-11 | 2027-01-11 | **2027-01-04** | SYNC |
| EST Sun 8:50 PM | Mon 01:50 | 2027-01-11 | 2027-01-11 | **2027-01-04** | SYNC |
| EST Sun 9:00 PM | Mon 02:00 | 2027-01-11 | 2027-01-11 | **2027-01-04** | REPORT |
| EST Sun 9:10 PM | Mon 02:10 | 2027-01-11 | 2027-01-11 | **2027-01-04** | — |
| EST Sun 11:59 PM | Mon 04:59 | 2027-01-11 | 2027-01-11 | **2027-01-04** | — |
| EST Mon 12:00 AM | Mon 05:00 | 2027-01-11 | 2027-01-11 | **2027-01-04** | — |
| EST Mon 9:00 AM | Mon 14:00 | 2027-01-11 | 2027-01-11 | **2027-01-04** | CATCHUP |
| Fall-back Sun Nov 1 9:00 PM | Mon 02:00 | 2026-11-02 | 2026-11-02 | **2026-10-26** | REPORT |
| Spring-fwd Sun Mar 14 9:00 PM | Mon 01:00 | 2027-03-15 | 2027-03-15 | **2027-03-08** | REPORT |

**Result: defect CONFIRMED.** At every scheduled Sunday-evening and Monday-morning point, in EDT and EST, the view and the report function resolve to the **following** week — one week ahead of the week being reported — and the cron windows themselves fire correctly. Consequences: the Sunday 9 PM email/PDF (default `weekStart`) reports the new, empty week (all centers `current`, 0 attendance); the Growth page default ("latest" week) shows 0 / 11; a notification built on either would read "0 of 11 received". The UTC date flips at 8 PM ET during EDT and **7 PM ET during EST**, so the defect also begins before the 8:50 PM sync. Mid-week behaviour is currently *different* and also awkward: today (Thu 2026-10-01) the page default is the in-progress week 09-28 (0 reported, 11 `current`) while the meaningful latest reporting week is 09-21 (8/11 reported).
The sync itself is unaffected (it uses a rolling 14-day window); `weekly-growth-report` honors an explicit `body.week`, so past weeks can be regenerated correctly.

### 5.2 Intended single definition (proposal)
**Reporting week `R(t)`** = Monday of the **latest Sunday on or before `toronto_date(t)`** (America/Toronto, DST-safe). Examples: Thu 10-01 → 09-21; Sun 10-04 any time → 09-28; Mon 10-05 any time → 09-28; Sun 10-11 00:00 ET → 10-05. One function (e.g. `growth_reporting_week(p_at timestamptz default now())`) used by **every** consumer.

### 5.3 Proposed narrow fix (separate PR, not part of notifications)
1. Migration: replace both `CURRENT_DATE` uses in `v_service_center_weekly_growth` with the Toronto date (`(now() AT TIME ZONE 'America/Toronto')::date`) so `current`/`missing` and `week_spine` roll over at **Monday 00:00 ET**, not Sunday 8 PM/7 PM ET; add `growth_reporting_week()`.
2. `weekly-growth-report`: default `weekStart` = `growth_reporting_week(now())` (honor explicit `week`); compute label in Toronto.
3. Growth page: default selected week = `growth_reporting_week()` (replaces "latest in data"); read `?week=`.
4. Add `growth_week_summary()` (§4.2) and make the page tiles/PDF/email use it (parity test).
5. Tests: fixed-clock tests at all rows of §5.1 (EDT, EST, both DST transitions) asserting page default, view `current/missing`, report week, email week label, summary week, catch-up week and `?week=` resolve to the same `R`.
Open semantic point G1: during Sunday evening the unreported centers are `current` (honest until Monday 00:00 ET) but "outstanding" for the status notice; the summary function defines outstanding for `R` explicitly so the page, email, and notification agree.

### 5.4 Certification checklist (all must pass before Phase 5)
- [ ] §5.1 matrix reproduced by automated fixed-clock tests against the fixed code (EDT, EST, fall-back, spring-forward).
- [ ] Page default, view, PDF, email subject/body week, Sunday status, Monday catch-up and `?week=` resolve to the same week.
- [ ] `growth_week_summary` parity with the page for weeks with flags and inactive centers (e.g. 2026-09-07: 7 reported / 11 expected / 3 missing / 1 flagged).
- [ ] No DST double-send or skip (guards ±3 min remain correct).
- [ ] Dry-run of Sunday 2026-10-04 on a non-production path; production reviewed read-only the next morning.
- [ ] Sign-off recorded here.

---

## 6. GAP ANALYSIS
| Area | Current | Gap |
|---|---|---|
| Push security | anon-reachable, client-controlled content | Phase 0 |
| Reminder reliability | meeting/due-date/digest crons failing in prod | repair in Phase 0 |
| Cron credentials | 3 jobs hold literal keys | rotate + `app_setting()` |
| Devices | 1/user | `push_subscriptions` |
| Push default | per-type `mobile` rows | category defaults |
| Email | mirror | allowlist (§0.5) |
| Deep links | all `/inbox`; `?task=` not consumed; ICPLC drawer in-memory | link column + consumers (§2.6) |
| Dedupe | ad hoc | `dedupe_key` |
| Onboarding | timer toast, permanent dismiss | snooze + suppress setting |
| Growth week | UTC; next-week bug | §5 certification |
| Growth notice | none | §4 after certification |
| Sprint/meeting events | missing | emitters in Phase 4 |
| ICPLC | no producers; bulk = client writes | Phase 6, domain events only |

**Extend or new tables?** Extend `notifications` and prefs; add `push_subscriptions`, `growth_runs` (+ snapshot), nothing parallel.

---

## 7. LOGIN EXPERIENCE & SETTINGS
Eligibility each login (silent): supported · permission ≠ `denied` · no active subscription for **this** endpoint · not snoozed · user hasn't suppressed onboarding.
- **First eligible login:** value-first card → *Enable* triggers native permission (user gesture only) → register device → defaults ON. *Not now* → `snoozed_until = now+7d`. iOS Safari outside an installed PWA: Add-to-Home-Screen guidance instead.
- **Later logins:** valid subscription ⇒ nothing; expired ⇒ silent recovery; snoozed ⇒ wait; `denied` ⇒ never prompt natively; new device ⇒ offer for that device.
- **Settings:** this device (status, test, turn off), device list (revoke), category × channel matrix (locked rows for security/operational alerts), and **"Don't show Nexus notification onboarding"** toggle.

---

## 8. REMAINING IMPLEMENTATION SEQUENCE (nothing started)

1. **Phase 0 — Security & reliability.** Close S1 (§2.1); repair L1–L3; rotate/move L4. *(Needs: your sign-off to run production-repair migrations and to deploy the function.)*
2. **Phase 1 — Multi-device** `push_subscriptions`, backfill 12 rows, per-endpoint lifecycle.
3. **Phase 2 — Shared dispatcher:** metadata columns, `create_notification()`, templates/privacy tiers, link validation, dedupe, category defaults, email allowlist (preserve existing prefs), SW same-origin check.
4. **Phase 3 — Onboarding:** eligibility, 7-day snooze, suppress setting, denied/iOS guidance, endpoint reconcile.
5. **Phase 4 — Tasks/Meetings/Sprints migration:** global `?task=` consumer, meeting/sprint links, new emitters (task overdue, sprint start/end/deadline, meeting rescheduled/cancelled).
6. **GATE — GROWTH WEEK SEMANTICS CERTIFICATION (§5):** separate narrow PR, may be done in parallel with Phases 1–4 since it's independent; must complete before Phase 5. First real Sunday exposure: **2026-10-04** — worth deciding whether to ship the §5.3 fix before then (D1).
7. **Phase 5 — Growth PWA:** `growth_runs`, `growth_week_summary` parity, `growth-notify` (Sunday primary, Monday conditional), failure alert, `?week=`.
8. **Phase 6 — ICPLC operational notifications:** explicit domain events, T1 payloads, `?participant=` consumer, no table-trigger notifications.

Mapping to the broader PWA prompt series you supplied: Prompt 1 (PWA foundation/security audit) is **not yet run** and would also cover manifest/service worker/cache/offline/update/performance, which this audit only touches; Prompts 2–3 = Phases 0–2; 4 = Phase 3; 5 = mobile shell (not in this audit's scope); 6 = Phase 5 (**plus the §5 gate**); 7 = updates/offline/performance. Recommend Prompt 6 be preceded by the §5 certification prompt.

**Open decisions**
- **D1** Ship the §5.3 week fix before the first Sunday run (**2026-10-04**), or accept one more wrong-week email? (The Sunday email, once the new crons first fire, will likely report the empty next week.)
- **D2** Monday unchanged-but-incomplete: no push (recommended) vs one in-app-only follow-up vs one push follow-up.
- **D3** Email prefs migration: treat all existing rows as explicit (recommended) vs reset seeded `task_due_soon`/`daily_digest` rows.
- **D4** Authorize production-repair work for L1–L4 (crons, credential rotation) in Phase 0.
- **D5** Page default week: adopt `R(t)` (latest Sunday-anchored week) — confirm that leadership wants Thursday's page to show last week's results rather than the empty in-progress week.

---

## Appendix — evidence & files
Live: `cron.job`, `cron.job_run_details`, `pg_get_viewdef(v_service_center_weekly_growth)`, `pg_trigger` on `notifications`, aggregate counts, `functions list`, one anon-key probe (nonexistent recipient). Repo: `supabase/functions/send-task-push-notification`, `weekly-growth-report`, `growth-reports-sync`, `meeting-reminders`, `due-date-reminders`; migrations `20260912000000`, `20270804000015/24/48`, `20270927000003`, `20270928000002`, `20271001000004`; `src/lib/webPush.js`, `NotificationsPage.jsx`, `NotificationPermissionPrompt.jsx`, `pages/personal/MyTasks.jsx`, `components/layout/TopBar.jsx`, `ProtectedRoute.jsx`, `features/icplc/ICPLCContext.jsx`, `ICPLCPortal.jsx`, `hooks/useICPLCBulk.js`, `pages/growth/GrowthTrackingPage.jsx`, `App.jsx`, `public/service-worker.js`.
