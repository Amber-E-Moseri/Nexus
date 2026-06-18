-- Agendas table
CREATE TABLE IF NOT EXISTS public.agendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  meeting_type text NOT NULL CHECK (meeting_type IN ('regional', 'dream_team', 'sunday_service', 'ors_meeting')),
  theme text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'archived'))
);

-- Agenda items (sort-order based ordering)
CREATE TABLE IF NOT EXISTS public.agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id uuid NOT NULL REFERENCES public.agendas(id) ON DELETE CASCADE,
  sequence int NOT NULL,
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('speech', 'prayer', 'discussion', 'presentation', 'worship', 'break')),
  duration_minutes int NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agendas_created_by ON public.agendas(created_by);
CREATE INDEX IF NOT EXISTS idx_agenda_items_agenda_id ON public.agenda_items(agenda_id);
CREATE INDEX IF NOT EXISTS idx_agenda_items_sequence ON public.agenda_items(agenda_id, sort_order);

-- RLS
ALTER TABLE public.agendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_items ENABLE ROW LEVEL SECURITY;

-- Policies: Users can manage own agendas
CREATE POLICY "Users can manage own agendas"
  ON public.agendas FOR ALL
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Super admin can read all agendas"
  ON public.agendas FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.users WHERE users.id = auth.uid() AND role = 'super_admin'
  ));

CREATE POLICY "Agenda items inherit agenda permissions"
  ON public.agenda_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.agendas WHERE agendas.id = agenda_id AND auth.uid() = created_by
  ));

-- RPC: Calculate timing for agenda items
CREATE OR REPLACE FUNCTION public.calculate_agenda_timing(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_item jsonb;
  v_current_time interval := '00:00';
BEGIN
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    v_result := v_result || jsonb_build_object(
      'sequence', (v_item->>'sequence')::int,
      'start_time', v_current_time::text,
      'duration_minutes', (v_item->>'duration_minutes')::int,
      'end_time', (v_current_time + (v_item->>'duration_minutes')::int * interval '1 minute')::text
    );
    v_current_time := v_current_time + (v_item->>'duration_minutes')::int * interval '1 minute';
  END LOOP;
  RETURN v_result;
END;
$$;
