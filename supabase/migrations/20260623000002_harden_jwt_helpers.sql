-- Removes the DB fallback from the JWT helper functions introduced in
-- 20260623000000. Run only after all active sessions have been refreshed
-- and the JWT hook has been verified working in production.

create or replace function public.current_user_role()
returns text language sql stable security definer
set search_path = public
as $$ select auth.jwt() ->> 'user_role' $$;

create or replace function public.current_user_department()
returns uuid language sql stable security definer
set search_path = public
as $$ select (auth.jwt() ->> 'user_department_id')::uuid $$;
