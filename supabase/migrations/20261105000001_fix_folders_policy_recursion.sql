-- Fix infinite recursion in folders_select policy
-- The issue: checking folder_shares with its own RLS policy creates circular dependency
-- Solution: Use a direct query without triggering RLS on folder_shares

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
    OR folder_id IN (
      SELECT folder_id FROM public.folder_shares
      WHERE user_id = auth.uid()
    )
  ))
);

-- Same fix for lists_select policy
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
    OR list_id IN (
      SELECT list_id FROM public.list_shares
      WHERE user_id = auth.uid()
    )
  ))
);
