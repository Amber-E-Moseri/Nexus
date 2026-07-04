-- Add visibility column to folders
ALTER TABLE public.folders ADD COLUMN visibility TEXT DEFAULT 'public' CHECK(visibility IN ('public', 'private'));

-- Add visibility column to lists
ALTER TABLE public.lists ADD COLUMN visibility TEXT DEFAULT 'public' CHECK(visibility IN ('public', 'private'));

-- Create folder_shares table
CREATE TABLE public.folder_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(folder_id, user_id)
);

-- Create list_shares table
CREATE TABLE public.list_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(list_id, user_id)
);

-- Enable RLS on share tables
ALTER TABLE public.folder_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_shares ENABLE ROW LEVEL SECURITY;

-- RLS policy for folder_shares (only creator or shared users can see)
CREATE POLICY "folder_shares_select" ON public.folder_shares
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.folders f
    WHERE f.id = folder_id AND f.created_by = auth.uid()
  )
);

-- RLS policy for folder_shares insert/delete (only creator can modify)
CREATE POLICY "folder_shares_write" ON public.folder_shares
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.folders f
    WHERE f.id = folder_id AND f.created_by = auth.uid()
  )
);

-- RLS policy for list_shares (only creator or shared users can see)
CREATE POLICY "list_shares_select" ON public.list_shares
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.lists l
    WHERE l.id = list_id AND l.created_by = auth.uid()
  )
);

-- RLS policy for list_shares insert/delete (only creator can modify)
CREATE POLICY "list_shares_write" ON public.list_shares
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lists l
    WHERE l.id = list_id AND l.created_by = auth.uid()
  )
);

-- Update folder RLS to respect visibility
DROP POLICY IF EXISTS "folders_select" ON public.folders;
CREATE POLICY "folders_select" ON public.folders
FOR SELECT TO authenticated
USING (
  (visibility = 'public' AND (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
    OR EXISTS (
      SELECT 1 FROM public.space_members
      WHERE space_id = folders.department_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.department_id = folders.department_id
    )
  ))
  OR (visibility = 'private' AND (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.folder_shares
      WHERE folder_id = folders.id AND user_id = auth.uid()
    )
  ))
);

-- Update list RLS to respect visibility
DROP POLICY IF EXISTS "lists_select" ON public.lists;
CREATE POLICY "lists_select" ON public.lists
FOR SELECT TO authenticated
USING (
  (visibility = 'public' AND (
    (auth.jwt() ->> 'role') in ('super_admin', 'dept_lead')
    OR EXISTS (
      SELECT 1 FROM public.space_members
      WHERE space_id = lists.department_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.department_id = lists.department_id
    )
  ))
  OR (visibility = 'private' AND (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.list_shares
      WHERE list_id = lists.id AND user_id = auth.uid()
    )
  ))
);
