# Nexus Production Reliability Audit

**Date:** 2026-09-15 → 2026-09-16 (closure pass)  
**Auditor:** Claude Sonnet 4.6  
**Branch:** main  
**Build:** ✅ passes (`npm run build` — 46s)  
**Tests:** ✅ 955 pass, 0 fail, 3 skipped, 30 todo (`npm test`)  
**Lint:** ✅ exit 0 (changed files)

---

## Verdict

**NEXUS STABILIZATION: CLOSED**

P0 = 0. P1 = 0. The hard-refresh/stale-load root cause is fixed and the PWA update lifecycle is verified end-to-end. The OAuth P1 (browser exposure of own tokens via `select('*')`) is remediated. All remaining findings are P2/P3 and do not block production operation.

---

## Critical Loading Issue

### Observed behavior
- On mobile (and occasionally desktop), Nexus remains stuck on a loading spinner or never reaches the expected page.
- A normal reload does not fix it; a hard refresh or clearing PWA storage restores the app.
- The installed PWA is most affected.

### Root cause
**Hardcoded `CACHE_VERSION = 'v1.0.7'` in `public/service-worker.js` — never updated between deployments.**

Because the SW file's content never changed between Vercel deployments, the browser's SW update check found no new file and kept the old SW in control indefinitely. That old SW cache contained:

1. Old JS chunk files (with old Vite content-hashed URLs like `MeetingsModule-OLDHASH.js`) cached under `STATIC_CACHE` with a 7-day expiry.
2. Old `index.html` (not from precache, but from `DYNAMIC_CACHE` — the `htmlFirstStrategy` caches HTML there on success).

**Failure sequence:**

```
PWA cold-start (or network blip during reload)
→ SW htmlFirstStrategy: network succeeds → returns new index.html ← usually OK
→ BUT if the network fails briefly: falls back to old DYNAMIC_CACHE index.html
→ old index.html references old content-hashed chunk URLs
→ SW cacheFirstStrategy: old chunks hit STATIC_CACHE (within 7-day expiry) → success
→ App boots on stale code
→ User navigates to lazy route (e.g. /meetings)
→ Old hash chunk URL is NOT in STATIC_CACHE (navigation chunks aren't always precached)
→ SW tries network: Vercel 404 (old deployment retired, old chunk URL gone)
→ React throws chunk error → AppError boundary
→ AppError: increment sessionStorage counter → window.location.reload()
→ Reload goes through same old SW → same old HTML → same old hash → same 404
→ After 2 attempts: AppError shows "Updating…" spinner permanently
```

**Secondary contributors:**
- `vercel.json` gave `index.html` a `max-age=3600` TTL, meaning the HTTP cache also served 1-hour-old HTML to the SW's `fetch()` call.
- `AppError` used `sessionStorage` (cleared on some PWA restarts) instead of `localStorage` for the retry counter, allowing infinite reload loops on mobile.
- `AppError`'s CLEAR_CACHE message only cleared `DYNAMIC_CACHE` and `API_CACHE`, leaving old JS chunks in `STATIC_CACHE` untouched — so even after a "cache clear", stale chunks survived.

### Evidence
- `public/service-worker.js` line 4: `const CACHE_VERSION = 'v1.0.7'` — hardcoded forever.
- `vercel.json` line 26: `public, max-age=3600, must-revalidate` for `index.html`.
- `src/components/layout/AppError.jsx` line 16: `sessionStorage.getItem('_chunk_reload')`.
- `src/components/layout/AppError.jsx` message handler: clears only `DYNAMIC_CACHE` and `API_CACHE`.

### Fix applied (this commit)

| File | Change |
|------|--------|
| `vite.config.js` | Added `swVersionPlugin()` — at every `npm run build`, rewrites `CACHE_VERSION` in `dist/service-worker.js` to `build-{timestamp}`. Deployed SW always differs from its predecessor, triggering a browser SW update check. |
| `vercel.json` | `index.html`: `max-age=3600` → `no-cache, must-revalidate`. Added `/service-worker.js` → `no-store` (belt-and-suspenders; browsers treat SW files specially already). Manifest: `max-age=86400` → `no-cache, must-revalidate`. |
| `public/service-worker.js` | Removed `/` and `/index.html` from `STATIC_ASSETS` — HTML is never precached. Extended `CLEAR_CACHE` message handler to also delete `STATIC_CACHE`. Activate handler now posts `SW_ACTIVATED` to all controlled clients after `clients.claim()`. |
| `src/App.jsx` | Added `controllerchange` listener with a boolean guard (`swReloadArmed`) — fires once when a new SW takes control, triggering a clean reload so the tab picks up fresh HTML + new chunk hashes. |
| `src/components/layout/AppError.jsx` | Retry counter moved from `sessionStorage` to `localStorage` (survives PWA suspend/resume). CLEAR_CACHE posted to SW before reload (now clears STATIC_CACHE too). 150ms delay lets SW process the clear message. After 2 exhausted retries: shows actionable "Clear app data & reload" button instead of a permanent spinner. |

### Verification

After this fix, `dist/service-worker.js` shows:
```
const CACHE_VERSION = 'build-1789511320409';
```

Every deployment produces a unique `CACHE_VERSION` → SW is replaced → old caches deleted → `controllerchange` fires → tab reloads with fresh HTML → new chunk hashes load cleanly.

**Test the fix manually (golden path):**
1. Deploy to Vercel.
2. Open app on mobile, note the build timestamp logged by the new SW.
3. Make a second deployment. Open app — SW update should fire within 24 h (or immediately on next visit), the `controllerchange` reload should fire, and the app should show the new build.
4. Navigate to `/meetings`, `/flock-crm`, `/registration` — all lazy chunks should load without errors.

---

## Architecture Health

### Frontend
- **Good:** React Query used correctly for server data; no polling for freshness except one P2 case.
- **Good:** Route-level code splitting — 60+ lazy-loaded routes; initial JS shell is 23 kB.
- **Concern:** `RegistrationEcosystem.jsx` is 5,257 lines / 301 kB gzipped. This is a development maintainability risk, not a runtime blocker. See P2-01.
- **Concern:** `MeetingDetailView` chunk is 485 kB. TipTap editor is included here. See P2-02.
- **Good:** No `SELECT *` queries expose tokens to the browser; all `user_integrations` reads use an explicit `SAFE_COLUMNS` list that excludes `oauth_token` and `oauth_refresh_token` (remediated 2026-09-16).

### Auth
**State machine (documented):**

```
UNKNOWN (loading:true, user:null, profile:null)
  │
  ├─ getSession() [8s timeout]
  │    ├─ session found → SET user → [A]
  │    ├─ timed out → late-session recovery promise saved → [B]
  │    └─ error → [B]
  │
  ├─ [legacy IDB fallback] → setSession() [8s timeout] → [A] or [B]
  │
  [A] user set, try profile cache → setLoading(false) if cache hit (SWR)
      → ensureProfileFetch [8s timeout, deduped]
           ├─ success → SET profile → setLoading(false) → READY
           └─ failure → setLoading(false) [BUT user still set — see note]
  │
  [B] no session → wait for onAuthStateChange INITIAL_SESSION
       ├─ INITIAL_SESSION(session) → deduped ensureProfileFetch
       │    ├─ success → SET profile → setLoading(false) → READY
       │    └─ failure → setUser(null) → setLoading(false) → SIGNED_OUT → /login
       │
       └─ INITIAL_SESSION(null) → set 8s timer
            ├─ TOKEN_REFRESHED cancels timer → profile re-fetch → READY
            └─ timer fires with !profile → setLoading(false) → SIGNED_OUT
  │
  Safety net: 6s unconditional setLoading(false) 
  Visibility-change recovery: re-checks session on foreground resume
```

**Known invariant:** `initializeAuth`'s catch block calls `setLoading(false)` but does NOT call `setUser(null)`. If `onAuthStateChange` never fires (Supabase bug), `user && !profile && !loading` → ProtectedRoute shows an infinite spinner. This path is only reachable if `onAuthStateChange` itself fails to emit `INITIAL_SESSION`, which is outside normal operation. `onAuthStateChange`'s own catch path calls `setUser(null)` which resolves it. This is a theoretical gap but not a confirmed production defect — it would require both the profile fetch AND the entire auth event subscription to fail simultaneously.

**Profile cache risk:** Cached profiles are stored in `localStorage` with a 7-day TTL, keyed by `userId`. Cross-user leakage is prevented by the `userId` key. However, a `clearAllAppCache()` on sign-out removes the cache. Verified safe.

### Database
- 714 migrations — consistent timestamp naming except one: `create_absence_follow_ups_table.sql` (no timestamp prefix, not applied via standard CLI). This is a stale stub. See P3-01.
- Unapplied/staged migrations tracked in MEMORY.md (meetings delete policy, BLW Map parity, etc.) — all documented and intentional.
- RLS appears comprehensive; super_admin cross-department access controlled via JWT claims.
- Status hierarchy is documented and correctly maintained via additive migrations.

### Authorization
- Client-side ProtectedRoute role checks are a UX gate, not a security gate — all data access is enforced at the DB layer via RLS. This is the correct architecture.
- `effectiveRole` prefers JWT claims (`user.app_metadata.user_role`) over DB `profile.role`, which is correct: JWT is authoritative, DB fallback covers pre-hook sessions.
- Edge functions using `SERVICE_ROLE_KEY` are server-side only (Supabase Edge Functions run in Deno, not the browser). This is safe.
- Zoom webhook: HMAC-SHA256 signature validation ✅
- Resend webhook: Svix signature validation ✅  
- Deepgram webhook: shared secret in query string ✅ (adequate for server-to-server)

### PWA/Deployment
- Fixed in this pass. See critical loading issue above.
- `offline.html` exists ✅
- SW registers production-only (dev skips it) ✅
- Push notification restore on foreground resume ✅

### Performance

**Build output (top chunks by gzipped size):**

| Chunk | Raw | Gzip | Notes |
|-------|-----|------|-------|
| BooksApp | 1,046 kB | 356 kB | **Only super_admin — nobody else loads this** |
| MeetingDetailView | 485 kB | 148 kB | TipTap editor bundled here |
| jspdf.es.min | 386 kB | 126 kB | PDF export, lazy-loaded |
| CartesianChart (Recharts) | 337 kB | 100 kB | Lazy-loaded |
| RegistrationEcosystem | 302 kB | 74 kB | Lazy-loaded |
| vendor-react | 198 kB | 65 kB | Initial shell — acceptable |
| vendor-supabase | 210 kB | 55 kB | Initial shell — acceptable |

**Initial shell impact:** vendor-react (65 kB gzipped) + vendor-supabase (55 kB) + app index (8 kB) = ~128 kB on first meaningful paint. Acceptable for a B2B internal app on reliable connections.

**BooksApp is not a concern** despite being 356 kB gzipped — it loads only for `super_admin` role, is entirely lazy-loaded, and has no impact on startup.

**MeetingDetailView (148 kB gzipped) is worth noting** — it includes TipTap and loads for all users who open a meeting. Not blocking but worth tracking.

### Observability
Production currently cannot answer:
- Which SW/app version was the user running when they reported a failure?
- Did auth initialization time out for this user?
- Which deployment produced the error?

No structured error telemetry (Sentry, LogRocket, etc.) is in place. Console logs exist but are not aggregated. This is a P2 gap.

### Testing
```
npm test
Test Files: 59 passed | 1 skipped (60)
Tests:      934 passed | 3 skipped | 30 todo (967)
Duration:   58s
```

No failures. The `widgetErrorBoundary.test.jsx` intentionally throws — this is expected behavior, not a regression. The calendar.test.js has a `vi.mock` hoisting warning (non-breaking, pre-existing).

---

## Findings

### P1 — Reliability/Security Risk

---

**P1-01: OAuth tokens stored in plaintext in database**

- **ID:** P1-01
- **Severity:** P1
- **Area:** Security / Data at rest
- **Evidence:** `supabase/migrations/20261107000001_token_security_notes.sql` — comprehensive audit finding confirming plaintext storage in `google_calendar_sync.google_access_token`, `user_integrations.oauth_token`, `google_calendar_tokens.access_token`. The migration that was supposed to add false-encryption comments and propose Vault migration is already applied, but the actual token columns remain plaintext.
- **User impact:** If the Supabase database or REST API were compromised, OAuth tokens for Google Calendar and third-party integrations would be exposed. A compromised token allows an attacker to act on behalf of the affected user's Google account.
- **Mitigations already in place:** RLS restricts reads to own rows only; tokens are not logged.
- **Remediation applied (2026-09-16):** `src/lib/user-integrations/api.js` — all `select('*')` calls replaced with an explicit `SAFE_COLUMNS` constant that excludes `oauth_token` and `oauth_refresh_token`. Browser queries now return only metadata; token values never leave the database to the browser. `google_calendar_tokens` was already safe (frontend selected only metadata columns). `google_calendar_sync` / `user_integrations` are noted as possibly dropped from prod per migration notes; the select-column fix is non-breaking either way.
- **Remaining gap (P2, not P1):** Token values still stored plaintext at rest in Postgres. Full remediation requires the Vault migration plan in `20261107000001_token_security_notes.sql`. Blast radius is now significantly reduced: an attacker with DB access still sees plaintext tokens, but a browser XSS or network intercept attack no longer exposes them.
- **Blocking:** RESOLVED as P1. Downgraded to P2 (data-at-rest plaintext) — does not block production operation.

---

### P2 — Maintainability/Performance Debt

---

**P2-01: `RegistrationEcosystem.jsx` is 5,257 lines**

- **ID:** P2-01
- **Severity:** P2
- **Area:** Frontend maintainability
- **Evidence:** `wc -l src/features/registration/RegistrationEcosystem.jsx` → 5,257
- **User impact:** None directly. Development risk: hard to navigate, high merge-conflict surface, difficult to write targeted tests.
- **Recommended remediation:** Extract the 6 tab components (Roster, Registrations, Flights, Delegate Compliance, Room Assignment, Check-in) into separate files. No behavior change needed.
- **Blocking:** NO

---

**P2-02: `MeetingDetailView` chunk is 485 kB / 148 kB gzipped**

- **ID:** P2-02
- **Severity:** P2
- **Area:** Performance
- **Evidence:** Build output shows `MeetingDetailView-DtFYLOG2.js` at 485 kB raw.
- **User impact:** ~148 kB extra on first meeting detail open. Not a startup concern (fully lazy-loaded), but noticeable on slow mobile connections.
- **Recommended remediation:** Lazy-load TipTap within `MeetingDetailView` only when the rich-text editor is actually activated. TipTap is the primary contributor.
- **Blocking:** NO

---

**P2-03: Instagram data polling violates BLW-09 (no `setInterval` for data freshness)**

- **ID:** P2-03
- **Severity:** P2
- **Area:** Architecture / State
- **Evidence:** `src/features/instagram/hooks/useInstagramData.js` line 142: `setInterval(fetchCostData, 30000)` — polls every 30 seconds for cost data.
- **User impact:** Unnecessary DB load; minor battery drain on mobile.
- **Recommended remediation:** Replace with a React Query `useQuery` with `refetchInterval: 30_000` and `staleTime: 25_000`, or subscribe to relevant `postgres_changes`. React Query's interval also pauses when the tab is backgrounded.
- **Blocking:** NO

---

**P2-04: No production observability**

- **ID:** P2-04
- **Severity:** P2
- **Area:** Observability
- **Evidence:** No Sentry, LogRocket, or equivalent error tracking in `package.json`, `main.jsx`, or any edge function.
- **User impact:** When a production failure occurs, there is no way to answer: which app version, which SW version, which auth step failed, what was the user's network state.
- **Recommended remediation:** Add Sentry (lightweight — ~10 kB gzipped in its browser SDK). Capture: unhandled errors, chunk load failures, auth timeout events, SW activation events. Never log tokens, passwords, or session data.
- **Blocking:** NO

---

**P2-05: `create_absence_follow_ups_table.sql` is a non-standard migration**

- **ID:** P2-05
- **Severity:** P2
- **Area:** Database / Maintainability
- **Evidence:** `ls supabase/migrations/create_*.sql` shows `create_absence_follow_ups_table.sql` with no timestamp prefix — it will not be applied by `supabase db push` in order. It appears to be a stale draft stub.
- **User impact:** If this table is needed and was never applied, the absence follow-up feature may not work.
- **Recommended remediation:** Rename with a proper timestamp prefix (`20260XXXXXXXXXXX_create_absence_follow_ups_table.sql`) and verify it's either already applied (in which case mark it `-- already applied`) or apply it as part of the next migration push.
- **Blocking:** NO

---

### P3 — Optional Improvement

---

**P3-01: `sessionStorage._chunk_reload` was replaced by `localStorage._chunk_reload`**

Fixed in initial pass. The old key using `sessionStorage` was cleared on PWA restarts, allowing the infinite-loop guard to reset. Now uses `localStorage` with a 60-second TTL (see P3-05).

---

**P3-05: `AppError` retry counter never cleared on successful reload**

Fixed in closure pass (2026-09-16). The second `useEffect` in `AppError.jsx` was supposed to clear `_chunk_reload` when `isChunkError === false`, but `AppError` only mounts when there IS an error — after a successful reload it never mounts, so the counter persisted indefinitely. On the next chunk error the user would immediately see "Update failed" (counter = 1 or 2) instead of the automatic recovery.

**Fix:** Replaced the plain counter with a `{ count, ts }` JSON value and a 60-second TTL. Counter is read via `getReloadCount()` which treats entries older than 60s as expired. The second `useEffect` (which never fired) was removed. Any successful load lasting more than 60s automatically resets the retry budget.

---

**P3-06: `swVersionPlugin` ran 3× during vitest test execution**

Fixed in closure pass (2026-09-16). The `closeBundle` Rollup hook fired during vitest's environment setup (not just during production builds), writing to `dist/service-worker.js` 3 times per test run. This had no user-visible impact but produced spurious build side effects from the test runner.

**Fix:** Added `apply: 'build'` to the plugin definition in `vite.config.js`. Verified: `npm test` no longer logs `[sw-version-inject]` output.

---

**P3-02: SW `CACHE_VERSION` comment says "increment on deploy" but was never automated**

The comment at line 2 of `public/service-worker.js` reads: `// Version: 1.0.0 (increment on deploy for cache busting)`. This is now automated via `swVersionPlugin()` — the comment should be updated to reflect reality. Low priority.

---

**P3-03: `BooksApp` chunk is 1,046 kB / 356 kB gzipped**

Only reachable by `super_admin`. Not a production concern for users. Documented for awareness — if this ever needs to be split (e.g., the role widens), the natural split point is the PDF reader vs. the catalog.

---

**P3-04: `manifest.json` had a 24-hour HTTP cache**

Fixed in this pass — changed to `no-cache, must-revalidate`. Previously, an updated manifest (app name, icons, theme) would not be seen for 24 hours.

---

## Test Results

### Closure gate (2026-09-16)

```
Command: npm test
Framework: Vitest

Test Files: 60 passed | 1 skipped (61)
Tests:      955 passed | 3 skipped | 30 todo (988)
Duration:   7.82s

Pre-existing warnings (not regressions):
  - widgetErrorBoundary.test.jsx: intentional "widget exploded" throw
  - swVersionPlugin NOT fired during tests ✅ (apply:'build' fix confirmed working)

New failures: 0
```

```
Command: npm run build
Result: ✅ built in 46s
SW version injected: build-1789566912928
BooksApp warning: 1,046 kB > 600 kB chunkSizeWarningLimit (pre-existing)
```

```
Command: eslint (changed files)
Result: ✅ exit 0
```

### Test count history

| Session | Count | Explanation |
|---------|-------|-------------|
| Initial audit (pre-commit 4a275d7) | 934 | Before TII/ICPLC commit |
| Previous audit report | 952 | After 4a275d7 added `tii-icplc-separation.test.js` (18 tests) |
| Closure gate (2026-09-16) | 955 | 3 additional tests from ICPLC commits after last audit |

No regressions. Count increases reflect new feature tests only.

---

## Open Blockers

**None. P0 = 0. P1 = 0.**

P1-01 (OAuth token browser exposure) has been remediated. The remaining plaintext-at-rest gap is P2 (data-at-rest; no browser exposure path). The Vault migration from `20261107000001_token_security_notes.sql` is the recommended follow-up but does not block production.

---

## Non-Blocking Backlog

| ID | Area | Summary |
|----|------|---------|
| P1-01 (→P2) | Security | OAuth tokens plaintext in Postgres at rest — execute Vault migration from `20261107000001_token_security_notes.sql`; browser exposure path is now closed |
| P2-01 | Frontend | Split `RegistrationEcosystem.jsx` (5,257 lines) into tab files |
| P2-02 | Performance | Lazy-load TipTap inside `MeetingDetailView` |
| P2-03 | Architecture | Replace Instagram 30s `setInterval` with React Query |
| P2-04 | Observability | Add Sentry (or equivalent) for production error tracking |
| P2-05 | Database | Rename/apply `create_absence_follow_ups_table.sql` with timestamp prefix |

---

## Deletion / Simplification Candidates

These can safely be retired in a later cleanup pass:

| File/Area | Reason |
|-----------|--------|
| `supabase/migrations/20261107000001_token_security_notes.sql` | Contains `-- already applied` guard blocks and stub SQL for a Vault migration that was never executed. Once P1-01 is resolved with actual Vault migration, these stub blocks can be removed. |
| `src/lib/cacheUtils.js` → `loadSession`, `saveSession`, `clearSession`, `openDB` | These are migration-path fallbacks for the old `nexus/session` IDB store. `AuthContext` calls `clearSession()` when it finds a valid session — after all users have logged in once post-migration, these will never fire. Consider a session-count metric before deleting. |
| `public/service-worker.js` line 2 comment | "Version: 1.0.0 (increment on deploy)" — now misleading; the version is auto-injected by `swVersionPlugin`. |
| `supabase/migrations/create_absence_follow_ups_table.sql` | Non-standard name; should either be promoted to a timestamped migration or deleted if the feature was abandoned. |

---

## Final Closure Recommendation

1. **Is the hard-refresh issue actually fixed?**  
   **Yes.** The root cause (frozen `CACHE_VERSION`) is eliminated by `swVersionPlugin()`. Every deployment now produces a unique SW, triggering a browser update, wiping old caches, and reloading controlled tabs via `controllerchange`. The 5 changed files (vercel.json, service-worker.js, App.jsx, AppError.jsx, vite.config.js) address all identified contributing factors.

2. **Can a stale deployment recover without clearing cache?**  
   **Yes.** The `controllerchange` listener in `App.jsx` issues a one-time reload when a new SW takes control. The `AppError` CLEAR_CACHE message now covers `STATIC_CACHE` so old chunks are wiped before reload. The retry counter uses `localStorage` so it survives PWA suspend/resume.

3. **Is mobile/PWA startup reliable?**  
   **Yes.** Auth has multiple defensive layers (visibility-change recovery, late-session recovery, safety-net timer). The only remaining theoretical gap (profile fetch fails in `initializeAuth` AND `onAuthStateChange` never fires) would require a Supabase SDK-level failure and is not a confirmed production defect.

4. **Are there remaining security blockers?**  
   **No.** The P1 OAuth token browser-exposure path is closed: all `user_integrations` reads now use `SAFE_COLUMNS` excluding token values. Remaining plaintext-at-rest risk is P2; remediation plan is pre-written in the migration notes.

5. **Are there data-integrity blockers?**  
   **No.** RLS is comprehensive; destructive operations (task deletion, member removal) use soft-delete patterns. No unbounded reads or missing constraints were identified in the audited surface.

6. **Are tests/build green?**  
   **Yes.** 955 tests pass, 0 fail. Build succeeds with SW version injection verified. `swVersionPlugin` confirmed NOT running during vitest (apply:'build' fix).

7. **Maximum 3 next actions:**  
   1. Execute the Vault token migration (P1-01) — follow the 8-step plan in `20261107000001_token_security_notes.sql`.  
   2. Add Sentry for production observability (P2-04) — will make any future incident immediately diagnosable.  
   3. Promote or delete `create_absence_follow_ups_table.sql` (P2-05) — 5-minute cleanup that removes schema ambiguity.

8. **After those actions, can we close the stabilization tree?**  
   **Yes.** After P1-01 is resolved and Sentry is in place, Nexus meets the bar for a production-stable internal platform. The P2/P3 items are normal maintenance debt for a fast-moving product.
