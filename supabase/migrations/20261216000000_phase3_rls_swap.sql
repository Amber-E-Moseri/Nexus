-- ============================================================
-- PHASE 3 (follow-up) — THE RLS SWAP
-- ============================================================
-- Rewrites every live policy that authorized via one of the four legacy
-- mechanisms onto the space_roles model:
--
--   (a) BROKEN JWT claim:  auth.jwt() ->> 'role'  — the token hook sets
--       user_role, never role, so this claim is always 'authenticated'
--       and every such branch is dead (Task #5; live-verified: the
--       applied comms hardening denies ALL client reads incl. super_admin).
--   (b) Department-name dual identity:  d.name = 'ORS' / 'ORS Projects'
--       ('ORS Projects' doesn't even exist as a live department).
--   (c) Base-role authority for space roles:  role = 'ors' etc. — dead
--       since 20261215000003 removed ors/media/programs from users.role.
--   (d) dept_lead-by-department:  role='dept_lead' AND department_id=X —
--       replaced by has_space_role(uid, X, 'dept_lead'); users.role='dept_lead'
--       is a label only and users.department_id carries zero authority.
--
-- Conventions used throughout:
--   * super_admin keeps using public.current_user_role() (JWT user_role
--     with DB fallback) — base-role check, works today.
--   * regional_secretary stays a base role (org-wide oversight), also
--     via current_user_role().
--   * ORS authority is org-wide BY PRODUCT DESIGN (they run meetings,
--     comms, and campus review for the whole org). The space_roles grant
--     anchors WHO holds the role; the authority it confers is org-wide.
--     Hence has_space_role_anywhere() below rather than hardcoding the
--     ORS space UUID into every policy.
--   * Multiple permissive policies OR together — so this file DROPs every
--     historical policy-name variant on each table before recreating a
--     single canonical set, to stop stale permissive policies (e.g. the
--     20260620000018 meetings pair alongside the 20260911 set) from
--     silently widening access.
--
-- Deliberately NOT touched here:
--   * calendar_events / calendar_permissions system — parallel permission
--     domain, folding it in was deferred at Phase 2 gate.
--   * sprint_access_requests — authorizes via sprint_members roles, not
--     users.role. Not a base/space-role mechanism.
--   * meeting_transcriptions view/insert dept-membership branches —
--     department there is data-scoping (whose meeting it is), not
--     authority. Only the dead org_members branch is dropped (§10).
--   * Storage bucket policies (avatars) — auth.uid()-scoped, fine.
-- ============================================================

-- ─── 0. Helper: has_space_role_anywhere ─────────────────────

create or replace function public.has_space_role_anywhere(p_user_id uuid, p_role text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.space_roles
    where user_id = p_user_id
      and role = p_role
  );
$$;

comment on function public.has_space_role_anywhere(uuid, text) is
  'True if the user holds the given space role in ANY space. For roles whose authority is org-wide by product design (ors; comms managers). Space-local authority checks must use has_space_role() instead.';

-- Comms-manager predicate used by the whole communications suite.
create or replace function public.is_comms_manager()
returns boolean
language sql
stable
as $$
  select public.current_user_role() = 'super_admin'
    or public.has_space_role_anywhere(auth.uid(), 'ors')
    or public.has_space_role_anywhere(auth.uid(), 'programs')
    or public.has_space_role_anywhere(auth.uid(), 'dept_lead');
$$;

comment on function public.is_comms_manager() is
  'Communications suite manager: super_admin, or ors/programs/dept_lead space-role holder. Replaces the dead auth.jwt()->>''role'' checks and ORS department-name checks across communication_* policies.';

-- ─── 1. meetings — collapse both live policy sets into one ──
-- Live today: meetings_select_access/meetings_write_access (20260620000018,
-- dual-identity + org-wide dept_lead select + grants) OR'd with
-- users_view/create/update/delete_meetings (20260911/20261103, visibility +
-- designated_creators + JWT ors). Union preserved, mechanisms swapped.

drop policy if exists "meetings_select_access" on public.meetings;
drop policy if exists "meetings_write_access" on public.meetings;
drop policy if exists "users_view_meetings" on public.meetings;
drop policy if exists "users_create_meetings" on public.meetings;
drop policy if exists "users_update_meetings" on public.meetings;
drop policy if exists "users_delete_meetings" on public.meetings;

create policy "meetings_select" on public.meetings
  for select to authenticated
  using (
    public.current_user_role() in ('super_admin', 'regional_secretary')
    or visibility = 'published'
    or created_by = auth.uid()
    or auth.uid() = any(allowed_viewers)
    or auth.uid() = any(allowed_editors)
    or public.has_space_role_anywhere(auth.uid(), 'ors')
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or public.user_has_grant(auth.uid(), 'meetings_manager')
  );

create policy "meetings_insert" on public.meetings
  for insert to authenticated
  with check (
    public.current_user_role() = 'super_admin'
    or (
      created_by = auth.uid()
      and (
        public.has_space_role_anywhere(auth.uid(), 'ors')
        or public.has_space_role(auth.uid(), department_id, 'dept_lead')
        or exists (select 1 from public.designated_creators where user_id = auth.uid())
        or public.user_has_grant(auth.uid(), 'meetings_manager')
      )
    )
  );

create policy "meetings_update" on public.meetings
  for update to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.has_space_role_anywhere(auth.uid(), 'ors')
    or auth.uid() = any(allowed_editors)
    or (created_by = auth.uid() and visibility = 'private')
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or public.user_has_grant(auth.uid(), 'meetings_manager')
  );

create policy "meetings_delete" on public.meetings
  for delete to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.has_space_role_anywhere(auth.uid(), 'ors')
    or created_by = auth.uid()
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or public.user_has_grant(auth.uid(), 'meetings_manager')
  );

-- ─── 2. Communications suite ─────────────────────────────────
-- Every SELECT here was dead-deny (broken claim from the 20260731
-- hardening); writes were a mix of broken-claim and ORS-dept-name.

-- 2a. communication_segments
drop policy if exists "comm_segments_select" on public.communication_segments;
drop policy if exists "comm_segments_insert" on public.communication_segments;
drop policy if exists "comm_segments_update" on public.communication_segments;
drop policy if exists "comm_segments_delete" on public.communication_segments;
create policy "comm_segments_select" on public.communication_segments
  for select to authenticated using (public.is_comms_manager());
create policy "comm_segments_insert" on public.communication_segments
  for insert to authenticated with check (public.is_comms_manager());
create policy "comm_segments_update" on public.communication_segments
  for update to authenticated using (public.is_comms_manager());
create policy "comm_segments_delete" on public.communication_segments
  for delete to authenticated using (public.current_user_role() = 'super_admin');

-- 2b. communication_campaigns
drop policy if exists "comm_campaigns_select" on public.communication_campaigns;
drop policy if exists "comm_campaigns_insert" on public.communication_campaigns;
drop policy if exists "comm_campaigns_update" on public.communication_campaigns;
drop policy if exists "comm_campaigns_delete" on public.communication_campaigns;
create policy "comm_campaigns_select" on public.communication_campaigns
  for select to authenticated using (public.is_comms_manager());
create policy "comm_campaigns_insert" on public.communication_campaigns
  for insert to authenticated with check (public.is_comms_manager());
create policy "comm_campaigns_update" on public.communication_campaigns
  for update to authenticated using (public.is_comms_manager());
create policy "comm_campaigns_delete" on public.communication_campaigns
  for delete to authenticated
  using (public.current_user_role() = 'super_admin' or created_by = auth.uid());

-- 2c. communication_sends
drop policy if exists "comm_sends_select" on public.communication_sends;
drop policy if exists "comm_sends_insert" on public.communication_sends;
drop policy if exists "comm_sends_update" on public.communication_sends;
drop policy if exists "comm_sends_delete" on public.communication_sends;
create policy "comm_sends_select" on public.communication_sends
  for select to authenticated using (public.is_comms_manager());
create policy "comm_sends_insert" on public.communication_sends
  for insert to authenticated with check (public.is_comms_manager());
create policy "comm_sends_update" on public.communication_sends
  for update to authenticated using (public.is_comms_manager());
create policy "comm_sends_delete" on public.communication_sends
  for delete to authenticated using (public.current_user_role() = 'super_admin');

-- 2d. communication_ab_tests
drop policy if exists "comm_ab_select" on public.communication_ab_tests;
drop policy if exists "comm_ab_insert" on public.communication_ab_tests;
drop policy if exists "comm_ab_update" on public.communication_ab_tests;
drop policy if exists "comm_ab_delete" on public.communication_ab_tests;
create policy "comm_ab_select" on public.communication_ab_tests
  for select to authenticated using (public.is_comms_manager());
create policy "comm_ab_insert" on public.communication_ab_tests
  for insert to authenticated with check (public.is_comms_manager());
create policy "comm_ab_update" on public.communication_ab_tests
  for update to authenticated using (public.is_comms_manager());
create policy "comm_ab_delete" on public.communication_ab_tests
  for delete to authenticated using (public.current_user_role() = 'super_admin');

-- 2e. communication_contacts (email addresses — manager-only both ways)
drop policy if exists "comm_contacts_select" on public.communication_contacts;
drop policy if exists "comm_contacts_insert" on public.communication_contacts;
drop policy if exists "comm_contacts_update" on public.communication_contacts;
drop policy if exists "comm_contacts_delete" on public.communication_contacts;
create policy "comm_contacts_select" on public.communication_contacts
  for select to authenticated using (public.is_comms_manager());
create policy "comm_contacts_insert" on public.communication_contacts
  for insert to authenticated with check (public.is_comms_manager());
create policy "comm_contacts_update" on public.communication_contacts
  for update to authenticated using (public.is_comms_manager());
create policy "comm_contacts_delete" on public.communication_contacts
  for delete to authenticated using (public.is_comms_manager());

-- 2f. communication_categories + contact_categories
drop policy if exists "comm_categories_select" on public.communication_categories;
drop policy if exists "comm_categories_insert" on public.communication_categories;
drop policy if exists "comm_categories_update" on public.communication_categories;
drop policy if exists "comm_categories_delete" on public.communication_categories;
create policy "comm_categories_select" on public.communication_categories
  for select to authenticated using (public.is_comms_manager());
create policy "comm_categories_insert" on public.communication_categories
  for insert to authenticated with check (public.is_comms_manager());
create policy "comm_categories_update" on public.communication_categories
  for update to authenticated using (public.is_comms_manager());
create policy "comm_categories_delete" on public.communication_categories
  for delete to authenticated using (public.is_comms_manager());

drop policy if exists "comm_contact_categories_select" on public.communication_contact_categories;
drop policy if exists "comm_contact_categories_insert" on public.communication_contact_categories;
drop policy if exists "comm_contact_categories_update" on public.communication_contact_categories;
drop policy if exists "comm_contact_categories_delete" on public.communication_contact_categories;
create policy "comm_contact_categories_select" on public.communication_contact_categories
  for select to authenticated using (public.is_comms_manager());
create policy "comm_contact_categories_insert" on public.communication_contact_categories
  for insert to authenticated with check (public.is_comms_manager());
create policy "comm_contact_categories_update" on public.communication_contact_categories
  for update to authenticated using (public.is_comms_manager());
create policy "comm_contact_categories_delete" on public.communication_contact_categories
  for delete to authenticated using (public.is_comms_manager());

-- 2g. communication_unsubscribes — anon insert stays open (unsubscribe
-- links are unauthenticated by design); management is comms-managers.
drop policy if exists "comm_unsub_select" on public.communication_unsubscribes;
drop policy if exists "comm_unsub_update" on public.communication_unsubscribes;
drop policy if exists "comm_unsub_delete" on public.communication_unsubscribes;
-- (comm_unsub_insert `to anon, authenticated with check (true)` kept as-is)
create policy "comm_unsub_select" on public.communication_unsubscribes
  for select to authenticated using (public.is_comms_manager());
create policy "comm_unsub_update" on public.communication_unsubscribes
  for update to authenticated using (public.is_comms_manager());
create policy "comm_unsub_delete" on public.communication_unsubscribes
  for delete to authenticated using (public.current_user_role() = 'super_admin');

-- 2h. campaign_link_clicks + email_bounces (webhook writes use service
-- role and bypass RLS; client access is manager-only).
drop policy if exists "link_clicks_select" on public.campaign_link_clicks;
drop policy if exists "link_clicks_insert" on public.campaign_link_clicks;
create policy "link_clicks_select" on public.campaign_link_clicks
  for select to authenticated using (public.is_comms_manager());
create policy "link_clicks_insert" on public.campaign_link_clicks
  for insert to authenticated with check (public.is_comms_manager());

drop policy if exists "email_bounces_select" on public.email_bounces;
drop policy if exists "email_bounces_insert" on public.email_bounces;
drop policy if exists "email_bounces_update" on public.email_bounces;
create policy "email_bounces_select" on public.email_bounces
  for select to authenticated using (public.is_comms_manager());
create policy "email_bounces_insert" on public.email_bounces
  for insert to authenticated with check (public.is_comms_manager());
create policy "email_bounces_update" on public.email_bounces
  for update to authenticated using (public.is_comms_manager());

-- 2i. communication_email_templates
drop policy if exists "email_templates_insert" on public.communication_email_templates;
drop policy if exists "email_templates_update" on public.communication_email_templates;
drop policy if exists "email_templates_delete" on public.communication_email_templates;
-- (email_templates_select `using (true)` kept — templates aren't sensitive)
create policy "email_templates_insert" on public.communication_email_templates
  for insert to authenticated with check (public.is_comms_manager());
create policy "email_templates_update" on public.communication_email_templates
  for update to authenticated
  using (public.is_comms_manager() or created_by = auth.uid());
create policy "email_templates_delete" on public.communication_email_templates
  for delete to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or (created_by = auth.uid() and not is_system)
  );

-- ─── 3. broadcast_campaigns + app_notifications ──────────────

drop policy if exists "admins_insert_broadcast_campaigns" on public.broadcast_campaigns;
drop policy if exists "admins_update_broadcast_campaigns" on public.broadcast_campaigns;
drop policy if exists "admins_delete_broadcast_campaigns" on public.broadcast_campaigns;
-- (all_select_broadcast_campaigns `using (true)` kept — flagged in the
--  Phase 1 audit as broad-by-design; tightening it is a product decision,
--  not a mechanism swap. Revisit with Phase 6.)
create policy "admins_insert_broadcast_campaigns" on public.broadcast_campaigns
  for insert to authenticated
  with check (public.is_comms_manager() and created_by = auth.uid());
create policy "admins_update_broadcast_campaigns" on public.broadcast_campaigns
  for update to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or (public.is_comms_manager() and created_by = auth.uid())
  )
  with check (
    public.current_user_role() = 'super_admin'
    or (public.is_comms_manager() and created_by = auth.uid())
  );
create policy "admins_delete_broadcast_campaigns" on public.broadcast_campaigns
  for delete to authenticated
  using (public.current_user_role() = 'super_admin' or created_by = auth.uid());

drop policy if exists "admins_insert_notifications" on public.app_notifications;
create policy "admins_insert_notifications" on public.app_notifications
  for insert to authenticated
  with check (public.is_comms_manager() or created_by = auth.uid());

-- ─── 4. tasks + task_status_definitions ─────────────────────

drop policy if exists "tasks_select_lead" on public.tasks;
create policy "tasks_select_lead" on public.tasks
  for select to authenticated
  using (public.has_space_role(auth.uid(), department_id, 'dept_lead'));

drop policy if exists "tasks_update_delete" on public.tasks;
create policy "tasks_update_delete" on public.tasks
  for all to authenticated
  using (
    created_by = auth.uid()
    or public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
  )
  with check (
    created_by = auth.uid()
    or public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
  );

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      is_personal = true
      or public.current_user_role() = 'super_admin'
      or public.has_space_role(auth.uid(), department_id, 'dept_lead')
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.department_id = tasks.department_id
      )
      or exists (
        select 1 from public.space_members sm
        where sm.user_id = auth.uid() and sm.space_id = tasks.department_id
      )
    )
  );

drop policy if exists "status_definitions_select_authenticated" on public.task_status_definitions;
create policy "status_definitions_select_authenticated" on public.task_status_definitions
  for select to authenticated
  using (
    department_id is null
    or public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.department_id = task_status_definitions.department_id
    )
    or exists (
      select 1 from public.space_members sm
      where sm.user_id = auth.uid() and sm.space_id = task_status_definitions.department_id
    )
  );

-- NOTE: preserves the pre-existing looseness where any dept_lead could
-- manage any non-org status (the `is_org_status = false` branch commented
-- into 20260702000002). Mechanism swapped, behavior kept; tightening is a
-- separate product decision.
drop policy if exists "status_definitions_manage_admin" on public.task_status_definitions;
create policy "status_definitions_manage_admin" on public.task_status_definitions
  for all to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or (public.has_space_role_anywhere(auth.uid(), 'dept_lead') and is_org_status = false)
  )
  with check (
    public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or (public.has_space_role_anywhere(auth.uid(), 'dept_lead') and is_org_status = false)
  );

-- ─── 5. folders + lists writes (were dead-deny broken claim) ─

drop policy if exists "folders_write" on public.folders;
create policy "folders_write" on public.folders
  for all to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or created_by = auth.uid()
  )
  with check (
    public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or (
      created_by = auth.uid()
      and (
        exists (select 1 from public.users u
                where u.id = auth.uid() and u.department_id = folders.department_id)
        or exists (select 1 from public.space_members sm
                   where sm.user_id = auth.uid() and sm.space_id = folders.department_id)
      )
    )
  );

drop policy if exists "lists_write" on public.lists;
create policy "lists_write" on public.lists
  for all to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or created_by = auth.uid()
  )
  with check (
    public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or (
      created_by = auth.uid()
      and (
        exists (select 1 from public.users u
                where u.id = auth.uid() and u.department_id = lists.department_id)
        or exists (select 1 from public.space_members sm
                   where sm.user_id = auth.uid() and sm.space_id = lists.department_id)
      )
    )
  );

-- ─── 6. users directory visibility ───────────────────────────
-- Was: current_user_role() in ('super_admin','dept_lead') — org-wide user
-- list for any dept_lead. Swapped: super_admin + regional_secretary
-- (people:view_all) + any space-role manager (they need the directory to
-- assign/manage within their space).

drop policy if exists "users_select_leads" on public.users;
create policy "users_select_leads" on public.users
  for select to authenticated
  using (
    public.current_user_role() in ('super_admin', 'regional_secretary')
    or exists (
      select 1 from public.space_roles sr
      where sr.user_id = auth.uid()
        and sr.role in ('dept_lead', 'ors', 'programs', 'media')
    )
  );

-- ─── 7. goals / meeting_attendance / automations dept_lead ───

drop policy if exists "goals_write_leads" on public.goals;
create policy "goals_write_leads" on public.goals
  for all to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or owner_id = auth.uid()
  )
  with check (
    public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or owner_id = auth.uid()
  );

drop policy if exists "meeting_attendance_write_leads" on public.meeting_attendance;
create policy "meeting_attendance_write_leads" on public.meeting_attendance
  for all to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.has_space_role_anywhere(auth.uid(), 'ors')
    or exists (
      select 1 from public.meetings m
      where m.id = meeting_attendance.meeting_id
        and public.has_space_role(auth.uid(), m.department_id, 'dept_lead')
    )
  )
  with check (
    public.current_user_role() = 'super_admin'
    or public.has_space_role_anywhere(auth.uid(), 'ors')
    or exists (
      select 1 from public.meetings m
      where m.id = meeting_attendance.meeting_id
        and public.has_space_role(auth.uid(), m.department_id, 'dept_lead')
    )
  );

drop policy if exists "automations_write_admin_lead" on public.automations;
create policy "automations_write_admin_lead" on public.automations
  for all to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
  )
  with check (
    public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
  );

-- ─── 8. campus_edits + campuses (base-role 'ors' now dead) ───

drop policy if exists "campus_edits_select_own_or_admin" on public.campus_edits;
create policy "campus_edits_select_own_or_admin" on public.campus_edits
  for select to authenticated
  using (
    auth.uid() = submitted_by
    or public.current_user_role() = 'super_admin'
    or public.has_space_role_anywhere(auth.uid(), 'ors')
  );

drop policy if exists "campus_edits_update_admin_only" on public.campus_edits;
create policy "campus_edits_update_admin_only" on public.campus_edits
  for update to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.has_space_role_anywhere(auth.uid(), 'ors')
  );

drop policy if exists "campuses_edit_admin_ors" on public.campuses;
create policy "campuses_edit_admin_ors" on public.campuses
  for update to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.has_space_role_anywhere(auth.uid(), 'ors')
  )
  with check (
    public.current_user_role() = 'super_admin'
    or public.has_space_role_anywhere(auth.uid(), 'ors')
  );

-- ─── 9. BLW map (prayer_logs / prayer_requests 'ors') ────────

drop policy if exists "prayer_logs_delete_own_or_admin" on public.prayer_logs;
create policy "prayer_logs_delete_own_or_admin" on public.prayer_logs
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_role() = 'super_admin'
    or public.has_space_role_anywhere(auth.uid(), 'ors')
  );

drop policy if exists "prayer_requests_update_own_or_admin" on public.prayer_requests;
create policy "prayer_requests_update_own_or_admin" on public.prayer_requests
  for update to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_role() = 'super_admin'
    or public.has_space_role_anywhere(auth.uid(), 'ors')
  );

drop policy if exists "prayer_requests_delete_own_or_admin" on public.prayer_requests;
create policy "prayer_requests_delete_own_or_admin" on public.prayer_requests
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_role() = 'super_admin'
    or public.has_space_role_anywhere(auth.uid(), 'ors')
  );

-- ─── 10. meeting_minutes + dead org_members policies ─────────
-- Guarded: some remotes never materialized these tables (ledger entries
-- were repaired in without the DDL running), and policy DDL errors on a
-- missing relation even with `if exists`.

do $$
begin
  if to_regclass('public.meeting_minutes') is not null then
    execute 'drop policy if exists "minutes_insert_require_permission" on public.meeting_minutes';
    execute $pol$
      create policy "minutes_insert_require_permission" on public.meeting_minutes
        for insert to authenticated
        with check (
          created_by = auth.uid()
          and (
            public.current_user_role() = 'super_admin'
            or public.has_space_role_anywhere(auth.uid(), 'ors')
            or public.has_space_role_anywhere(auth.uid(), 'dept_lead')
            or public.has_space_role_anywhere(auth.uid(), 'programs')
          )
        )
    $pol$;
  end if;
end $$;

-- Dead policies referencing org_members.role='organizational_rep_secretary'
-- (a vocabulary that matches nothing in this system):
do $$
begin
  if to_regclass('public.meeting_transcriptions') is not null then
    execute 'drop policy if exists "ors_view_all_transcriptions" on public.meeting_transcriptions';
    execute $pol$
      create policy "ors_view_all_transcriptions" on public.meeting_transcriptions
        for select to authenticated
        using (public.has_space_role_anywhere(auth.uid(), 'ors'))
    $pol$;
  end if;

  if to_regclass('public.meeting_action_items') is not null then
    execute 'drop policy if exists "ORS can link action items to tasks" on public.meeting_action_items';
    execute 'drop policy if exists "ors_link_action_items" on public.meeting_action_items';
    execute $pol$
      create policy "ors_link_action_items" on public.meeting_action_items
        for update to authenticated
        using (public.has_space_role_anywhere(auth.uid(), 'ors'))
        with check (public.has_space_role_anywhere(auth.uid(), 'ors'))
    $pol$;
  end if;
end $$;

-- ─── 11. integration_requests dept_lead authority ────────────

do $$
begin
  if to_regclass('public.integration_requests') is not null then
    execute 'drop policy if exists "integration_requests_select_leads" on public.integration_requests';
    execute $pol$
      create policy "integration_requests_select_leads" on public.integration_requests
        for select to authenticated
        using (
          public.current_user_role() = 'super_admin'
          or public.has_space_role(auth.uid(), department_id, 'dept_lead')
        )
    $pol$;
    execute 'drop policy if exists "integration_requests_update" on public.integration_requests';
    execute $pol$
      create policy "integration_requests_update" on public.integration_requests
        for update to authenticated
        using (
          public.current_user_role() = 'super_admin'
          or public.has_space_role(auth.uid(), department_id, 'dept_lead')
        )
        with check (
          public.current_user_role() = 'super_admin'
          or public.has_space_role(auth.uid(), department_id, 'dept_lead')
        )
    $pol$;
  end if;
end $$;

-- ─── 12. can_manage_space(): drop dual identity ──────────────
-- Department-space management now comes ONLY from space_roles (or
-- super_admin / personal-space ownership / explicit space_members
-- owner/manager rows). users.department_id no longer grants anything.
-- regional_secretary deliberately NOT a manager (oversight = view, not
-- manage — locked decision).

create or replace function public.can_manage_space(space_uuid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_type text;
  v_owner_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select d.space_type, d.owner_id
    into v_space_type, v_owner_id
  from public.departments d
  where d.id = space_uuid;

  if not found then
    return false;
  end if;

  if v_space_type = 'personal' then
    return v_owner_id = auth.uid();
  end if;

  if public.is_super_admin() then
    return true;
  end if;

  if v_space_type = 'department' then
    return exists (
      select 1 from public.space_roles sr
      where sr.user_id = auth.uid()
        and sr.space_id = space_uuid
        and sr.role in ('dept_lead', 'ors', 'programs', 'media')
    );
  end if;

  if v_owner_id = auth.uid() then
    return true;
  end if;

  return exists (
    select 1
    from public.space_members sm
    where sm.space_id = space_uuid
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'manager')
  );
end;
$$;

-- ─── 13. can_manage_roster(): dual identity fully deleted ────

create or replace function public.can_manage_roster()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() in ('super_admin', 'regional_secretary')
    or public.has_space_role_anywhere(auth.uid(), 'ors')
    or public.has_space_role_anywhere(auth.uid(), 'programs')
    or public.has_space_role_anywhere(auth.uid(), 'dept_lead');
$$;

comment on function public.can_manage_roster() is
  'Roster (expected_attendees) managers. Space-roles-backed since the Phase 3 RLS swap; the ORS department-name dual-identity check is retired.';
