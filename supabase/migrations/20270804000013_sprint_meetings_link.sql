-- Junction table linking meetings to sprints.
-- Uses a separate table rather than a meetings.sprint_id column so that:
--   a) the complex meetings UPDATE RLS is not required for sprint managers to link meetings
--   b) one meeting can appear in multiple sprints

create table if not exists public.sprint_meetings (
  sprint_id  uuid not null references public.sprints(id)  on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  linked_by  uuid not null references public.users(id)    on delete cascade,
  linked_at  timestamptz not null default now(),
  primary key (sprint_id, meeting_id)
);

create index if not exists sprint_meetings_sprint_id_idx  on public.sprint_meetings(sprint_id);
create index if not exists sprint_meetings_meeting_id_idx on public.sprint_meetings(meeting_id);

alter table public.sprint_meetings enable row level security;

-- Any sprint member (or super_admin / dept_lead) can read
create policy "sprint_meetings_select" on public.sprint_meetings
  for select to authenticated
  using (
    public.is_sprint_member(sprint_id)
    or public.current_user_role() = any(array['super_admin', 'dept_lead'])
  );

-- Any sprint member can link meetings
create policy "sprint_meetings_insert" on public.sprint_meetings
  for insert to authenticated
  with check (
    public.is_sprint_member(sprint_id)
    or public.current_user_role() = any(array['super_admin', 'dept_lead'])
  );

-- Sprint member or the person who linked it can unlink
create policy "sprint_meetings_delete" on public.sprint_meetings
  for delete to authenticated
  using (
    public.is_sprint_member(sprint_id)
    or public.current_user_role() = any(array['super_admin', 'dept_lead'])
  );

-- Grant table access to the authenticated role
grant select, insert, delete on public.sprint_meetings to authenticated;
