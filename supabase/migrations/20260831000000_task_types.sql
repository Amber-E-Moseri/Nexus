-- Add task_type column to tasks table
alter table public.tasks add column task_type text default 'flexible';

-- Add constraint for valid task types
alter table public.tasks add constraint task_type_valid
  check (task_type in ('fixed', 'flexible', 'personal'));

-- Backfill existing tasks with appropriate types
update public.tasks set task_type = 'fixed' where sprint_id is not null;
update public.tasks set task_type = 'personal' where is_personal = true;
update public.tasks set task_type = 'flexible' where task_type = 'flexible';

-- Create function to determine task type
create or replace function public.get_task_type(task_id uuid)
returns text
language sql
security definer
as $$
  select
    case
      when (select sprint_id from public.tasks where id = task_id) is not null then 'fixed'
      when (select is_personal from public.tasks where id = task_id) = true then 'personal'
      else 'flexible'
    end;
$$;

-- Create function to update task due date (with validation)
create or replace function public.update_task_due_date(
  task_id uuid,
  new_due_date date
)
returns json
language plpgsql
security definer
as $$
declare
  task_type text;
  updated_task json;
begin
  -- Check if task is locked (fixed type)
  select public.get_task_type(task_id) into task_type;

  if task_type = 'fixed' then
    raise exception 'Cannot reschedule tasks with fixed deadlines (e.g., sprint or meeting tasks)';
  end if;

  -- Update the due date
  update public.tasks
  set
    due_date = new_due_date,
    updated_at = now()
  where id = task_id;

  -- Return updated task as JSON
  select row_to_json(t.*) into updated_task
  from public.tasks t
  where t.id = task_id;

  return updated_task;
end;
$$;

-- Grant execute permissions
grant execute on function public.get_task_type(uuid) to authenticated;
grant execute on function public.update_task_due_date(uuid, date) to authenticated;

-- Create index on task_type for performance
create index if not exists idx_tasks_task_type on public.tasks(task_type);
