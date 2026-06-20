-- Grant ORS and permissioned people access to communications
-- ORS members can manage segments and campaigns
-- Department leads can manage in their own department
-- Others have view-only access

-- Segments policies
drop policy if exists "comm_segments_insert" on public.communication_segments;
drop policy if exists "comm_segments_update" on public.communication_segments;
drop policy if exists "comm_segments_delete" on public.communication_segments;

create policy "comm_segments_insert" on public.communication_segments for insert to authenticated
  with check (
    (auth.jwt() ->> 'role') = 'super_admin'
    or (
      select d.name = 'ORS Projects' or d.name = 'ORS'
      from public.departments d
      where d.id = public.current_user_department()
    )
    or (auth.jwt() ->> 'role') = 'dept_lead'
  );

create policy "comm_segments_update" on public.communication_segments for update to authenticated
  using (
    (auth.jwt() ->> 'role') = 'super_admin'
    or (
      select d.name = 'ORS Projects' or d.name = 'ORS'
      from public.departments d
      where d.id = public.current_user_department()
    )
    or (auth.jwt() ->> 'role') = 'dept_lead'
  );

create policy "comm_segments_delete" on public.communication_segments for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'super_admin');

-- Campaigns policies
drop policy if exists "comm_campaigns_insert" on public.communication_campaigns;
drop policy if exists "comm_campaigns_update" on public.communication_campaigns;
drop policy if exists "comm_campaigns_delete" on public.communication_campaigns;

create policy "comm_campaigns_insert" on public.communication_campaigns for insert to authenticated
  with check (
    (auth.jwt() ->> 'role') = 'super_admin'
    or (
      select d.name = 'ORS Projects' or d.name = 'ORS'
      from public.departments d
      where d.id = public.current_user_department()
    )
    or (auth.jwt() ->> 'role') = 'dept_lead'
  );

create policy "comm_campaigns_update" on public.communication_campaigns for update to authenticated
  using (
    (auth.jwt() ->> 'role') = 'super_admin'
    or (
      select d.name = 'ORS Projects' or d.name = 'ORS'
      from public.departments d
      where d.id = public.current_user_department()
    )
    or (auth.jwt() ->> 'role') = 'dept_lead'
  );

create policy "comm_campaigns_delete" on public.communication_campaigns for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'super_admin');

-- Sends policies
drop policy if exists "comm_sends_insert" on public.communication_sends;
drop policy if exists "comm_sends_update" on public.communication_sends;
drop policy if exists "comm_sends_delete" on public.communication_sends;

create policy "comm_sends_insert" on public.communication_sends for insert to authenticated
  with check (
    (auth.jwt() ->> 'role') = 'super_admin'
    or (
      select d.name = 'ORS Projects' or d.name = 'ORS'
      from public.departments d
      where d.id = public.current_user_department()
    )
    or (auth.jwt() ->> 'role') = 'dept_lead'
  );

create policy "comm_sends_update" on public.communication_sends for update to authenticated
  using (
    (auth.jwt() ->> 'role') = 'super_admin'
    or (
      select d.name = 'ORS Projects' or d.name = 'ORS'
      from public.departments d
      where d.id = public.current_user_department()
    )
    or (auth.jwt() ->> 'role') = 'dept_lead'
  );

create policy "comm_sends_delete" on public.communication_sends for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'super_admin');
