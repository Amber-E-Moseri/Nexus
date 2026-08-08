-- Fix avatars bucket: was created with public=false which makes getPublicUrl() URLs 404.
-- The RLS policy already allows public select, but the bucket flag must also be true
-- for Supabase to serve files at /storage/v1/object/public/avatars/*.

update storage.buckets
set public = true
where id = 'avatars';
