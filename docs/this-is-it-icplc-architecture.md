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
All tables where `event_config_id IS NULL` are This Is It 2.0 historical records:

| Table | Historical record marker |
|-------|--------------------------|
| `registrations` | `event_config_id IS NULL` |
| `working_list` | `event_config_id IS NULL` |
| `roster` | `event_config_id IS NULL` |
| `event_payments` | `event_config_id IS NULL` |
| `tii_sessions` | `event_id` → TII event_configs row |
| `tii_attendance` | via `tii_sessions.event_id` |
| `tii_saved_reports` | (linked to sessions) |
| `registration_config` | shared key-value store (TII 2.0 keys) |

### Tables
All tables in the `registrations` domain; see **Shared Infrastructure** below.

### Migrations
All TII-specific migrations use a `tii_` prefix or reference `This Is It` in
their file names. The critical data-isolation migration is:

```
supabase/migrations/20260915000001_registration_event_config_id.sql
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
> **Historical This Is It 2.0 data must remain identifiable as TII 2.0 data forever.**
> Never make historical records appear as though they originated from ICPLC.

### Convention
```
event_config_id IS NULL   →  This Is It 2.0 historical record (pre-separation)
event_config_id = <uuid>  →  Record belonging to that specific event_configs row
```

### Migration
`20260915000001_registration_event_config_id.sql` adds `event_config_id` as a
nullable FK to `registrations`, `working_list`, `roster`, and `event_payments`.
Existing (all TII 2.0) records retain `NULL`.

### Write rule
Every insert into these tables must set `event_config_id`:
- TII 2.0 path: use `eventConfig?.id ?? null`
  (null when legacy config has no id; explicit TII id when it does)
- ICPLC path: always has a non-null `eventConfig.id` from `ICPLCConfigProvider`

### Source-of-truth for new events
When a new ICPLC event cycle begins, create a new `event_configs` row (via the
Settings tab inside `/icplc`) with its own UUID. All ICPLC records for that cycle
will carry that UUID. Historical TII records remain untouched.

---

## Isolation Rules

These things **must never happen**:

1. An ICPLC write is not filtered to TII's `event_config_id IS NULL` scope
2. A TII read is not filtered to ICPLC's `event_config_id`
3. A migration renames, deletes, or re-assigns existing `registrations` rows
   from TII to ICPLC
4. `RegistrationPage.jsx` receives ICPLC-specific display logic
5. `ICPLCPage.jsx` is used as the entry point for TII 2.0 historical access
6. The sidebar has only one of the two entries — both must appear for eligible roles

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

`src/tests/tii-icplc-separation.test.js` — 24 tests covering:
- Event filter resolution (NULL vs eq)
- TII historical data access (NULL filter)
- ICPLC data isolation (eq filter)
- Insert provenance stamping
- Cross-contamination guard

Run: `npm test -- src/tests/tii-icplc-separation.test.js --run`

---

## Revision History

| Date | Change |
|------|--------|
| 2026-09-08 | ICPLC forked from TII 2.0 (`cc9d63d`); TII moved from sidebar to Apps (`3701dd0`) |
| 2026-09-15 | TII sidebar entry restored; `event_config_id` FK added to data tables; separation tests written; this document created |
