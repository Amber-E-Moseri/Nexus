-- Regional secretaries and programs space members can now add/manage sprint members and teams

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
        or public.current_user_role() = 'regional_secretary'
        or s.created_by = auth.uid()
        or exists (
          select 1
          from public.sprint_members sm
          where sm.sprint_id = p_sprint_id
            and sm.user_id = auth.uid()
            and sm.role in ('owner', 'manager')
        )
        or exists (
          select 1
          from public.space_members sm
          where sm.space_id = (select id from public.departments where name = 'Programs')
            and sm.user_id = auth.uid()
        )
      )
  )
$$;
