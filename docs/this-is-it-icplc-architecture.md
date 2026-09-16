# This Is It 2.0 / ICPLC Architecture

## Overview

Nexus contains **two distinct event management systems** that must never be
conflated:

| System | Status | Route | Purpose |
|--------|--------|-------|---------|
| **This Is It 2.0** | Historical / preserved | `/registration` | 2026 BLW Canada national event; preserved for data posterity, reporting, and reference |
| **ICPLC** | Active / in development | `/icplc` | New revamped event system forked from TII 2.0; the system we actively redesign |

ICPLC was forked from This Is It 2.0 — it did not replace it.

---

## This Is It 2.0

### Purpose
- Preserve the complete operational history of the 2026 This Is It national event
- Provide read access to historical participants, records, attendance, and reports
- Serve as the reference implementation from which ICPLC was derived

### Historical Status
This Is It 2.0 remains **fully operational** (not read-only) as of September 2026.
Sprint teams from the 2026 event may still have active access for reporting.
If the 2026 TII event cycle is fully complete, a super_admin can mark it read-only
by deactivating the event config. Do not delete it.

### Route
`/registration` → `RegistrationPage.jsx` → `RegistrationEcosystem`

### UI indicator
A purple "Historical" badge appears at the top of the page to distinguish it
from ICPLC without making it appear broken or deprecated.

### Access
Role-based: `super_admin`, `regional_secretary`, `pastor`.
`RegistrationPage.jsx` performs its own fine-grained sprint team + permission checks.

### Data ownership
All records where `event_config_id = <tii_uuid>` (the active `event_configs` row for TII).

| Table | Ownership marker |
|-------|------------------|
| `registrations` | `event_config_id = <tii_uuid>` |
| `working_list` | `event_config_id = <tii_uuid>` |
| `roster` | `event_config_id = <tii_uuid>` |
| `event_payments` | `event_config_id = <tii_uuid>` |
| `tii_sessions` | `event_id` → TII event_configs row |
| `tii_attendance` | via `tii_sessions.event_id` |
| `tii_saved_reports` | (linked to sessions) |
| `registration_config` | shared key-value store (TII 2.0 keys) |

### Tables
All tables in the `registrations` domain; see **Shared Infrastructure** below.

### Migrations
The provenance migration sequence (applied 2026-09-15):

```
20260915000001_registration_event_config_id.sql   — adds nullable event_config_id FK
20260915000002_backfill_tii_event_config_id.sql   — backfills NULL → TII UUID
20260915000003_registration_event_config_not_null.sql — adds NOT NULL + RESTRICT FK
20260915000004_public_rpc_event_config_scope.sql  — scopes public RPC by event
```

---

## ICPLC

### Purpose
- New revamped event registration system for future BLW Canada international events
- Independently evolving from the TII 2.0 foundation
- Active development target for new features, workflow improvements, and UX redesign

### Route
`/icplc` → `ICPLCPage.jsx` → `RegistrationEcosystem` (with ICPLC config injected)

### Access
Role-based: `super_admin`, `regional_secretary`, `pastor`.
`ICPLCPage.jsx` performs sprint team checks against the ICPLC sprint (`%ICPLC%` pattern).

### Config isolation
`ICPLCPage.jsx` loads the ICPLC row from `event_configs` (by `event_name ILIKE '%ICPLC%'`)
and injects it via `ICPLCConfigProvider` → `EventConfigContext`.
`RegistrationEcosystem` reads `eventConfig.id` from context and scopes all queries to
`event_config_id = <icplc_id>`.

### Hidden tabs
The following TII-specific tabs are hidden for ICPLC via `ICPLC_HIDDEN_TABS`:
`overview`, `summary`, `tii-report`, `checkin`, `confirm`, `discipleship`,
`compliance`, `import`.

### Data ownership
All tables where `event_config_id = <icplc event_configs id>`.

### Future development
> **Rule:** New features, workflow improvements, UX changes, and dashboard redesigns
> for ICPLC go in `ICPLCPage.jsx` and ICPLC-specific components/hooks.
> Do NOT apply ICPLC-specific changes to `RegistrationPage.jsx` or to shared
> infrastructure unless both systems genuinely need the change.

---

## Shared Infrastructure

These layers are intentionally shared. Changes here affect both TII and ICPLC.

### `RegistrationEcosystem.jsx`
The core tabbed registration UI. Reused by both systems via `EventConfigContext`.
**Never add TII-specific or ICPLC-specific display logic here** — use `tab_config`
overrides or feature flags passed as props instead.

### `EventConfigContext.jsx`
Provides the active event config to all children. TII path loads the active
config (via `useEventConfig()`); ICPLC path overrides the context via
`ICPLCConfigProvider` in `ICPLCPage.jsx`.

### `RegistrationDataTab.jsx`, `RegistrationEditModal.jsx`, `SettingsTab.jsx`
Shared tab components. Safe to reuse. Do not hard-code TII or ICPLC assumptions.

### `RegistrationPublicPage.jsx`
Public registration form — currently TII-specific. When ICPLC needs a public
form, wire it through a separate route or an `event_config_id` query param.

---

## Data Lineage

### Invariant
```
TII_UUID   →  This Is It 2.0 record
ICPLC_UUID →  ICPLC record
NULL       →  INVALID (DB NOT NULL constraint rejects this since 2026-09-15)
```

> **NULL is not a valid event_config_id.** All historical TII records were
> backfilled with the explicit TII UUID on 2026-09-15. Code that treats NULL as
> TII ownership is a bug.

### Write rule
Every insert into `registrations`, `working_list`, `roster`, `event_payments` must
set `event_config_id` to the UUID from the active `EventConfigContext`:

```javascript
// CORRECT — explicit UUID from context
event_config_id: eventConfig.id

// WRONG — NULL-as-TII is permanently removed
event_config_id: eventConfig?.id ?? null
```

If `eventConfig.id` is absent, the write must be rejected before reaching the DB.
`RegistrationEcosystem` guards this: the data-load useEffect returns early and logs
an error if `eventConfig.id` is falsy.

### Source-of-truth for new events
When a new ICPLC event cycle begins, create a new `event_configs` row (via the
Settings tab inside `/icplc`) with its own UUID. All ICPLC records for that cycle
will carry that UUID. Historical TII records remain untouched.

---

## Isolation Rules

These things **must never happen**:

1. A write to the 4 registration-domain tables omits `event_config_id`
2. A read query uses `IS NULL` to scope to TII (use explicit eq filter instead)
3. A migration renames, deletes, or re-assigns existing `registrations` rows
   from TII to ICPLC
4. `RegistrationPage.jsx` receives ICPLC-specific display logic
5. `ICPLCPage.jsx` is used as the entry point for TII 2.0 historical access
6. The sidebar has only one of the two entries — both must appear for eligible roles
7. Code uses `eventConfig?.id ?? null` to produce a NULL fallback (remove it)

---

## Navigation

Both appear in the sidebar for `super_admin`, `regional_secretary`, `pastor`:

```
Apps           (trophy icon)
This Is It 2.0 (check-circle icon)  ← /registration
ICPLC          (plane icon)          ← /icplc
```

Both also appear as cards on `/apps`.

---

## Tests

`src/tests/tii-icplc-separation.test.js` — 21 tests covering:
- Event filter resolution (abort if no UUID, eq filter for named events)
- TII data access (explicit UUID scoping)
- ICPLC data isolation (eq filter)
- Insert provenance (no NULL writes; undefined → DB rejects)
- Provenance regression (NULL records invisible to all eq-filter queries)
- Cross-contamination guard (non-overlapping result sets)

Run: `npm test -- src/tests/tii-icplc-separation.test.js --run`

---

## RLS / Security Boundary

**`event_config_id` is application-level scoping, not an RLS security boundary.**

The four registration-domain tables use these RLS policies:

| Table | SELECT policy | Event isolation |
|-------|--------------|-----------------|
| `registrations` | role/grant-gated | application only |
| `working_list` | `using(true)` — any auth user | application only |
| `roster` | `auth.uid() is not null` | application only |
| `event_payments` | finance role/grant-gated | application only |

A user with a valid session token can query any event's rows directly via the
Supabase client or API, bypassing the `eq('event_config_id', ...)` filter that
`RegistrationEcosystem` applies. The UI prevents this; the DB does not.

TII and ICPLC have different authorized audiences (different sprint team members),
so cross-event access via a Supabase bypass is a real risk. Enforcing event
isolation at the RLS layer is deferred to the ICPLC branch because it requires
either RLS functions that inspect JWT claims for sprint membership, or explicit
grant tables — both are significant features outside this closure scope.

### registration_config shared-key contamination risk

`registration_config` is a key-value store scoped only by key name, not by
`event_config_id`. TII and ICPLC share the same table but use different keys for
their share tokens (`tii2_public_token` vs `icplc_public_token`). However:

- ICPLC's `rooms` tab is not hidden; saving ICPLC room assignments writes to the
  shared `room-assignments` key, overwriting TII's room layout.
- The ICPLC branch must either add event scoping to `registration_config` or hide
  the rooms tab until a separate key prefix per event is implemented.

---

## Revision History

| Date | Change |
|------|--------|
| 2026-09-08 | ICPLC forked from TII 2.0 (`cc9d63d`); TII moved from sidebar to Apps (`3701dd0`) |
| 2026-09-15 | TII sidebar entry restored; `event_config_id` FK added to data tables; NULL backfilled to explicit TII UUID; NOT NULL + RESTRICT constraint applied; NULL-as-TII logic removed from all code paths; separation tests rewritten; this document updated |
