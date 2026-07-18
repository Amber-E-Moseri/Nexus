-- P0: get_or_create_task_feed_token() and get_my_task_ids() accepted a caller-supplied
-- p_user_id without verifying it matched auth.uid(), enabling any authenticated user
-- to create feed tokens for or probe task ownership of arbitrary other users.

create or replace function public.get_or_create_task_feed_token(
  p_user_id   uuid,
  p_space_id  uuid default null,
  p_feed_type text default null
)
returns text
language plpgsql security definer as $$
declare
  v_token text;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'forbidden: p_user_id must match the authenticated user';
  end if;

  if p_space_id is not null then
    insert into public.task_feed_subscriptions (user_id, space_id, feed_type)
    values (p_user_id, p_space_id, p_feed_type)
    on conflict do nothing;

    select token into v_token
    from public.task_feed_subscriptions
    where user_id = p_user_id
      and space_id = p_space_id
      and feed_type = p_feed_type;
  else
    insert into public.task_feed_subscriptions (user_id, space_id, feed_type)
    values (p_user_id, null, p_feed_type)
    on conflict do nothing;

    select token into v_token
    from public.task_feed_subscriptions
    where user_id = p_user_id
      and space_id is null
      and feed_type = p_feed_type;
  end if;

  return v_token;
end;
$$;

create or replace function public.get_my_task_ids(p_user_id uuid)
returns table(task_id uuid) language plpgsql stable security definer as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'forbidden: p_user_id must match the authenticated user';
  end if;

  return query
    select distinct t.id
    from public.tasks t
    left join public.task_assignees ta on ta.task_id = t.id
    where t.deleted_at is null
      and (
        t.created_by = p_user_id
        or t.assignee_id = p_user_id
        or ta.user_id = p_user_id
      );
end;
$$;

notify pgrst, 'reload schema';
