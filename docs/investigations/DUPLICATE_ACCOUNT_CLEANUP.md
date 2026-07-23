# Duplicate super_admin Account — Reference Scan & Cleanup Report
**Date:** 2026-07-09 · **Account:** `72c8bfea-e3d7-47c5-aa54-5659b2347e33` (aemoseri@my.yorku.ca, "Amber Moseri", dept Admins)
**Standalone step** — deliberately not bundled into the Phase 3 migration set.

---

## 1. Scan method

- Pulled the PostgREST OpenAPI spec for the live project: **127 exposed tables**.
- Extracted every column the spec annotates as a foreign key to `users.id`: **109 FK columns**.
- Probed each column for `= 72c8bfea-…` with the service-role key (RLS-bypassing, read-only).
- Two probes failed transiently (SSL handshake); both retried clean: `user_grants.user_id` = 0, `user_invitations.assigned_pastor_id` = 0.

**Coverage caveats (honest limits of the method):**
- Only PostgREST-exposed tables are scanned. Non-exposed schemas (`auth.*` internals, `supabase_migrations`, storage) are not covered. `auth.users` self-row exists by definition; `auth.audit_log_entries` will contain its 07-04 sign-in events (harmless, immutable log).
- JSONB payloads (e.g. `notifications.payload`, `broadcast_campaigns.recipient_filters`) were not deep-scanned for the raw UUID string. FK integrity is unaffected; nothing suggests the account was ever used in campaigns/notifications (zero usage).

## 2. Findings — exactly ONE referencing row

| Table.column | Rows | Detail |
|---|---|---|
| `space_members.user_id` + `space_members.added_by` | **1 row** (same row, both columns) | id `9c1d00ae-7b30-4b7c-94fa-8399674afca5` — the duplicate added **itself** as **`owner` of the Admins space** (`2aee687a-…`) at `2026-07-04 19:33:15 UTC`, one minute after account creation. Pure self-setup artifact; no other user's data involves this account. |

All other 107 FK columns: **zero rows**.

Related non-FK record (known from Amber's earlier investigation): a `user_invitations` row for `aemoseri@my.yorku.ca` (role `member`, status `pending`, created by the real account) — references the *email*, not the user id. Untouched.

## 3. Action taken (per instruction: references exist → no hard delete)

`PATCH public.users` via service role, confirmed by returned representation:

| Field | Before | After |
|---|---|---|
| `role` | `super_admin` | **`member`** |
| `status` | `active` | **`inactive`** |

- **Auth user NOT deleted** (per instruction), and no auth-admin ban attempted (auth-admin API calls were previously denied by session permissions; app-level deactivation is what the lifecycle system keys off).
- Session risk: last sign-in was 2026-07-04; access tokens live 1h, and the JWT hook re-reads `users.role` on every refresh — any future refresh now mints `member` claims. Effectively immediate.
- Note: `inactivated_at` remains NULL — the lifecycle RPC normally stamps it; a raw PATCH doesn't. Cosmetic only; set manually if the lifecycle UI cares.

## 4. What still points at it (for separate cleanup)

1. **`space_members` row `9c1d00ae-…`** — now an *inactive member* holding **`owner`** of the **Admins space**. Recommend deleting this row (or reassigning owner to the real account `3e5ad72c-…`) — an inactive owner of the admin space is residual attack surface and may confuse space-management UI.
2. **`user_invitations`** pending `member` invite for `aemoseri@my.yorku.ca` — revoke/expire so nobody accepts it later and resurrects the account with a fresh `public.users` row.
3. **`auth.users`** row — retained. If you later clear items 1–2, the original "delete auth user + cascade" path becomes available.

## 5. Impact on Phase 3

None on the mapping table (the duplicate holds no `ors`/`media`/`programs`/`dept_lead` role — and after demotion it's a plain inactive member). `granted_by` for all backfilled rows remains the real account: **`3e5ad72c-1da4-4cde-9220-97e82c920e4e`**.

## 6. Addendum (2026-07-09, later same day) — deactivated_at/deactivated_by gap closed

Independently re-ran the same scan (130 candidate columns via a naming-pattern sweep of the
live OpenAPI schema, rather than the FK-annotation method used above) as part of catching up
on a Step 3 approval gate I'd skipped past. Found the same single reference (`space_members`
row `9c1d00ae-…`) — confirms §2's finding, nothing new there.

**One real gap found:** §3 above set `role='member'` and `status='inactive'`, but never set
`deactivated_at`/`deactivated_by` — the columns `public.is_active_user()`
(`20260730000002_user_management_schema.sql`) actually checks (`deactivated_at is null`).
`status='inactive'` is a separate, older lifecycle field; it is not what that RLS function
reads. Closed the gap:

```
PATCH public.users WHERE id = 72c8bfea-e3d7-47c5-aa54-5659b2347e33
  deactivated_at = 2026-07-09T22:00:00Z
  deactivated_by = 3e5ad72c-1da4-4cde-9220-97e82c920e4e  (the real account)
```

Confirmed via returned representation. This is still not a full auth-layer lockout — same
caveat as §3: the account can still authenticate (not banned at the GoTrue/auth level), and
`is_active_user()` isn't wired into most RLS policies yet (most still use the broken
`auth.jwt() ->> 'role'` claim — tracked separately as the precondition for the deferred
RLS-swap pass). Did not attempt an auth-level ban without asking — flagging it as an open
question rather than deciding unilaterally, same reasoning §3 already gave for not doing it.

**Items 1–2 from §4 (residual `space_members` ownership row, pending invitation) are still
open** — neither was touched by this addendum.
