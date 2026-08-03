-- DEBUG (superseded by 20270805000008): temporarily opened tasks_update to
-- isolate whether cross-team sprint saves were being blocked by RLS. They were
-- not — the bug was client-side. Kept so migration history replays faithfully.

drop policy if exists "tasks_update" on public.tasks;

create policy "tasks_update" on public.tasks
  for update to authenticated
  using (true)
  with check (true);
