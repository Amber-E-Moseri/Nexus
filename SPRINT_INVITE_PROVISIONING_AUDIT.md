# Sprint Invite Provisioning Audit
**Date:** 2026-07-09 · **Scope:** "Invite member" (internal) and "Invite external member" flows — are users provisioned correctly when they sign in?
**Method:** code trace (frontend → edge functions → RPC → RLS) + live DB probes (read-only, plus one CHECK-probe that inserted nothing).

---

## TL;DR

- **Internal "invite member": OK.** Adds existing active users to a sprint with a valid role; they're already provisioned.
- **External "invite external member": BROKEN end-to-end (P0).** The invitee gets a working login but **never joins the sprint** — the sprint-membership insert fails a CHECK constraint, and their intended sprint role is discarded before that anyway. They land as a role=`member`, department=NULL, `pending_activation` account with no sprint.
- The **platform role** itself provisions correctly (`member`, valid under the new Phase 3 5-role CHECK, propagates into the JWT). The failure is in **sprint membership + activation state**, not the base role.

---

## Part A — Live provisioning facts (verified)

| Fact | Value | Source |
|---|---|---|
| External invitee `public.users.role` | `member` (DB column default; `add-sprint-member` omits role on upsert) | `add-sprint-member/index.ts:49-60` + initial-schema default |
| External invitee `status` | `pending_activation`, `is_temporary=true` | `add-sprint-member/index.ts:56-57` |
| External invitee `department_id` | `NULL` (never set) | same |
| `sprint_members.role` CHECK | `owner\|manager\|contributor\|viewer` — **`member` is rejected** | `20260723000000` + live probe returned `23514` |
| Live `sprint_members.role` distribution | `{owner: 7, contributor: 4}` | live query |
| `sprint_invite_tokens.metadata` column | exists live, but every row `null` | live query |
| Status→active flip after sprint invite | **none exists** | grep: only `/activate` (a different, non-sprint flow) flips status |

---

## Part B — The external invite flow, step by step

Live path (the one wired to the UI):
**`InviteExternalModal` → `inviteExternalToSprint()` → `send-sprint-invite` → email → `SignupInvite.jsx` → `create-invite-user` → `add-sprint-member`.**

1. **`send-sprint-invite`** receives `{email, name, role, membershipEndDate}` from the modal (role defaults to `contributor`)… then **persists none of them.** The token insert writes only `sprint_id, token, email, created_by` ([send-sprint-invite/index.ts:142-149](supabase/functions/send-sprint-invite/index.ts)). The `metadata` column stays null. → **Bug #2: intended role/name/end-date lost at the source.**

2. **`SignupInvite.jsx`** validates the token but selects only `id, sprint_id, expires_at, used_at` — it doesn't read `metadata` at all — and **hardcodes `setRole('member')`** ([SignupInvite.jsx:80](src/pages/auth/SignupInvite.jsx)). → **Bug #3: even if metadata existed, it's ignored; role is forced to the invalid value `member`.**

3. **`create-invite-user`** creates the auth user (`email_confirm: true`, no role in `app_metadata`). Fine on its own.

4. **`add-sprint-member`** upserts `public.users` (role omitted → defaults to `member`; `status='pending_activation'`, `is_temporary=true`), then inserts `sprint_members` with `role: body.role || 'member'` = **`member`** → **CHECK `sprint_members_role_check` violation (23514)** ([add-sprint-member/index.ts:68-76](supabase/functions/add-sprint-member/index.ts)). The function returns 400; `SignupInvite` shows *"Account created but failed to add to sprint"* ([SignupInvite.jsx:143](src/pages/auth/SignupInvite.jsx)).

### Net result of an external invite (P0)
- ✅ `auth.users` row — can log in
- ✅ `public.users` row — role `member`, `status='pending_activation'`, `is_temporary=true`, `department_id=NULL`
- ❌ **`sprint_members` row — never created (CHECK failure)**
- ❌ Token **not** marked used (mark happens only after the failed step) — a retry just fails identically
- **On sign-in:** they reach the dashboard as a `member`, can see the sprint *list* (`sprints_select` is `using(true)`), but **cannot open the sprint board** — that's gated by `is_sprint_member()`, and they have no membership row. They'd have to use "request access."

---

## Part C — The internal invite flow ("invite member")

**`SprintMemberPanel` → `getActiveUsers()` → `addSprintMember()`** ([sprints.js:523](src/features/sprints/lib/sprints.js)).

- `getActiveUsers()` lists only `status='active'` users → these already have accounts, roles, departments. **No provisioning needed.**
- `addSprintMember(..., role='contributor', ...)` inserts a `sprint_members` row with a **valid** default role. Client-side insert, gated by `sprint_members_write` RLS (caller must be able to manage the sprint).
- **Verdict: sound.** The only coupling to the bug above is that an external invitee stuck at `pending_activation` won't appear in `getActiveUsers()`, so you can't add them to *other* sprints this way.

---

## Part D — Secondary findings

- **P1 — External invitees are permanently `pending_activation`.** Nothing flips them to `active` (the `/activate` route serves the separate org-invitation flow, not sprint invites). Consequences: excluded from `getActiveUsers()` (assignee pickers, member panels), flagged `is_temporary=true` indefinitely.
- **P2 — `department_id` is NULL.** The platform base-role provisioning still works (JWT hook maps null dept to a safe value; role `member` is valid). But any legacy department-scoped RLS returns nothing for them — expected for a sprint-only guest, just worth stating.
- **P2 — `add-sprint-member` upsert can demote an existing user.** `onConflict: 'id'` rewrites `status='pending_activation'`, `is_temporary=true` unconditionally — re-inviting an existing active user via this path would knock them back to pending. Low likelihood (external emails), but unguarded.
- **P2 — Dead alternate path is a landmine.** `set-sprint-invite-password` (+ RPC `add_sprint_member_profile`) is not wired to any UI, and has two independent bugs: the RPC requires `auth.uid()` but is called with the service-role client (→ `auth.uid()` null → "Authentication required"), and it reads token `metadata` that the send step never writes. If anything is ever pointed at it, it will fail. Recommend deleting both.
- **P3 — Migration ordering bug.** `20260620000001_add_metadata_to_sprint_invite_tokens.sql` is dated ~2 months **before** the table's creation migration `20260820000001`. It's guarded with `IF EXISTS(table)`, so on a clean replay it **silently no-ops and the column is never added**. Live happens to have the column (applied out of strict order), but a rebuild-from-history would lose it and break any future metadata write.

---

## Part E — Minimal fix set (for a follow-up; nothing changed here)

Ranked by leverage:

1. **Unbreak the join (P0):** stop sending `member` as a sprint role. In `add-sprint-member` change the fallback `|| 'member'` → `|| 'contributor'`, and in `SignupInvite.jsx` stop hardcoding `role='member'`. One-line each; either alone stops the CHECK failure, but fix both.
2. **Preserve the inviter's chosen role (P1):** have `send-sprint-invite` write `{name, role, membership_end_date}` into `sprint_invite_tokens.metadata`, and have `SignupInvite` read it instead of hardcoding. (Column already exists live.)
3. **Activate on join (P1):** set `status='active'` (and clear/keep `is_temporary` per intent) when the sprint join succeeds, so guests aren't stuck.
4. **Guard the upsert (P2):** don't reset `status`/`is_temporary` on `onConflict` for a user who's already `active`.
5. **Delete the dead path (P2)** and **re-date/repair the metadata migration (P3).**

Note: sprint role (`owner/manager/contributor/viewer`) and platform role (`member` etc.) are different axes — none of the above changes the platform base role, which is already correct.
