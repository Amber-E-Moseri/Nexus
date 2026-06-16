drop policy if exists "status_definitions_select_authenticated" on public.task_status_definitions;
create policy "status_definitions_select_authenticated"
on public.task_status_definitions
for select
to authenticated
using (true);

drop policy if exists "status_definitions_manage_admin" on public.task_status_definitions;
create policy "status_definitions_manage_admin"
on public.task_status_definitions
for all
to authenticated
using (
  current_user_role() = 'super_admin' or
  (current_user_role() = 'dept_lead' and
   (department_id is null or department_id = current_user_department()))
)
with check (
  current_user_role() = 'super_admin' or
  (current_user_role() = 'dept_lead' and
   (department_id is null or department_id = current_user_department()))
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sprints'
      and column_name = 'department_id'
  ) then
    execute $policy$
      drop policy if exists "sprint_members_select" on public.sprint_members;
      create policy "sprint_members_select"
      on public.sprint_members
      for select
      to authenticated
      using (
        public.current_user_role() = 'super_admin'
        or public.current_user_role() = 'dept_lead'
        or user_id = auth.uid()
        or exists (
          select 1
          from public.sprints s
          where s.id = sprint_members.sprint_id
            and (
              s.created_by = auth.uid()
              or (
                s.department_id is not null
                and public.can_view_space(s.department_id)
              )
            )
        )
      );
    $policy$;
  else
    execute $policy$
      drop policy if exists "sprint_members_select" on public.sprint_members;
      create policy "sprint_members_select"
      on public.sprint_members
      for select
      to authenticated
      using (
        public.current_user_role() = 'super_admin'
        or public.current_user_role() = 'dept_lead'
        or user_id = auth.uid()
        or exists (
          select 1
          from public.sprints s
          where s.id = sprint_members.sprint_id
            and s.created_by = auth.uid()
        )
      );
    $policy$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sprints'
      and column_name = 'department_id'
  ) then
    execute $policy$
      drop policy if exists "sprint_members_write" on public.sprint_members;
      create policy "sprint_members_write"
      on public.sprint_members
      for all
      to authenticated
      using (
        public.current_user_role() in ('super_admin', 'dept_lead')
        or exists (
          select 1
          from public.sprints s
          where s.id = sprint_members.sprint_id
            and (
              s.created_by = auth.uid()
              or (
                s.department_id is not null
                and public.can_manage_space(s.department_id)
              )
            )
        )
      )
      with check (
        public.current_user_role() in ('super_admin', 'dept_lead')
        or exists (
          select 1
          from public.sprints s
          where s.id = sprint_members.sprint_id
            and (
              s.created_by = auth.uid()
              or (
                s.department_id is not null
                and public.can_manage_space(s.department_id)
              )
            )
        )
      );
    $policy$;
  else
    execute $policy$
      drop policy if exists "sprint_members_write" on public.sprint_members;
      create policy "sprint_members_write"
      on public.sprint_members
      for all
      to authenticated
      using (
        public.current_user_role() in ('super_admin', 'dept_lead')
        or exists (
          select 1
          from public.sprints s
          where s.id = sprint_members.sprint_id
            and s.created_by = auth.uid()
        )
      )
      with check (
        public.current_user_role() in ('super_admin', 'dept_lead')
        or exists (
          select 1
          from public.sprints s
          where s.id = sprint_members.sprint_id
            and s.created_by = auth.uid()
        )
      );
    $policy$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sprints'
      and column_name = 'department_id'
  ) then
    execute $policy$
      drop policy if exists "tasks_select_sprint_member" on public.tasks;
      create policy "tasks_select_sprint_member"
      on public.tasks
      for select
      to authenticated
      using (
        task_type = 'sprint'
        and sprint_id is not null
        and (
          public.current_user_role() = 'super_admin'
          or public.current_user_role() = 'dept_lead'
          or created_by = auth.uid()
          or exists (
            select 1
            from public.sprints s
            where s.id = tasks.sprint_id
              and (
                s.created_by = auth.uid()
                or (
                  s.department_id is not null
                  and public.can_view_space(s.department_id)
                )
              )
          )
        )
      );
    $policy$;
  else
    execute $policy$
      drop policy if exists "tasks_select_sprint_member" on public.tasks;
      create policy "tasks_select_sprint_member"
      on public.tasks
      for select
      to authenticated
      using (
        task_type = 'sprint'
        and sprint_id is not null
        and (
          public.current_user_role() = 'super_admin'
          or public.current_user_role() = 'dept_lead'
          or created_by = auth.uid()
          or exists (
            select 1
            from public.sprints s
            where s.id = tasks.sprint_id
              and s.created_by = auth.uid()
          )
        )
      );
    $policy$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sprints'
      and column_name = 'department_id'
  ) then
    execute $policy$
      drop policy if exists "tasks_update_delete_sprint_manager" on public.tasks;
      create policy "tasks_update_delete_sprint_manager"
      on public.tasks
      for all
      to authenticated
      using (
        task_type = 'sprint'
        and sprint_id is not null
        and (
          public.current_user_role() = 'super_admin'
          or public.current_user_role() = 'dept_lead'
          or created_by = auth.uid()
          or exists (
            select 1
            from public.sprints s
            where s.id = tasks.sprint_id
              and (
                s.created_by = auth.uid()
                or (
                  s.department_id is not null
                  and public.can_manage_space(s.department_id)
                )
              )
          )
        )
      )
      with check (
        task_type = 'sprint'
        and sprint_id is not null
        and (
          public.current_user_role() = 'super_admin'
          or public.current_user_role() = 'dept_lead'
          or created_by = auth.uid()
          or exists (
            select 1
            from public.sprints s
            where s.id = tasks.sprint_id
              and (
                s.created_by = auth.uid()
                or (
                  s.department_id is not null
                  and public.can_manage_space(s.department_id)
                )
              )
          )
        )
      );
    $policy$;
  else
    execute $policy$
      drop policy if exists "tasks_update_delete_sprint_manager" on public.tasks;
      create policy "tasks_update_delete_sprint_manager"
      on public.tasks
      for all
      to authenticated
      using (
        task_type = 'sprint'
        and sprint_id is not null
        and (
          public.current_user_role() = 'super_admin'
          or public.current_user_role() = 'dept_lead'
          or created_by = auth.uid()
          or exists (
            select 1
            from public.sprints s
            where s.id = tasks.sprint_id
              and s.created_by = auth.uid()
          )
        )
      )
      with check (
        task_type = 'sprint'
        and sprint_id is not null
        and (
          public.current_user_role() = 'super_admin'
          or public.current_user_role() = 'dept_lead'
          or created_by = auth.uid()
          or exists (
            select 1
            from public.sprints s
            where s.id = tasks.sprint_id
              and s.created_by = auth.uid()
          )
        )
      );
    $policy$;
  end if;
end $$;

alter table public.external_integrations
  add column if not exists show_in_sidebar boolean not null default false;
