-- ============================================================
-- PHASE 3 (4/5) — Shrink users.role CHECK to the 5 base roles
-- ============================================================
-- MUST run after 20261215000002_phase3_backfill_space_roles.sql.
-- Before that backfill, the only 'ors'-role user (Amber 2) would
-- violate this narrower constraint; the backfill flips her to
-- 'member' first. No live user currently holds 'media' or 'programs'
-- (PHASE3_AUDIT.md §6), so they need no equivalent flip.
--
-- 'ors', 'media', 'programs' remain valid space_roles.role values
-- (that table has no CHECK tying it to this list) — they simply stop
-- being valid users.role values, matching the locked design: those
-- three are space roles only, never base roles.
--
-- users.role is `text` with a CHECK constraint, not the `user_role`
-- enum (verified live in PHASE3_AUDIT.md §1 — a bogus-value probe
-- returned an empty result set, not a Postgres enum error). The
-- untracked `user_role` enum type is unaffected by this migration and
-- is not used by users.role.
-- ============================================================

do $$
begin
  if exists (
    select 1 from public.users
    where role not in ('super_admin', 'dept_lead', 'pastor', 'regional_secretary', 'member')
  ) then
    raise exception 'Phase 3: users.role CHECK shrink would violate existing data — run the backfill migration first';
  end if;
end $$;

alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in (
    'super_admin',
    'dept_lead',
    'pastor',
    'regional_secretary',
    'member'
  ));

comment on constraint users_role_check on public.users is
  'Phase 3 (2026-07-09): shrunk from 8 to 5 values. ors/media/programs are now space_roles-only — see has_space_role(). dept_lead remains a valid base-role value but is a label only; its authority comes from a space_roles row, not from holding this base role.';
