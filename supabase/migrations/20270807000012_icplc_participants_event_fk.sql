-- Forward convergence: add deferred FKs from ICPLC tables → event_configs.
-- These FKs were removed because event_configs didn't exist when the ICPLC
-- tables were created (20260925000001–20260925000006).
-- Also recreate the ICPLC helper functions now that event_configs exists,
-- replacing stubs with full event_configs-backed logic.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'event_configs' AND relnamespace = 'public'::regnamespace) THEN
    RAISE NOTICE 'event_configs not yet created — skipping forward convergence';
    RETURN;
  END IF;

  -- icplc_participants.event_id → event_configs(id) ON DELETE RESTRICT
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'icplc_participants' AND relnamespace = 'public'::regnamespace)
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'icplc_participants_event_id_fkey' AND table_name = 'icplc_participants')
  THEN
    EXECUTE 'ALTER TABLE public.icplc_participants ADD CONSTRAINT icplc_participants_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT';
  END IF;

  -- icplc_tags.event_id → event_configs(id) ON DELETE CASCADE
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'icplc_tags' AND relnamespace = 'public'::regnamespace)
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'icplc_tags_event_id_fkey' AND table_name = 'icplc_tags')
  THEN
    EXECUTE 'ALTER TABLE public.icplc_tags ADD CONSTRAINT icplc_tags_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_configs(id) ON DELETE CASCADE';
  END IF;

  -- icplc_visa_defaults.event_id → event_configs(id) ON DELETE CASCADE
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'icplc_visa_defaults' AND relnamespace = 'public'::regnamespace)
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'icplc_visa_defaults_event_id_fkey' AND table_name = 'icplc_visa_defaults')
  THEN
    EXECUTE 'ALTER TABLE public.icplc_visa_defaults ADD CONSTRAINT icplc_visa_defaults_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_configs(id) ON DELETE CASCADE';
  END IF;

  -- icplc_import_batches.event_id → event_configs(id) ON DELETE RESTRICT
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'icplc_import_batches' AND relnamespace = 'public'::regnamespace)
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'icplc_import_batches_event_id_fkey' AND table_name = 'icplc_import_batches')
  THEN
    EXECUTE 'ALTER TABLE public.icplc_import_batches ADD CONSTRAINT icplc_import_batches_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT';
  END IF;

  -- icplc_identity_maps.event_id → event_configs(id) ON DELETE RESTRICT
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'icplc_identity_maps' AND relnamespace = 'public'::regnamespace)
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'icplc_identity_maps_event_id_fkey' AND table_name = 'icplc_identity_maps')
  THEN
    EXECUTE 'ALTER TABLE public.icplc_identity_maps ADD CONSTRAINT icplc_identity_maps_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT';
  END IF;
END;
$$;

-- Recreate helper functions with full event_configs logic (replacing stubs)
create or replace function public.icplc_can_read_participants()
  returns boolean language sql security definer stable as $$
    select (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or exists (
        select 1
        from public.event_configs ec
        join public.sprints s    on s.name ilike ec.sprint_pattern
        join public.sprint_teams st  on st.sprint_id = s.id
        join public.sprint_team_members stm on stm.team_id = st.id
        where ec.event_name ilike '%ICPLC%'
          and stm.user_id = auth.uid()
          and st.name not ilike '%Finance%'
      )
    )
  $$;

create or replace function public.icplc_can_write_participants()
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or exists (
        select 1
        from public.event_configs ec
        join public.sprints s           on s.name ilike ec.sprint_pattern
        join public.sprint_teams st         on st.sprint_id = s.id
        join public.sprint_team_members stm on stm.team_id = st.id
        where ec.event_name ilike '%ICPLC%'
          and stm.user_id = auth.uid()
          and st.name not ilike '%Finance%'
          and st.name not ilike '%Transportation%'
          and st.name not ilike '%Accommodation%'
          and st.name not ilike '%Hospitality%'
      )
    )
  $$;

create or replace function public.icplc_can_import()
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or exists (
        select 1
        from public.event_configs ec
        join public.sprints s           on s.name ilike ec.sprint_pattern
        join public.sprint_teams st         on st.sprint_id = s.id
        join public.sprint_team_members stm on stm.team_id = st.id
        where ec.event_name ilike '%ICPLC%'
          and stm.user_id = auth.uid()
          and st.name not ilike '%Finance%'
          and st.name not ilike '%Transportation%'
          and st.name not ilike '%Accommodation%'
          and st.name not ilike '%Hospitality%'
      )
    )
  $$;
