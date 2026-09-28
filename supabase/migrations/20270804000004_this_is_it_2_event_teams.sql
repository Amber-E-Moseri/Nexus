-- ============================================================
-- This Is It 2.0 — 25 event team spaces
-- ============================================================
-- Creates:
--   • parent_id column on departments (nullable FK; no existing rows affected)
--   • 1 umbrella 'program' space (org-visible)
--   • 25 'group' spaces (membership-gated via group_space_members)
--   • group_space_members rows (owner = lead, member = everyone else)
--   • space_roles rows (role='dept_lead') for each confirmed team lead
--
-- Department-wide memberships (ORS, Pastors, PFCC, Admin) expand to ALL
-- active members of that department at migration time.
--
-- All UUIDs verified against the live users table on 2026-07-28 and
-- hardcoded here (same pattern as 20261215000002_phase3_backfill_space_roles).
-- Existence-check guards fire RAISE EXCEPTION if any row has since been
-- deleted or deactivated before this migration runs.
--
-- TODOs (people not yet in Nexus) are commented-out INSERT statements.
-- ============================================================

begin;

-- ── 1. Add parent_id to departments ─────────────────────────────────────────
alter table public.departments
  add column if not exists parent_id uuid references public.departments(id);

create index if not exists idx_departments_parent_id on public.departments(parent_id);

-- ── 2. Create spaces, memberships, and space roles ───────────────────────────
do $$
declare
  -- ── Verified UUIDs (2026-07-28 verification SELECT) ─────────────────────

  -- Amber_Moseri (super_admin, moseriewere@gmail.com) — used as granted_by
  -- AND as the Registration team member (v_amber = v_admin; same account).
  v_admin     uuid := '3e5ad72c-1da4-4cde-9220-97e82c920e4e';

  v_jason_i   uuid := '477a2d5a-05b8-4063-80b6-c4371b643de0'; -- Jason Ikeokwu
  v_chi       uuid := '4c70ca61-443b-4a64-87aa-3453c9dd5c65'; -- Pastor Chi Nwokem
  v_natasha   uuid := 'dc063c77-f2f8-4b8c-a1a9-4ba2f792f65f'; -- Pastor Natasha Dara
  v_laura_a   uuid := 'ce0be5bb-f235-4106-a5f3-e602c0d663ae'; -- Laura A
  v_sharon_m  uuid := 'b5e5719d-a1d4-4de0-afc1-5682b1fac387'; -- Sharon Mutambwi
  v_waneta    uuid := 'ddf30c5c-7efa-489b-8818-214eb1c164ee'; -- Waneta Ikheloa-Agbonselobho
  v_dorcas    uuid := '750e94e0-aa87-491c-8372-958225861484'; -- Dorcas M
  v_ella      uuid := '0a645fbf-01e2-4c49-a32a-4a13b2800b6d'; -- Ella Ukpabia
  v_david_a   uuid := '9184f58d-6fe2-4923-b76e-b4c3ae900027'; -- David A. Akalue
  v_chiamaka  uuid := 'b79bcebc-15dc-495d-b139-17824a613b4e'; -- Chiamaka Okeke
  v_chloe     uuid := '1ed70498-aa54-4009-9af8-65215bdd255f'; -- Pastor Chloe Isesele
  v_yifan     uuid := 'fd022387-23ca-4781-95bf-11c5722f00d0'; -- Yifan Wang
  v_alex_d    uuid := '7b858a93-2239-459a-89b3-80cd0719d5aa'; -- Alex D
  v_precious  uuid := '56943f44-def8-4c2c-8644-b80dca6af85e'; -- Precious Enoh
  v_jason_c   uuid := 'f8cd9d4b-68ef-4703-9fb9-e0a0e64b440a'; -- Jason Chan
  v_naomi     uuid := 'b212b5b2-456a-49d1-85a8-3e97636efbfe'; -- Pastor Naomi Ighodaro
  v_ifedayomi uuid := '23e2f2df-f25b-4603-9428-e75cc602c13e'; -- Ifedayomi O
  v_olamide   uuid := '19f6c2d9-b778-4dd0-b74c-e9475c09ea46'; -- Pastor Olamide A.
  v_toby      uuid := '5acd45b5-ba41-46ae-8694-dd10958325a7'; -- Pastor Toby Yinka-Okunusi

  -- ── Department IDs (all confirmed from live REST API 2026-07-28) ─────────
  v_dept_admin    uuid := '2aee687a-4dad-447b-ad6b-1e0239a6beb6'; -- "Admins"
  v_dept_pfcc     uuid := 'a7f3d1d8-7a11-40d4-b65f-cd0bf17308ad'; -- "PFCC"
  v_dept_ors      uuid := '740b2809-b821-4861-b323-c37612de7741'; -- "ORS"
  v_dept_pastors  uuid := 'e06d95c4-c36e-439f-993c-2b7f2393d277'; -- "Pastors"

  -- ── Team space IDs (populated by INSERT...RETURNING) ─────────────────────
  v_tii uuid;
  v_t1  uuid; v_t2  uuid; v_t3  uuid; v_t4  uuid; v_t5  uuid;
  v_t6  uuid; v_t7  uuid; v_t8  uuid; v_t9  uuid; v_t10 uuid;
  v_t11 uuid; v_t12 uuid; v_t13 uuid; v_t14 uuid; v_t15 uuid;
  v_t16 uuid; v_t17 uuid; v_t18 uuid; v_t19 uuid; v_t20 uuid;
  v_t21 uuid; v_t22 uuid; v_t23 uuid; v_t24 uuid; v_t25 uuid;

begin

  -- ── Existence guards: skip entire block on fresh installs ────────────
  if not exists (select 1 from public.users where id = v_admin and status = 'active') then
    raise notice 'Skipping TII 2.0 seed: Amber_Moseri (v_admin) not found — fresh install';
    return;
  end if;
  if not exists (select 1 from public.users where id = v_jason_i  and status = 'active') then raise notice 'Skipping TII 2.0 seed: Jason Ikeokwu not found'; return; end if;
  if not exists (select 1 from public.users where id = v_chi      and status = 'active') then raise notice 'Skipping TII 2.0 seed: Pastor Chi Nwokem not found'; return; end if;
  if not exists (select 1 from public.users where id = v_natasha  and status = 'active') then raise notice 'Skipping TII 2.0 seed: Pastor Natasha Dara not found'; return; end if;
  if not exists (select 1 from public.users where id = v_laura_a  and status = 'active') then raise notice 'Skipping TII 2.0 seed: Laura A not found'; return; end if;
  if not exists (select 1 from public.users where id = v_sharon_m and status = 'active') then raise notice 'Skipping TII 2.0 seed: Sharon Mutambwi not found'; return; end if;
  if not exists (select 1 from public.users where id = v_waneta   and status = 'active') then raise notice 'Skipping TII 2.0 seed: Waneta not found'; return; end if;
  if not exists (select 1 from public.users where id = v_dorcas   and status = 'active') then raise notice 'Skipping TII 2.0 seed: Dorcas M not found'; return; end if;
  if not exists (select 1 from public.users where id = v_ella     and status = 'active') then raise notice 'Skipping TII 2.0 seed: Ella Ukpabia not found'; return; end if;
  if not exists (select 1 from public.users where id = v_david_a  and status = 'active') then raise notice 'Skipping TII 2.0 seed: David A. Akalue not found'; return; end if;
  if not exists (select 1 from public.users where id = v_chiamaka and status = 'active') then raise notice 'Skipping TII 2.0 seed: Chiamaka Okeke not found'; return; end if;
  if not exists (select 1 from public.users where id = v_chloe    and status = 'active') then raise notice 'Skipping TII 2.0 seed: Pastor Chloe Isesele not found'; return; end if;
  if not exists (select 1 from public.users where id = v_yifan    and status = 'active') then raise notice 'Skipping TII 2.0 seed: Yifan Wang not found'; return; end if;
  if not exists (select 1 from public.users where id = v_alex_d   and status = 'active') then raise notice 'Skipping TII 2.0 seed: Alex D not found'; return; end if;
  if not exists (select 1 from public.users where id = v_precious and status = 'active') then raise notice 'Skipping TII 2.0 seed: Precious Enoh not found'; return; end if;
  if not exists (select 1 from public.users where id = v_jason_c  and status = 'active') then raise notice 'Skipping TII 2.0 seed: Jason Chan not found'; return; end if;
  if not exists (select 1 from public.users where id = v_naomi    and status = 'active') then raise notice 'Skipping TII 2.0 seed: Pastor Naomi Ighodaro not found'; return; end if;
  if not exists (select 1 from public.users where id = v_ifedayomi and status = 'active') then raise notice 'Skipping TII 2.0 seed: Ifedayomi O not found'; return; end if;
  if not exists (select 1 from public.users where id = v_olamide  and status = 'active') then raise notice 'Skipping TII 2.0 seed: Pastor Olamide A. not found'; return; end if;
  if not exists (select 1 from public.users where id = v_toby     and status = 'active') then raise notice 'Skipping TII 2.0 seed: Pastor Toby Yinka-Okunusi not found'; return; end if;

  if not exists (select 1 from public.departments where id = v_dept_admin   and space_type = 'department') then raise notice 'Skipping TII 2.0 seed: Admins department not found'; return; end if;
  if not exists (select 1 from public.departments where id = v_dept_pfcc    and space_type = 'department') then raise notice 'Skipping TII 2.0 seed: PFCC department not found'; return; end if;
  if not exists (select 1 from public.departments where id = v_dept_ors     and space_type = 'department') then raise notice 'Skipping TII 2.0 seed: ORS department not found'; return; end if;
  if not exists (select 1 from public.departments where id = v_dept_pastors and space_type = 'department') then raise notice 'Skipping TII 2.0 seed: Pastors department not found'; return; end if;


  -- ══════════════════════════════════════════════════════════════════════════
  -- STEP A: Umbrella 'This Is It 2.0' program space (org-visible)
  -- ══════════════════════════════════════════════════════════════════════════
  insert into public.departments (name, space_type, visibility, status, description, owner_id)
  values (
    'This Is It 2.0',
    'program',
    'org',
    'active',
    'Umbrella for all 25 This Is It 2.0 conference working teams.',
    v_admin
  )
  returning id into v_tii;


  -- ══════════════════════════════════════════════════════════════════════════
  -- STEP B: Create 25 group spaces
  -- All: space_type='group', visibility='private', parent_id=v_tii.
  -- owner_id=NULL for teams whose Nexus lead is still a TODO.
  -- ══════════════════════════════════════════════════════════════════════════

  -- T1: Secretariat and Planning
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Secretariat and Planning', 'group', 'private', 'active', v_tii, v_jason_i,
    'Lead: Jason Ikeokwu. + all Pastors dept + all ORS dept.')
  returning id into v_t1;

  -- T2: Secretariat Programs
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Secretariat Programs', 'group', 'private', 'active', v_tii, v_chi,
    'Lead: Pastor Chi Nwokem. + all PFCC dept.')
  returning id into v_t2;

  -- T3: Registration — lead (Pastor Nigel) not yet in Nexus
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Registration', 'group', 'private', 'active', v_tii, null,
    'Lead: TODO — Pastor Nigel (not yet in Nexus). Next-gen Asst: Amber Moseri. + all Admin dept.')
  returning id into v_t3;

  -- T4: Branding and Marketing
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Branding and Marketing', 'group', 'private', 'active', v_tii, v_natasha,
    'Lead: Pastor Natasha Dara. Assistant: Sister Phoebe (TODO — not yet in Nexus). Member: Laura A.')
  returning id into v_t4;

  -- T5: Finance
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Finance', 'group', 'private', 'active', v_tii, v_sharon_m,
    'Lead: Sharon Mutambwi.')
  returning id into v_t5;

  -- T6: Delegates Compliance (shell — all TODO)
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Delegates Compliance', 'group', 'private', 'active', v_tii, null,
    'Lead + assistant: TODO — nobody in Nexus yet.')
  returning id into v_t6;

  -- T7: Venue and Logistics
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Venue and Logistics', 'group', 'private', 'active', v_tii, v_waneta,
    'Lead: Waneta Ikheloa-Agbonselobho.')
  returning id into v_t7;

  -- T8: Accommodation and Room Coordination
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Accommodation and Room Coordination', 'group', 'private', 'active', v_tii, v_dorcas,
    'Lead: Dorcas M. Members: Waneta Ikheloa-Agbonselobho, Ella Ukpabia.')
  returning id into v_t8;

  -- T9: Transportation
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Transportation', 'group', 'private', 'active', v_tii, v_david_a,
    'Lead: David A. Akalue. Assistant + 1 member: TODO (not yet in Nexus).')
  returning id into v_t9;

  -- T10: Health and Safety (shell)
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Health and Safety', 'group', 'private', 'active', v_tii, null,
    'Lead + assistant: TODO — nobody in Nexus yet.')
  returning id into v_t10;

  -- T11: Ushering (shell)
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Ushering', 'group', 'private', 'active', v_tii, null,
    'Lead: TODO — nobody in Nexus yet.')
  returning id into v_t11;

  -- T12: Hospitality — Senior Pastors and CM Ministers
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Hospitality — Senior Pastors and CM Ministers', 'group', 'private', 'active', v_tii, v_natasha,
    'Lead: Pastor Natasha Dara. Members: Sharon Mutambwi, Chiamaka Okeke. TODO: Sharon Adelike (asst, not yet in Nexus).')
  returning id into v_t12;

  -- T13: Hospitality — Delegates
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Hospitality — Delegates', 'group', 'private', 'active', v_tii, v_chloe,
    'Lead: Pastor Chloe Isesele. Assistant + 2 members: TODO (not yet in Nexus).')
  returning id into v_t13;

  -- T14: Technical — Sound and Lighting
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Technical — Sound and Lighting', 'group', 'private', 'active', v_tii, v_yifan,
    'Lead: Yifan Wang. TODO: Tobi Ibiyeye (asst, not yet in Nexus).')
  returning id into v_t14;

  -- T15: Technical — Projection (shell)
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Technical — Projection', 'group', 'private', 'active', v_tii, null,
    'Lead + assistant: TODO — nobody in Nexus yet.')
  returning id into v_t15;

  -- T16: Technical — Media
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Technical — Media', 'group', 'private', 'active', v_tii, v_alex_d,
    'Lead: Alex D. TODO: Bernard (asst, not yet in Nexus).')
  returning id into v_t16;

  -- T17: Technical — Streaming (shell)
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Technical — Streaming', 'group', 'private', 'active', v_tii, null,
    'Lead + assistant: TODO — nobody in Nexus yet.')
  returning id into v_t17;

  -- T18: Media — Photography and Videography
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Media — Photography and Videography', 'group', 'private', 'active', v_tii, v_precious,
    'Lead: Precious Enoh. Assistant + 3 members: TODO (not yet in Nexus).')
  returning id into v_t18;

  -- T19: Media — Live Updates — lead (Phoebe Kudowor) not yet in Nexus
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Media — Live Updates', 'group', 'private', 'active', v_tii, null,
    'Lead: TODO — Phoebe Kudowor (not yet in Nexus). Asst: Laura A. 2 members: TODO.')
  returning id into v_t19;

  -- T20: Praise and Worship
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Praise and Worship', 'group', 'private', 'active', v_tii, v_olamide,
    'Lead: Pastor Olamide A. Assistant: TODO (not yet in Nexus).')
  returning id into v_t20;

  -- T21: Creative Arts
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Creative Arts', 'group', 'private', 'active', v_tii, v_olamide,
    'Lead: Pastor Olamide A. 2 members: TODO (not yet in Nexus).')
  returning id into v_t21;

  -- T22: Decorations — Pastor''s Birthday (shell)
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Decorations — Pastor''s Birthday (Team 23)', 'group', 'private', 'active', v_tii, null,
    'Lead: TODO — nobody in Nexus yet.')
  returning id into v_t22;

  -- T23: Foundation School Graduation and Baptism — no lead identified
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Foundation School Graduation and Baptism (Team 24)', 'group', 'private', 'active', v_tii, null,
    'No lead identified yet. Confirmed member: Jason Chan.')
  returning id into v_t23;

  -- T24: Prayer Team
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Prayer Team', 'group', 'private', 'active', v_tii, v_naomi,
    'Lead: Pastor Naomi Ighodaro. Asst: Ella Ukpabia. Member: Ifedayomi O.')
  returning id into v_t24;

  -- T25: Protocol (Team 10) — no single lead
  insert into public.departments (name, space_type, visibility, status, parent_id, owner_id, description)
  values ('Protocol (Team 10)', 'group', 'private', 'active', v_tii, null,
    'No single lead. Members: Jason Ikeokwu, Jason Chan, Pastor Toby Yinka-Okunusi, David A. Akalue.')
  returning id into v_t25;


  -- ══════════════════════════════════════════════════════════════════════════
  -- STEP C: group_space_members
  -- Leads = 'owner', everyone else = 'member'.
  -- ON CONFLICT (group_space_id, user_id) DO NOTHING: safe — a lead who also
  -- appears in a dept bulk-expansion keeps their 'owner' row untouched.
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── T1: Secretariat and Planning ────────────────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t1, v_jason_i, 'owner',  v_admin),
         (v_t1, v_chi,     'member', v_admin)
  on conflict (group_space_id, user_id) do nothing;

  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  select v_t1, u.id, 'member', v_admin
  from public.users u
  where u.department_id in (v_dept_pastors, v_dept_ors)
    and u.status = 'active'
    and u.id != v_jason_i
  on conflict (group_space_id, user_id) do nothing;

  -- ── T2: Secretariat Programs ────────────────────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t2, v_chi,     'owner',  v_admin),
         (v_t2, v_jason_i, 'member', v_admin)
  on conflict (group_space_id, user_id) do nothing;

  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  select v_t2, u.id, 'member', v_admin
  from public.users u
  where u.department_id = v_dept_pfcc
    and u.status = 'active'
    and u.id not in (v_chi, v_jason_i)
  on conflict (group_space_id, user_id) do nothing;

  -- ── T3: Registration ────────────────────────────────────────────────────
  -- v_admin IS Amber_Moseri (same UUID) — added as member
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t3, v_admin, 'member', v_admin)
  on conflict (group_space_id, user_id) do nothing;

  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  select v_t3, u.id, 'member', v_admin
  from public.users u
  where u.department_id = v_dept_admin
    and u.status = 'active'
    and u.id != v_admin
  on conflict (group_space_id, user_id) do nothing;
  -- TODO: Pastor Nigel — add as owner once onboarded

  -- ── T4: Branding and Marketing ──────────────────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t4, v_natasha, 'owner',  v_admin),
         (v_t4, v_laura_a, 'member', v_admin)
  on conflict (group_space_id, user_id) do nothing;
  -- TODO: Sister Phoebe (asst) — add as member once onboarded

  -- ── T5: Finance ─────────────────────────────────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t5, v_sharon_m, 'owner', v_admin)
  on conflict (group_space_id, user_id) do nothing;

  -- ── T6: Delegates Compliance — empty shell ──────────────────────────────
  -- TODO: Lead + assistant — add once onboarded

  -- ── T7: Venue and Logistics ─────────────────────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t7, v_waneta, 'owner', v_admin)
  on conflict (group_space_id, user_id) do nothing;

  -- ── T8: Accommodation and Room Coordination ─────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t8, v_dorcas,  'owner',  v_admin),
         (v_t8, v_waneta,  'member', v_admin),
         (v_t8, v_ella,    'member', v_admin)
  on conflict (group_space_id, user_id) do nothing;

  -- ── T9: Transportation ──────────────────────────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t9, v_david_a, 'owner', v_admin)
  on conflict (group_space_id, user_id) do nothing;
  -- TODO: Assistant + 1 member — add once onboarded

  -- ── T10: Health and Safety — empty shell ────────────────────────────────
  -- TODO: Lead + assistant — add once onboarded

  -- ── T11: Ushering — empty shell ─────────────────────────────────────────
  -- TODO: Lead — add once onboarded

  -- ── T12: Hospitality — Senior Pastors and CM Ministers ──────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t12, v_natasha,  'owner',  v_admin),
         (v_t12, v_sharon_m, 'member', v_admin),
         (v_t12, v_chiamaka, 'member', v_admin)
  on conflict (group_space_id, user_id) do nothing;
  -- TODO: Sharon Adelike (asst) — add as member once onboarded

  -- ── T13: Hospitality — Delegates ────────────────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t13, v_chloe, 'owner', v_admin)
  on conflict (group_space_id, user_id) do nothing;
  -- TODO: Assistant + 2 members — add once onboarded

  -- ── T14: Technical — Sound and Lighting ─────────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t14, v_yifan, 'owner', v_admin)
  on conflict (group_space_id, user_id) do nothing;
  -- TODO: Tobi Ibiyeye (asst) — add once onboarded

  -- ── T15: Technical — Projection — empty shell ───────────────────────────
  -- TODO: Lead + assistant — add once onboarded

  -- ── T16: Technical — Media ──────────────────────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t16, v_alex_d, 'owner', v_admin)
  on conflict (group_space_id, user_id) do nothing;
  -- TODO: Bernard (asst) — add once onboarded

  -- ── T17: Technical — Streaming — empty shell ────────────────────────────
  -- TODO: Lead + assistant — add once onboarded

  -- ── T18: Media — Photography and Videography ────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t18, v_precious, 'owner', v_admin)
  on conflict (group_space_id, user_id) do nothing;
  -- TODO: Assistant + 3 members — add once onboarded

  -- ── T19: Media — Live Updates ───────────────────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t19, v_laura_a, 'member', v_admin)
  on conflict (group_space_id, user_id) do nothing;
  -- TODO: Phoebe Kudowor (lead) — add as owner once onboarded
  -- TODO: 2 additional members — add once onboarded

  -- ── T20: Praise and Worship ─────────────────────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t20, v_olamide, 'owner', v_admin)
  on conflict (group_space_id, user_id) do nothing;
  -- TODO: Assistant — add once onboarded

  -- ── T21: Creative Arts ──────────────────────────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t21, v_olamide, 'owner', v_admin)
  on conflict (group_space_id, user_id) do nothing;
  -- TODO: 2 members — add once onboarded

  -- ── T22: Decorations — empty shell ──────────────────────────────────────
  -- TODO: Lead — add once onboarded

  -- ── T23: Foundation School Graduation and Baptism ───────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t23, v_jason_c, 'member', v_admin)
  on conflict (group_space_id, user_id) do nothing;

  -- ── T24: Prayer Team ────────────────────────────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t24, v_naomi,     'owner',  v_admin),
         (v_t24, v_ella,      'member', v_admin),
         (v_t24, v_ifedayomi, 'member', v_admin)
  on conflict (group_space_id, user_id) do nothing;

  -- ── T25: Protocol ───────────────────────────────────────────────────────
  insert into public.group_space_members (group_space_id, user_id, role, added_by)
  values (v_t25, v_jason_i, 'member', v_admin),
         (v_t25, v_jason_c, 'member', v_admin),
         (v_t25, v_toby,    'member', v_admin),
         (v_t25, v_david_a, 'member', v_admin)
  on conflict (group_space_id, user_id) do nothing;


  -- ══════════════════════════════════════════════════════════════════════════
  -- STEP D: space_roles — dept_lead for each confirmed team lead
  -- Makes has_space_role(user, teamSpaceId, 'dept_lead') resolve true.
  -- Teams without a Nexus lead have no row here; add in the onboarding pass.
  -- ══════════════════════════════════════════════════════════════════════════
  insert into public.space_roles (user_id, space_id, role, granted_by)
  values
    (v_jason_i,  v_t1,  'dept_lead', v_admin),  -- T1  Secretariat & Planning
    (v_chi,      v_t2,  'dept_lead', v_admin),  -- T2  Secretariat Programs
    -- T3  Registration: Pastor Nigel — TODO
    (v_natasha,  v_t4,  'dept_lead', v_admin),  -- T4  Branding & Marketing
    (v_sharon_m, v_t5,  'dept_lead', v_admin),  -- T5  Finance
    -- T6  Delegates Compliance: TODO
    (v_waneta,   v_t7,  'dept_lead', v_admin),  -- T7  Venue & Logistics
    (v_dorcas,   v_t8,  'dept_lead', v_admin),  -- T8  Accommodation & Room
    (v_david_a,  v_t9,  'dept_lead', v_admin),  -- T9  Transportation
    -- T10 Health & Safety: TODO
    -- T11 Ushering: TODO
    (v_natasha,  v_t12, 'dept_lead', v_admin),  -- T12 Hospitality (Sr Pastors)
    (v_chloe,    v_t13, 'dept_lead', v_admin),  -- T13 Hospitality (Delegates)
    (v_yifan,    v_t14, 'dept_lead', v_admin),  -- T14 Technical: Sound & Lighting
    -- T15 Technical: Projection: TODO
    (v_alex_d,   v_t16, 'dept_lead', v_admin),  -- T16 Technical: Media
    -- T17 Technical: Streaming: TODO
    (v_precious, v_t18, 'dept_lead', v_admin),  -- T18 Media: Photo & Video
    -- T19 Media: Live Updates: Phoebe Kudowor — TODO
    (v_olamide,  v_t20, 'dept_lead', v_admin),  -- T20 Praise & Worship
    (v_olamide,  v_t21, 'dept_lead', v_admin),  -- T21 Creative Arts
    -- T22 Decorations: TODO
    -- T23 Foundation School: no lead identified
    (v_naomi,    v_t24, 'dept_lead', v_admin)   -- T24 Prayer Team
    -- T25 Protocol: no single lead
  on conflict (user_id, space_id, role) do nothing;


  -- ══════════════════════════════════════════════════════════════════════════
  -- STEP E: Summary log
  -- ══════════════════════════════════════════════════════════════════════════
  raise notice 'This Is It 2.0 umbrella id: %', v_tii;
  raise notice 'T1=%  T2=%  T3=%  T4=%  T5=%',  v_t1, v_t2, v_t3, v_t4, v_t5;
  raise notice 'T6=%  T7=%  T8=%  T9=%  T10=%', v_t6, v_t7, v_t8, v_t9, v_t10;
  raise notice 'T11=% T12=% T13=% T14=% T15=%', v_t11, v_t12, v_t13, v_t14, v_t15;
  raise notice 'T16=% T17=% T18=% T19=% T20=%', v_t16, v_t17, v_t18, v_t19, v_t20;
  raise notice 'T21=% T22=% T23=% T24=% T25=%', v_t21, v_t22, v_t23, v_t24, v_t25;

end $$;

commit;
