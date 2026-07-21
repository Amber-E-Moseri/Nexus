-- Revert 20270718000009: regional_secretary's blanket SELECT across every
-- pastor's flock_contacts/interactions/todos/settings was a full-detail read
-- (name, phone, email, notes — not just workload counts), letting regional
-- secretaries browse pastors' individual contact lists. User confirmed the
-- intended model is stricter than the "workload only" design noted in
-- memory: each pastor's flock is theirs alone, and regional_secretary should
-- have no read access into it at all. Drop the four ORS-read policies;
-- flock_*_own (pastor_id = auth.uid() OR super_admin) remains untouched and
-- is now the only way to read these tables.

DROP POLICY IF EXISTS "flock_contacts_regional_sec_read" ON public.flock_contacts;
DROP POLICY IF EXISTS "flock_interactions_regional_sec_read" ON public.flock_interactions;
DROP POLICY IF EXISTS "flock_todos_regional_sec_read" ON public.flock_todos;
DROP POLICY IF EXISTS "flock_settings_regional_sec_read" ON public.flock_settings;
