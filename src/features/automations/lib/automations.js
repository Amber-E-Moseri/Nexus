import { supabase } from '../../../lib/supabase'

export const TRIGGER_LABELS = {
  task_status_change: 'Task status changes',
  task_assigned: 'Task is assigned',
  task_overdue: 'Task becomes overdue',
  delegated_task_due_soon: 'Delegated task due soon',
  meeting_created: 'Meeting is logged',
}

export const ACTION_LABELS = {
  send_notification: 'Notify a user',
  create_task: 'Create a task',
  send_email: 'Send an email',
  post_webhook: 'Post to webhook URL',
}

export async function getDeptAutomations(departmentId) {
  const { data, error } = await supabase
    .from('automations')
    .select('id, name, description, enabled, trigger_type, trigger_config, actions, conditions, fire_count, last_fired_at, created_at, created_by, department_id')
    .eq('department_id', departmentId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function createAutomation(automationData) {
  const { data, error } = await supabase.from('automations').insert(automationData).select().single()
  if (error) throw error
  return data
}

export async function updateAutomation(id, updates) {
  const { data, error } = await supabase
    .from('automations')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function toggleAutomation(id, enabled) {
  return updateAutomation(id, { enabled })
}

export async function deleteAutomation(id) {
  const { error } = await supabase.from('automations').delete().eq('id', id)
  if (error) throw error
}

export async function getAutomationRuns(automationId, limit = 20) {
  const { data, error } = await supabase
    .from('automation_runs')
    .select('id, status, error, duration_ms, ran_at, actions_taken')
    .eq('automation_id', automationId)
    .order('ran_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function getRecentAutomationRuns(automationIds, limit = 50) {
  if (!automationIds?.length) {
    return []
  }

  const { data, error } = await supabase
    .from('automation_runs')
    .select('id, automation_id, status, error, duration_ms, ran_at, actions_taken, trigger_payload, automation:automations(name, trigger_type)')
    .in('automation_id', automationIds)
    .order('ran_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function getAllDepartments() {
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, color')
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function getAllUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, department_id, status')
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function getAllAutomations() {
  const { data, error } = await supabase
    .from('automations')
    .select('id, name, description, enabled, trigger_type, trigger_config, actions, conditions, fire_count, last_fired_at, created_at, created_by, department_id')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getAutomationRunLog(limit = 100) {
  const { data, error } = await supabase
    .from('automation_run_log')
    .select('id, automation_id, trigger_type, trigger_payload, actions_executed, success, error_message, ran_at')
    .order('ran_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function getWebhookDeliveryLog(limit = 100) {
  const { data, error } = await supabase
    .from('webhook_delivery_log')
    .select('id, automation_id, webhook_url, response_status, response_body, delivered_at, success')
    .order('delivered_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}
