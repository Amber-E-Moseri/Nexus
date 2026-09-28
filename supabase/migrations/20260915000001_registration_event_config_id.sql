-- Data isolation: link registration-domain tables to their owning event.
-- GUARD: All four tables (registrations, working_list, roster, event_payments)
-- are created later; guard each section independently.

-- ── registrations ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace)
     AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'event_configs' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE 'ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS event_config_id uuid REFERENCES public.event_configs(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_registrations_event_config_id ON public.registrations (event_config_id)';
  END IF;
END;
$$;

-- ── working_list ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'working_list' AND relnamespace = 'public'::regnamespace)
     AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'event_configs' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE 'ALTER TABLE public.working_list ADD COLUMN IF NOT EXISTS event_config_id uuid REFERENCES public.event_configs(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_working_list_event_config_id ON public.working_list (event_config_id)';
  END IF;
END;
$$;

-- ── roster ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'roster' AND relnamespace = 'public'::regnamespace)
     AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'event_configs' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE 'ALTER TABLE public.roster ADD COLUMN IF NOT EXISTS event_config_id uuid REFERENCES public.event_configs(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_roster_event_config_id ON public.roster (event_config_id)';
  END IF;
END;
$$;

-- ── event_payments ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'event_payments' AND relnamespace = 'public'::regnamespace)
     AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'event_configs' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE 'ALTER TABLE public.event_payments ADD COLUMN IF NOT EXISTS event_config_id uuid REFERENCES public.event_configs(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_event_payments_event_config_id ON public.event_payments (event_config_id)';
  END IF;
END;
$$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
