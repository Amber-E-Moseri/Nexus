-- =============================================================================
-- Delete the 7 auto-generated department teams from the TII 2.0 sprint.
-- These were created by the sprint template before the 25 event teams were
-- added in migration 000006. They have 0 members and no lead_user_id.
-- sprint_team_members rows cascade-delete automatically (ON DELETE CASCADE).
-- =============================================================================

delete from public.sprint_teams
where id in (
  '5ca177dc-3b27-4839-8476-828bd94a4486', -- "Media"
  '2836c4f0-3d6b-46e4-a859-8b7fb6a80b8c', -- "Pastors"
  '66bb7e37-85a9-4646-a14b-74907d1709ab', -- "ORS"
  '6df498ad-4b65-4496-b8c4-5f91d8c8416c', -- "PFCC"
  '8ded7324-5ca5-419c-a5e8-4d7a607d003e', -- "Programs"
  '5d6082ee-f578-4978-bb88-0a46a64134c5', -- "Registration" (old duplicate)
  '4b222de2-4128-46a5-8de4-d6b8e5b4c11b'  -- "Media Live Updates" (old duplicate)
);
