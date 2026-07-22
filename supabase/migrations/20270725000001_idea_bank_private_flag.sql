-- Idea Bank: replace the open/in_progress/resolved status workflow (dropped
-- from the UI per product decision — ideas don't need a status pipeline,
-- just capture/edit/delete/nest) with a simple private flag. Private ideas
-- are visible only to their creator and the space's admins (super_admin/
-- regional_secretary/dept_lead) — same authorization union already used by
-- idea_bank_items_update/_delete.

alter table public.idea_bank_items
  add column if not exists is_private boolean not null default false;

drop policy if exists idea_bank_items_select on public.idea_bank_items;
create policy idea_bank_items_select on public.idea_bank_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and (
          u.role = 'super_admin'
          or u.role = 'regional_secretary'
          or idea_bank_items.space_id is null
          or (
            u.department_id = idea_bank_items.space_id
            and (
              not idea_bank_items.is_private
              or idea_bank_items.user_id = auth.uid()
              or u.role = 'dept_lead'
            )
          )
        )
    )
  );
