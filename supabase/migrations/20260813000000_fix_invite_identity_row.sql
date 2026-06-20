-- Fix: insert into auth.identities when creating temporary users so that
-- auth.admin.generateLink can find the user and generate a recovery link.

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

  -- Reuse existing auth user if email already registered
  select id into v_user_id
  from auth.users
  where email = p_email
  limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      p_email,
      '',
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), split_part(p_email, '@', 1)), 'is_temporary', true),
      'authenticated',
      'authenticated'
    );

    -- Required so auth.admin.generateLink can find the user
    insert into auth.identities (
      id,
      user_id,
      provider_id,
      provider,
      identity_data,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_user_id,
      p_email,
      'email',
      jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true),
      now(),
      now(),
      now()
    );

    insert into public.users (id, email, name, status, is_temporary, created_at)
    values (
      v_user_id,
      p_email,
      coalesce(nullif(trim(p_name), ''), split_part(p_email, '@', 1)),
      'pending_activation',
      true,
      now()
    );
  end if;

  if exists (
    select 1 from public.sprint_members
    where sprint_id = p_sprint_id and user_id = v_user_id
  ) then
    raise exception 'User is already a member of this sprint';
  end if;

  insert into public.sprint_members (
    sprint_id, user_id, role, is_temporary, membership_end_date, invited_by
  ) values (
    p_sprint_id, v_user_id, p_role, true, p_end_date, v_inviter
  );

  return v_user_id;
end;
$$;

grant execute on function public.invite_external_sprint_member(text, text, uuid, text, date) to authenticated;
