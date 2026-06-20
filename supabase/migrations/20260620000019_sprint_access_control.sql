-- Sprint access control: restrict visibility, allow requests and grants
-- Only invited members, granted users, and creators can see sprints
-- Others can request access

-- 1. Table for access requests
create table public.sprint_access_requests (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references public.users(id),
  response_message text,
  unique(sprint_id, user_id)
);

alter table public.sprint_access_requests enable row level security;

-- Users can see their own requests, sprint members/creators can see all requests for their sprints
create policy "sprint_access_requests_select" on public.sprint_access_requests
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_role() = 'super_admin'
    or exists (
      select 1 from public.sprint_members
      where sprint_id = sprint_access_requests.sprint_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from public.sprints
      where id = sprint_access_requests.sprint_id
        and created_by = auth.uid()
    )
  );

-- Users can insert their own requests
create policy "sprint_access_requests_insert" on public.sprint_access_requests
  for insert to authenticated
  with check (user_id = auth.uid());

-- Sprint members/creators can update requests
create policy "sprint_access_requests_update" on public.sprint_access_requests
  for update to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or exists (
      select 1 from public.sprint_members
      where sprint_id = sprint_access_requests.sprint_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from public.sprints
      where id = sprint_access_requests.sprint_id
        and created_by = auth.uid()
    )
  );

-- 2. Update sprint RLS to remove org-wide visibility
-- Now only invited members, granted users, or creators can see sprints
drop policy if exists "sprints_select" on public.sprints;

create policy "sprints_select" on public.sprints
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.is_sprint_member(id)
    or created_by = auth.uid()
    or public.user_has_grant(auth.uid(), 'sprint_access', id::text)
  );

-- 3. Helper function to approve access request
create or replace function public.approve_sprint_access_request(p_request_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_sprint_id uuid;
  v_user_id uuid;
begin
  select sprint_id, user_id into v_sprint_id, v_user_id
  from public.sprint_access_requests
  where id = p_request_id;

  if v_sprint_id is null then
    raise exception 'Access request not found';
  end if;

  -- Check permission: super_admin or sprint member
  if auth.uid() <> (select created_by from public.sprints where id = v_sprint_id)
     and public.current_user_role() <> 'super_admin'
     and not exists (
       select 1 from public.sprint_members
       where sprint_id = v_sprint_id and user_id = auth.uid()
     )
  then
    raise exception 'You do not have permission to approve this request';
  end if;

  -- Add to sprint_members
  insert into public.sprint_members (sprint_id, user_id, role, added_by)
  values (v_sprint_id, v_user_id, 'member', auth.uid())
  on conflict (sprint_id, user_id) do nothing;

  -- Update request status
  update public.sprint_access_requests
  set status = 'approved', responded_at = now(), responded_by = auth.uid()
  where id = p_request_id;
end;
$$;

grant execute on function public.approve_sprint_access_request(uuid) to authenticated;

-- 4. Helper function to reject access request
create or replace function public.reject_sprint_access_request(p_request_id uuid, p_message text default null)
returns void
language plpgsql
security definer
as $$
declare
  v_sprint_id uuid;
begin
  select sprint_id into v_sprint_id
  from public.sprint_access_requests
  where id = p_request_id;

  if v_sprint_id is null then
    raise exception 'Access request not found';
  end if;

  -- Check permission: super_admin or sprint member
  if auth.uid() <> (select created_by from public.sprints where id = v_sprint_id)
     and public.current_user_role() <> 'super_admin'
     and not exists (
       select 1 from public.sprint_members
       where sprint_id = v_sprint_id and user_id = auth.uid()
     )
  then
    raise exception 'You do not have permission to reject this request';
  end if;

  update public.sprint_access_requests
  set status = 'rejected', responded_at = now(), responded_by = auth.uid(),
      response_message = p_message
  where id = p_request_id;
end;
$$;

grant execute on function public.reject_sprint_access_request(uuid, text) to authenticated;
