-- =============================================================================
-- Restore ORS, PFCC, and Media dept members to their TII 2.0 teams.
-- Migration 000007 removed them; this adds them back to the correct teams:
--   ORS   → T1 Secretariat and Planning  (828337b7)
--   PFCC  → T2 Secretariat Programs      (cf26202e)
--   Media → T16 Technical — Media        (68c09f0e)
-- Existing named leads/members are untouched (ON CONFLICT DO NOTHING).
-- =============================================================================

do $$
declare
  v_sprint  uuid := 'b7515367-2ccd-4e2c-8f31-933ab43e1135';
  v_t1      uuid := '828337b7-070a-4f53-89b3-1676bbc17b01'; -- Secretariat and Planning
  v_t2      uuid := 'cf26202e-7aae-44f1-b4aa-b55b32d4d4fb'; -- Secretariat Programs
  v_t16     uuid := '68c09f0e-45f5-4d81-9d24-0bd743e70cfb'; -- Technical — Media

  v_dept_ors   uuid := '740b2809-b821-4861-b323-c37612de7741';
  v_dept_pfcc  uuid := 'a7f3d1d8-7a11-40d4-b65f-cd0bf17308ad';
  v_dept_media uuid := '9798f8e3-50f2-4e5b-a456-c4ad9f94fe85';
begin
  -- ORS → T1
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  select v_sprint, v_t1, u.id
  from public.users u
  where u.department_id = v_dept_ors and u.status = 'active'
  on conflict (team_id, user_id) do nothing;

  -- PFCC → T2
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  select v_sprint, v_t2, u.id
  from public.users u
  where u.department_id = v_dept_pfcc and u.status = 'active'
  on conflict (team_id, user_id) do nothing;

  -- Media → T16
  insert into public.sprint_team_members (sprint_id, team_id, user_id)
  select v_sprint, v_t16, u.id
  from public.users u
  where u.department_id = v_dept_media and u.status = 'active'
  on conflict (team_id, user_id) do nothing;

  -- Ensure all new team members are also sprint_members
  insert into public.sprint_members (sprint_id, user_id, role)
  select distinct v_sprint, stm.user_id, 'contributor'
  from public.sprint_team_members stm
  where stm.sprint_id = v_sprint
    and stm.team_id in (v_t1, v_t2, v_t16)
  on conflict (sprint_id, user_id) do nothing;
end $$;
