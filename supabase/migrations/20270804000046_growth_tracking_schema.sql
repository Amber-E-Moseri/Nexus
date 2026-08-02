-- Growth Tracking — Phase 1: Service Centers (SundayService + GlobalService only)
-- Phase 2 (regional training meetings via TrainingMeeting kind) deferred to a future migration.
-- Unit data sourced from leaders.lwcanada.org /api/units — kind='Church' = 17 Service Centers.

-- ─── 1. service_reports — API mirror, aggregated per service per church ────────
CREATE TABLE public.service_reports (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  church_unit_id   text        NOT NULL,
  church_name      text        NOT NULL,
  service_kind     text        NOT NULL CHECK (service_kind IN ('SundayService', 'GlobalService')),
  service_date     date        NOT NULL,
  service_name     text        NOT NULL,
  total_attendance integer     NOT NULL DEFAULT 0,
  first_timers     integer     NOT NULL DEFAULT 0,
  synced_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (church_unit_id, service_kind, service_date, service_name)
);

-- ─── 2. service_center_schedule — which churches are tracked ─────────────────
CREATE TABLE public.service_center_schedule (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  church_name    text        NOT NULL,
  church_unit_id text        NOT NULL UNIQUE,  -- leaders.lwcanada.org unit ID
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. service_center_week_status — admin flags per church per week ──────────
-- 'reported' and 'missing' are computed, not stored. Only explicit flags go here.
CREATE TABLE public.service_center_week_status (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id     uuid        NOT NULL REFERENCES public.service_center_schedule(id) ON DELETE CASCADE,
  week_start_date date        NOT NULL,  -- Monday of the ISO week (date_trunc('week', ...))
  status          text        NOT NULL CHECK (status IN ('merged', 'did_not_meet')),
  merged_with     text[],                -- church_unit_ids that merged into this service
  note            text,
  set_by          uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  set_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, week_start_date)
);

-- ─── 4. report_recipients — weekly email list ─────────────────────────────────
CREATE TABLE public.report_recipients (
  id       uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  email    text        NOT NULL UNIQUE,
  active   boolean     NOT NULL DEFAULT true,
  added_at timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.service_reports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_center_schedule    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_center_week_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_recipients          ENABLE ROW LEVEL SECURITY;

-- service_reports: super_admin read/write; service_role for the sync edge function
CREATE POLICY "service_reports_admin"
  ON public.service_reports FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'super_admin');

CREATE POLICY "service_reports_service_role"
  ON public.service_reports FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "schedule_admin"
  ON public.service_center_schedule FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'super_admin');

CREATE POLICY "schedule_service_role"
  ON public.service_center_schedule FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "week_status_admin"
  ON public.service_center_week_status FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'super_admin');

CREATE POLICY "recipients_admin"
  ON public.report_recipients FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'super_admin');

-- ─── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_schedule_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_schedule_updated_at
  BEFORE UPDATE ON public.service_center_schedule
  FOR EACH ROW EXECUTE FUNCTION public.set_schedule_updated_at();

-- ─── Seed: 17 Service Centers (phase-1 scope) ─────────────────────────────────
-- Source: leaders.lwcanada.org /api/units?pageSize=1000 filtered to kind='Church', 2026-08-01
INSERT INTO public.service_center_schedule (church_name, church_unit_id) VALUES
  ('Brock Service Center',      'cmphy72jl00gvoaqnwxbl323m'),
  ('Centennial Service Center', 'cmqpdb6tw04vn1g6xkjkdx7f6'),
  ('Edmonton Service Center',   'cmowttfk1006ih4nrsiiodc0k'),
  ('Leth Poly Service Center',  'cmqpdb6sb04su1g6x12zn970c'),
  ('MUN Service Center',        'cmowttfj0001sh4nrfx1pcdz9'),
  ('TMU Service Center',        'cmowttfmt00ghh4nruddpmek7'),
  ('UCalgary Service Center',   'cmowttfio000wh4nrxflfawch'),
  ('UGuelph Service Center',    'cmowttftp013ph4nr90qvurvi'),
  ('UManitoba Service Center',  'cmowttfix001kh4nrf2pq7a5o'),
  ('URegina Service Center',    'cmowttfiu001dh4nrf5tcysl9'),
  ('USask Service Center',      'cmowttflk00c8h4nrqkikf15f'),
  ('UTM Service Center',        'cmowttfkx009hh4nrflap990z'),
  ('UTSC Service Center',       'cmowttfqw00t1h4nrv9ihyejy'),
  ('UWaterloo Service Center',  'cmowttfwm01cgh4nr65hl4dg0'),
  ('UWinnipeg Service Center',  'cmowttfk90075h4nr5b8zbdxx'),
  ('UofL Service Center',       'cmowttfis0016h4nr12f17l3l'),
  ('YorkU Service Center',      'cmowttfj2001wh4nrm1xgermy')
ON CONFLICT (church_unit_id) DO NOTHING;

-- Seed: initial report recipient
INSERT INTO public.report_recipients (email)
VALUES ('ivanamoseri@gmail.com')
ON CONFLICT (email) DO NOTHING;
