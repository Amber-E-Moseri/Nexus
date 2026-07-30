-- Add fellowship column to working_list and allow full-access users to import

alter table public.working_list
  add column if not exists fellowship text not null default '';

-- Allow authenticated users to upsert working list (Import tab)
-- Limited pastors can't reach the Import tab, so this is fine to be broad
create policy "working_list_auth_upsert"
on public.working_list for insert to authenticated
with check (true);

create policy "working_list_auth_update"
on public.working_list for update to authenticated
using (true);

create policy "working_list_auth_delete"
on public.working_list for delete to authenticated
using (true);
