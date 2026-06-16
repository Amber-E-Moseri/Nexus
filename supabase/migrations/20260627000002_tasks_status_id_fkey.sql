-- Ensures the FK from tasks.status_id → task_status_definitions.id exists.
-- PostgREST needs this constraint to resolve task_status_definitions!status_id joins.
-- The column may have been added without the reference if the migration file was
-- edited after its initial push.

-- Ensure the column exists first (no-op if already present)
alter table public.tasks
  add column if not exists status_id uuid;

-- Add the FK only if it is missing
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema    = kcu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema    = 'public'
      and tc.table_name      = 'tasks'
      and kcu.column_name    = 'status_id'
  ) then
    alter table public.tasks
      add constraint tasks_status_id_fkey
      foreign key (status_id) references public.task_status_definitions(id);
  end if;
end;
$$;

-- Signal PostgREST to reload its schema cache so the new relationship is visible
notify pgrst, 'reload schema';
