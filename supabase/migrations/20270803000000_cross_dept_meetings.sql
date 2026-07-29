-- ================================================================
-- Cross-Department Meetings: junction table for multi-space sharing
-- ================================================================
-- Allows a meeting (with primary department_id) to be explicitly
-- shared with additional departments via meeting_spaces rows.
--
-- RLS policies use scalar-subquery wrapping (SELECT auth.uid(), etc.)
-- to prevent per-row re-evaluation, matching the established pattern
-- across 136+ existing policies.
--
-- The meetings_select policy is dropped and recreated (not altered)
-- because boolean OR expressions can't be appended via ALTER POLICY.
-- This is a deliberate exception to the ALTER POLICY discipline.
-- ================================================================

-- ── Table: meeting_spaces ─────────────────────────────────────────
-- Junction table linking meetings to departments they're shared with.
-- Primary key is (meeting_id, department_id) to enforce uniqueness.

create table public.meeting_spaces (
  meeting_id    uuid not null references public.meetings(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  added_by      uuid references public.users(id) on delete set null,
  added_at      timestamptz not null default now(),
  primary key (meeting_id, department_id)
);

create index meeting_spaces_dept_idx on public.meeting_spaces(department_id);

alter table public.meeting_spaces enable row level security;

-- ── Policy: meeting_spaces_select ─────────────────────────────────
-- SELECT: anyone who can already see the parent meeting can see who
-- it is shared with. Uses scalar-subquery wrapping on auth.uid() and
-- role/dept functions to prevent per-row re-evaluation.

create policy "meeting_spaces_select" on public.meeting_spaces
  for select to authenticated using (
    (select public.current_user_role()) = 'super_admin'
    or exists (
      select 1 from public.meetings m where m.id = meeting_spaces.meeting_id
        and (
          m.created_by = (select auth.uid())
          or (select auth.uid()) = any(m.allowed_viewers)
          or (select auth.uid()) = any(m.allowed_editors)
          or (m.visibility = 'published' and (m.department_id = (select public.current_user_department()) or m.department_id is null))
        )
    )
  );

-- ── Policy: meeting_spaces_insert ─────────────────────────────────
-- INSERT: creator, allowed editor, dept_lead, or super_admin can add
-- shared departments.

create policy "meeting_spaces_insert" on public.meeting_spaces
  for insert to authenticated with check (
    added_by = (select auth.uid())
    and (
      (select public.current_user_role()) in ('super_admin', 'dept_lead')
      or exists (
        select 1 from public.meetings m where m.id = meeting_spaces.meeting_id
          and (m.created_by = (select auth.uid()) or (select auth.uid()) = any(m.allowed_editors))
      )
    )
  );

-- ── Policy: meeting_spaces_delete ─────────────────────────────────
-- DELETE: same authorization as INSERT.

create policy "meeting_spaces_delete" on public.meeting_spaces
  for delete to authenticated using (
    (select public.current_user_role()) in ('super_admin', 'dept_lead')
    or exists (
      select 1 from public.meetings m where m.id = meeting_spaces.meeting_id
        and (m.created_by = (select auth.uid()) or (select auth.uid()) = any(m.allowed_editors))
    )
  );

-- ── Patch: meetings_select policy ─────────────────────────────────
-- Dropped and recreated (not altered) to add a new OR clause for
-- cross-dept shared meetings. The clause gates on visibility='published'
-- and checks if a row exists in meeting_spaces matching the viewer's
-- current department.
--
-- PERFORMANCE NOTE: This creates a circular policy reference:
-- meetings_select → EXISTS (meeting_spaces) → meetings_select.
-- Functionally safe (Postgres doesn't recurse on different tables),
-- but the scalar-subquery wrapping is critical to avoid per-row
-- re-evaluation of auth.uid() etc. worth EXPLAIN ANALYZE on realistic
-- data (meetings + meeting_spaces corpus) before production deploy.

drop policy if exists "meetings_select" on public.meetings;

create policy "meetings_select" on public.meetings
  for select to authenticated
  using (
    (
      (select public.current_user_role()) = 'super_admin'
      and not public.is_regionalsecretary_private_meeting(created_by, visibility)
    )
    or created_by = (select auth.uid())
    or (select auth.uid()) = any(allowed_viewers)
    or (select auth.uid()) = any(allowed_editors)
    or (
      ((select public.current_user_role()) = 'regional_secretary'
       or public.has_space_role_anywhere((select auth.uid()), 'ors'))
      and visibility = 'published'
    )
    or (
      public.has_space_role((select auth.uid()), department_id, 'dept_lead')
      and visibility = 'published'
    )
    or (
      public.user_has_grant((select auth.uid()), 'meetings_manager')
      and visibility = 'published'
    )
    or exists (
      select 1 from public.group_space_members gsm
      where gsm.user_id = (select auth.uid())
        and gsm.group_space_id = meetings.department_id
    )
    or (
      visibility = 'published'
      -- group_space_members are covered by the gsm EXISTS clause above;
      -- no role exclusion needed here for real authenticated users
      and (department_id = (select public.current_user_department()) or department_id is null)
    )
    -- NEW: cross-dept share clause
    -- published meeting explicitly shared with viewer's department
    or (
      visibility = 'published'
      -- group_space_members are covered by the gsm EXISTS clause above;
      -- no role exclusion needed here for real authenticated users
      and exists (
        select 1 from public.meeting_spaces ms
        where ms.meeting_id = meetings.id
          and ms.department_id = (select public.current_user_department())
      )
    )
  );

-- ── Patch: meeting_open_items_select policy ────────────────────────
-- Add the same cross-dept clause so members of a shared department
-- can also read open items for that meeting.

drop policy if exists "open_items_select" on public.meeting_open_items;

create policy "open_items_select" on public.meeting_open_items
  for select to authenticated
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_open_items.meeting_id
        and (
          (
            (select public.current_user_role()) = 'super_admin'
            and not public.is_regionalsecretary_private_meeting(m.created_by, m.visibility)
          )
          or m.created_by = (select auth.uid())
          or (select auth.uid()) = any(m.allowed_editors)
          or (
            ((select public.current_user_role()) = 'regional_secretary'
             or public.has_space_role_anywhere((select auth.uid()), 'ors'))
            and m.visibility = 'published'
          )
          or (
            public.has_space_role((select auth.uid()), m.department_id, 'dept_lead')
            and m.visibility = 'published'
          )
          or (
            public.user_has_grant((select auth.uid()), 'meetings_manager')
            and m.visibility = 'published'
          )
          or exists (
            select 1 from public.group_space_members gsm
            where gsm.user_id = (select auth.uid()) and gsm.group_space_id = m.department_id
          )
          or (
            m.visibility = 'published'
            -- group_space_members are covered by the gsm EXISTS clause above;
            -- no role exclusion needed here for real authenticated users
            and (m.department_id = (select public.current_user_department()) or m.department_id is null)
          )
          or (
            (select auth.uid()) = any(m.allowed_viewers)
            and (m.meeting_type is distinct from '1_on_1_meeting'
                 or (select auth.uid()) = any(m.notes_shared_with))
          )
          -- NEW: cross-dept share clause
          -- Members of a shared department can see open items created for
          -- their own department or org-wide, but not items created for other depts.
          or (
            m.visibility = 'published'
            -- group_space_members are covered by the gsm EXISTS clause above;
            -- no role exclusion needed here for real authenticated users
            and exists (
              select 1 from public.meeting_spaces ms
              where ms.meeting_id = m.id
                and ms.department_id = (select public.current_user_department())
            )
            and (
              meeting_open_items.space_id is null
              or meeting_open_items.space_id = (select public.current_user_department())
            )
          )
        )
    )
  );
