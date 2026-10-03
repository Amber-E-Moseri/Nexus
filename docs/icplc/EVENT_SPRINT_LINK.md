# Event → sprint link (`event_configs.sprint_id`)

**Authoritative relationship.** `event_configs.sprint_id` (nullable FK → `sprints.id`, `ON DELETE SET NULL`) is the only
event→sprint link used for ICPLC authorization: the database (`icplc_event_sprint_ids()` and everything built on it) and
the `cmp-documentation-sync` / `cmp-flight-sync` Edge Functions.

- Cardinality: each event has **at most one** explicitly configured sprint. Several events *may* reference the same sprint
  (explicit super_admin choice; there is deliberately no unique constraint — one-event-per-sprint is not a Nexus domain
  invariant: configs are duplicated as drafts, archived and re-activated, and programs can share an organising sprint).
- `sprint_id IS NULL` ⇒ **fail closed**: no sprint-derived access (team, direct sprint member, CMP sync). Super admin,
  regional secretary and the Programs department are platform-level and unaffected. There is no pattern fallback.
- Cloning (`activate_event_from_template`, "save as template") copies `sprint_pattern` but **not** `sprint_id`; a new
  event starts unlinked and must be configured on its own sprint (regression-tested).
- `sprint_pattern` is legacy/discovery only. It never decides authorization.
- Membership stays a *set* over `sprint_team_members`; `sprint_members.sprint_team_id` no longer exists
  (`20270719000004_drop_sprint_team_id_column.sql`) and nothing depends on a primary team.

## Configuring (production sprint/team population is a separate, controlled phase)
```sql
-- candidates are suggestions only, never applied automatically
select ec.id, ec.event_name, s.id as sprint_id, s.name
from public.event_configs ec left join public.sprints s on s.name ilike ec.sprint_pattern
where ec.event_name ilike '%ICPLC%' order by 1, 4;
update public.event_configs set sprint_id = '<sprint uuid>' where id = '<event uuid>';
```
Before applying the PR #69 migrations in production, note that sprint-derived ICPLC access stays closed until this is set.

## Technical debt: UI still gates on `sprint_pattern`
`ICPLCPage.jsx`, `RegistrationPage.jsx`, `RegistrationEcosystem.jsx` and `scripts/check-reg-access.mjs` still resolve the
sprint with `sprints.name ILIKE event_configs.sprint_pattern` to decide whether to show a page. The database no longer
trusts that match, so this is **not a security bypass**: a user the pattern admits but `sprint_id` does not may reach the
page and receive no protected rows. Clean up (resolve via `sprint_id`, add an admin control to set it, surface "event has
no sprint configured") in the sprint/team configuration phase. `SettingsTab.jsx` / `EventConfigsPage.jsx` still edit
`sprint_pattern` and never write `sprint_id`, so saving settings cannot clobber the link.

## Verification
`src/tests/icplc/eventSprintLink.test.js` (stub Postgres) and `eventSprintLinkSupabase.test.js` (real Supabase: GoTrue +
PostgREST/RLS under user JWTs + both CMP Edge Functions under Deno) cover null-sprint, cross-event, multi-team, delete and
clone behaviour. They need a local Supabase (`ICPLC_REQUIRE_DB=1` makes absence a failure).
