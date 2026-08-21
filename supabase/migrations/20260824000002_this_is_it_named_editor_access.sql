-- Grants edit access on the This Is It 2.0 prep guide to three named
-- Programs team members, without changing their app-wide role column
-- (which would affect permissions well beyond this page):
--   Pastor Chi Nwokem  (cedochie@gmail.com)   4c70ca61-443b-4a64-87aa-3453c9dd5c65
--   Dorcas M           (dorcasmuk20@gmail.com) 750e94e0-aa87-491c-8372-958225861484
--   Ella Ukpabia       (emmanuellauk54@gmail.com) 0a645fbf-01e2-4c49-a32a-4a13b2800b6d
-- These are additive permissive policies alongside the existing
-- super_admin/regional_secretary policies (RLS OR-combines permissive
-- policies for the same command).

create policy "this_is_it_named_editors_content" on this_is_it_event_content
  as permissive for all
  using (
    auth.uid() in (
      '4c70ca61-443b-4a64-87aa-3453c9dd5c65',
      '750e94e0-aa87-491c-8372-958225861484',
      '0a645fbf-01e2-4c49-a32a-4a13b2800b6d'
    )
  )
  with check (
    auth.uid() in (
      '4c70ca61-443b-4a64-87aa-3453c9dd5c65',
      '750e94e0-aa87-491c-8372-958225861484',
      '0a645fbf-01e2-4c49-a32a-4a13b2800b6d'
    )
  );

create policy "this_is_it_named_editors_schedule" on this_is_it_schedule_items
  as permissive for all
  using (
    auth.uid() in (
      '4c70ca61-443b-4a64-87aa-3453c9dd5c65',
      '750e94e0-aa87-491c-8372-958225861484',
      '0a645fbf-01e2-4c49-a32a-4a13b2800b6d'
    )
  )
  with check (
    auth.uid() in (
      '4c70ca61-443b-4a64-87aa-3453c9dd5c65',
      '750e94e0-aa87-491c-8372-958225861484',
      '0a645fbf-01e2-4c49-a32a-4a13b2800b6d'
    )
  );

create policy "this_is_it_named_editors_checklist" on this_is_it_checklist_items
  as permissive for all
  using (
    auth.uid() in (
      '4c70ca61-443b-4a64-87aa-3453c9dd5c65',
      '750e94e0-aa87-491c-8372-958225861484',
      '0a645fbf-01e2-4c49-a32a-4a13b2800b6d'
    )
  )
  with check (
    auth.uid() in (
      '4c70ca61-443b-4a64-87aa-3453c9dd5c65',
      '750e94e0-aa87-491c-8372-958225861484',
      '0a645fbf-01e2-4c49-a32a-4a13b2800b6d'
    )
  );
