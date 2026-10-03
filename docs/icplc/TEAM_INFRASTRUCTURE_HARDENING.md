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

## Expiry semantics (as found, not changed)
* `sprint_members.is_temporary` + `membership_end_date` (and `users.is_temporary`) exist. `sprint_team_members` has **no** expiry
  column (the `team_memberships … membership_end_date` UI in `SprintMemberPanel` reads a field that does not exist).
* No policy or authorization function reads `membership_end_date`; `is_temp_member_expired()` is only used by a notification trigger.
* Expiry is enforced out of band: the daily `deactivate-temp-sprint-members` job sets `users.status = 'inactive'`
  (it never touches `sprint_members`/`sprint_team_members`). Neither that status nor the end date is consulted by the ICPLC
  helpers (all SECURITY DEFINER), and no Auth ban is applied. So an expired temporary member keeps sprint- and team-derived
  ICPLC access at the database layer until their sessions end / the account is otherwise blocked in the app.
* **Open product decision** (not made here): is "account inactive" the intended boundary, or should expiry also stop sprint/team
  authorization? Characterization tests lock the current behaviour so any change is deliberate.

## Team deletion
`delete_sprint_team` deletes `sprint_team_members WHERE team_id = …` then the team. FK `team_id → sprint_teams ON DELETE CASCADE`.
Other teams of the same person are untouched (tested). It is a **no-op for a team whose `sprint_id` is NULL**. Prefer archive over
delete once a team has operational history: deletion removes the memberships and their audit context is only the activity_log rows.

## Multi-team mutation: lost updates (NOT fixed here — separate PR proposed)
`updateSprintMemberTeams(sprintId, userId, teamIds)` replaces a person's whole team set in a sprint with two non-transactional
statements (delete all, then insert). Proven with the real function:
* stale add: A+B, staff 1 adds C, staff 2 (stale A+B) adds D → **A+B+D, C silently lost**;
* stale remove: staff 2's stale view resurrects a membership staff 1 removed;
* single-row insert/delete (the model to move to) is safe under concurrency;
* between the delete and the insert a person has no team membership, which F1 reads as "no team" (generic direct-member arm).
Callers: `SprintMemberPanel` (add/remove chips), `SprintTeamPanel` (add/remove), `SprintModal` (creator). Recommendation: interactive callers
use atomic add/remove (`addTeamMember` / `removeTeamMember` already exist as single-row operations); keep replace-set only for a
deliberate reconciliation/import with a preview.

### Schema/code mismatch to verify against production (read-only) before that PR
The replace-set function, `addTeamMember` and `addSprintMember` insert `sprint_id` into `sprint_team_members` (code comments call it
NOT NULL), and `create_sprint_with_template` does the same. The migration chain never creates that column (a migration comment says
not to), so on a chain-built database those calls fail with PGRST204 *after* the delete. Also, user-JWT writes to `sprint_teams`
/ `sprint_team_members` hit `infinite recursion detected in policy` on the chain-built schema. Production probably differs from the
migration chain here. Verify (read-only): `select column_name, is_nullable from information_schema.columns where table_name='sprint_team_members'`
and the policies on both tables. The audit triggers are written to work either way (the sprint is read from the team).

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
