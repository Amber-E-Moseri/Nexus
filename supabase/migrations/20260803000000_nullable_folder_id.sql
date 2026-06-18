-- Make folder_id nullable to support unfolded lists
alter table public.lists
alter column folder_id drop not null;

-- Update list indexes to handle null folder_id
drop index if exists lists_folder_sort_idx;
create index if not exists lists_folder_sort_idx
  on public.lists (folder_id, sort_order);

create index if not exists lists_unfolded_sort_idx
  on public.lists (department_id, sort_order)
  where folder_id is null;
