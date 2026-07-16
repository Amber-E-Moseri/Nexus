-- Let a pastor hold regional_secretary-level admin reach without changing
-- their base role (which would silently drop the ~10 pastor-specific RLS/RPC
-- checks elsewhere: dashboard flock task filtering, pastor_task_assignment,
-- invite-flow pastor-eligibility, etc. — see the pastor-vs-regional-secretary
-- role conflict). Uses the existing user_grants system (already used for
-- meetings_manager/communications_manager) instead of the role column.

-- ─── 1. Users can read their own grants ─────────────────────────────────
-- user_grants_select was super_admin-only, so a granted user's own client
-- (AuthContext fetching profile.grants) could never see their own grant row.

create policy "user_grants_select_own" on public.user_grants
  for select to authenticated
  using (user_id = auth.uid());

-- ─── 2. Grant regionalsecretary@lwcanada.org regional-secretary admin reach ──
-- Base role is left untouched (stays 'pastor') — this is additive only.

insert into public.user_grants (user_id, grant_type)
select id, 'regional_secretary_access'
from public.users
where email = 'regionalsecretary@lwcanada.org'
on conflict (user_id, grant_type, resource_type) do nothing;

comment on policy "user_grants_select_own" on public.user_grants
  is 'A user can always see their own grants — needed for AuthContext to attach profile.grants client-side.';
