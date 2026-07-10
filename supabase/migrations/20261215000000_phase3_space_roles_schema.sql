-- ============================================================
-- PHASE 3 (1/5) — Unified Space Roles: schema
-- ============================================================
-- Creates the three tables the permission revamp is built on.
-- Does NOT touch users.role — the CHECK-constraint shrink to 5 base
-- roles is a separate, later migration (20261215000003) that must run
-- AFTER the backfill (20261215000002), per PHASE3_AUDIT.md §7.2:
-- shrinking the CHECK before the one live 'ors' user is flipped to
-- 'member' would violate the constraint against live data.
--
-- role_permissions did NOT previously exist on the live database
-- (PHASE3_AUDIT.md §2) — the two 2026-09/10 migrations that were meant
-- to create and seed it were never applied. This file creates it fresh.
-- Per the audit's recommendation, role is `text` (not the untracked
-- `user_role` enum) with an explicit role_scope column distinguishing
-- base roles from space roles, so a base role and a space role can
-- never silently collide on the same string.
-- ============================================================

-- ─── 1a. role_permissions ──────────────────────────────────
-- The base-role × space-role permission matrix. role_scope='base' rows
-- apply org-wide by holding that users.role value. role_scope='space'
-- rows apply only where the user additionally holds that role in a
-- specific space via space_roles (see 20261215000002_...).

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  role_scope text not null check (role_scope in ('base', 'space')),
  permission_key text not null,
  enabled boolean not null default true,
  description text,
  is_baseline boolean not null default true,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role, role_scope, permission_key)
);

create index if not exists idx_role_permissions_role on public.role_permissions(role, role_scope);
create index if not exists idx_role_permissions_permission_key on public.role_permissions(permission_key);
create index if not exists idx_role_permissions_category on public.role_permissions(category);

alter table public.role_permissions enable row level security;

create policy "role_permissions_select_authenticated" on public.role_permissions
  for select
  using (auth.uid() is not null);

create policy "role_permissions_write_super_admin" on public.role_permissions
  for all
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- ─── 1b. space_roles ────────────────────────────────────────
-- Replaces the dead `users.feature_roles` JSONB (confirmed empty for
-- every live user — PHASE3_AUDIT.md §5) as the actual mechanism for
-- "this user holds role R in space S". A user can hold different roles
-- in different spaces; nothing here implies cross-space inheritance.

create table if not exists public.space_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  space_id uuid not null references public.departments(id) on delete cascade,
  role text not null,
  granted_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, space_id, role)
);

create index if not exists idx_space_roles_user on public.space_roles(user_id);
create index if not exists idx_space_roles_space on public.space_roles(space_id);

alter table public.space_roles enable row level security;

-- Deliberately conservative for this pass: a user can see their own
-- grants, super_admin sees/manages everything. Space-manager
-- self-service (e.g. an ORS lead granting ORS to a teammate without
-- going through super_admin) is a has_space_role()-dependent policy —
-- introducing it here would be circular (space_roles RLS depending on
-- a function that itself reads space_roles for a *different* user).
-- That widening is left to the deferred RLS-swap pass once
-- has_space_role() is live and verified against the backfilled rows.
create policy "space_roles_select_own_or_admin" on public.space_roles
  for select
  using (user_id = auth.uid() or public.current_user_role() = 'super_admin');

create policy "space_roles_write_super_admin" on public.space_roles
  for all
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- ─── 1c. user_permission_overrides ──────────────────────────
-- Individual grant/deny layer. Global (space_id null) or space-scoped.
-- Deny always wins over any grant at the same or broader scope — this
-- is an app-layer resolution rule (see design doc §3), enforced by
-- userHasPermission()/has_permission(), not by the table itself.
--
-- Supersedes the old empty `user_permissions` table (0 rows live,
-- PHASE3_AUDIT.md §2) rather than extending it, since that table had
-- no expiry/scope/effect columns and nothing reads or writes it today.
-- The old table is left in place (untouched, still empty) rather than
-- dropped, since dropping a live table is outside this migration's
-- read-only-until-approved scope; retiring it is a follow-up cleanup.

create table if not exists public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  permission_key text not null,
  effect text not null check (effect in ('grant', 'deny')),
  space_id uuid references public.departments(id), -- null = global
  reason text,
  granted_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_overrides_user on public.user_permission_overrides(user_id);

alter table public.user_permission_overrides enable row level security;

create policy "user_permission_overrides_select_own_or_admin" on public.user_permission_overrides
  for select
  using (user_id = auth.uid() or public.current_user_role() = 'super_admin');

create policy "user_permission_overrides_write_super_admin" on public.user_permission_overrides
  for all
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
