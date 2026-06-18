-- Adds a stable ordering column so List-view drag-to-reorder can persist.
-- Status changes already persist via tasks.status_id; this is purely for ordering.
alter table public.tasks
  add column if not exists sort_order numeric;

create index if not exists idx_tasks_sort_order
  on public.tasks(sort_order);

-- Backfill existing rows from created_at so the current ordering is preserved.
update public.tasks
set sort_order = extract(epoch from created_at)
where sort_order is null;
