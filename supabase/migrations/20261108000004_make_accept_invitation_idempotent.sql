-- accept_user_invitation: make idempotent against heal_pending_invitation_for_self.
--
-- Problem: onAuthStateChange fires *inside* the signInWithPassword await chain
-- (supabase-js v2 _notifyAllSubscribers is awaited before signInWithPassword
-- resolves). AuthContext's fetchProfile gets PGRST116, triggers the self-heal,
-- which creates public.users AND marks the invitation accepted — all before
-- acceptInvitation(token) runs in ActivateInvitation.jsx.
--
-- Without this fix, the normal invitation flow would show "Invitation is invalid
-- or expired" even though the user was correctly set up by the heal.
--
-- Fix: before raising, check if the invitation was already accepted by the caller
-- (heal ran first). If so, return the existing user record silently.

create or replace function public.accept_user_invitation(p_token text)
returns public.users
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invitation public.user_invitations%rowtype;
  v_auth_email text;
  v_user       public.users%rowtype;
  v_full_name  text;
  v_hash       text := md5(p_token);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Expire any pending tokens that have passed their deadline
  update public.user_invitations
  set
    status         = 'expired',
    delivery_status = 'expired',
    delivery_error = null
  where status = 'pending'
    and expires_at < now()
    and (
      invitation_token_hash = v_hash
      or invitation_token   = p_token
    );

  -- Try to claim a live pending invitation
  select *
  into v_invitation
  from public.user_invitations
  where status = 'pending'
    and expires_at >= now()
    and (
      invitation_token_hash = v_hash
      or invitation_token   = p_token
    );

  if v_invitation.id is null then
    -- Idempotency gate: the heal RPC may have already accepted this invitation
    -- (triggered by PGRST116 in onAuthStateChange before this call resolved).
    -- If this invitation was accepted by the current user, return the profile silently.
    select *
    into v_invitation
    from public.user_invitations
    where (invitation_token_hash = v_hash or invitation_token = p_token)
      and status          = 'accepted'
      and accepted_user_id = auth.uid();

    if v_invitation.id is not null then
      select * into v_user from public.users where id = auth.uid();
      return v_user;
    end if;

    raise exception 'Invitation is invalid or expired';
  end if;

  select lower(email)
  into v_auth_email
  from auth.users
  where id = auth.uid();

  if v_auth_email is distinct from lower(v_invitation.email) then
    raise exception 'Signed-in email does not match invitation email';
  end if;

  v_full_name := trim(v_invitation.first_name || ' ' || v_invitation.last_name);

  insert into public.users (
    id, name, email, role, department_id,
    first_name, last_name, status,
    invited_at, activated_at, last_active_at
  )
  values (
    auth.uid(), v_full_name, lower(v_invitation.email), v_invitation.role, v_invitation.department_id,
    v_invitation.first_name, v_invitation.last_name, 'active',
    v_invitation.created_at, now(), now()
  )
  on conflict (id) do update
    set
      name           = excluded.name,
      email          = excluded.email,
      role           = excluded.role,
      department_id  = excluded.department_id,
      first_name     = excluded.first_name,
      last_name      = excluded.last_name,
      status         = 'active',
      invited_at     = coalesce(public.users.invited_at, excluded.invited_at),
      activated_at   = coalesce(public.users.activated_at, now()),
      last_active_at = now()
  returning * into v_user;

  if v_invitation.role = 'member' then
    delete from public.pastor_members where member_id = auth.uid();

    if v_invitation.assigned_pastor_id is not null then
      insert into public.pastor_members (pastor_id, member_id)
      values (v_invitation.assigned_pastor_id, auth.uid())
      on conflict (pastor_id, member_id) do nothing;
    end if;
  end if;

  update public.user_invitations
  set
    status           = 'accepted',
    accepted_at      = now(),
    accepted_user_id = auth.uid(),
    delivery_status  = 'activated',
    delivery_error   = null
  where id = v_invitation.id;

  insert into public.user_status_history (user_id, from_status, to_status, reason, changed_by)
  values (auth.uid(), 'invited', 'active', 'Invitation accepted', auth.uid());

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_accepted', 'user_invitation', v_invitation.id);

  return v_user;
end;
$$;
