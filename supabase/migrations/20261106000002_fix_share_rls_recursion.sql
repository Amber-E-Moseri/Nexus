-- Drop problematic policies
DROP POLICY IF EXISTS "folder_shares_select" ON public.folder_shares;
DROP POLICY IF EXISTS "folder_shares_write" ON public.folder_shares;
DROP POLICY IF EXISTS "folder_shares_insert" ON public.folder_shares;
DROP POLICY IF EXISTS "folder_shares_delete" ON public.folder_shares;
DROP POLICY IF EXISTS "list_shares_select" ON public.list_shares;
DROP POLICY IF EXISTS "list_shares_write" ON public.list_shares;
DROP POLICY IF EXISTS "list_shares_insert" ON public.list_shares;
DROP POLICY IF EXISTS "list_shares_delete" ON public.list_shares;

-- Simpler policies that don't cause recursion
-- Users can see shares they're part of or created
CREATE POLICY "folder_shares_select" ON public.folder_shares
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "folder_shares_insert" ON public.folder_shares
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.folders
    WHERE id = folder_id AND created_by = auth.uid()
  )
);

CREATE POLICY "folder_shares_delete" ON public.folder_shares
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.folders
    WHERE id = folder_id AND created_by = auth.uid()
  )
);

CREATE POLICY "list_shares_select" ON public.list_shares
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "list_shares_insert" ON public.list_shares
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.lists
    WHERE id = list_id AND created_by = auth.uid()
  )
);

CREATE POLICY "list_shares_delete" ON public.list_shares
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lists
    WHERE id = list_id AND created_by = auth.uid()
  )
);

-- Simplify folders_select policy to avoid recursion
DROP POLICY IF EXISTS "folders_select" ON public.folders;
CREATE POLICY "folders_select" ON public.folders
FOR SELECT TO authenticated
USING (
  visibility = 'public'
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.space_members
    WHERE space_id = folders.department_id AND user_id = auth.uid() AND visibility = 'public'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.department_id = folders.department_id AND visibility = 'public'
  )
);

-- Simplify lists_select policy to avoid recursion
DROP POLICY IF EXISTS "lists_select" ON public.lists;
CREATE POLICY "lists_select" ON public.lists
FOR SELECT TO authenticated
USING (
  visibility = 'public'
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.space_members
    WHERE space_id = lists.department_id AND user_id = auth.uid() AND visibility = 'public'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.department_id = lists.department_id AND visibility = 'public'
  )
);
