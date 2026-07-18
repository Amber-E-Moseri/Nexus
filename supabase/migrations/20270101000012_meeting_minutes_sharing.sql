-- Add sharing mechanism for meeting_minutes
-- Creator controls who can see their notes via explicit share grants
-- Private by default: only creator can see unless explicitly shared

-- Add is_private flag to meeting_minutes (default true = only creator can see)
ALTER TABLE IF EXISTS public.meeting_minutes
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT true;

-- Add comment explaining the flag
COMMENT ON COLUMN public.meeting_minutes.is_private IS
  'If true, only creator can see these notes. If false, notes are org-wide visible to anyone.';

-- Create sharing table for granular access control
CREATE TABLE IF NOT EXISTS public.meeting_minutes_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minutes_id uuid NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shared_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(minutes_id, user_id) -- One grant per user per minutes record
);

-- Enable RLS on sharing table
ALTER TABLE public.meeting_minutes_shares ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read shares they're part of
CREATE POLICY "shares_select_own"
  ON public.meeting_minutes_shares FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    or shared_by = auth.uid()
    or (select role from public.users where id = auth.uid()) = 'super_admin'
  );

-- Only creator of minutes can grant shares
CREATE POLICY "shares_insert_creator_only"
  ON public.meeting_minutes_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    exists (
      select 1 from public.meeting_minutes mm
      where mm.id = minutes_id
      and mm.created_by = auth.uid()
    )
  );

-- Only creator or grantee can delete their own shares
CREATE POLICY "shares_delete_creator_or_grantee"
  ON public.meeting_minutes_shares FOR DELETE
  TO authenticated
  USING (
    shared_by = auth.uid()
    or user_id = auth.uid()
  );

-- Create index for faster share lookups
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_shares_minutes_id
  ON public.meeting_minutes_shares(minutes_id);

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_shares_user_id
  ON public.meeting_minutes_shares(user_id);

-- Update RLS policies for meeting_minutes to respect sharing
DROP POLICY IF EXISTS "minutes_select_creator_or_super_admin" ON public.meeting_minutes;
CREATE POLICY "minutes_select_by_share"
  ON public.meeting_minutes FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR exists (
      select 1 from public.meeting_minutes_shares mms
      where mms.minutes_id = id
      and mms.user_id = auth.uid()
    )
    OR (not is_private) -- Shared with org (is_private = false)
  );

-- Update segments to respect minute's sharing
DROP POLICY IF EXISTS "segments_select" ON public.meeting_minutes_segments;
CREATE POLICY "segments_select"
  ON public.meeting_minutes_segments FOR SELECT
  TO authenticated
  USING (
    exists (
      select 1 from public.meeting_minutes mm
      where mm.id = minutes_id
      and (
        mm.created_by = auth.uid()
        or exists (
          select 1 from public.meeting_minutes_shares mms
          where mms.minutes_id = mm.id
          and mms.user_id = auth.uid()
        )
        or not mm.is_private
      )
    )
  );

-- Update action items to respect minute's sharing
DROP POLICY IF EXISTS "action_items_select" ON public.meeting_action_items;
CREATE POLICY "action_items_select"
  ON public.meeting_action_items FOR SELECT
  TO authenticated
  USING (
    exists (
      select 1 from public.meeting_minutes_segments mms
      join public.meeting_minutes mm on mm.id = mms.minutes_id
      where mms.id = segment_id
      and (
        mm.created_by = auth.uid()
        or exists (
          select 1 from public.meeting_minutes_shares mmshare
          where mmshare.minutes_id = mm.id
          and mmshare.user_id = auth.uid()
        )
        or not mm.is_private
      )
    )
  );

COMMENT ON TABLE public.meeting_minutes_shares IS
  'Explicit share grants for meeting minutes. Creator controls who can view their notes.';
