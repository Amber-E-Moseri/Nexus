/*
  Post-deploy action required:

  1. Go to Supabase Dashboard -> Authentication -> Hooks
  2. Register public.custom_access_token_hook as the "Custom Access Token" hook
  3. Ask users to sign out and sign back in so refreshed JWTs include the new claims
*/

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  user_record public.users%rowtype;
  claims jsonb;
begin
  select *
  into user_record
  from public.users
  where id = (event ->> 'user_id')::uuid;

  if not found then
    return event;
  end if;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  claims := jsonb_set(claims, '{user_role}', to_jsonb(user_record.role), true);
  claims := jsonb_set(
    claims,
    '{user_department_id}',
    to_jsonb(user_record.department_id::text),
    true
  );

  return jsonb_set(event, '{claims}', claims, true);
exception
  when invalid_text_representation then
    return event;
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, authenticated, anon;

comment on function public.custom_access_token_hook(jsonb)
is 'Injects user_role and user_department_id into JWT claims for auth sessions.';

create or replace function public.current_user_role()
returns text
language sql
stable
as $$
  select coalesce(
    auth.jwt() ->> 'user_role',
    (select role from public.users where id = auth.uid())
  )
$$;

comment on function public.current_user_role()
is 'Reads current user role from JWT first with DB fallback for backward compatibility during rollout.';

create or replace function public.current_user_department()
returns uuid
language sql
stable
as $$
  select coalesce(
    (auth.jwt() ->> 'user_department_id')::uuid,
    (select department_id from public.users where id = auth.uid())
  )
$$;

comment on function public.current_user_department()
is 'Reads current user department from JWT first with DB fallback for backward compatibility during rollout.';
