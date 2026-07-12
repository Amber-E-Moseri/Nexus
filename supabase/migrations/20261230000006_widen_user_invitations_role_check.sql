-- ============================================================
-- Align user_invitations.role CHECK with users_role_check.
--
-- The invitation constraint (defined inline in 20260609000000) was never
-- widened when regional_secretary was standardized (20261001000000) and later
-- shrunk to the Phase 3 canonical set (20261215000003). As a result invitations
-- could only be issued for super_admin/dept_lead/pastor/member, so a person
-- meant to accept as regional_secretary could not be invited into that role.
--
-- This brings the invitation constraint in line with the current canonical
-- base-role set on public.users.
-- ============================================================

alter table public.user_invitations
  drop constraint if exists user_invitations_role_check;

alter table public.user_invitations
  add constraint user_invitations_role_check
  check (role in (
    'super_admin',
    'dept_lead',
    'pastor',
    'regional_secretary',
    'member'
  ));
