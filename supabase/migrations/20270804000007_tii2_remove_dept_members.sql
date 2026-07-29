-- =============================================================================
-- Remove ORS, Media, and PFCC department members from TII 2.0 sprint teams.
-- The bulk dept expansions in 000006 should not have been included.
-- sprint_members is left untouched (ON CONFLICT DO NOTHING in 000006 means
-- pre-existing sprint membership rows are unaffected).
-- =============================================================================

delete from public.sprint_team_members stm
using public.users u
where stm.user_id = u.id
  and stm.sprint_id = 'b7515367-2ccd-4e2c-8f31-933ab43e1135'
  and u.department_id in (
    '740b2809-b821-4861-b323-c37612de7741', -- ORS
    '9798f8e3-50f2-4e5b-a456-c4ad9f94fe85', -- Media
    'a7f3d1d8-7a11-40d4-b65f-cd0bf17308ad'  -- PFCC
  );

-- Update T1 description (ORS removed; Pastors expansion stays)
update public.sprint_teams
set description = 'Lead: Jason Ikeokwu. Members: all Pastors dept.'
where sprint_id = 'b7515367-2ccd-4e2c-8f31-933ab43e1135'
  and name = 'Secretariat and Planning';

-- Update T2 description to remove the PFCC bulk expansion note
update public.sprint_teams
set description = 'Lead: Pastor Chi Nwokem.'
where sprint_id = 'b7515367-2ccd-4e2c-8f31-933ab43e1135'
  and name = 'Secretariat Programs';

-- Update T3 description to remove the Admin bulk expansion note
update public.sprint_teams
set description = 'Lead: TODO — Pastor Nigel (not yet in Nexus). Next-gen Asst: Amber Moseri.'
where sprint_id = 'b7515367-2ccd-4e2c-8f31-933ab43e1135'
  and name = 'Registration';
