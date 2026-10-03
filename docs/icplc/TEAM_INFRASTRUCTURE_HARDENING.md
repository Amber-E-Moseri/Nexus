# ICPLC Sprint/Team infrastructure hardening (pre-population)

Scope: make the existing Sprint/Team machinery safe enough to populate ICPLC afterwards. No ICPLC sprint, team,
membership or `event_configs.sprint_id` is created or changed by this work; configurable visibility / F4 is not started.

## What this change does
| Area | Change |
|---|---|
| Archived teams | One shared helper `icplc_event_team_memberships()` ignores `sprint_teams.is_archived` for every grant (read / write / import, the zero-argument helpers and both CMP Edge Functions). Memberships are never removed by archiving. |
| Generic-member fallback | `icplc_has_event_team_membership()` still counts *archived* memberships, so archiving a restrictive team (e.g. Finance) can never widen someone's access via the generic direct-member arm. |
| Pattern-based leftovers | The zero-argument `icplc_can_*()` / `icplc_is_sprint_member()` helpers resolved sprints by `sprint_pattern ILIKE`; they now delegate to the event-scoped helpers (explicit `sprint_id`). |
| Cross-event RPC gaps | `icplc_resolve_unmatched_row` and `icplc_backfill_participants_from_import` (SECURITY DEFINER) were gated only by the any-event helper, so a writer of one event could act inside another's batch (and backfill every event). Both now authorize for the batch's own event; a NULL batch needs a platform role. |
| Audit | `activity_log` rows (database triggers) for team member added/removed, team created/deleted/archived/unarchived/moved, and every change of `event_configs.sprint_id`. |

## Expiry and inactive accounts (decided and implemented)
Decision: an expired temporary sprint membership must not keep granting sprint- or team-derived ICPLC access, and authorization
must not wait for the daily clean-up job.
* `sprint_members.membership_end_date` is a **DATE**; expired = `is_temporary AND membership_end_date <= current_date` (end date
  inclusive) - the same predicate as `is_temp_member_expired()` and the daily job, so nothing was reinterpreted.
* One canonical set of helpers (`20271005000003`): `sprint_membership_is_expired`, `sprint_member_is_expired`, `is_active_account`
  (`users.status = 'active'`), `is_active_sprint_member`, and the single shared team source `icplc_event_team_memberships_for`
  that every ICPLC team decision (RLS helpers **and** both CMP Edge Functions, via `icplc_user_team_can_write`) now uses.
* Direct sprint-member arm: needs an active sprint membership. Team arm: needs the team row, an active account, and that the
  person's sprint membership is not expired. A team-only member (no `sprint_members` row) is not blocked: absence is not expiry.
* Team rows are never deleted/changed by expiry; renewing (later end date, or non-temporary) restores access.
* Any non-`active` status (inactive, archived, invited, pending_activation) loses sprint/team-derived ICPLC access.
* Unchanged on purpose: platform roles, the Programs department, the service role, the generic `is_sprint_member()` used across
  Nexus. **Group Pastor** access is participant-derived, and now (`20271005000005`) also requires an active account: only the two
  policy arms that GRANT a GP read (participants, participant tags) use `icplc_gp_has_active_access()`; `icplc_gp_is_authorized()` is
  unchanged because it is also used as a RESTRICTION (no GP writes/imports). The participant row is never altered by account status;
  reactivation restores access while the relationship is valid; duplicate/ambiguous GP mappings still fail closed.
* The helpers that take an explicit user id are service-role only, so signed-in users cannot probe other people's access.
* Consequence worth knowing before population: newly invited people (`invited` / `pending_activation`) have no ICPLC
  sprint/team access until their account is `active`.

## Team deletion
`delete_sprint_team` deletes `sprint_team_members WHERE team_id = …` then the team. FK `team_id → sprint_teams ON DELETE CASCADE`.
Other teams of the same person are untouched (tested). It is a **no-op for a team whose `sprint_id` is NULL**. Prefer archive over
delete once a team has operational history: deletion removes the memberships and their audit context is only the activity_log rows.

## Multi-team mutation: lost updates (fixed)
The old replace-set `updateSprintMemberTeams` (delete everything, then insert the caller's list) lost concurrent changes (A+B, staff 1
adds C, staff 2 on a stale view adds D -> A+B+D) and resurrected removed memberships (proven; the algorithm is kept as a model in the
test). It is **removed**. `20271005000004` adds `add_sprint_team_member`, `remove_sprint_team_member` (single relationship, idempotent,
sprint-validated, audited once, SECURITY DEFINER with an explicit manager check like `delete_sprint_team`, deliberately narrower than the
table policy) and `reconcile_sprint_member_teams` (one transaction, per-person lock, refuses stale `expected` state, for deliberate bulk
use only). Callers: `SprintMemberPanel` (add/remove chips) and `SprintTeamPanel` (add/remove) and `SprintModal` (creator joins the new
team) were all single add/remove interactions and now use the atomic operations; `addSprintMember` and `addTeamMember` add one team at a
time. No caller needed replace-set. Real concurrent RPC tests: add/add, remove/add, six racing adds, mixed removes/adds all converge.
The migration contains a temporary drift shim: if a database has a `sprint_id` column on `sprint_team_members` it is filled from the team
(the column is never created or required).

## Production schema comparison: NOT DONE (no production access from this environment)
Run `docs/icplc/drafts/production_schema_readonly_inspection.sql` (SELECT-only catalog queries, no user data) against production and
compare. Until then these are the **migration-chain** facts and the open questions:
| Object | Migration-chain schema | Production | Match? |
|---|---|---|---|
| `sprint_team_members` columns | id, team_id, user_id, role, joined_at (no sprint_id; a migration comment says never add it) | unverified | ? |
| App code / RPCs inserting `sprint_id` into it | `addTeamMember`, `addSprintMember`, `create_sprint_with_template` still assume it | unverified | ? |
| RLS: user-token read/write of `sprint_teams`, `sprint_team_members` | fails with 42P17 (recursion) | unverified | ? |
| RLS: user-token read of `departments`, `users`, `tasks`, `activity_log` | fails with 42P17 | unverified | ? |
The feature works for real users in production, so production's policies very likely differ from the chain. That is repo-wide drift (not
ICPLC-specific); the cycles and a draft fix are in `docs/icplc/drafts/policy_recursion_fixes_DRAFT.sql` and are deliberately NOT migrations:
re-creating policies from the chain's definitions could overwrite production fixes.

## Bulk population (design only; additive by default)
Input: rows of `{ person identity (email / nexus user id), sprint, teams[] }` (one person may appear in several rows or carry a team array).
Dry-run classification per (person, team): `matched_user` · `needs_account_invite` · `ambiguous_identity` · `conflicting_identity` ·
`invalid_sprint` · `invalid_team` · `duplicate_in_input` · `already_assigned` · `new_membership` · `removal_requested`.
Rules: default mode is **additive** (absence from the input never removes anything); removals only as explicit rows or a deliberately
selected `reconcile` mode that shows the full removal list first; apply is idempotent, per-membership (never replace-set), runs in one
transaction, and every change is audited with a shared batch id; nothing is applied unless the dry-run has no `ambiguous`/`invalid` rows.

## Activation order (production; not executed)
1. #69 + this PR's migrations deployed; the ICPLC event keeps `sprint_id = NULL` (sprint-derived access fails closed).
2. Create/identify the sprint → create teams → review → add sprint members → add 0/1/many team memberships.
3. Verify the membership report and the audit history; run the authorization matrix against the populated structure.
4. Set `event_configs.sprint_id` explicitly; verify live authorization again.
5. Only later: configurable visibility / F4.
Until step 4 an incomplete structure grants nothing sprint-derived (tested: `eventSprintLinkSupabase`, `teamInfrastructure`).
