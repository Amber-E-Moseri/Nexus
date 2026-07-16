-- Fix: super_admin (and meeting creator / ORS / dept_lead) can delete meetings.
--
-- The live delete policy "users_delete_meetings" (20260911) gates delete on the
-- BASE role being 'ors'. Phase 3 (20261215*) removed 'ors' from the base-role
-- set — it is now a space_roles role — so that policy matches nobody and meeting
-- deletion silently fails for everyone, including super_admin. The corrected
-- policy lives in the not-yet-applied 20261216000000_phase3_rls_swap.sql.
--
-- This migration is a standalone, additive fix that does NOT depend on the
-- phase-3 RLS swap or its helper functions (has_space_role_anywhere, etc.). It
-- only uses primitives already live in production: current_user_role() (JWT role
-- with DB fallback), space_roles, and the meetings.created_by / department_id
-- columns. Adding a permissive DELETE policy can only widen access, never
-- restrict it, so it is safe to apply ahead of the full phase-3 swap.

drop policy if exists "meetings_delete_admin_fix" on public.meetings;

create policy "meetings_delete_admin_fix" on public.meetings
  for delete to authenticated
  using (
    -- Super admin: the primary ask — can always delete
    public.current_user_role() = 'super_admin'
    -- Creator can delete their own meeting
    or created_by = auth.uid()
    -- ORS space role (org-wide operations) — anywhere they hold it
    or exists (
      select 1 from public.space_roles sr
      where sr.user_id = auth.uid()
        and sr.role = 'ors'
    )
    -- Department/space lead can delete meetings in their own space
    or exists (
      select 1 from public.space_roles sr
      where sr.user_id = auth.uid()
        and sr.space_id = meetings.department_id
        and sr.role = 'dept_lead'
    )
  );
