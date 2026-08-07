// nova-action write tools — tasks.
// These call SECURITY DEFINER domain RPCs that enforce permission checks internally.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function callAssignTask(
  client: ReturnType<typeof createClient>,
  args: Record<string, unknown>,
): Promise<{ taskId: string }> {
  const taskId = args.task_id as string
  const assigneeId = args.assignee_id as string

  if (!taskId || !assigneeId) throw new Error('task_id and assignee_id are required')

  const { data, error } = await client.rpc('nova_assign_task', {
    p_task_id: taskId,
    p_assignee_id: assigneeId,
  })

  if (error) throw new Error(error.message)
  return { taskId: data as string }
}

export async function callCreateTask(
  client: ReturnType<typeof createClient>,
  args: Record<string, unknown>,
): Promise<{ taskId: string }> {
  const title = args.title as string
  const departmentId = args.department_id as string

  if (!title || !departmentId) throw new Error('title and department_id are required')

  const { data, error } = await client.rpc('nova_create_task', {
    p_title: title,
    p_department_id: departmentId,
    p_assignee_id: (args.assignee_id as string) ?? null,
    p_due_date: (args.due_date as string) ?? null,
    p_priority: (args.priority as string) ?? 'normal',
    p_meeting_id: (args.meeting_id as string) ?? null,
    p_sprint_id: (args.sprint_id as string) ?? null,
  })

  if (error) throw new Error(error.message)
  return { taskId: data as string }
}
