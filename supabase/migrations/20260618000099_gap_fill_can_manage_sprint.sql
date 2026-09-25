-- Gap-fill: can_manage_sprint(uuid) is used in 20260619000001_temporary_sprint_invites
-- but is first formally defined in 20260620000000_sprint_system_hardening.
-- Stub it here so the migration chain can proceed.

create or replace function public.can_manage_sprint(p_sprint_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.sprints s
    where s.id = p_sprint_id
      and (
        public.current_user_role() = 'super_admin'
        or s.created_by = auth.uid()
        or exists (
          select 1
          from public.sprint_members sm
          where sm.sprint_id = p_sprint_id
            and sm.user_id = auth.uid()
            and sm.role in ('owner', 'manager')
        )
      )
  )
$$;
