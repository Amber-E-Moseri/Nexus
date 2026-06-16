do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_meeting_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_meeting_id_fkey
      foreign key (meeting_id)
      references public.meetings(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_tasks_meeting_id on public.tasks(meeting_id);
