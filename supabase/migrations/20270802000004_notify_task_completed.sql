-- Notify task followers (watchers) when a task transitions to the 'completed'
-- status category. Powers the inbox → "→ Task" flow where the original
-- @mentioner is added as a watcher and gets the memo when the task is done.

create or replace function public.notify_task_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_category text;
  v_old_category text;
  v_recipient    uuid;
begin
  -- Fast-path: only care when status_id actually changed.
  if NEW.status_id is not distinct from OLD.status_id then
    return NEW;
  end if;

  -- Resolve categories.
  select category into v_new_category
  from public.task_status_definitions where id = NEW.status_id;

  select category into v_old_category
  from public.task_status_definitions where id = OLD.status_id;

  -- Only fire when transitioning INTO completed (skip if already completed).
  if v_new_category is distinct from 'completed' or v_old_category = 'completed' then
    return NEW;
  end if;

  -- Fan-out to all watchers.
  for v_recipient in
    select user_id from public.task_follows where task_id = NEW.id
  loop
    insert into public.notifications (user_id, type, payload)
    values (
      v_recipient,
      'task_completed',
      jsonb_build_object(
        'task_id',    NEW.id,
        'task_title', NEW.title
      )
    );
  end loop;

  return NEW;
end;
$$;

drop trigger if exists on_task_completed on public.tasks;
create trigger on_task_completed
  after update on public.tasks
  for each row
  execute function public.notify_task_completed();
