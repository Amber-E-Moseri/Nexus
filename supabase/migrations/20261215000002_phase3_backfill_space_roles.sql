-- ============================================================
-- PHASE 3 (3/5) — Backfill space_roles from the approved mapping
-- ============================================================
-- Source: PHASE3_AUDIT.md §6, approved by Amber 2026-07-09. Only two
-- live users hold role in ('ors','media','programs','dept_lead');
-- both map cleanly to their current department (no ambiguous rows).
--
--   Amber 2 (ceba851c-1539-429b-a710-b6b76d54a8e4)
--     role='ors', department=ORS (740b2809-b821-4861-b323-c37612de7741)
--     -> space_roles(ORS, 'ors') + base role flips to 'member'
--        ('ors' stops being a valid base-role value once the CHECK
--        shrinks in the next migration — see that file's header).
--
--   Pastor Chi Nwokem (4c70ca61-443b-4a64-87aa-3453c9dd5c65)
--     role='dept_lead', department=Programs (0654615d-9bb2-4b1c-a56d-1f50c5add60e)
--     -> space_roles(Programs, 'dept_lead'); base role stays 'dept_lead'
--        (still a valid CHECK value post-shrink — now a label only,
--        per the locked design decision; his real authority in
--        Programs comes from this space_roles row once RLS is swapped).
--
-- granted_by on both rows = 3e5ad72c-1da4-4cde-9220-97e82c920e4e, the
-- confirmed real/active super_admin account (moseriewere@gmail.com —
-- see DUPLICATE_ACCOUNT_CLEANUP.md for how the other super_admin
-- account, aemoseri@my.yorku.ca, was ruled out and separately demoted).
--
-- Wrapped explicitly in BEGIN/COMMIT per Amber's requirement: no
-- intermediate state where Amber 2 has neither her old 'ors' role
-- coverage nor the new space_roles row. Both inserts and the role
-- flip below either all land or none do.
-- ============================================================

begin;

do $$
declare
  v_granted_by uuid := '3e5ad72c-1da4-4cde-9220-97e82c920e4e';
  v_amber_id uuid := 'ceba851c-1539-429b-a710-b6b76d54a8e4';
  v_ors_space uuid := '740b2809-b821-4861-b323-c37612de7741';
  v_chi_id uuid := '4c70ca61-443b-4a64-87aa-3453c9dd5c65';
  v_programs_space uuid := '0654615d-9bb2-4b1c-a56d-1f50c5add60e';
begin
  -- Guard: fail loudly rather than silently no-op if the mapping's
  -- source data has moved since the audit was approved.
  if not exists (select 1 from public.users where id = v_granted_by) then
    raise exception 'Phase 3 backfill: granted_by user % not found', v_granted_by;
  end if;

  if not exists (select 1 from public.users where id = v_amber_id and role in ('ors', 'member')) then
    raise exception 'Phase 3 backfill: Amber 2 (%) not found or role is neither ors nor member — mapping may be stale', v_amber_id;
  end if;

  if not exists (select 1 from public.users where id = v_chi_id and role = 'dept_lead') then
    raise exception 'Phase 3 backfill: Pastor Chi Nwokem (%) not found or role is not dept_lead — mapping may be stale', v_chi_id;
  end if;

  -- Amber 2: ORS space role + base role flip (single statement group,
  -- both inside this already-open transaction).
  insert into public.space_roles (user_id, space_id, role, granted_by)
  values (v_amber_id, v_ors_space, 'ors', v_granted_by)
  on conflict (user_id, space_id, role) do nothing;

  update public.users
  set role = 'member'
  where id = v_amber_id and role = 'ors';

  -- Pastor Chi Nwokem: Programs dept_lead space role. Base role is
  -- already 'dept_lead' and stays that way (label only, post-shrink).
  insert into public.space_roles (user_id, space_id, role, granted_by)
  values (v_chi_id, v_programs_space, 'dept_lead', v_granted_by)
  on conflict (user_id, space_id, role) do nothing;
end $$;

commit;
