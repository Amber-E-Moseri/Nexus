-- Fix: ensure auth.identities row exists for ALL users (new and reused)
-- so generateLink always succeeds. Also backfill any existing temporary
-- users that were created without an identity row.

create or replace function public.invite_external_sprint_member(
  p_email            text,
  p_name             text,
  p_sprint_id        uuid,
  p_role             text    default 'contributor',
  p_end_date         date    default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id   uuid;
  v_inviter   uuid := auth.uid();
begin
  if v_inviter is null then
    raise exception 'Authentication required';
  end if;

  p_email := lower(trim(p_email));

  select id into v_user_id
  from auth.users
  where email = p_email
  limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      p_email, '',
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), split_part(p_email, '@', 1)), 'is_temporary', true),
      'authenticated', 'authenticated'
    );

    insert into public.users (id, email, name, status, is_temporary, created_at)
    values (
      v_user_id, p_email,
      coalesce(nullif(trim(p_name), ''), split_part(p_email, '@', 1)),
      'pending_activation', true, now()
    );
  end if;

  -- Ensure identity row exists (required for generateLink to work)
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id, p_email, 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true),
    now(), now(), now()
  )
  on conflict (provider, provider_id) do nothing;

  -- Insert sprint membership; skip silently if already a member (allows resending invite)
  insert into public.sprint_members (
    sprint_id, user_id, role, is_temporary, membership_end_date, invited_by
  ) values (
    p_sprint_id, v_user_id, p_role, true, p_end_date, v_inviter
  )
  on conflict (sprint_id, user_id) do nothing;

  return v_user_id;
end;
$$;

grant execute on function public.invite_external_sprint_member(text, text, uuid, text, date) to authenticated;

-- Backfill identity rows for temporary users that were created without one
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.email, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where not exists (
  select 1 from auth.identities i where i.user_id = u.id
);
