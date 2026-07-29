-- ============================================================
-- Programs department members get comms access
-- ============================================================
-- All users in the Programs department (is_programs = true on
-- departments table) now have full communications access without
-- needing an explicit 'programs' space role. This update changes:
--   1. is_comms_manager() SQL function — includes Programs dept check
--   2. All comms RLS policies — reuse updated is_comms_manager()

-- ─── Update is_comms_manager() to include Programs dept members ──

create or replace function public.is_comms_manager()
returns boolean
language sql
stable
as $$
  select public.current_user_role() = 'super_admin'
    or public.has_space_role_anywhere(auth.uid(), 'ors')
    or public.has_space_role_anywhere(auth.uid(), 'programs')
    or public.has_space_role_anywhere(auth.uid(), 'dept_lead')
    or (
      select exists (
        select 1 from public.users u
        join public.departments d on d.id = u.department_id
        where u.id = auth.uid()
          and d.is_programs = true
      )
    );
$$;

comment on function public.is_comms_manager() is
  'Communications suite manager: super_admin, ors/programs/dept_lead space-role holder, or member of Programs department. Replaces the dead auth.jwt()->>''role'' checks and ORS department-name checks across communication_* policies.';
