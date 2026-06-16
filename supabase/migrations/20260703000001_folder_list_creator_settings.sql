-- Allow folder and list creators to edit their own settings without full space-management access.

drop policy if exists "folders_update" on public.folders;

create policy "folders_update"
on public.folders
for update
to authenticated
using (
  public.can_manage_space(department_id)
  or created_by = auth.uid()
)
with check (
  public.can_manage_space(department_id)
  or created_by = auth.uid()
);

drop policy if exists "lists_update" on public.lists;

create policy "lists_update"
on public.lists
for update
to authenticated
using (
  public.can_manage_space(department_id)
  or created_by = auth.uid()
)
with check (
  public.can_manage_space(department_id)
  or created_by = auth.uid()
);
