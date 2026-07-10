-- ============================================================
-- PHASE 3 (2/5) — has_space_role(): single resolution path
-- ============================================================
-- The one function every space-scoped RLS policy will call once the
-- deferred RLS-swap pass rewrites the current ad hoc checks (bare
-- `role = 'ors'`, department-name string compares like
-- `d.name = 'ORS'`, and department_id-as-authority checks such as
-- can_manage_space()'s `v_role in (...) and v_department_id = space_uuid`
-- — see PHASE3_AUDIT.md §3–4 and §7 for the full inventory).
--
-- Not called by any policy yet in this migration — per the Phase 3
-- brief, this pass is schema + backfill + audit only. Wiring it into
-- RLS is the explicit follow-up step, done once this function has been
-- verified against the two backfilled rows.
-- ============================================================

create or replace function public.has_space_role(p_user_id uuid, p_space_id uuid, p_role text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.space_roles
    where user_id = p_user_id
      and space_id = p_space_id
      and role = p_role
  );
$$;

comment on function public.has_space_role(uuid, uuid, text) is
  'Single resolution path for "does this user hold this role in this space". Introduced in Phase 3 of the permission revamp; not yet wired into RLS policies (deferred swap pass) or edge functions.';
