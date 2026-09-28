-- Update communications policies to use user grants system
-- Allows ORS, dept_leads, and users with grants
--
-- GUARD: Tables are created later by 20260721000001_communication_infrastructure.sql.
-- Policies deferred until all three relations exist; later migrations (20260721000001,
-- 20261216000000) establish the final policy state.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'communication_segments'  AND relnamespace = 'public'::regnamespace)
 AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'communication_campaigns' AND relnamespace = 'public'::regnamespace)
 AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'communication_sends'     AND relnamespace = 'public'::regnamespace)
  THEN

    -- Segments policies
    EXECUTE 'drop policy if exists "comm_segments_insert" on public.communication_segments';
    EXECUTE 'drop policy if exists "comm_segments_update" on public.communication_segments';

    EXECUTE $pol$
      create policy "comm_segments_insert" on public.communication_segments for insert to authenticated
        with check (
          (auth.jwt() ->> 'role') = 'super_admin'
          or (
            select d.name = 'ORS Projects' or d.name = 'ORS'
            from public.departments d
            where d.id = public.current_user_department()
          )
          or (auth.jwt() ->> 'role') = 'dept_lead'
          or public.user_has_grant(auth.uid(), 'communications_manager')
        )
    $pol$;

    EXECUTE $pol$
      create policy "comm_segments_update" on public.communication_segments for update to authenticated
        using (
          (auth.jwt() ->> 'role') = 'super_admin'
          or (
            select d.name = 'ORS Projects' or d.name = 'ORS'
            from public.departments d
            where d.id = public.current_user_department()
          )
          or (auth.jwt() ->> 'role') = 'dept_lead'
          or public.user_has_grant(auth.uid(), 'communications_manager')
        )
    $pol$;

    -- Campaigns policies
    EXECUTE 'drop policy if exists "comm_campaigns_insert" on public.communication_campaigns';
    EXECUTE 'drop policy if exists "comm_campaigns_update" on public.communication_campaigns';

    EXECUTE $pol$
      create policy "comm_campaigns_insert" on public.communication_campaigns for insert to authenticated
        with check (
          (auth.jwt() ->> 'role') = 'super_admin'
          or (
            select d.name = 'ORS Projects' or d.name = 'ORS'
            from public.departments d
            where d.id = public.current_user_department()
          )
          or (auth.jwt() ->> 'role') = 'dept_lead'
          or public.user_has_grant(auth.uid(), 'communications_manager')
        )
    $pol$;

    EXECUTE $pol$
      create policy "comm_campaigns_update" on public.communication_campaigns for update to authenticated
        using (
          (auth.jwt() ->> 'role') = 'super_admin'
          or (
            select d.name = 'ORS Projects' or d.name = 'ORS'
            from public.departments d
            where d.id = public.current_user_department()
          )
          or (auth.jwt() ->> 'role') = 'dept_lead'
          or public.user_has_grant(auth.uid(), 'communications_manager')
        )
    $pol$;

    -- Sends policies
    EXECUTE 'drop policy if exists "comm_sends_insert" on public.communication_sends';
    EXECUTE 'drop policy if exists "comm_sends_update" on public.communication_sends';

    EXECUTE $pol$
      create policy "comm_sends_insert" on public.communication_sends for insert to authenticated
        with check (
          (auth.jwt() ->> 'role') = 'super_admin'
          or (
            select d.name = 'ORS Projects' or d.name = 'ORS'
            from public.departments d
            where d.id = public.current_user_department()
          )
          or (auth.jwt() ->> 'role') = 'dept_lead'
          or public.user_has_grant(auth.uid(), 'communications_manager')
        )
    $pol$;

    EXECUTE $pol$
      create policy "comm_sends_update" on public.communication_sends for update to authenticated
        using (
          (auth.jwt() ->> 'role') = 'super_admin'
          or (
            select d.name = 'ORS Projects' or d.name = 'ORS'
            from public.departments d
            where d.id = public.current_user_department()
          )
          or (auth.jwt() ->> 'role') = 'dept_lead'
          or public.user_has_grant(auth.uid(), 'communications_manager')
        )
    $pol$;

  END IF;
END;
$$;
