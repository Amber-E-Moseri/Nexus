-- Phase 3c: Advanced Permission Model
-- Add visibility, created_by, and designated creators system

-- Step 1: Add permission fields to meetings table
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS visibility text default 'published' check (visibility in ('private', 'published'));
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS created_by uuid references public.users(id) on delete set null;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS updated_at timestamptz default now();
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS allowed_editors uuid[] default '{}';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS allowed_viewers uuid[] default '{}';

-- Step 2: Backfill created_by and visibility for existing meetings
-- All existing meetings: visibility='published', created_by=ORS user (or null if no ORS)
UPDATE public.meetings
SET created_by = (
  SELECT id FROM public.users
  WHERE role = 'ors'
  ORDER BY created_at ASC
  LIMIT 1
),
visibility = 'published',
updated_at = now()
WHERE created_by IS NULL;

-- Step 3: Create designated_creators table
CREATE TABLE IF NOT EXISTS public.designated_creators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  granted_by uuid not null references public.users(id),
  granted_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_meetings_visibility ON public.meetings(visibility);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by ON public.meetings(created_by);
CREATE INDEX IF NOT EXISTS idx_designated_creators_user_id ON public.designated_creators(user_id);

-- Step 4: Enable RLS on new tables
ALTER TABLE public.designated_creators ENABLE ROW LEVEL SECURITY;

-- Step 5: Create auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_meetings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_meetings_timestamp ON public.meetings;
CREATE TRIGGER update_meetings_timestamp
BEFORE UPDATE ON public.meetings
FOR EACH ROW
EXECUTE FUNCTION public.update_meetings_updated_at();

-- Step 6: Update RLS Policies for meetings

-- Drop old policies
DROP POLICY IF EXISTS "users_view_org_meetings" ON public.meetings;
DROP POLICY IF EXISTS "users_create_meetings" ON public.meetings;
DROP POLICY IF EXISTS "users_edit_own_meetings" ON public.meetings;
DROP POLICY IF EXISTS "users_delete_meetings" ON public.meetings;

-- New view policy: published OR creator OR ORS OR invited
CREATE POLICY "users_view_meetings" ON public.meetings
  FOR SELECT USING (
    visibility = 'published'
    OR auth.uid() = created_by
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
    OR auth.uid() = ANY(allowed_viewers)
    OR auth.uid() = ANY(allowed_editors)
  );

-- New create policy: ORS or designated creator only
CREATE POLICY "users_create_meetings" ON public.meetings
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND (
      (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
      OR EXISTS (
        SELECT 1 FROM public.designated_creators WHERE user_id = auth.uid()
      )
    )
  );

-- New update policy: creator (draft only) or ORS or invited editor
CREATE POLICY "users_update_meetings" ON public.meetings
  FOR UPDATE USING (
    (auth.uid() = created_by AND visibility = 'private')
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
    OR auth.uid() = ANY(allowed_editors)
  );

-- New delete policy: ORS only
CREATE POLICY "users_delete_meetings" ON public.meetings
  FOR DELETE USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
  );

-- Step 7: RLS for designated_creators (ORS can read/manage)
CREATE POLICY "designated_creators_select_ors" ON public.designated_creators
  FOR SELECT USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
  );

CREATE POLICY "designated_creators_insert_ors" ON public.designated_creators
  FOR INSERT WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
  );

CREATE POLICY "designated_creators_delete_ors" ON public.designated_creators
  FOR DELETE USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
  );
