-- Fix: allow meeting creator to update their own meetings regardless of visibility.
-- Previously, the policy required visibility = 'private' for creator-based updates,
-- which blocked ad-hoc meetings (default visibility = 'published', no department_id).

drop policy if exists "meetings_update" on public.meetings;

create policy "meetings_update" on public.meetings
  for update to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.has_space_role_anywhere(auth.uid(), 'ors')
    or auth.uid() = any(allowed_editors)
    or created_by = auth.uid()
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or public.user_has_grant(auth.uid(), 'meetings_manager')
  );
