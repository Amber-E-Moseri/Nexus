-- Restrict meeting_minutes visibility to creator + super_admin only
-- Previously: anyone in the same department could see all minutes (privacy leak)
-- Now: only creator and super_admin can see/edit meeting notes
-- This prevents admins/dept_leads from seeing private notes they shouldn't access

drop policy if exists "minutes_select_own_or_org" on public.meeting_minutes;
create policy "minutes_select_creator_or_super_admin"
  on public.meeting_minutes for select to authenticated
  using (
    created_by = auth.uid()
    or (select role from public.users where id = auth.uid()) = 'super_admin'
  );

-- Segments: inherit creator-only restriction
drop policy if exists "segments_select" on public.meeting_minutes_segments;
create policy "segments_select"
  on public.meeting_minutes_segments for select to authenticated
  using (
    exists (
      select 1 from public.meeting_minutes mm
      where mm.id = minutes_id
      and (
        mm.created_by = auth.uid()
        or (select role from public.users where id = auth.uid()) = 'super_admin'
      )
    )
  );

-- Action items: only visible to creator or super_admin
drop policy if exists "action_items_select" on public.meeting_action_items;
create policy "action_items_select"
  on public.meeting_action_items for select to authenticated
  using (
    exists (
      select 1 from public.meeting_minutes_segments mms
      join public.meeting_minutes mm on mm.id = mms.minutes_id
      where mms.id = segment_id
      and (
        mm.created_by = auth.uid()
        or (select role from public.users where id = auth.uid()) = 'super_admin'
      )
    )
  );

comment on policy "minutes_select_creator_or_super_admin" on public.meeting_minutes is
  'Only the creator of meeting minutes or super_admin can view. Prevents department-wide visibility leaks.';
