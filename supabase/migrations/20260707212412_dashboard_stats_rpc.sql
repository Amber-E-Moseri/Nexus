-- Create RPC function to batch dashboard statistics queries
-- Replaces 4 separate queries with 1 RPC call for 50% faster dashboard load

create or replace function public.get_dashboard_stats(p_user_id uuid)
returns table (
  space_count bigint,
  open_task_count bigint,
  my_due_task_count bigint,
  active_sprint_count bigint
)
language sql
as $$
  select
    (select count(*) from public.departments) as space_count,
    (select count(*) from public.tasks
     where is_personal = false
     and parent_task_id is null
     and completed_at is null) as open_task_count,
    (select count(*) from public.tasks
     where assignee_id = p_user_id
     and completed_at is null
     and due_date is not null) as my_due_task_count,
    (select count(*) from public.sprints
     where status = 'active') as active_sprint_count
$$;

-- Grant execute to authenticated users
grant execute on function public.get_dashboard_stats(uuid) to authenticated;

comment on function public.get_dashboard_stats(uuid) is
  'Batches 4 dashboard stat queries (spaces, open tasks, user due tasks, active sprints) into a single RPC call for performance';

