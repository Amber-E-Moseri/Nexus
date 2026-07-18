-- Bootstrap meeting_minutes tables if they were never created (earlier creation
-- migrations were marked applied via repair without actually running), then
-- restore super_admin + regional_secretary SELECT bypass on all three tables.

-- ── 1. meeting_minutes (base table) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_minutes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'archived')),
  summary     text,
  is_private  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id)
);

-- Add is_private if table already existed without it
ALTER TABLE public.meeting_minutes
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_meeting_id  ON public.meeting_minutes(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_created_by  ON public.meeting_minutes(created_by);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_status      ON public.meeting_minutes(status);

ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;

-- ── 2. meeting_minutes_segments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_minutes_segments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minutes_id   uuid NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  segment_id   uuid NOT NULL,
  segment_name text NOT NULL,
  notes        text,
  decisions    text,
  key_points   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(minutes_id, segment_id)
);

CREATE INDEX IF NOT EXISTS idx_minutes_segments_minutes_id ON public.meeting_minutes_segments(minutes_id);

ALTER TABLE public.meeting_minutes_segments ENABLE ROW LEVEL SECURITY;

-- ── 3. meeting_action_items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_action_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id  uuid NOT NULL REFERENCES public.meeting_minutes_segments(id) ON DELETE CASCADE,
  description text NOT NULL,
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  due_date    date,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  task_id     uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_items_segment_id  ON public.meeting_action_items(segment_id);
CREATE INDEX IF NOT EXISTS idx_action_items_assigned_to ON public.meeting_action_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_action_items_status      ON public.meeting_action_items(status);

ALTER TABLE public.meeting_action_items ENABLE ROW LEVEL SECURITY;

-- ── 4. meeting_minutes_shares ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_minutes_shares (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minutes_id uuid NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shared_by  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(minutes_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_shares_minutes_id ON public.meeting_minutes_shares(minutes_id);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_shares_user_id    ON public.meeting_minutes_shares(user_id);

ALTER TABLE public.meeting_minutes_shares ENABLE ROW LEVEL SECURITY;

-- Sharing table policies (idempotent)
DROP POLICY IF EXISTS "shares_select_own"             ON public.meeting_minutes_shares;
DROP POLICY IF EXISTS "shares_insert_creator_only"    ON public.meeting_minutes_shares;
DROP POLICY IF EXISTS "shares_delete_creator_or_grantee" ON public.meeting_minutes_shares;

CREATE POLICY "shares_select_own" ON public.meeting_minutes_shares FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR shared_by = auth.uid()
         OR public.current_user_role() = 'super_admin');

CREATE POLICY "shares_insert_creator_only" ON public.meeting_minutes_shares FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meeting_minutes mm WHERE mm.id = minutes_id AND mm.created_by = auth.uid()
  ));

CREATE POLICY "shares_delete_creator_or_grantee" ON public.meeting_minutes_shares FOR DELETE TO authenticated
  USING (shared_by = auth.uid() OR user_id = auth.uid());

-- INSERT / UPDATE policies on base tables (idempotent)
DROP POLICY IF EXISTS "minutes_insert_require_permission" ON public.meeting_minutes;
CREATE POLICY "minutes_insert_require_permission" ON public.meeting_minutes FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.current_user_role() IN ('super_admin', 'dept_lead', 'regional_secretary', 'ors')
  );

DROP POLICY IF EXISTS "minutes_update_own_draft" ON public.meeting_minutes;
CREATE POLICY "minutes_update_own_draft" ON public.meeting_minutes FOR UPDATE TO authenticated
  USING  (created_by = auth.uid() AND status = 'draft')
  WITH CHECK (created_by = auth.uid() AND status IN ('draft', 'submitted'));

DROP POLICY IF EXISTS "segments_insert_update" ON public.meeting_minutes_segments;
CREATE POLICY "segments_insert_update" ON public.meeting_minutes_segments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meeting_minutes mm
    WHERE mm.id = minutes_id AND mm.created_by = auth.uid() AND mm.status = 'draft'
  ));

DROP POLICY IF EXISTS "action_items_insert_update" ON public.meeting_action_items;
CREATE POLICY "action_items_insert_update" ON public.meeting_action_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meeting_minutes_segments mms
    JOIN public.meeting_minutes mm ON mm.id = mms.minutes_id
    WHERE mms.id = segment_id AND mm.created_by = auth.uid() AND mm.status = 'draft'
  ));

-- ── 5. SELECT policies: restore super_admin + regional_secretary bypass ──────

DROP POLICY IF EXISTS "minutes_select_by_share"             ON public.meeting_minutes;
DROP POLICY IF EXISTS "minutes_select_own_or_org"           ON public.meeting_minutes;
DROP POLICY IF EXISTS "minutes_select_creator_or_super_admin" ON public.meeting_minutes;

CREATE POLICY "minutes_select_by_share" ON public.meeting_minutes FOR SELECT TO authenticated USING (
  created_by = auth.uid()
  OR public.current_user_role() IN ('super_admin', 'regional_secretary')
  OR EXISTS (
    SELECT 1 FROM public.meeting_minutes_shares mms
    WHERE mms.minutes_id = id AND mms.user_id = auth.uid()
  )
  OR (NOT is_private)
);

DROP POLICY IF EXISTS "segments_select" ON public.meeting_minutes_segments;
CREATE POLICY "segments_select" ON public.meeting_minutes_segments FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.meeting_minutes mm WHERE mm.id = minutes_id AND (
      mm.created_by = auth.uid()
      OR public.current_user_role() IN ('super_admin', 'regional_secretary')
      OR EXISTS (SELECT 1 FROM public.meeting_minutes_shares mms WHERE mms.minutes_id = mm.id AND mms.user_id = auth.uid())
      OR NOT mm.is_private
    )
  )
);

DROP POLICY IF EXISTS "action_items_select" ON public.meeting_action_items;
CREATE POLICY "action_items_select" ON public.meeting_action_items FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.meeting_minutes_segments seg
    JOIN public.meeting_minutes mm ON mm.id = seg.minutes_id
    WHERE seg.id = segment_id AND (
      mm.created_by = auth.uid()
      OR public.current_user_role() IN ('super_admin', 'regional_secretary')
      OR EXISTS (SELECT 1 FROM public.meeting_minutes_shares mms WHERE mms.minutes_id = mm.id AND mms.user_id = auth.uid())
      OR NOT mm.is_private
    )
  )
);
