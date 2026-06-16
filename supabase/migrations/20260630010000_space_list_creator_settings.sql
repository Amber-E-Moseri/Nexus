-- Allow list creators to edit their own list settings without full space-management access.

drop policy if exists "space_lists_update" on public.space_lists;

create policy "space_lists_update"
on public.space_lists
for update
to authenticated
using (
  public.can_manage_space(space_id)
  or created_by = auth.uid()
)
with check (
  public.can_manage_space(space_id)
  or created_by = auth.uid()
);
