-- RPC: fan-out a task_comment notification to all watchers and assignees
-- when a new comment is posted. Called from createComment() in tasks.js.
--
-- Recipients = union of:
--   task_follows.user_id       (watchers)
--   task_assignees.user_id     (multi-assignee junction)
--   tasks.assignee_id          (primary assignee column)
-- minus:
--   the comment author
--   users who disabled task_comment in-app notifications

create or replace function public.notify_comment_posted(
  p_task_id       uuid,
  p_comment_id    uuid,
  p_author_id     uuid,
  p_author_name   text,
  p_body_preview  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_title text;
  v_recipient  uuid;
begin
  select title into v_task_title
  from public.tasks
  where id = p_task_id and deleted_at is null;

  if v_task_title is null then
    return; -- task not found or deleted, nothing to do
  end if;

  for v_recipient in
    -- all watchers + assignees, deduped, author excluded
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
      -- skip users who have opted out of task_comment in-app notifications
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
        'task_id',        p_task_id,
        'comment_id',     p_comment_id,
        'author_name',    p_author_name,
        'task_title',     v_task_title,
        'comment_preview', p_body_preview
      )
    );
  end loop;
end;
$$;

grant execute on function public.notify_comment_posted(uuid, uuid, uuid, text, text) to authenticated;
