-- =============================================================================
-- This Is It 2.0 — 25 event teams as sprint_teams within the TII 2.0 sprint
-- Sprint b7515367-2ccd-4e2c-8f31-933ab43e1135 already exists (active).
-- Inserts into: sprint_teams (lead_user_id), sprint_team_members (sprint_id, team_id, user_id), sprint_members
-- =============================================================================

do $$
declare
  v_sprint uuid := 'b7515367-2ccd-4e2c-8f31-933ab43e1135';
  v_admin  uuid := '3e5ad72c-1da4-4cde-9220-97e82c920e4e'; -- Amber_Moseri (super_admin)

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

  v_dept_admin   uuid := '2aee687a-4dad-447b-ad6b-1e0239a6beb6'; -- "Admins"
  v_dept_pfcc    uuid := 'a7f3d1d8-7a11-40d4-b65f-cd0bf17308ad'; -- "PFCC"
  v_dept_ors     uuid := '740b2809-b821-4861-b323-c37612de7741'; -- "ORS"
  v_dept_pastors uuid := 'e06d95c4-c36e-439f-993c-2b7f2393d277'; -- "Pastors"

  v_t1  uuid; v_t2  uuid; v_t3  uuid; v_t4  uuid; v_t5  uuid;
  v_t6  uuid; v_t7  uuid; v_t8  uuid; v_t9  uuid; v_t10 uuid;
  v_t11 uuid; v_t12 uuid; v_t13 uuid; v_t14 uuid; v_t15 uuid;
  v_t16 uuid; v_t17 uuid; v_t18 uuid; v_t19 uuid; v_t20 uuid;
  v_t21 uuid; v_t22 uuid; v_t23 uuid; v_t24 uuid; v_t25 uuid;

begin
  -- ── Guards: skip entire block on fresh installs ────────────────────────────
  if not exists (select 1 from public.sprints where id = v_sprint) then
    raise notice 'Skipping TII 2.0 sprint teams: sprint (b7515367) not found — fresh install';
    return;
  end if;
  if not exists (select 1 from public.users where id = v_admin    and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Amber_Moseri not found'; return; end if;
  if not exists (select 1 from public.users where id = v_jason_i  and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Jason Ikeokwu not found'; return; end if;
  if not exists (select 1 from public.users where id = v_chi      and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Pastor Chi Nwokem not found'; return; end if;
  if not exists (select 1 from public.users where id = v_natasha  and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Pastor Natasha Dara not found'; return; end if;
  if not exists (select 1 from public.users where id = v_laura_a  and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Laura A not found'; return; end if;
  if not exists (select 1 from public.users where id = v_sharon_m and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Sharon Mutambwi not found'; return; end if;
  if not exists (select 1 from public.users where id = v_waneta   and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Waneta not found'; return; end if;
  if not exists (select 1 from public.users where id = v_dorcas   and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Dorcas M not found'; return; end if;
  if not exists (select 1 from public.users where id = v_ella     and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Ella Ukpabia not found'; return; end if;
  if not exists (select 1 from public.users where id = v_david_a  and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: David A. Akalue not found'; return; end if;
  if not exists (select 1 from public.users where id = v_chiamaka and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Chiamaka Okeke not found'; return; end if;
  if not exists (select 1 from public.users where id = v_chloe    and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Pastor Chloe Isesele not found'; return; end if;
  if not exists (select 1 from public.users where id = v_yifan    and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Yifan Wang not found'; return; end if;
  if not exists (select 1 from public.users where id = v_alex_d   and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Alex D not found'; return; end if;
  if not exists (select 1 from public.users where id = v_precious and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Precious Enoh not found'; return; end if;
  if not exists (select 1 from public.users where id = v_jason_c  and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Jason Chan not found'; return; end if;
  if not exists (select 1 from public.users where id = v_naomi    and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Pastor Naomi Ighodaro not found'; return; end if;
  if not exists (select 1 from public.users where id = v_ifedayomi and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Ifedayomi O not found'; return; end if;
  if not exists (select 1 from public.users where id = v_olamide  and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Pastor Olamide A. not found'; return; end if;
  if not exists (select 1 from public.users where id = v_toby     and status = 'active') then raise notice 'Skipping TII 2.0 sprint teams: Pastor Toby Yinka-Okunusi not found'; return; end if;
  if not exists (select 1 from public.departments where id = v_dept_admin   and space_type = 'department') then raise notice 'Skipping TII 2.0 sprint teams: Admins department not found'; return; end if;
  if not exists (select 1 from public.departments where id = v_dept_pfcc    and space_type = 'department') then raise notice 'Skipping TII 2.0 sprint teams: PFCC department not found'; return; end if;
  if not exists (select 1 from public.departments where id = v_dept_ors     and space_type = 'department') then raise notice 'Skipping TII 2.0 sprint teams: ORS department not found'; return; end if;
  if not exists (select 1 from public.departments where id = v_dept_pastors and space_type = 'department') then raise notice 'Skipping TII 2.0 sprint teams: Pastors department not found'; return; end if;

  -- ── Create 25 sprint_teams ─────────────────────────────────────────────────
  -- lead_user_id = confirmed Nexus lead; null = TODO (not yet onboarded)

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Secretariat and Planning',
    'Lead: Jason Ikeokwu. Members: all Pastors dept + all ORS dept.', v_jason_i)
  returning id into v_t1;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Secretariat Programs',
    'Lead: Pastor Chi Nwokem. Members: all PFCC dept.', v_chi)
  returning id into v_t2;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Registration',
    'Lead: TODO — Pastor Nigel (not yet in Nexus). Next-gen Asst: Amber Moseri. Members: all Admin dept.', null)
  returning id into v_t3;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Branding and Marketing',
    'Lead: Pastor Natasha Dara. Assistant: Sister Phoebe (TODO). Member: Laura A.', v_natasha)
  returning id into v_t4;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Finance',
    'Lead: Sharon Mutambwi.', v_sharon_m)
  returning id into v_t5;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Delegates Compliance',
    'Lead + assistant: TODO — nobody in Nexus yet.', null)
  returning id into v_t6;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Venue and Logistics',
    'Lead: Waneta Ikheloa-Agbonselobho.', v_waneta)
  returning id into v_t7;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Accommodation and Room Coordination',
    'Lead: Dorcas M. Members: Waneta Ikheloa-Agbonselobho, Ella Ukpabia.', v_dorcas)
  returning id into v_t8;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Transportation',
    'Lead: David A. Akalue. Assistant + 1 member: TODO (not yet in Nexus).', v_david_a)
  returning id into v_t9;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Health and Safety',
    'Lead + assistant: TODO — nobody in Nexus yet.', null)
  returning id into v_t10;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Ushering',
    'Lead: TODO — nobody in Nexus yet.', null)
  returning id into v_t11;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Hospitality — Senior Pastors and CM Ministers',
    'Lead: Pastor Natasha Dara. Members: Sharon Mutambwi, Chiamaka Okeke. TODO: Sharon Adelike (asst).', v_natasha)
  returning id into v_t12;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Hospitality — Delegates',
    'Lead: Pastor Chloe Isesele. Assistant + 2 members: TODO (not yet in Nexus).', v_chloe)
  returning id into v_t13;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Technical — Sound and Lighting',
    'Lead: Yifan Wang. TODO: Tobi Ibiyeye (asst, not yet in Nexus).', v_yifan)
  returning id into v_t14;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Technical — Projection',
    'Lead + assistant: TODO — nobody in Nexus yet.', null)
  returning id into v_t15;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Technical — Media',
    'Lead: Alex D. TODO: Bernard (asst, not yet in Nexus).', v_alex_d)
  returning id into v_t16;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Technical — Streaming',
    'Lead + assistant: TODO — nobody in Nexus yet.', null)
  returning id into v_t17;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Media — Photography and Videography',
    'Lead: Precious Enoh. Assistant + 3 members: TODO (not yet in Nexus).', v_precious)
  returning id into v_t18;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Media — Live Updates',
    'Lead: TODO — Phoebe Kudowor (not yet in Nexus). Asst: Laura A. 2 members: TODO.', null)
  returning id into v_t19;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Praise and Worship',
    'Lead: Pastor Olamide A. Assistant: TODO (not yet in Nexus).', v_olamide)
  returning id into v_t20;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Creative Arts',
    'Lead: Pastor Olamide A. 2 members: TODO (not yet in Nexus).', v_olamide)
  returning id into v_t21;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Decorations',
    'Lead: TODO — nobody in Nexus yet.', null)
  returning id into v_t22;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Foundation School Graduation and Baptism',
    'No lead identified yet. Confirmed member: Jason Chan.', null)
  returning id into v_t23;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Prayer Team',
    'Lead: Pastor Naomi Ighodaro. Asst: Ella Ukpabia. Member: Ifedayomi O.', v_naomi)
  returning id into v_t24;

  insert into public.sprint_teams (sprint_id, name, description, lead_user_id)
  values (v_sprint, 'Protocol',
    'No single lead. Members: Jason Ikeokwu, Jason Chan, Pastor Toby Yinka-Okunusi, David A. Akalue.', null)
  returning id into v_t25;

  -- ── sprint_team_members (sprint_id, team_id, user_id — no role column) ───────

  -- T1: Secretariat and Planning
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t1, v_jason_i),
         (v_sprint, v_t1, v_chi)
  on conflict (team_id, user_id) do nothing;

  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  select v_sprint, v_t1, u.id
  from public.users u
  where u.department_id in (v_dept_pastors, v_dept_ors)
    and u.status = 'active'
    and u.id not in (v_jason_i, v_chi)
  on conflict (team_id, user_id) do nothing;

  -- T2: Secretariat Programs
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t2, v_chi),
         (v_sprint, v_t2, v_jason_i)
  on conflict (team_id, user_id) do nothing;

  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  select v_sprint, v_t2, u.id
  from public.users u
  where u.department_id = v_dept_pfcc
    and u.status = 'active'
    and u.id not in (v_chi, v_jason_i)
  on conflict (team_id, user_id) do nothing;

  -- T3: Registration
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t3, v_admin)
  on conflict (team_id, user_id) do nothing;

  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  select v_sprint, v_t3, u.id
  from public.users u
  where u.department_id = v_dept_admin
    and u.status = 'active'
    and u.id != v_admin
  on conflict (team_id, user_id) do nothing;
  -- TODO: Pastor Nigel — update lead_user_id once onboarded

  -- T4: Branding and Marketing
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t4, v_natasha),
         (v_sprint, v_t4, v_laura_a)
  on conflict (team_id, user_id) do nothing;
  -- TODO: Sister Phoebe (asst) — add once onboarded

  -- T5: Finance
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t5, v_sharon_m)
  on conflict (team_id, user_id) do nothing;

  -- T6: Delegates Compliance — empty shell
  -- TODO: Lead + assistant — add once onboarded

  -- T7: Venue and Logistics
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t7, v_waneta)
  on conflict (team_id, user_id) do nothing;

  -- T8: Accommodation and Room Coordination
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t8, v_dorcas),
         (v_sprint, v_t8, v_waneta),
         (v_sprint, v_t8, v_ella)
  on conflict (team_id, user_id) do nothing;

  -- T9: Transportation
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t9, v_david_a)
  on conflict (team_id, user_id) do nothing;
  -- TODO: Assistant + 1 member — add once onboarded

  -- T10: Health and Safety — empty shell
  -- TODO: Lead + assistant — add once onboarded

  -- T11: Ushering — empty shell
  -- TODO: Lead — add once onboarded

  -- T12: Hospitality — Senior Pastors and CM Ministers
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t12, v_natasha),
         (v_sprint, v_t12, v_sharon_m),
         (v_sprint, v_t12, v_chiamaka)
  on conflict (team_id, user_id) do nothing;
  -- TODO: Sharon Adelike (asst) — add once onboarded

  -- T13: Hospitality — Delegates
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t13, v_chloe)
  on conflict (team_id, user_id) do nothing;
  -- TODO: Assistant + 2 members — add once onboarded

  -- T14: Technical — Sound and Lighting
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t14, v_yifan)
  on conflict (team_id, user_id) do nothing;
  -- TODO: Tobi Ibiyeye (asst) — add once onboarded

  -- T15: Technical — Projection — empty shell
  -- TODO: Lead + assistant — add once onboarded

  -- T16: Technical — Media
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t16, v_alex_d)
  on conflict (team_id, user_id) do nothing;
  -- TODO: Bernard (asst) — add once onboarded

  -- T17: Technical — Streaming — empty shell
  -- TODO: Lead + assistant — add once onboarded

  -- T18: Media — Photography and Videography
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t18, v_precious)
  on conflict (team_id, user_id) do nothing;
  -- TODO: Assistant + 3 members — add once onboarded

  -- T19: Media — Live Updates
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t19, v_laura_a)
  on conflict (team_id, user_id) do nothing;
  -- TODO: Phoebe Kudowor (lead) — update lead_user_id once onboarded

  -- T20: Praise and Worship
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t20, v_olamide)
  on conflict (team_id, user_id) do nothing;
  -- TODO: Assistant — add once onboarded

  -- T21: Creative Arts
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t21, v_olamide)
  on conflict (team_id, user_id) do nothing;
  -- TODO: 2 members — add once onboarded

  -- T22: Decorations — empty shell
  -- TODO: Lead — add once onboarded

  -- T23: Foundation School Graduation and Baptism
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t23, v_jason_c)
  on conflict (team_id, user_id) do nothing;

  -- T24: Prayer Team
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t24, v_naomi),
         (v_sprint, v_t24, v_ella),
         (v_sprint, v_t24, v_ifedayomi)
  on conflict (team_id, user_id) do nothing;

  -- T25: Protocol
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  values (v_sprint, v_t25, v_jason_i),
         (v_sprint, v_t25, v_jason_c),
         (v_sprint, v_t25, v_toby),
         (v_sprint, v_t25, v_david_a)
  on conflict (team_id, user_id) do nothing;

  -- ── Ensure all team members are also sprint_members ────────────────────────
  -- ON CONFLICT DO NOTHING preserves any existing roles (manager, owner, etc.)
  insert into public.sprint_members (sprint_id, user_id, role)
  select distinct v_sprint, stm.user_id, 'contributor'
  from public.sprint_team_members stm
  join public.sprint_teams st on st.id = stm.team_id
  where st.sprint_id = v_sprint
  on conflict (sprint_id, user_id) do nothing;

  raise notice 'T1=%  T2=%  T3=%  T4=%  T5=%',  v_t1, v_t2, v_t3, v_t4, v_t5;
  raise notice 'T6=%  T7=%  T8=%  T9=%  T10=%', v_t6, v_t7, v_t8, v_t9, v_t10;
  raise notice 'T11=% T12=% T13=% T14=% T15=%', v_t11, v_t12, v_t13, v_t14, v_t15;
  raise notice 'T16=% T17=% T18=% T19=% T20=%', v_t16, v_t17, v_t18, v_t19, v_t20;
  raise notice 'T21=% T22=% T23=% T24=% T25=%', v_t21, v_t22, v_t23, v_t24, v_t25;
end $$;
