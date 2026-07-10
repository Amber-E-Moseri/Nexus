-- Sprint access request flow: everyone can see all sprints, but only members
-- can open one. Non-members request access; the sprint creator/owner/manager
-- (or a super_admin) approves or rejects the request.
--
-- This also fixes two bugs in the original 20260620000019 RPCs that made them
-- unusable: sprint_members has no `added_by` column (it has `invited_by`),
-- and 'member' is not a valid sprint_members.role (valid values are
-- owner/manager/contributor/viewer per 20260723000000_fix_sprint_members_role.sql).

-- 1. Everyone can see the sprint list; task/board access stays gated by
--    sprint_members (see tasks_select_* / sprint_members_select policies).
drop policy if exists "sprints_select" on public.sprints;

create policy "sprints_select" on public.sprints
  for select to authenticated
  using (true);

-- 2. Tighten who can decide on a request to match the RPCs below (creator,
--    owner/manager member, dept_lead of the sprint's department, or
--    super_admin) instead of "any sprint member".
drop policy if exists "sprint_access_requests_update" on public.sprint_access_requests;

create policy "sprint_access_requests_update" on public.sprint_access_requests
  for update to authenticated
  using (public.can_manage_sprint(sprint_id));

-- 3. request_sprint_access: creates/reactivates a request and notifies the
--    people who can approve it. SECURITY DEFINER so it can notify someone
--    other than the caller (notifications_insert only allows self-inserts
--    for regular users).
create or replace function public.request_sprint_access(p_sprint_id uuid)
returns public.sprint_access_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_id uuid := auth.uid();
  v_requester_name text;
  v_sprint_name text;
  v_sprint_creator uuid;
  v_existing_status text;
  v_result public.sprint_access_requests%rowtype;
  v_notify_id uuid;
begin
  if v_requester_id is null then
    raise exception 'Authentication required';
  end if;

  select name, created_by into v_sprint_name, v_sprint_creator
  from public.sprints
  where id = p_sprint_id;

  if v_sprint_name is null then
    raise exception 'Sprint not found';
  end if;

  if exists (
    select 1 from public.sprint_members
    where sprint_id = p_sprint_id and user_id = v_requester_id
  ) then
    raise exception 'You already have access to this sprint';
  end if;

  select status into v_existing_status
  from public.sprint_access_requests
  where sprint_id = p_sprint_id and user_id = v_requester_id;

  if v_existing_status = 'pending' then
    raise exception 'Your access request is already pending';
  end if;

  select name into v_requester_name from public.users where id = v_requester_id;

  insert into public.sprint_access_requests (sprint_id, user_id, status, requested_at, responded_at, responded_by, response_message)
  values (p_sprint_id, v_requester_id, 'pending', now(), null, null, null)
  on conflict (sprint_id, user_id) do update
    set status = 'pending', requested_at = now(), responded_at = null, responded_by = null, response_message = null
  returning * into v_result;

  for v_notify_id in
    select distinct u.id from (
      select v_sprint_creator as id
      union
      select sm.user_id from public.sprint_members sm
      where sm.sprint_id = p_sprint_id and sm.role in ('owner', 'manager')
    ) u
    where u.id is not null and u.id <> v_requester_id
  loop
    insert into public.notifications (user_id, type, payload)
    values (
      v_notify_id,
      'sprint_access_requested',
      jsonb_build_object(
        'sprint_id', p_sprint_id,
        'sprint_name', v_sprint_name,
        'requester_id', v_requester_id,
        'requester_name', coalesce(v_requester_name, 'Someone')
      )
    );
  end loop;

  return v_result;
end;
$$;

grant execute on function public.request_sprint_access(uuid) to authenticated;

-- 4. approve_sprint_access_request: fix permission check + broken insert, notify requester.
create or replace function public.approve_sprint_access_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sprint_id uuid;
  v_user_id uuid;
  v_sprint_name text;
begin
  select sprint_id, user_id into v_sprint_id, v_user_id
  from public.sprint_access_requests
  where id = p_request_id;

  if v_sprint_id is null then
    raise exception 'Access request not found';
  end if;

  if not public.can_manage_sprint(v_sprint_id) then
    raise exception 'You do not have permission to approve this request';
  end if;

  select name into v_sprint_name from public.sprints where id = v_sprint_id;

  insert into public.sprint_members (sprint_id, user_id, role, invited_by)
  values (v_sprint_id, v_user_id, 'contributor', auth.uid())
  on conflict (sprint_id, user_id) do nothing;

  update public.sprint_access_requests
  set status = 'approved', responded_at = now(), responded_by = auth.uid()
  where id = p_request_id;

  insert into public.notifications (user_id, type, payload)
  values (
    v_user_id,
    'sprint_access_approved',
    jsonb_build_object('sprint_id', v_sprint_id, 'sprint_name', v_sprint_name)
  );
end;
$$;

grant execute on function public.approve_sprint_access_request(uuid) to authenticated;

-- 5. reject_sprint_access_request: fix permission check, notify requester.
create or replace function public.reject_sprint_access_request(p_request_id uuid, p_message text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sprint_id uuid;
  v_user_id uuid;
  v_sprint_name text;
begin
  select sprint_id, user_id into v_sprint_id, v_user_id
  from public.sprint_access_requests
  where id = p_request_id;

  if v_sprint_id is null then
    raise exception 'Access request not found';
  end if;

  if not public.can_manage_sprint(v_sprint_id) then
    raise exception 'You do not have permission to reject this request';
  end if;

  select name into v_sprint_name from public.sprints where id = v_sprint_id;

  update public.sprint_access_requests
  set status = 'rejected', responded_at = now(), responded_by = auth.uid(),
      response_message = p_message
  where id = p_request_id;

  insert into public.notifications (user_id, type, payload)
  values (
    v_user_id,
    'sprint_access_rejected',
    jsonb_build_object('sprint_id', v_sprint_id, 'sprint_name', v_sprint_name, 'message', p_message)
  );
end;
$$;

grant execute on function public.reject_sprint_access_request(uuid, text) to authenticated;
