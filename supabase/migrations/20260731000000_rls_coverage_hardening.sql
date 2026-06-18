-- ============================================================
-- RLS COVERAGE HARDENING
-- ============================================================
-- Fixes overly permissive RLS policies and enables RLS on
-- previously unprotected tables. Audit completed 2026-07-31.

-- 1. ENABLE RLS ON UNPROTECTED TABLES
-- ======================================

alter table public.campaign_link_clicks enable row level security;
alter table public.email_bounces enable row level security;

-- 2. RLS POLICIES FOR campaign_link_clicks
-- ==========================================
-- Click tracking is sensitive (reveals engagement patterns).
-- Only dept_lead+ can view for campaign analysis.

drop policy if exists "link_clicks_select" on public.campaign_link_clicks;
create policy "link_clicks_select"
  on public.campaign_link_clicks
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
  );

drop policy if exists "link_clicks_insert" on public.campaign_link_clicks;
create policy "link_clicks_insert"
  on public.campaign_link_clicks
  for insert
  to authenticated
  with check (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
  );

-- 3. RLS POLICIES FOR email_bounces
-- ==================================
-- Bounce list is sensitive (reveals deliverability issues).
-- Only dept_lead+ can manage; unauthenticated reads/writes blocked
-- (webhook writes via service role, not user action).

drop policy if exists "email_bounces_select" on public.email_bounces;
create policy "email_bounces_select"
  on public.email_bounces
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
  );

drop policy if exists "email_bounces_insert" on public.email_bounces;
create policy "email_bounces_insert"
  on public.email_bounces
  for insert
  to authenticated
  with check (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
  );

drop policy if exists "email_bounces_update" on public.email_bounces;
create policy "email_bounces_update"
  on public.email_bounces
  for update
  to authenticated
  using (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
  );

-- 4. HARDEN communication_* OVERLY PERMISSIVE POLICIES
-- ======================================================
-- All communication tables allowed `USING (true)` for select.
-- Restrict to dept_lead+ to prevent data leakage.

drop policy if exists "comm_segments_select" on public.communication_segments;
create policy "comm_segments_select"
  on public.communication_segments
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
  );

drop policy if exists "comm_campaigns_select" on public.communication_campaigns;
create policy "comm_campaigns_select"
  on public.communication_campaigns
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
  );

drop policy if exists "comm_sends_select" on public.communication_sends;
create policy "comm_sends_select"
  on public.communication_sends
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
  );

drop policy if exists "comm_ab_select" on public.communication_ab_tests;
create policy "comm_ab_select"
  on public.communication_ab_tests
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
  );

drop policy if exists "comm_contacts_select" on public.communication_contacts;
create policy "comm_contacts_select"
  on public.communication_contacts
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
  );

drop policy if exists "comm_categories_select" on public.communication_categories;
create policy "comm_categories_select"
  on public.communication_categories
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
  );

drop policy if exists "comm_contact_categories_select" on public.communication_contact_categories;
create policy "comm_contact_categories_select"
  on public.communication_contact_categories
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
  );

-- EXCEPTION: communication_unsubscribes allows anonymous insert (unsubscribe link).
-- Keep `USING (true)` for insert, but lock down select/update to dept_lead+.

drop policy if exists "comm_unsub_select" on public.communication_unsubscribes;
create policy "comm_unsub_select"
  on public.communication_unsubscribes
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
  );

drop policy if exists "comm_unsub_update" on public.communication_unsubscribes;
create policy "comm_unsub_update"
  on public.communication_unsubscribes
  for update
  to authenticated
  using (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
  );

-- Keep insert open for unsubscribe link (anon + authenticated)
-- but document that webhook/edge functions must validate origin.

-- 5. HARDEN folders and lists (space hierarchy)
-- ==============================================
-- Both currently have USING (true) for select. Restrict to space members.

drop policy if exists "folders_select" on public.folders;
create policy "folders_select"
  on public.folders
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
    or exists (
      select 1 from public.space_members
      where space_id = folders.department_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.department_id = folders.department_id
    )
  );

drop policy if exists "folders_write" on public.folders;
create policy "folders_write"
  on public.folders
  for all
  to authenticated
  using (
    (auth.jwt() ->> 'role') = 'super_admin'
    or (
      (auth.jwt() ->> 'role') = 'dept_lead'
      and department_id = current_user_department()
    )
  )
  with check (
    (auth.jwt() ->> 'role') = 'super_admin'
    or (
      (auth.jwt() ->> 'role') = 'dept_lead'
      and department_id = current_user_department()
    )
  );

drop policy if exists "lists_select" on public.lists;
create policy "lists_select"
  on public.lists
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
    or exists (
      select 1 from public.space_members
      where space_id = lists.department_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.department_id = lists.department_id
    )
  );

drop policy if exists "lists_write" on public.lists;
create policy "lists_write"
  on public.lists
  for all
  to authenticated
  using (
    (auth.jwt() ->> 'role') = 'super_admin'
    or (
      (auth.jwt() ->> 'role') = 'dept_lead'
      and department_id = current_user_department()
    )
  )
  with check (
    (auth.jwt() ->> 'role') = 'super_admin'
    or (
      (auth.jwt() ->> 'role') = 'dept_lead'
      and department_id = current_user_department()
    )
  );

-- 6. HARDEN task_status_definitions
-- ==================================

drop policy if exists "status_definitions_select_authenticated" on public.task_status_definitions;
create policy "status_definitions_select_authenticated"
  on public.task_status_definitions
  for select
  to authenticated
  using (
    department_id is null
    or (
      (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
      and (department_id = current_user_department() or department_id is null)
    )
    or exists (
      select 1 from public.space_members
      where space_id = task_status_definitions.department_id
        and user_id = auth.uid()
    )
  );

-- 7. PUBLIC REPORT TABLES (VERIFY INTENT)
-- ========================================
-- meeting_attendance_reports and expected_attendees allow anon/authenticated
-- access via `USING (true)`. These are intentionally public (attendance
-- reporting), but confirm this is the desired behavior.
--
-- If these should be department-scoped:
-- 1. Uncomment the policies below
-- 2. Run the migration
-- 3. Test that the reporting dashboard still works
--
-- For now, leaving them as-is since they appear to be public reporting features.

-- Commented-out hardened versions if needed:
-- drop policy if exists "reports_select_public" on public.meeting_attendance_reports;
-- create policy "reports_select_public"
--   on public.meeting_attendance_reports
--   for select
--   to authenticated
--   using (
--     (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
--     or exists (
--       select 1 from public.meetings m
--       where m.id = meeting_attendance_reports.meeting_id
--         and m.department_id = current_user_department()
--     )
--   );

-- drop policy if exists "expected_attendees_select_anon" on public.expected_attendees;
-- create policy "expected_attendees_select_authenticated"
--   on public.expected_attendees
--   for select
--   to authenticated
--   using (
--     (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
--     or exists (
--       select 1 from public.meetings m
--       where m.id = expected_attendees.meeting_id
--         and m.department_id = current_user_department()
--     )
--   );
