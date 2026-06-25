-- Meeting Minutes Tables
-- Allows ORS to capture detailed notes, decisions, and action items after meetings

-- Main minutes record
CREATE TABLE IF NOT EXISTS public.meeting_minutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'archived')),
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id) -- Only one minutes record per meeting
);

-- Segment-specific notes (one per agenda item)
CREATE TABLE IF NOT EXISTS public.meeting_minutes_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minutes_id uuid NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL, -- Corresponds to agenda_items.id
  segment_name text NOT NULL, -- Copy of segment name for reference
  notes text,
  decisions text,
  key_points text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(minutes_id, segment_id) -- One note set per segment
);

-- Action items assigned to team members
CREATE TABLE IF NOT EXISTS public.meeting_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid NOT NULL REFERENCES public.meeting_minutes_segments(id) ON DELETE CASCADE,
  description text NOT NULL,
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  task_id uuid, -- Links to tasks module (future)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_meeting_id ON public.meeting_minutes(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_created_by ON public.meeting_minutes(created_by);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_status ON public.meeting_minutes(status);
CREATE INDEX IF NOT EXISTS idx_minutes_segments_minutes_id ON public.meeting_minutes_segments(minutes_id);
CREATE INDEX IF NOT EXISTS idx_action_items_segment_id ON public.meeting_action_items(segment_id);
CREATE INDEX IF NOT EXISTS idx_action_items_assigned_to ON public.meeting_action_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_action_items_status ON public.meeting_action_items(status);

-- Enable RLS
ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_minutes_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_action_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for meeting_minutes
CREATE POLICY "minutes_select_own_or_org"
  ON public.meeting_minutes FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
      AND m.department_id IN (
        SELECT department_id FROM public.users WHERE id = auth.uid()
      )
    )
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "minutes_insert_require_permission"
  ON public.meeting_minutes FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      (SELECT role FROM public.users WHERE id = auth.uid()) IN ('super_admin', 'ors')
      OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'dept_lead'
    )
  );

CREATE POLICY "minutes_update_own_draft"
  ON public.meeting_minutes FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND status = 'draft'
  )
  WITH CHECK (
    created_by = auth.uid()
    AND status IN ('draft', 'submitted')
  );

-- RLS Policies for segments (inherit from minutes)
CREATE POLICY "segments_select"
  ON public.meeting_minutes_segments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_minutes mm
      WHERE mm.id = minutes_id
      AND (
        mm.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.meetings m
          WHERE m.id = mm.meeting_id
          AND m.department_id IN (
            SELECT department_id FROM public.users WHERE id = auth.uid()
          )
        )
      )
    )
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "segments_insert_update"
  ON public.meeting_minutes_segments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meeting_minutes mm
      WHERE mm.id = minutes_id
      AND mm.created_by = auth.uid()
      AND mm.status = 'draft'
    )
  );

-- RLS Policies for action items
CREATE POLICY "action_items_select"
  ON public.meeting_action_items FOR SELECT
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR assigned_to IS NULL
    OR EXISTS (
      SELECT 1 FROM public.meeting_minutes_segments mms
      JOIN public.meeting_minutes mm ON mm.id = mms.minutes_id
      WHERE mms.id = segment_id
      AND mm.created_by = auth.uid()
    )
  );

CREATE POLICY "action_items_insert_update"
  ON public.meeting_action_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meeting_minutes_segments mms
      JOIN public.meeting_minutes mm ON mm.id = mms.minutes_id
      WHERE mms.id = segment_id
      AND mm.created_by = auth.uid()
      AND mm.status = 'draft'
    )
  );
