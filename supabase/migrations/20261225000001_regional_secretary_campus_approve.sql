-- Grant regional_secretary the ability to approve/reject campus map edits,
-- alongside super_admin and (space-scoped) ors. regional_secretary is an
-- org-wide oversight role modeled as role_scope='base' (see
-- 20261215000004_phase3_seed_role_permissions.sql), so it gets a base row
-- here rather than a space_roles grant.
--
-- Idempotent: upserts on the (role, role_scope, permission_key) unique key
-- from 20261215000000_phase3_space_roles_schema.sql.

insert into public.role_permissions (role, role_scope, permission_key, enabled, is_baseline, description, category)
values ('regional_secretary', 'base', 'campus:approve', true, true, 'Approve/reject campus edits', 'campus')
on conflict (role, role_scope, permission_key) do update set enabled = true;

-- The Phase 3 RLS swap (20261216000000) that re-expresses these policies via
-- current_user_role()/has_space_role_anywhere() has not gone live yet, so the
-- policies currently enforced are still the plain base-role checks from
-- 20261215999999_ensure_campus_edits.sql. Extend those directly so
-- regional_secretary can see + approve pending edits today; the swap
-- migration has separately been updated to include regional_secretary for
-- whenever it does land, so this stays consistent either way.

drop policy if exists "campus_edits_select_own_or_admin" on public.campus_edits;
create policy "campus_edits_select_own_or_admin"
on public.campus_edits
for select
to authenticated
using (
  auth.uid() = submitted_by
  or (select role from public.users where id = auth.uid()) in ('super_admin', 'ors', 'regional_secretary')
);

drop policy if exists "campus_edits_update_admin_only" on public.campus_edits;
create policy "campus_edits_update_admin_only"
on public.campus_edits
for update
to authenticated
using ((select role from public.users where id = auth.uid()) in ('super_admin', 'ors', 'regional_secretary'));
