-- Change notify_comment_posted to return the number of notifications actually
-- inserted so the frontend can log 0 (no recipients found) vs N (N sent).
-- Must drop first because you cannot ALTER the return type of a function in place.

drop function if exists public.notify_comment_posted(uuid, uuid, uuid, text, text);

create function public.notify_comment_posted(
  p_task_id       uuid,
  p_comment_id    uuid,
  p_author_id     uuid,
  p_author_name   text,
  p_body_preview  text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_title text;
  v_recipient  uuid;
  v_count      integer := 0;
begin
  select title into v_task_title
  from public.tasks
  where id = p_task_id and deleted_at is null;

  if v_task_title is null then
    return 0; -- task not found or deleted
  end if;

  for v_recipient in
    select distinct uid
    from (
      select user_id as uid from public.task_follows  where task_id = p_task_id
      union
      select user_id as uid from public.task_assignees where task_id = p_task_id
      union
      select assignee_id as uid from public.tasks
        where id = p_task_id and assignee_id is not null
    ) recipients
    where uid <> p_author_id
      and not exists (
        select 1 from public.user_notification_prefs
        where user_id = uid
          and notification_type = 'task_comment'
          and in_app = false
      )
  loop
    insert into public.notifications (user_id, type, payload)
    values (
      v_recipient,
      'task_comment',
      jsonb_build_object(
        'task_id',         p_task_id,
        'comment_id',      p_comment_id,
        'author_name',     p_author_name,
        'task_title',      v_task_title,
        'comment_preview', p_body_preview
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.notify_comment_posted(uuid, uuid, uuid, text, text) to authenticated;
