-- Set Pastor Toby Yinka-Okunusi's (christianokunusi@gmail.com) two logged
-- meetings to private, matching the new org-wide default. Date is
-- unchanged — confirmed correct as-is (today).

update public.meetings
set visibility = 'private',
    updated_at = now()
where created_by = (select id from public.users where email = 'christianokunusi@gmail.com')
  and id in ('0ee17803-8381-4cad-89c6-b4e185d4d500', '455115c0-4380-4942-be5a-1da612e93f9e')
  and visibility is distinct from 'private';
